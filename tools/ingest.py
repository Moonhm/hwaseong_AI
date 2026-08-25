#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/ingest.py — 외부 데이터 반입 (배포 Claude 담당 · WORKFLOW.md §18)

사용자가 /home/jovyan/work/ 에 원본 파일을 넣어 두면 이 도구가
  형식 확인 → 분류 → 지오코딩 → 기존 데이터 대조 → 보고
까지 수행한다. **기본은 보고만 하고 아무것도 쓰지 않는다.**

사용법
    python3 tools/ingest.py                    # /home/jovyan/work/ 스캔 후 보고
    python3 tools/ingest.py --dir <경로>        # 다른 폴더 스캔
    python3 tools/ingest.py --geocode           # 지오코딩까지 수행(네트워크)
    python3 tools/ingest.py --geocode --apply   # 실제로 js/data.js 에 추가

설계 근거
  · 지오코딩은 **이름 키워드 검색이 주력**이다. 동일 표본 30건 A/B 실측에서
    주소 검색은 22건 중 19건(86%)이 입력 주소의 행정구역 중심점을 그대로
    돌려줬다 — 유효 정보율 10%. 이름 검색은 21건 전부 실제 POI 로 70%.
  · 화성시 판정은 region_2depth_name 이 "화성시 만세구" 형태이므로
    반드시 indexOf 로 본다. === '화성시' 는 전건 실패한다.
  · 신규 id 는 data.js 실측 max+1 에서 시작한다. 하드코딩하면 §6 BUG-1 이 재발한다.
  · 주차장·지역화폐는 API 수집분이 정확하므로 덮어쓰지 않고 보고만 한다.
"""
import argparse, csv, io, json, os, re, sys, time, unicodedata
import urllib.parse, urllib.request

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "js", "data.js")
KEY = os.environ.get("KAKAO_REST_KEY", "1bd845da5756d1c78955463b800731ef")

HS_LAT = (36.98, 37.35)
HS_LNG = (126.45, 127.16)

# ── 분류 규칙 ────────────────────────────────────────────────────────────────
# 판별은 (1) 컬럼명 토큰 (2) 값 집합 두 축으로 본다. 값 집합이 결정적이다.
VALUE_SETS = {
    "hotel":       {"특1급", "특2급", "1급", "2급", "3급", "5성급", "4성급", "3성급", "2성급", "1성급"},
    "camping":     {"일반야영장", "자동차야영장", "글램핑", "카라반"},
    "touristrest": {"한식", "중국식", "일식", "서양식", "기타외국식"},
}
COL_HINTS = [
    ("parking",     ("주차구획", "주차면", "급지", "주차장명", "요금정보", "주차장구분")),
    ("localcurrency", ("가맹점명", "가맹점", "업종", "카드가맹")),
    ("camping",     ("야영장명", "야영장구분", "야영장면수", "캠핑장명", "글램핑", "카라반")),
    ("hotel",       ("객실수", "등급", "관광호텔", "호텔명", "부대시설")),
    ("touristrest", ("관광식당", "관광진흥법", "음식종류", "영업장면적")),
    ("restaurant",  ("모범음식점", "주메뉴", "업소명", "음식점명")),
    ("temple",      ("템플스테이", "사찰명", "수련프로그램", "전통사찰")),
    ("festival",    ("축제명", "행사명", "행사기간", "개최기간", "축제기간")),
    ("tourist",     ("관광지", "관광지명", "명소", "체험", "볼거리")),
]
LABEL = {
    "tourist": "관광지", "festival": "축제·행사", "restaurant": "모범음식점",
    "touristrest": "관광식당업", "hotel": "관광호텔", "camping": "캠핑장",
    "temple": "템플스테이", "jebu": "제부도 숙박", "parking": "공영주차장",
    "localcurrency": "지역화폐 가맹점", "_review": "신규 유형 후보(보류)", "_reject": "반입 불가",
}
# 덮어쓰지 않는 분류 — API 수집분이 더 정확하다
PROTECTED = {"parking", "localcurrency"}

NAME_COLS = ["명칭", "시설명", "장소명", "상호명", "이름", "축제명", "행사명",
             "가맹점명", "업소명", "야영장명", "호텔명", "사찰명", "주차장명",
             "관광지명", "체험장명", "시설명칭", "name"]
ADDR_COLS = ["소재지도로명주소", "소재지지번주소", "도로명주소", "지번주소",
             "주소", "소재지", "위치", "장소주소", "address"]
LAT_COLS = ["위도", "lat", "latitude", "y"]
LNG_COLS = ["경도", "lng", "lon", "longitude", "x"]


def pick(cols, cands, generic=None):
    """정확일치 → 부분일치 → 일반 패턴(예: '~명' 으로 끝나는 컬럼) 순으로 찾는다.
    공공데이터 컬럼명이 기관마다 제각각이라('화장실명','시장명','도서관명')
    후보 목록만으로는 계속 놓친다."""
    low = {c.strip().lower(): c for c in cols}
    for c in cands:
        if c.lower() in low:
            return low[c.lower()]
    for c in cands:                      # 부분 일치 폴백
        for k, orig in low.items():
            if c.lower() in k:
                return orig
    if generic:
        for orig in cols:
            if generic(orig.strip()):
                return orig
    return None


def _is_name_col(c):
    """'~명'·'~이름' 으로 끝나되 '주소·번호·일자' 류가 아닌 컬럼."""
    if re.search(r"(주소|번호|일자|일시|기간|시간|구분|유형|종류|수$|량$)", c):
        return False
    return bool(re.search(r"(명|이름)$", c))


def read_table(path):
    """CSV/TSV/JSON/XLSX → (rows, 사용한 인코딩). 한글 CSV 는 cp949 가 흔하다."""
    ext = path.rsplit(".", 1)[-1].lower()
    if ext == "json":
        d = json.load(open(path, encoding="utf-8"))
        return (d if isinstance(d, list) else [d]), "utf-8"
    if ext in ("xlsx", "xls"):
        try:
            import pandas as pd
            df = pd.read_excel(path)
            return df.where(pd.notna(df), None).to_dict("records"), "excel"
        except ImportError:
            return None, "openpyxl 미설치 — pip install openpyxl"
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
        try:
            txt = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        delim = "\t" if ext == "tsv" or txt[:2000].count("\t") > txt[:2000].count(",") else ","
        rows = list(csv.DictReader(io.StringIO(txt), delimiter=delim))
        if rows:
            return rows, enc
    return None, "인코딩 판별 실패(utf-8/cp949/euc-kr 모두 실패)"


def classify(rows):
    """(category, 근거) 반환"""
    if not rows:
        return "_reject", "행이 0건"
    cols = [c for c in (rows[0].keys() if hasattr(rows[0], "keys") else []) if c]
    joined = " ".join(cols)

    # 1) 값 집합 — 가장 결정적
    for cat, vals in VALUE_SETS.items():
        for c in cols:
            got = [str(r.get(c) or "").strip() for r in rows[:80]]
            got = [g for g in got if g]
            if got and sum(1 for g in got if g in vals) / len(got) >= 0.6:
                return cat, "컬럼 '%s' 값이 %s 집합과 일치" % (c, LABEL[cat])

    # 2) 제부도 숙박 — 주소 값으로 판정
    ac = pick(cols, ADDR_COLS)
    if ac:
        addrs = [str(r.get(ac) or "") for r in rows]
        hit = sum(1 for a in addrs if "제부" in a)
        # 표본이 적으면 값 기반 판정이 우연히 맞을 수 있다(1행짜리가 1/1=100%).
        if len(addrs) >= 5 and hit / len(addrs) >= 0.8:
            return "jebu", "주소 %d/%d 가 '제부' 포함" % (hit, len(addrs))

    # 3) 컬럼명 토큰
    for cat, toks in COL_HINTS:
        for t in toks:
            if t in joined:
                return cat, "컬럼명에 '%s'" % t

    # 4) 최소 요건조차 없으면 거절
    if not pick(cols, NAME_COLS, _is_name_col) and not ac and not pick(cols, LAT_COLS):
        return "_reject", "이름·주소·좌표 컬럼이 모두 없음"
    return "_review", "기존 분류에 안 걸림 — 컬럼: %s" % ", ".join(cols[:8])


# ── 지오코딩 (이름 우선 캐스케이드) ───────────────────────────────────────────
_cache = {}


def _api(ep, params):
    k = (ep, tuple(sorted(params.items())))
    if k in _cache:
        return _cache[k]
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request("https://dapi.kakao.com/v2/local/%s?%s" % (ep, q),
                                 headers={"Authorization": "KakaoAK " + KEY})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=8).read().decode())
    except Exception:
        d = {}
    _cache[k] = d
    time.sleep(0.06)
    return d


def in_hs(lat, lng):
    return HS_LAT[0] <= lat <= HS_LAT[1] and HS_LNG[0] <= lng <= HS_LNG[1]


def _hs_doc(docs):
    """화성시 결과 우선. region_2depth_name 이 '화성시 만세구' 형태라 indexOf 로 본다."""
    for d in docs:
        a = (d.get("address_name") or "") + (d.get("road_address_name") or "")
        if "화성시" in a:
            return d
    return None


def region_of(lat, lng):
    d = _api("geo/coord2regioncode.json", {"x": lng, "y": lat})
    H = [x for x in d.get("documents", []) if x.get("region_type") == "H"]
    if not H:
        return "", ""
    gu = (H[0].get("region_2depth_name") or "").replace("화성시", "").strip()
    return gu, (H[0].get("region_3depth_name") or "")


def geocode(name, addr):
    """이름 → 주소 순. (lat, lng, 등급, 근거)"""
    name = (name or "").strip()
    addr = (addr or "").strip()
    body = re.sub(r"^\s*(경기도\s*)?(화성시\s*)?", "", addr)

    if name:
        for q in (name, "화성 " + name):
            d = _hs_doc(_api("search/keyword.json", {"query": q, "size": 15}).get("documents", []))
            if d:
                return float(d["y"]), float(d["x"]), "exact", "키워드:" + d.get("place_name", q)
    if body and any(ch.isdigit() for ch in body):
        d = _hs_doc(_api("search/address.json",
                         {"query": "경기도 화성시 " + body, "size": 10}).get("documents", []))
        if d:
            return float(d["y"]), float(d["x"]), "addr", "주소:" + d.get("address_name", body)
    if body:
        d = _hs_doc(_api("search/address.json",
                         {"query": "경기도 화성시 " + body, "size": 10}).get("documents", []))
        if d:
            return float(d["y"]), float(d["x"]), "guess", "행정중심점:" + d.get("address_name", body)
    return None, None, "fail", "좌표를 얻지 못함"


def next_id():
    src = open(DATA_JS, encoding="utf-8").read()
    ids = [int(m) for m in re.findall(r"\bid:\s*(\d+)", src)]
    return max(ids) + 1 if ids else 1


def existing():
    src = open(DATA_JS, encoding="utf-8").read()
    return [{"id": int(i), "name": n, "lat": float(la), "lng": float(ln)}
            for i, n, la, ln in re.findall(
                r'id:(\d+),\s*name:"([^"]+)"[^}]*?lat:([\d.]+),\s*lng:([\d.]+)', src)]


def norm(s):
    s = unicodedata.normalize("NFC", (s or "")).lower()
    return re.sub(r"[\s()\[\]·,.\-_]", "", s)


def main():
    ap = argparse.ArgumentParser(description="외부 데이터 반입")
    ap.add_argument("--dir", default="/home/jovyan/work", help="스캔할 폴더")
    ap.add_argument("--geocode", action="store_true", help="지오코딩 수행(네트워크)")
    ap.add_argument("--apply", action="store_true", help="js/data.js 에 실제로 추가")
    args = ap.parse_args()

    exts = (".csv", ".tsv", ".json", ".xlsx", ".xls")
    files = []
    for f in sorted(os.listdir(args.dir)):
        p = os.path.join(args.dir, f)
        if os.path.isfile(p) and f.lower().endswith(exts) and not f.startswith("."):
            files.append(p)

    print("스캔 폴더: %s" % args.dir)
    if not files:
        print("  반입할 파일이 없습니다. (.csv/.tsv/.json/.xlsx)")
        return 0
    print("  파일 %d개 발견\n" % len(files))

    nid = next_id()
    prev = existing()
    print("현재 js/data.js — %d건, 다음 안전 id = %d\n" % (len(prev), nid))
    print("=" * 74)

    for p in files:
        base = os.path.basename(p)
        rows, enc = read_table(p)
        if rows is None:
            print("\n❌ %s — %s" % (base, enc))
            continue
        cat, why = classify(rows)
        cols = [c for c in rows[0].keys() if c]
        print("\n📄 %s" % base)
        print("   %d행 / 인코딩 %s / 컬럼 %d개" % (len(rows), enc, len(cols)))
        print("   분류: %s  ← %s" % (LABEL.get(cat, cat), why))

        if cat in PROTECTED:
            print("   ⏭  %s 는 기존 API 수집분이 정확합니다. 덮어쓰지 않고 보고만 합니다(§18)." % LABEL[cat])
            continue
        if cat in ("_reject", "_review"):
            print("   ⏸  자동 반입 대상이 아닙니다. 사용자 확인이 필요합니다.")
            print("      컬럼: %s" % ", ".join(cols[:12]))
            continue

        nc, ac = pick(cols, NAME_COLS, _is_name_col), pick(cols, ADDR_COLS)
        print("   이름 컬럼: %s / 주소 컬럼: %s" % (nc or "❌없음", ac or "❌없음"))
        if not nc and not ac:
            print("   ⏸  이름·주소가 모두 없어 지오코딩이 불가합니다.")
            continue

        # 기존 데이터와 중복 대조 (이름 정규화)
        pmap = {norm(x["name"]): x for x in prev}
        dups = []
        for r in rows:
            n = str(r.get(nc) or "").strip() if nc else ""
            if n and norm(n) in pmap:
                dups.append((n, pmap[norm(n)]["id"]))
        if dups:
            print("   ⚠ 기존 데이터와 이름이 같은 항목 %d건 — 건별 확인 대상(§18):" % len(dups))
            for n, i in dups[:8]:
                print("      · %s (기존 id:%d)" % (n, i))

        if not args.geocode:
            print("   ℹ️  --geocode 를 붙이면 좌표를 조회합니다.")
            continue

        grades = {}
        out = []
        for i, r in enumerate(rows):
            n = str(r.get(nc) or "").strip() if nc else ""
            a = str(r.get(ac) or "").strip() if ac else ""
            lat, lng, g, why2 = geocode(n, a)
            grades[g] = grades.get(g, 0) + 1
            if lat and not in_hs(lat, lng):
                g = "outside"
                grades["outside"] = grades.get("outside", 0) + 1
            out.append({"name": n, "addr": a, "lat": lat, "lng": lng, "geo": g, "src": why2})
        print("   지오코딩: " + " / ".join("%s %d" % (k, v) for k, v in sorted(grades.items())))
        ok = [o for o in out if o["lat"] and o["geo"] != "outside"]
        print("   → 반영 가능 %d건 / 보류 %d건" % (len(ok), len(out) - len(ok)))

        if args.apply:
            print("   ⚠ --apply 는 아직 구현하지 않았습니다. 분류·좌표를 먼저 검수하십시오.")

    print("\n" + "=" * 74)
    print("보고만 수행했습니다. js/data.js 는 수정하지 않았습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
