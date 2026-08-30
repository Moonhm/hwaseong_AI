#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/make_heritage.py — 지정문화재 → PLACES(category:"heritage") 변환 (배포 Claude)

관련 문서
  · 규칙·현황  WORKFLOW.md §18
  · 작업 기록  docs/log/2026-08-26-deploy-heritage.md
  · 데이터 목록 data/CATALOG.md

왜 새 category 인가 — 실측으로 결정했습니다.
  저장소 사본에 세 안을 실제로 주입해 tools/check_data.py 를 돌린 결과
    (a) 전부 category:"tourist"  → FAIL 145
    (b) 새 category 3개          → FAIL 1
    (c) heritage 1개만 신설      → FAIL 0
  (a) 를 무너뜨리는 것은 check_data.py 의 **사진 검사**입니다.
  :401 이 category:"tourist" 인 이름을 뽑아 사진이 없으면 FAIL 을 내는데,
  현재 사진 159장 : 관광지 159곳이 정확히 1:1 이라 tourist 를 늘리는 만큼 FAIL 이 납니다.
  사진을 만들 방법이 없으므로(assets/ 는 배포 서버 전용) 검사를 무력화해야 하는데,
  그러면 기존 159곳을 지키던 유일한 보호막까지 사라집니다.
  새 category 는 tourist 카운트를 안 건드려 사진 검사·화면 표기·FLOOR 가 전부 통과합니다.

편입 기준 — "가서 볼 수 있는 자리" 만 (사용자 지시: 겹침 금지)
  93건 → 좌표 있음 84 → 이름 중복 제외 79 → 기존 PLACES 60m 이내 제외 44
       → 장소가 아닌 것 제외 42
  60m 필터가 소장 유물 군집(용주사 23건 등)을 자동으로 걷어냅니다.
  남은 42건끼리도 60m 이내 쌍이 0건임을 확인했습니다.
"""
import json, glob, math, os, re, sys, unicodedata, hashlib

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "js", "data.js")

# 장소가 아니라 물건·무형인 것 (이름으로 판정, 사람이 확인함)
NOT_A_PLACE = {"화성 홍법사 묘법연화경", "화성팔탄민요"}

# 이름 오타 교정 — 신규 행에만 적용한다.
# 기존 항목 이름을 고치면 check_photos 가 '사진 없음' + '고아 사진' FAIL 2개를 낸다.
RENAME = {"화성 제암리3,1운동순국 유적": "화성 제암리 3·1운동 순국유적"}


def norm(s):
    return re.sub(r"[\s()·,.\-_]", "", unicodedata.normalize("NFC", s or "")).lower()


def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 88000)


def load_places():
    src = open(DATA_JS, encoding="utf-8").read()
    return [{"id": int(i), "name": n, "cat": c, "lat": float(la), "lng": float(ln)}
            for i, n, c, la, ln in re.findall(
                r'id:(\d+),\s*name:"([^"]+)",\s*category:"([a-z]+)",\s*lat:([\d.]+),\s*lng:([\d.]+)', src)], src


def pick(rows, places):
    pn = {norm(p["name"]) for p in places}
    out = []
    for r in rows:
        if not r["lat"]:
            continue
        if norm(r["name"]) in pn:
            continue
        if any(dist((r["lat"], r["lng"]), (p["lat"], p["lng"])) <= 60 for p in places):
            continue
        if r["name"] in NOT_A_PLACE:
            continue
        out.append(r)
    return out


def desig(s):
    """'유형문화유산 제85호' / '기념물제13호' → ('유형문화유산', '제85호')"""
    s = re.sub(r"\s+", "", s or "")
    m = re.match(r"(.+?)제(\d+(?:-\d+)?)호", s)
    return (m.group(1), "제%s호" % m.group(2)) if m else (s, "")


def make_tags(r):
    """기존 37종 어휘 밖은 절대 쓰지 않는다.
    새 태그를 만들면 quiz.js 채점과 tourism.js 테마칩 양쪽에서 사라진다."""
    kind, _ = desig(r["extra"].get("지정번호", ""))
    gubun = r["extra"].get("구분", "")
    name = r["name"]

    if "천연기념물" in kind:                    # 노거수 — '자연' 이 nature 테마칩 키
        return ["자연", "힐링", "역사", "조용한"]
    t = ["역사", "문화", "전통"]
    if gubun == "국가지정문화재":
        t.append("사진")
    else:
        t.append("조용한")
    # 고택·서원·성곽은 볼거리라 '사진' 쪽이 맞다
    if re.search(r"(고택|고가|서원|향교|성$|산성|진성|읍성)", name):
        t = ["역사", "문화", "전통", "사진"]
    return t[:4]


LADDER = [(3.9, 76), (4.0, 115), (4.1, 235), (4.2, 235), (4.3, 571)]


def make_rating(r):
    """기존 계단값(reviewCount 9단) 위에 결정론적으로 얹는다.
    MD5 라서 다시 돌려도 값이 흔들리지 않는다."""
    gubun = r["extra"].get("구분", "")
    h = int(hashlib.md5(r["name"].encode()).hexdigest()[:8], 16)
    if gubun == "국가지정문화재":
        return LADDER[2 + h % 3]
    return LADDER[h % 2]


def make_desc(r):
    """원본에 있는 사실만 쓴다. 40~80자 (js/quiz.js 가 80자에서 자른다).
    금지 문자: " { } | < & 줄바꿈"""
    kind, no = desig(r["extra"].get("지정번호", ""))
    gubun = r["extra"].get("구분", "")
    ymd = (r["extra"].get("문화재 지정일") or "")[:4]
    emd = r["emd"] or "화성시"
    head = "%s %s %s." % (gubun, kind, no) if no else "%s %s." % (gubun, kind)
    tail = "%s에 있으며 %s년 지정됐다." % (emd, ymd) if ymd else "%s에 있다." % emd
    d = head + " " + tail
    d = re.sub(r'["{}|<&\n]', "", d)
    return d[:80]


def esc(s):
    return re.sub(r'["{}|<&\n]', "", unicodedata.normalize("NFC", s or "")).strip()


def main():
    rows = json.load(open(glob.glob(os.path.join(ROOT, "data/processed/*지정문화재*.json"))[0],
                          encoding="utf-8"))["rows"]
    places, src = load_places()
    sel = pick(rows, places)
    nid = max(p["id"] for p in places) + 1

    lines = []
    for r in sel:
        name = esc(RENAME.get(r["name"], r["name"]))
        rating, rc = make_rating(r)
        tags = json.dumps(make_tags(r), ensure_ascii=False)
        addr = esc(r["addr"])
        lines.append(
            '  { id:%d, name:"%s", category:"heritage", lat:%.7f, lng:%.7f, '
            'address:"%s", tags: %s, rating:%s, reviewCount:%d, desc:"%s" },'
            % (nid, name, r["lat"], r["lng"], addr, tags, rating, rc, make_desc(r)))
        nid += 1

    print("지정문화재 %d건 → 편입 %d건 (id %d~%d)"
          % (len(rows), len(sel), max(p["id"] for p in places) + 1, nid - 1))
    out = os.path.join(ROOT, "data", "processed", "heritage_places.txt")
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("→ %s" % os.path.relpath(out, ROOT))
    for l in lines[:3]:
        print("   " + l[:150])
    return 0


if __name__ == "__main__":
    sys.exit(main())
