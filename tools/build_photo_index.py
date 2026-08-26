#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build_photo_index.py — 사진 인덱스 생성 (배포 Claude 담당)

왜 인덱스인가:
  현행은 assets/images/places/{name}.jpg 로, data.js 의 name 과 글자 단위로
  일치해야만 사진이 뜬다. tourist 159건 중 50건(31.4%)이 공백·괄호·쉼표·
  마침표·언더스코어를 갖고 있어, 이름을 한 글자만 고쳐도 그 사진은 조용히 404 가 된다.
  실제로 커밋 c941986 에서 '발안식염 온천'→'화성식염온천' 개명 때 사진도 손으로
  같이 고쳐야 했다. 이름과 사진을 분리하려고 인덱스를 둔다.

새 파일명 규칙 (사용자 지정 — 지역 이름으로 라벨링):
    {읍면동}_{id}[_{아무 메모}].{jpg|jpeg|png|webp}
    예) 서신면_1_제부도.jpg   동탄6동_162_CGV동탄역.jpg   우정읍_199_매향항 낙조.jpg

  ★ 매칭에 쓰이는 토큰은 {id} 하나뿐이다.
    앞의 지역명과 뒤의 메모는 사람이 읽고 정렬하기 위한 장식이며 코드가 대조하지 않는다.
    따라서 지역명을 틀리게 적어도 사진은 정상적으로 뜬다.
    (지역과 사진, 두 설계가 서로의 실패를 전파하지 않도록 일부러 느슨하게 묶었다)

  ★ 기존 {name}.jpg 도 계속 인식한다. 빅뱅 개명이 필요 없다.
    실측: 기존 159장을 새 정규식에 넣었을 때 오탐 0건.

사용법:
    python3 tools/build_photo_index.py            # js/photos.js 생성
    python3 tools/build_photo_index.py --check    # 생성 없이 점검만
    python3 tools/build_photo_index.py --list     # 사진 넣을 때 참고할 CSV 출력

⚠ assets/ 는 .gitignore 대상이라 배포 서버에만 있다.
   따라서 이 스크립트는 배포 서버에서 돌리고, 산출물 js/photos.js 만 커밋한다.
"""
import argparse, json, os, re, sys, unicodedata
from collections import defaultdict

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO_DIR = os.path.join(ROOT, "assets", "images", "places")
DATA_JS = os.path.join(ROOT, "js", "data.js")
CONV_JS = os.path.join(ROOT, "js", "convenience.js")
OUT_JS = os.path.join(ROOT, "js", "photos.js")

EXTS = ("jpg", "jpeg", "png", "webp")
# 첫 '_' 앞까지가 지역명. '동탄1동_37_…' 처럼 지역명에 숫자가 있어도 정확히 분해된다.
NEW_RE = re.compile(r"^(?P<region>[^_]+)_(?P<id>\d+)(?:_(?P<memo>.*))?\.(?P<ext>%s)$"
                    % "|".join(EXTS), re.I)


def load_places():
    """js/data.js → [{id, name, category, address}]"""
    src = open(DATA_JS, encoding="utf-8").read()
    rows = re.findall(
        r'id:(\d+),\s*name:"([^"]+)",\s*category:"([a-z]+)"[^}]*?address:"([^"]*)"', src)
    return [{"id": int(i), "name": n, "category": c, "address": a} for i, n, c, a in rows]


def load_conv_places():
    """js/convenience.js → [{id:None, name, category:"convenience", address}]

    왜 필요한가 (2026-08-26): 이 빌더는 js/data.js 만 읽었다. 그래서 영화관·캠핑장·
    관광호텔처럼 CONVENIENCE 에 사는 장소의 사진은 assets/ 에 파일이 있어도
    js/photos.js 에 한 줄도 안 들어갔고, 화면에서 영영 안 떴다. 실측 34장 31곳이
    그 상태였다. tools/check_data.py 는 고아 판정에 convenience.js 를 이미 넣고
    있어서(:478) 검사만 통과하고 아무도 눈치채지 못했다.

    id 는 None 이다 — CONVENIENCE 항목에는 id 가 없다. 사진은 이름으로만 찾으므로
    byName 에만 들어간다. build() 의 by_id_place 에 None 키가 하나 생기지만
    신규 규칙 경로는 정수 id 로만 조회하므로 부딪히지 않는다.
    """
    if not os.path.exists(CONV_JS):
        return []
    src = open(CONV_JS, encoding="utf-8").read()
    out, seen = [], set()
    # CONVENIENCE 항목은 전부 {name:"…", addr:"…"} 꼴이다(tel 등은 뒤에 붙기도 한다).
    for n, a in re.findall(r'name:\s*"([^"]+)"\s*,\s*addr:\s*"([^"]*)"', src):
        if n in seen:
            continue
        seen.add(n)
        out.append({"id": None, "name": n, "category": "convenience", "address": a})
    return out


def scan_photos():
    if not os.path.isdir(PHOTO_DIR):
        return None
    out = []
    for fn in sorted(os.listdir(PHOTO_DIR)):
        if fn.startswith("."):
            continue
        if not fn.lower().endswith(tuple("." + e for e in EXTS)):
            continue
        # macOS 등에서 들어온 NFD 파일명을 NFC 로 맞춘다 (한글 자모 분리 방지)
        out.append(unicodedata.normalize("NFC", fn))
    return out


def build(files, places):
    """파일명 → 인덱스. 장소당 여러 장을 배열로 담는다.

    인식하는 형식 3가지 (위에서부터 시도)
      1) {읍면동}_{id}[_{메모}].ext   — 신규 규칙. 매칭은 id 토큰만
      2) {PLACES name}_{설명}.ext    — 사용자가 보내는 현행 규칙 (장소당 여러 장)
      3) {PLACES name}.ext           — 기존 159장
    """
    by_name_place = {p["name"]: p for p in places}
    by_id_place = {p["id"]: p for p in places}
    # 긴 이름부터 맞춰야 '제부도' 가 '제부도리조트_전망' 을 가로채지 않는다
    names_desc = sorted(by_name_place, key=len, reverse=True)

    idx_id, idx_name = {}, {}
    unknown_id, orphan, legacy_n, desc_n = [], [], 0, 0
    ambiguous = []

    for fn in files:
        stem, _, ext = fn.rpartition(".")
        m = NEW_RE.match(fn)
        if m:                                        # 1) 신규 규칙
            pid = int(m.group("id"))
            if pid not in by_id_place:
                unknown_id.append((fn, pid))
            else:
                idx_id.setdefault(pid, []).append(fn)
            continue
        if stem in by_name_place:                    # 3) 이름 그대로
            idx_name.setdefault(stem, []).append(fn)
            legacy_n += 1
            continue
        hit = next((n for n in names_desc if stem.startswith(n + "_")), None)
        if hit:                                      # 2) 이름_설명
            # '전곡항_요트.jpg' 는 '전곡항 요트'(id:204) 사진인데 규칙 2 가
            # 짧은 쪽 '전곡항'(id:3) 으로 흡수한다. 긴 이름은 공백, 파일명은 언더스코어라
            # startswith(name + '_') 가 긴 쪽을 못 잡는다. 조용히 틀리므로 경고한다.
            alt = stem.replace("_", " ")
            if alt in by_name_place and alt != hit:
                ambiguous.append((fn, hit, alt))
            idx_name.setdefault(hit, []).append(fn)
            desc_n += 1
            continue
        orphan.append(fn)

    for d in (idx_id, idx_name):                     # 사람이 보기 좋게 정렬
        for k in d:
            d[k].sort()

    covered = set(idx_id) | {by_name_place[n]["id"] for n in idx_name}
    missing = [p for p in places if p["category"] == "tourist" and p["id"] not in covered]
    # 카테고리별 공백도 함께 센다 — tourist 만 보면 heritage 42건이 통째로 빈 것을 놓친다
    gap = {}
    for p in places:
        if p["id"] not in covered:
            gap.setdefault(p["category"], []).append(p)
    dups = {k: v for k, v in idx_id.items() if len(v) > 1}
    return {
        "byId": idx_id, "byName": idx_name, "dups": dups,
        "unknown_id": unknown_id, "orphan": orphan,
        "legacy": legacy_n, "desc": desc_n, "missing": missing, "gap": gap,
        "ambiguous": ambiguous,
        "cross": cross_place_dupes(idx_id, idx_name, by_name_place),
        "shots": sum(len(v) for v in idx_id.values()) + sum(len(v) for v in idx_name.values()),
    }


def cross_place_dupes(idx_id, idx_name, by_name_place):
    """같은 사진 파일이 서로 다른 장소에 배정됐는지 내용 해시로 잡는다.

    2026-08-26 에 실제로 터진 사고를 막으려고 넣었다: 사진 373장 중 고유 이미지가
    211장뿐이었고, 162장이 다른 관광지 사진의 복사본이었다. 예컨대 '화성시작은영화관'
    간판이 찍힌 사진 한 장이 CGV·롯데시네마 4곳의 대표 사진으로 들어가 있었다.
    파일명만 보면 멀쩡해 보여서 아무 검사도 이것을 잡지 못했다.
    """
    owner = {}                                   # 파일명 → 소속 장소 표시
    for pid, fns in idx_id.items():
        for fn in fns:
            owner[fn] = "id:%d" % pid
    for nm, fns in idx_name.items():
        for fn in fns:
            owner.setdefault(fn, nm)

    import hashlib
    by_hash = {}
    for fn in owner:
        path = os.path.join(PHOTO_DIR, fn)
        if not os.path.exists(path):             # NFD 로 저장된 경우 원본 이름을 되찾는다
            cand = [f for f in os.listdir(PHOTO_DIR)
                    if unicodedata.normalize("NFC", f) == fn]
            if not cand:
                continue
            path = os.path.join(PHOTO_DIR, cand[0])
        with open(path, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()[:12]
        by_hash.setdefault(h, []).append(fn)

    out = []
    for h, fns in by_hash.items():
        places_hit = {owner[f] for f in fns}
        if len(places_hit) > 1:                  # 한 사진이 두 장소 이상을 덮고 있다
            out.append((h, sorted(fns), sorted(places_hit)))
    return sorted(out, key=lambda x: -len(x[1]))


def write_js(r):
    payload = {
        "byId": {str(k): v for k, v in sorted(r["byId"].items())},
        "byName": dict(sorted(r["byName"].items())),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(
            "/* 자동 생성 — tools/build_photo_index.py\n"
            " * 직접 고치지 마십시오. 사진을 추가한 뒤 배포 서버에서 스크립트를 다시 돌리십시오.\n"
            " *\n"
            " * byId   : PLACES.id   → 파일명 배열 (신규 규칙 {읍면동}_{id}_{메모}.jpg)\n"
            " * byName : PLACES.name → 파일명 배열 ({name}.jpg · {name}_{설명}.jpg)\n"
            " * 장소당 여러 장이 올 수 있어 값은 항상 배열이다. 첫 장이 대표.\n"
            " * 조회 순서는 js/ui.js 의 placePhotoSrc() 참조 — byId 우선, 없으면 byName.\n"
            " */\n"
            "var PHOTO_INDEX = " + body + ";\n")
    return len(payload["byId"]), len(payload["byName"])


def main():
    ap = argparse.ArgumentParser(description="사진 인덱스 생성")
    ap.add_argument("--check", action="store_true", help="생성 없이 점검만")
    ap.add_argument("--list", action="store_true", help="사진 넣을 때 참고할 CSV 출력")
    args = ap.parse_args()

    places = load_places()
    tourist = [p for p in places if p["category"] == "tourist"]
    # 편의정보(영화관·캠핑장·관광호텔 등)도 사진 대상이다. 이름이 겹치면 PLACES 를 남긴다.
    _known = {p["name"] for p in places}
    conv = [p for p in load_conv_places() if p["name"] not in _known]
    places = places + conv

    if args.list:
        print("id,읍면동(주소에서 추정),이름,권장_파일명")
        # 편의정보(id:None)는 신규 규칙 {읍면동}_{id}_ 대상이 아니라 제외한다.
        # 안 거르면 sorted 가 None 과 int 를 비교하다 TypeError 로 죽는다.
        for p in sorted([q for q in places if q["id"] is not None], key=lambda x: x["id"]):
            m = re.search(r"([가-힣]+(?:읍|면|동))", (p["address"] or "").replace("화성시", ""))
            emd = m.group(1) if m else "지역"
            nm = p["name"].replace(",", " ")
            print("%d,%s,%s,%s_%d_%s.jpg" % (p["id"], emd, nm, emd, p["id"], nm))
        return 0

    files = scan_photos()
    if files is None:
        print("ℹ️  %s 가 없습니다. 이 워킹트리에는 사진이 없습니다(assets/ 는 git 제외)." % PHOTO_DIR)
        print("   배포 서버에서 실행하십시오.")
        return 0

    r = build(files, places)
    print("사진 %d장 / PLACES %d건 (tourist %d)" % (len(files), len(places), len(tourist)))
    print("  신규 규칙 {읍면동}_{id}   : %d장 → %d곳" % (sum(len(v) for v in r["byId"].values()), len(r["byId"])))
    print("  이름_설명 {name}_{desc}  : %d장" % r["desc"])
    print("  이름 그대로 {name}       : %d장" % r["legacy"])
    print("  → 사진이 있는 장소 %d곳 / 총 %d장" % (len(r["byId"]) + len(r["byName"]), r["shots"]))

    rc = 0
    if r["dups"]:
        print("\nℹ️  한 장소에 여러 장 (배열로 담았습니다. 첫 장이 대표):")
        for pid, fns in sorted(r["dups"].items())[:8]:
            print("   id:%d → %d장" % (pid, len(fns)))
    if r["unknown_id"]:
        rc = 1
        print("\n❌ data.js 에 없는 id 를 가리키는 파일:")
        for fn, pid in r["unknown_id"]:
            print("   %s (id:%d 없음)" % (fn, pid))
    if r["orphan"]:
        print("\n⚠ 어느 장소와도 연결되지 않는 파일 %d개:" % len(r["orphan"]))
        for fn in r["orphan"][:10]:
            print("   %s" % fn)
    if r["ambiguous"]:
        rc = 1
        print("\n❌ 파일명이 두 장소 어느 쪽 것인지 모호합니다 — 짧은 쪽으로 흡수됐습니다:")
        for fn, got, want in r["ambiguous"]:
            print("   %s → '%s' 에 붙었으나 '%s' 도 있습니다" % (fn, got, want))
        print("   → 어느 쪽인지 정하고 '{읍면동}_{id}_{메모}.jpg' 로 바꾸십시오. id 만 대조하므로 안 흔들립니다.")
    if r["cross"]:
        rc = 1
        n = sum(len(f) - 1 for _, f, _ in r["cross"])
        print("\n❌ 같은 사진이 서로 다른 장소에 배정됐습니다 — %d그룹 / 잉여 사본 %d장:"
              % (len(r["cross"]), n))
        for h, fns, pls in r["cross"][:8]:
            print("   [%s] %d곳: %s" % (h, len(pls), ", ".join(fns[:5])))
        print("   → 진짜 주인 1곳만 남기고 나머지 사본을 지우십시오."
              " 사진이 없어지는 장소는 호출부의 이모지 폴백으로 떨어집니다.")
    if r["missing"]:
        print("\nℹ️  사진이 없는 관광지 %d곳 (앞 10개): %s"
              % (len(r["missing"]), ", ".join(p["name"] for p in r["missing"][:10])))
    if r["gap"]:
        print("\nℹ️  카테고리별 사진 공백: %s"
              % " / ".join("%s %d건" % (c, len(v)) for c, v in sorted(r["gap"].items())))

    if args.check:
        print("\n(--check 이므로 js/photos.js 를 쓰지 않았습니다)")
        return rc
    if rc:
        print("\n중단합니다. 위 오류를 먼저 해결하십시오.")
        return rc

    a, b = write_js(r)
    print("\n✅ js/photos.js 생성 — byId %d곳 / byName %d곳 / 총 %d장" % (a, b, r["shots"]))
    print("   ⚠ index.html 의 photos.js ?v= 날짜를 함께 올리십시오.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
