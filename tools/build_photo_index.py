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
    by_name = {p["name"]: p for p in places}
    by_id = {p["id"]: p for p in places}

    idx_id, idx_name = {}, {}
    dup_id = defaultdict(list)      # 같은 id 에 사진이 둘 이상
    unknown_id, orphan_name, legacy = [], [], []

    for fn in files:
        m = NEW_RE.match(fn)
        if m:
            pid = int(m.group("id"))
            if pid not in by_id:
                unknown_id.append((fn, pid))
                continue
            dup_id[pid].append(fn)
            idx_id[pid] = fn
        else:
            stem = fn.rsplit(".", 1)[0]
            if stem in by_name:
                idx_name[stem] = fn
                legacy.append(fn)
            else:
                orphan_name.append(fn)

    dups = {k: v for k, v in dup_id.items() if len(v) > 1}
    covered = set(idx_id) | {by_name[n]["id"] for n in idx_name if n in by_name}
    missing = [p for p in places if p["category"] == "tourist" and p["id"] not in covered]
    return {
        "byId": idx_id, "byName": idx_name, "dups": dups,
        "unknown_id": unknown_id, "orphan": orphan_name,
        "legacy": legacy, "missing": missing,
    }


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
            " * byId   : PLACES.id      → 파일명   (신규 규칙 {읍면동}_{id}_{메모}.jpg)\n"
            " * byName : PLACES.name    → 파일명   (기존 규칙 {name}.jpg)\n"
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

    if args.list:
        print("id,읍면동(주소에서 추정),이름,권장_파일명")
        for p in sorted(places, key=lambda x: x["id"]):
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
    print("  신규 규칙 매칭 : %d장" % len(r["byId"]))
    print("  기존 규칙 매칭 : %d장" % len(r["byName"]))

    rc = 0
    if r["dups"]:
        rc = 1
        print("\n❌ 같은 id 에 사진이 둘 이상입니다 — 어느 것이 쓰일지 보장되지 않습니다:")
        for pid, fns in sorted(r["dups"].items()):
            print("   id:%d → %s" % (pid, ", ".join(fns)))
    if r["unknown_id"]:
        rc = 1
        print("\n❌ data.js 에 없는 id 를 가리키는 파일:")
        for fn, pid in r["unknown_id"]:
            print("   %s (id:%d 없음)" % (fn, pid))
    if r["orphan"]:
        print("\n⚠ 어느 장소와도 연결되지 않는 파일 %d개:" % len(r["orphan"]))
        for fn in r["orphan"][:10]:
            print("   %s" % fn)
    if r["missing"]:
        print("\nℹ️  사진이 없는 관광지 %d곳 (앞 10개): %s"
              % (len(r["missing"]), ", ".join(p["name"] for p in r["missing"][:10])))

    if args.check:
        print("\n(--check 이므로 js/photos.js 를 쓰지 않았습니다)")
        return rc
    if rc:
        print("\n중단합니다. 위 오류를 먼저 해결하십시오.")
        return rc

    a, b = write_js(r)
    print("\n✅ js/photos.js 생성 — byId %d / byName %d" % (a, b))
    print("   ⚠ index.html 의 photos.js ?v= 날짜를 함께 올리십시오.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
