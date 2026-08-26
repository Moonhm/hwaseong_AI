#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check_data.py — 데이터 손실 검사 (표준 라이브러리만, node 불필요)

왜 파이썬 단독인가:
  이 저장소의 1순위 요구는 "웹에 있는 서비스 데이터 손실이 전혀 없도록" 이다.
  그 1순위 검사가 node 설치 여부에 따라 건너뛰어지면 안 된다.
  그래서 데이터 축은 python3 표준 라이브러리만으로 자립하게 만들었고,
  node 는 JS 문법·전역충돌·죽은버튼 검사(코드 축)에서만 쓴다.

왜 등호가 아니라 하한(floor)인가:
  데이터는 정당하게 늘어난다(관광지 추가, 가맹점 갱신). 등호를 걸면
  추가할 때마다 빨간불이 뜨고, 사람은 곧 기준선을 습관적으로 덮어쓰게 된다.
  그 손짓에 손실이 섞여 들어오면 검사가 있으나 마나가 된다.
  그래서 "줄면 실패 / 늘면 통과 + 기준선 갱신 안내" 로 만들었다.
"""
import json, os, re, sys, unicodedata

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─────────────────────────────────────────────────────────────────────────────
# 기준선 (사람이 갱신하는 유일한 곳)
#   * 갱신 규칙: "늘었다" 안내가 뜨면 그 숫자를 여기에 반영한다.
#     줄었는데도 정당하다면(중복 제거 등) 반드시 커밋 메시지에 이유를 남긴다.
#   * 2026-08-25 실측값
# ─────────────────────────────────────────────────────────────────────────────
FLOOR = {
    "PLACES.tourist":               159,   # js/data.js  category:"tourist"
    "PLACES.festival":               50,   # js/data.js  category:"festival"  (2026-08-26 id:276·277 추가)
    "PLACES.heritage":               42,   # js/data.js  category:"heritage" (2026-08-26 지정문화재)
    "CONVENIENCE.restaurants":       94,   # js/convenience.js:5    모범음식점
    "CONVENIENCE.touristRestaurants": 35,  # js/convenience.js:103  관광식당업
    "CONVENIENCE.hotels":            10,   # js/convenience.js:142  관광호텔
    "CONVENIENCE.camping":           17,   # js/convenience.js:156  캠핑장
    "CONVENIENCE.jebu.pension_outside": 47,
    "CONVENIENCE.jebu.inside":       21,
    "CONVENIENCE.jebu.nearby":        3,
    "CONVENIENCE.jebu.minbak_inside":31,
    "CONVENIENCE.jebu.minbak_nearby":13,
    "parking-static.json":          131,
    "localcurrency-static.json":  27374,
    "ratings.json":                 159,   # 코드 참조 0건이지만 kakaoId 159건의 유일한 사본
    # 2026-08-26 감사에서 '하한이 없어 통째로 사라져도 통과' 하던 것들을 채웠다.
    # 변조 실험으로 확인한 사각지대였다 — 데이터가 비어도 검사는 초록불이었다.
    "restaurants-static.json":     3754,   # js/restaurants-static.json rows (지도 음식점 칩)
    "CONVENIENCE.touristFacilities": 10,   # 지도 🏘️ 관광편의시설 칩
    "CONVENIENCE.cinemas":           10,   # 지도 🎬 영화상영관 칩
}
# templeStay(용주사) 는 배열이 아니라 객체 1건이라 건수가 아니라 '존재 여부'로 본다 (check_counts 참조)

# 알려진 결함의 상한(ceiling). 늘어나면 실패한다.
#   - 지금 이 값을 0 으로 못박으면 상시 빨간불이 되어 아무도 안 쓴다.
#   - 그래서 "현재 사실"을 박아두고 악화만 막는다. 줄이면 값을 내려라.
CEILING = {
    "lc.empty_addr": 503,     # localcurrency-static.json 의 a(주소) 빈 문자열 건수
    # 2026-08-25 해소 — geocode_jebu.py 에 jebu 섹션 범위 가드가 들어가
    # 이제 건수 상한이 아니라 '가드 존재 여부'를 본다 (check_tool_regex 참조).
    "jebu_regex_out_of_scope": 0,
    "fetch_without_cachebust": 2,   # ?v= 없는 fetch 대상 수 (parking/localcurrency static)
    # 2026-08-26: 사진 373장 중 162장이 '다른 관광지 사진의 복사본'이었다.
    # 한 장이 6곳을 덮은 사례까지 있어(작은영화관 간판 사진 → CGV·롯데시네마 4곳)
    # 전부 지웠다. 그 결과 관광지 120곳이 사진 없음이 됐고, 2026-08-26 2차 반입(138장)으로 32곳까지 줄었다.
    #   그 뒤 감사에서 '다른 장소 사진' 3장(스타즈호텔프리미어동탄·프로방스율암=화성예술의전당,
    #   롯데시네마동탄=CGV 로비)을 더 걷어내 34곳이 됐다. sha256 이 아니라 지각해시로 잡혔다.
    # 화면은 js/ui.js placePhotoSrc 호출부 4곳의 이모지 폴백으로 안전하게 떨어진다.
    # 사진을 새로 받으면 이 값을 내려라. 올리지는 마라.
    "photo_missing_tourist": 34,
    "photo_orphan": 3,              # PLACES·convenience 어디에도 없는 사진 (행사 사진 4장)
}

# 좌표 상자 — 화성시보다 넉넉히. 실측 27,712건 전부 이 안에 있다.
BOX = (36.8, 37.5, 126.3, 127.4)

FAIL, WARN, INFO = [], [], []
def fail(msg): FAIL.append(msg)
def warn(msg): WARN.append(msg)
def info(msg): INFO.append(msg)

# 4.2MB 짜리 localcurrency-static.json 을 두 번 파싱하지 않도록 한 번만 읽어 캐시한다.
# (실측: json.load 1회 0.195초. 캐시 없으면 건수 검사와 필드 검사가 각각 파싱해 0.4초를 쓴다.)
# 굳이 완전 파싱을 고집하는 이유: 파싱 자체가 "파일이 잘렸는가" 검사를 겸하기 때문이다.
# index.html:3607 의 빈 catch 가 브라우저에서 그 실패를 통째로 삼키므로, 여기서 안 잡으면 아무도 못 잡는다.
_JSON = {}
def load_json(fn):
    if fn in _JSON: return _JSON[fn]
    try:
        _JSON[fn] = json.load(open(os.path.join(ROOT, fn), encoding="utf-8"))
    except Exception as e:
        fail("%s  JSON 을 읽을 수 없다 (%s: %s) — 파일이 잘렸거나 깨졌다. "
             "브라우저에서는 빈 catch 가 삼켜 '0건'으로 조용히 렌더된다" % (fn, type(e).__name__, e))
        _JSON[fn] = None
    return _JSON[fn]


# ─── JS 소스에서 배열 원소 수를 세는 스캐너 ──────────────────────────────────
# 정규식 대신 문자 스캔을 쓰는 이유: 문자열 리터럴 안의 중괄호/대괄호와
# 주석 안의 예시 코드에 속지 않기 위해서다.
def strip_js_comments(src):
    """주석을 지우되 개행은 남긴다 — 보고하는 줄 번호가 실제 줄과 어긋나면 안 되므로."""
    out, i, n = [], 0, len(src)
    while i < n:
        ch = src[i]
        if ch in "\"'`":
            q = ch; out.append(ch); i += 1
            while i < n:
                if src[i] == "\\": out.append("  "); i += 2; continue
                out.append(src[i])
                if src[i] == q: i += 1; break
                i += 1
            continue
        if ch == "/" and i + 1 < n and src[i+1] == "*":
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            out.append("\n" * src.count("\n", i, j)); i = j; continue
        if ch == "/" and i + 1 < n and src[i+1] == "/":
            j = src.find("\n", i); j = n if j < 0 else j
            i = j; continue
        out.append(ch); i += 1
    return "".join(out)


def count_objects_in_array(src, start_bracket):
    """src[start_bracket] == '[' 인 지점부터 균형을 맞춰 스캔, 깊이 1의 '{' 개수를 센다."""
    depth = 0; n = 0; i = start_bracket; L = len(src)
    while i < L:
        ch = src[i]
        if ch in "\"'`":
            q = ch; i += 1
            while i < L:
                if src[i] == "\\": i += 2; continue
                if src[i] == q: i += 1; break
                i += 1
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0: return n
        elif ch == "{":
            if depth == 1: n += 1
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return -1  # 닫히지 않았다 = 파일이 잘렸다


def array_len(src, key, path, hint=""):
    m = re.search(r"(?m)^\s*%s\s*:\s*\[" % re.escape(key), src)
    if not m:
        fail("%s  배열 '%s' 를 못 찾았다 — 키 이름이 바뀌었거나 사라졌다. %s" % (path, key, hint))
        return 0
    ln = src.count("\n", 0, m.start()) + 1
    n = count_objects_in_array(src, m.end() - 1)
    if n < 0:
        fail("%s:%d  배열 '%s' 가 닫히지 않았다 — 파일이 잘렸다" % (path, ln, key))
        return 0
    return n


# ─── 1. 레코드 수 하한 ───────────────────────────────────────────────────────
def check_counts():
    got = {}

    p_data = os.path.join(ROOT, "js/data.js")
    src_d  = strip_js_comments(open(p_data, encoding="utf-8").read())
    got["PLACES.tourist"]  = len(re.findall(r'category:\s*"tourist"',  src_d))
    got["PLACES.festival"] = len(re.findall(r'category:\s*"festival"', src_d))
    got["PLACES.heritage"] = len(re.findall(r'category:\s*"heritage"', src_d))

    # 포맷 방어: PLACES 배열의 실제 객체 수와 카테고리 합이 어긋나면 세는 방법이 낡은 것이다.
    m = re.search(r"(?m)^\s*(?:const|let|var)\s+PLACES\s*=\s*\[", src_d)
    if not m:
        fail("js/data.js  PLACES 배열 선언을 못 찾았다 — 세는 방법이 무효다")
    else:
        total = count_objects_in_array(src_d, m.end() - 1)
        s = got["PLACES.tourist"] + got["PLACES.festival"] + got["PLACES.heritage"]
        if total != s:
            fail("js/data.js:%d  PLACES 객체 %d개인데 category 합은 %d개 — "
                 "category 가 없거나 오타난 항목이 %d건 있다"
                 % (src_d.count("\n", 0, m.start()) + 1, total, s, abs(total - s)))

    p_conv = os.path.join(ROOT, "js/convenience.js")
    src_c  = strip_js_comments(open(p_conv, encoding="utf-8").read())
    for k in ("restaurants", "touristRestaurants", "hotels", "camping"):
        got["CONVENIENCE." + k] = array_len(
            src_c, k, "js/convenience.js",
            "index.html:2141 의 `CONVENIENCE[srcMap[convCat]]` 가 undefined 를 받아 목록이 빈다")
    for k in ("pension_outside", "inside", "nearby", "minbak_inside", "minbak_nearby"):
        got["CONVENIENCE.jebu." + k] = array_len(
            src_c, k, "js/convenience.js",
            "js/conv_map.js:45-52 의 `(j.%s || [])` 가 조용히 빈 배열을 쓴다" % k)
    # templeStay 는 객체 1건 — 있는지만 본다
    if not re.search(r"(?m)^\s*templeStay\s*:\s*\{", src_c):
        fail("js/convenience.js  templeStay(용주사, 1건) 가 사라졌다")

    for key, fn in (("parking-static.json", "js/parking-static.json"),
                    ("localcurrency-static.json", "js/localcurrency-static.json"),
                    ("ratings.json", "js/ratings.json")):
        d = load_json(fn)
        got[key] = -1 if d is None else len(d)

    for k, base in FLOOR.items():
        g = got.get(k, -1)
        if g < 0:      continue                       # 위에서 이미 FAIL 처리됨
        elif g < base: fail("%-32s 기준선 %6d → 지금 %6d  (%d건 사라졌다)" % (k, base, g, base - g))
        elif g > base: info("%-32s 기준선 %6d → 지금 %6d  (+%d) — 기준선을 갱신하라"
                            " (tools/check_data.py FLOOR)" % (k, base, g, g - base))
    total = sum(v for v in got.values() if v > 0)
    return got, total


# ─── 2. 필드·좌표 모양 ───────────────────────────────────────────────────────
# 건수가 그대로여도 lat/lng 가 falsy 면 지도에서만 조용히 사라진다.
#   js/localcurrency.js:102,150 / js/parking.js:155,182,183 의 `!p.lat || !p.lng` 가
#   버리는 건수를 아무도 세지 않기 때문이다. 여기서 대신 센다.
def check_shape():
    def rows(fn):
        return load_json(fn) or []   # 못 읽었으면 check_counts 가 이미 FAIL 을 냈다

    def scan(label, data, req):
        bad = 0
        for i, r in enumerate(data):
            nm = r.get("name") or r.get("n") or "?"
            miss = [k for k in req if k not in r]
            if miss:
                bad += 1
                if bad <= 10: fail("%s[%d] id=%s %s  필드 %s 없음" % (label, i, r.get("id", "?"), nm, miss))
                continue
            la, ln = r.get("lat"), r.get("lng")
            if not isinstance(la, (int, float)) or not isinstance(ln, (int, float)) or not la or not ln:
                bad += 1
                if bad <= 10: fail("%s[%d] id=%s %s  좌표 falsy — 지도에서 조용히 빠진다" % (label, i, r.get("id", "?"), nm))
            elif not (BOX[0] < la < BOX[1] and BOX[2] < ln < BOX[3]):
                bad += 1
                if bad <= 10: fail("%s[%d] id=%s %s  좌표가 화성 밖 (%s,%s)" % (label, i, r.get("id", "?"), nm, la, ln))
        if bad > 10: fail("%s  … 그리고 %d건 더" % (label, bad - 10))

    scan("js/parking-static.json",      rows("js/parking-static.json"),      ("id", "name", "lat", "lng"))
    lc = rows("js/localcurrency-static.json")
    scan("js/localcurrency-static.json", lc,                                 ("id", "n", "c", "a", "lat", "lng"))

    empty = sum(1 for r in lc if not r.get("a"))
    if lc and empty > CEILING["lc.empty_addr"]:
        fail("js/localcurrency-static.json  주소(a) 빈 값이 상한 %d → %d 로 늘었다"
             % (CEILING["lc.empty_addr"], empty))
    elif lc:
        info("js/localcurrency-static.json  주소 빈 값 %d건 (상한 %d 이내)" % (empty, CEILING["lc.empty_addr"]))

    # js/data.js — "한 줄에 객체 하나" 포맷에 의존하므로, 매칭 줄 수가 급감하면 그 자체를 실패로 만든다.
    lines = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read().split("\n")
    hit = 0; ids = {}
    for i, l in enumerate(lines, 1):
        if not l.startswith("  { id:"): continue
        hit += 1
        for k in ("name:", "category:", "lat:", "lng:"):
            if k not in l: fail("js/data.js:%d  '%s' 없음  %s" % (i, k[:-1], l.strip()[:60]))
        m = re.search(r"lat:\s*([\d.]+),\s*lng:\s*([\d.]+)", l)
        if not m:
            fail("js/data.js:%d  lat/lng 를 읽을 수 없다  %s" % (i, l.strip()[:60]))
        elif not (BOX[0] < float(m.group(1)) < BOX[1] and BOX[2] < float(m.group(2)) < BOX[3]):
            fail("js/data.js:%d  좌표가 화성 밖 (%s,%s)" % (i, m.group(1), m.group(2)))
        mi = re.match(r"  \{ id:(\d+)", l)
        if mi: ids.setdefault(mi.group(1), []).append(i)
    if hit < 200:
        fail("js/data.js  '  { id:' 로 시작하는 줄이 %d개뿐이다 — 포맷이 바뀌어 이 검사가 무효다. "
             "포맷을 되돌리거나 이 검사를 고쳐라" % hit)
    for k, v in ids.items():
        if len(v) > 1: fail("js/data.js  id=%s 가 %s 줄에 중복 — 즐겨찾기·상세보기가 엉뚱한 곳을 연다" % (k, v))


# ─── 3. 화면에 손으로 적힌 숫자 ↔ 실제 데이터 ────────────────────────────────
# 데이터가 줄어도 화면은 계속 옛 숫자를 말한다. 손실을 은폐하는 두 번째 층을 걷어낸다.
# 각 패턴에 "최소 출현 횟수"를 붙인 이유: 문구를 바꿔 쓰면(관광지→관광명소)
# 검사가 그 줄을 못 보고 조용히 통과한다. 0건이면 그 자체를 실패로 만든다.
PRINTED = [
    # (정규식, 기대 키, 최소 출현 횟수)
    (r"관광지\s*([\d,]+)곳",            "PLACES.tourist",               2),  # index.html:1396, 1401
    (r"축제\s*([\d,]+)건",              "PLACES.festival",              2),  # index.html:1396, 1402
    (r"공영주차장\s*([\d,]+)개",        "parking-static.json",          1),  # index.html:1397
    (r"지역화폐 가맹점\s*([\d,]+)개",   "localcurrency-static.json",    1),  # index.html:1397
    (r"인증 맛집\s*([\d,]+)곳",         "CONVENIENCE.restaurants",      1),  # index.html:1754
    (r"화성시 캠핑장\s*([\d,]+)곳",     "CONVENIENCE.camping",          1),  # index.html:1768
    (r"펜션·민박\s*([\d,]+)곳",         "CONVENIENCE.jebu.total",       1),  # index.html:1775
    (r'id="living-list-count">([\d,]+)곳', "CONVENIENCE.restaurants",   1),  # index.html:1590
    (r'stat-val-sm">([\d,]+)</div><div class="stat-lbl-sm">모범음식점', "CONVENIENCE.restaurants", 1),        # :1557
    (r'stat-val-sm">([\d,]+)</div><div class="stat-lbl-sm">관광식당업', "CONVENIENCE.touristRestaurants", 1), # :1558
    # 2026-08-26 감사 보강 — 같은 문단의 다른 숫자는 전부 지켜지는데 이 둘만 빠져 있었다.
    (r"지정문화재\s*([\d,]+)곳",       "PLACES.heritage",              2),  # About 문단 + 칩
    # 지도 칩 '🍜 음식점 3,754' 는 2026-08-26 에 제거했다. 데이터 파일은 남아 있어
    # 아래 FLOOR 가 건수를 계속 지킨다 — 다시 띄울 때 이 PRINTED 항목도 되살려라.
]
# index.html:2698-2718 의 카드 숫자
PRINTED_CARD = [
    ("모범음식점", "CONVENIENCE.restaurants"),
    ("관광식당업", "CONVENIENCE.touristRestaurants"),
    ("관광호텔",   "CONVENIENCE.hotels"),
    ("캠핑장",     "CONVENIENCE.camping"),
    ("제부도 숙박", "CONVENIENCE.jebu.total"),
]

def check_printed(got):
    got = dict(got)
    got["CONVENIENCE.jebu.total"] = sum(v for k, v in got.items() if k.startswith("CONVENIENCE.jebu."))

    # 2026-08-25 인라인 JS 분리 이후: 화면에 찍히는 숫자를 만드는 코드가 index.html 과
    # js/*.js 양쪽에 흩어져 있다. index.html 만 훑으면 카드 라벨 5종을 못 찾아
    # "마크업이 바뀌었다" 오탐이 난다. 두 곳을 함께 훑는다.
    targets = ["index.html"] + sorted(
        "js/" + f for f in os.listdir(os.path.join(ROOT, "js")) if f.endswith(".js")
    )
    scan = []          # (파일명, 줄번호, 본문)
    for rel in targets:
        raw = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        # 주석 속 숫자를 실제 표기로 오인하지 않도록 지운다(개행은 보존).
        #   예: "27,374건" 이 주석으로 적혀 있는 자리가 있다.
        h = re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), raw, flags=re.S)
        h = strip_js_comments(h)
        scan.extend((rel, i, l) for i, l in enumerate(h.split("\n"), 1))

    for pat, key, minocc in PRINTED:
        occ = 0
        for fn, i, l in scan:
            for v in re.findall(pat, l):
                occ += 1
                real = got.get(key, -1)
                if real < 0:
                    continue  # 데이터를 못 읽었다 — check_counts 가 이미 FAIL 을 냈으므로 중복 보고하지 않는다
                if int(v.replace(",", "")) != real:
                    fail("%s:%d  「%s」 라고 적혀 있는데 실제 %s 는 %d건" % (fn, i, v, key, real))
        if occ < minocc:
            fail("index.html+js/  패턴 /%s/ 이 %d회밖에 안 잡힌다(기대 %d회) — 문구를 바꿨다면 "
                 "tools/check_data.py PRINTED 도 함께 고쳐라. 안 고치면 이 검사가 조용히 무력화된다"
                 % (pat, occ, minocc))

    for label, key in PRINTED_CARD:
        pat = r'place-card-sm-name"[^>]*>%s</div><div class="place-card-sm-addr">([\d,]+)곳' % re.escape(label)
        occ = 0
        for fn, i, l in scan:
            for v in re.findall(pat, l):
                occ += 1
                if int(v.replace(",", "")) != got.get(key, -1):
                    fail("%s:%d  카드「%s %s곳」인데 실제 %s 는 %d건" % (fn, i, label, v, key, got.get(key, -1)))
        if occ < 1:
            fail("index.html+js/  카드 라벨「%s」의 건수 표기를 못 찾았다 — 마크업이 바뀌었다" % label)

    # js/convenience.js:196 의 summary — 화면 숫자(index.html:2937-2945, js/conv_map.js:394-396)의 실제 출처
    src = open(os.path.join(ROOT, "js/convenience.js"), encoding="utf-8").read()
    m = re.search(r"summary\s*:\s*\{([^}]*)\}", src)
    if not m:
        fail("js/convenience.js  jebu.summary 를 못 찾았다 — 화면 제부도 숫자의 출처가 사라졌다")
    else:
        ln = src.count("\n", 0, m.start()) + 1
        for k, v in re.findall(r"(\w+)\s*:\s*(\d+)", m.group(1)):
            key = "CONVENIENCE.jebu.total" if k == "total" else "CONVENIENCE.jebu." + k
            if key in got and int(v) != got[key]:
                fail("js/convenience.js:%d  summary.%s=%s 인데 실제 %d건" % (ln, k, v, got[key]))


# ─── 4. 정규식 패치 도구의 사정거리 ──────────────────────────────────────────
# tools/*.py 는 검증·백업 없이 open(...,'w') 로 데이터 파일을 통째로 덮어쓴다
#   (tools/regeocode.py:163, tools/fix_all_coords.py:122, tools/fix_coords.py:69, tools/geocode_jebu.py:91).
# 그 정규식이 몇 건을 잡는지 미리 재두면, 포맷 변경으로 0건/부분 매치가 되어
# "✅ N개 수정 완료" 라고 성공을 보고하면서 나머지를 빠뜨리는 사고를 막는다.
# ※ 정규식을 tools/*.py 에서 읽어오는 게 아니라 여기 복사해 뒀다.
#   tools/*.py 의 정규식을 고치면 이 블록도 반드시 함께 고쳐라.
TOOL_RE = [
    ("tools/regeocode.py:_PLACE_RE",   "js/data.js",
     r'\{[^{}]*?id\s*:\s*(\d+)[^{}]*?category\s*:\s*"(tourist|festival)"[^{}]*?\}', 209, None),
    # 209 = tourist(159) + festival(50). heritage 42건 추가 이후 기준선 갱신 (2026-08-26).
    ("tools/fix_all_coords.py:BLOCK_RE", "js/data.js",
     r'(\{ id:(\d+), name:"([^"]+)", category:"(tourist|festival|heritage)", lat:([\d.]+), lng:([\d.]+), address:"([^"]*?)")', 251, None),
    # 251 = tourist(159) + festival(50) + heritage(42) = PLACES 전체. heritage 추가 이후 기준선 갱신 (2026-08-26).
    ("tools/geocode_jebu.py:ITEM_RE",  "js/convenience.js",
     r'\{name:"([^"]+)",\s*addr:"([^"]+)"(?:,\s*tel:"[^"]*")?\}', None, "jebu"),
]

def check_tool_regex():
    srcs = {}
    for _, f, _, _, _ in TOOL_RE:
        srcs.setdefault(f, open(os.path.join(ROOT, f), encoding="utf-8").read())

    c = srcs.get("js/convenience.js", "")
    secs = [(m.group(1), m.start()) for m in re.finditer(r"(?m)^\s{2}(\w+)\s*:", c)]
    def sec_of(pos):
        cur = "?"
        for n, s in secs:
            if s <= pos: cur = n
        return cur

    for name, f, pat, expect, scope in TOOL_RE:
        ms = list(re.finditer(pat, srcs[f], re.S))
        if expect is not None and len(ms) != expect:
            fail("%s  매치 %d건 (기대 %d건) — 이 도구를 지금 실행하면 %s"
                 % (name, len(ms), expect,
                    "아무것도 안 고치고 성공처럼 끝난다" if not ms else "일부만 고치고 나머지를 조용히 빠뜨린다"))
        if scope:
            out = [m for m in ms if sec_of(m.start()) != scope]
            # 2026-08-25 (배포 Claude, §19-3 처리): geocode_jebu.py 가 스캔 범위를
            # jebu 섹션으로 제한하도록 고쳐졌다. 정규식 자체는 여전히 restaurants 에도
            # 매치되므로 원시 매치 수만 세면 의미가 없다 — 도구에 범위 가드가
            # 살아 있는지를 본다. 가드가 사라지면 그 순간 다시 위험해진다.
            guard_src = open(os.path.join(ROOT, "tools/geocode_jebu.py"), encoding="utf-8").read()
            has_guard = "def jebu_span" in guard_src and "JSTART <= m.start() < JEND" in guard_src
            if not has_guard:
                fail("%s  jebu 섹션 범위 가드가 사라졌다 — 지금 실행하면 '%s' 밖 %d건(%s)에 "
                     "제부도 좌표가 박힌다. jebu_span() 스코프 제한을 되살려라"
                     % (name, scope, len(out), ",".join(sorted({sec_of(m.start()) for m in out}))))
            else:
                info("%s  범위 가드 확인 — '%s' 섹션만 스캔 (정규식 자체는 %s 에도 매치되나 대상에서 제외됨)"
                     % (name, scope, ",".join(sorted({sec_of(m.start()) for m in out})) or "없음"))


# ─── 5. 사진 ↔ 이름 연결 ─────────────────────────────────────────────────────
# assets/images/places/{name}.jpg 는 data.js 의 name 과 글자 단위로 일치해야 뜬다
#   (js/map.js:401, index.html:2037/2355/3085). 중간 매핑 테이블이 없다.
# 이름을 다듬는 순간 사진이 영영 안 보이는데, onerror 가 404 를 삼켜 아무 표시도 안 난다
#   (js/map.js:409, index.html:3088).
# assets/ 는 .gitignore:7 에 걸려 있어 개발 워킹트리에는 없는 것이 정상이다.
# 없을 때 실패시키면 상시 빨간불이 되어 아무도 안 쓰게 된다 → 명시적으로 "건너뜀"을 찍는다.
def check_photos():
    pdir = os.path.join(ROOT, "assets/images/places")
    names = [m.group(1) for m in re.finditer(r'name:"([^"]+)",\s*category:"tourist"',
                                             open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read())]
    if not os.path.isdir(pdir):
        print("  SKIP  assets/images/places 없음 — 이 워킹트리는 사진을 갖고 있지 않다(.gitignore:7).")
        print("        사진 163장은 배포 서버 디스크 한 곳에만 있고 버전관리도 백업도 없다.")
        print("        배포 서버에서 이 검사를 돌려라. 잃어버렸다면: git archive '6004a43^' assets | tar -x")
        return
    # 2026-08-25 (배포 Claude): 신규 파일명 규칙을 함께 인식한다.
    #   {읍면동}_{id}[_{메모}].{jpg|jpeg|png|webp}  — 매칭은 id 토큰만 쓴다.
    # 이걸 안 넣으면 신규 형식 사진을 1장만 넣어도 즉시 FAIL(고아) 이 되고,
    # 전건 개명 시 FAIL 318 이 되어 상시 빨간불이 된다 — 이 파일 스스로
    # ':46 알려진 결함의 상한' 주석에서 경계한 바로 그 상태다.
    src_d = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()
    all_ids = {int(m) for m in re.findall(r"\bid:\s*(\d+)", src_d)}

    EXTS = ("jpg", "jpeg", "png", "webp")
    NEW_RE = re.compile(r"^(?P<region>[^_]+)_(?P<id>\d+)(?:_(?P<memo>.*))?\.(?:%s)$"
                        % "|".join(EXTS), re.I)
    N = lambda s: unicodedata.normalize("NFC", s)

    legacy, by_id, unknown = set(), {}, []
    for f in os.listdir(pdir):
        f = N(f)
        if not f.lower().endswith(tuple("." + e for e in EXTS)):
            continue
        m = NEW_RE.match(f)
        if m:
            pid = int(m.group("id"))
            if pid not in all_ids:
                unknown.append(f)
            else:
                by_id.setdefault(pid, []).append(f)
        else:
            legacy.add(f.rsplit(".", 1)[0])

    # 고아 판정과 '사진 없음' 판정은 대상 범위가 다르다.
    #   want     = tourist 만  → 사진이 없으면 FAIL (관광지는 사진이 있어야 한다)
    #   want_all = 전체 카테고리 → 고아 판정용. 이걸 tourist 로 좁히면
    #              축제·문화재 사진을 넣는 순간 전부 "고아"로 잡혀 상시 빨간불이 된다.
    #              (2026-08-26: 축제 사진 41장이 실제로 이 오탐에 걸렸다)
    want = {N(n) for n in names}
    all_named = re.findall(r'id:(\d+),\s*name:"([^"]+)",\s*category:"[a-z]+"', src_d)
    want_all = {N(b) for _, b in all_named}
    name2id = {N(b): int(a) for a, b in all_named}

    # 캠핑장·관광호텔 등은 PLACES 가 아니라 js/convenience.js 에 산다.
    # data.js 만 보면 그 사진들이 전부 고아로 잡힌다 — 실제로는 앱이 아는 장소다.
    conv = os.path.join(ROOT, "js/convenience.js")
    if os.path.exists(conv):
        want_all |= {N(m) for m in
                     re.findall(r'name:\s*"([^"]+)"', open(conv, encoding="utf-8").read())}

    # 멀티사진 레거시 규칙: "{장소명}_{설명}.jpg" 형식.
    # 장소명 자체는 언더스코어 없이 한글·공백으로 구성되므로, 마지막 '_' 앞 부분을 기준 이름으로 쓴다.
    # 예: "국화도_갯벌" → 기준 "국화도" 가 want 에 있으면 그 장소의 멀티사진으로 인정.
    # 2026-08-26: 신규 사진 137장이 이 형식으로 반입됨 (배포 Claude §23).
    def legacy_base(stem):
        if "_" in stem:
            return N(stem.rsplit("_", 1)[0])
        return None

    # want 이름으로 직접 매치되거나 멀티사진 기반 이름으로 매치되면 covered
    legacy_exact = legacy & want_all
    legacy_multi = {f for f in legacy if legacy_base(f) in want_all}
    covered = set(by_id) | {name2id[n] for n in legacy_exact if n in name2id} \
              | {name2id[legacy_base(f)] for f in legacy_multi if legacy_base(f) in name2id}

    # 사진 없는 관광지는 건별 FAIL 이 아니라 상한 대조로 본다.
    # 건별로 실패시키면 120건이 상시 빨간불이 되어 이 검사 전체가 무시된다
    # (파일 머리말 '알려진 결함의 상한' 정책 참조). 악화만 막는다.
    lack = [n for n in names
            if N(n) not in legacy_exact and name2id.get(N(n)) not in covered]
    if len(lack) > CEILING["photo_missing_tourist"]:
        fail("사진 없는 관광지가 %d곳 → %d곳으로 늘었다. 앞 5곳: %s"
             % (CEILING["photo_missing_tourist"], len(lack), ", ".join(lack[:5])))
    elif lack:
        info("사진 없는 관광지 %d곳 (상한 %d 이내) — 앞 5곳: %s"
             % (len(lack), CEILING["photo_missing_tourist"], ", ".join(lack[:5])))

    # 고아: 정확 매치도, 멀티사진 기반 이름도 모두 아닌 파일 (전체 카테고리 기준)
    orphans = sorted(legacy - want_all - legacy_multi)
    if len(orphans) > CEILING["photo_orphan"]:
        fail("고아 사진이 %d개 → %d개로 늘었다: %s"
             % (CEILING["photo_orphan"], len(orphans), ", ".join(orphans[:6])))
    elif orphans:
        info("고아 사진 %d개 (상한 %d 이내) — PLACES·convenience 어디에도 없다: %s"
             % (len(orphans), CEILING["photo_orphan"], ", ".join(orphans)))
    for f in sorted(unknown):
        fail("assets/images/places/%s — data.js 에 없는 id 를 가리킨다" % f)
    for pid, fs in sorted(by_id.items()):
        if len(fs) > 1:
            fail("id:%d 에 사진이 %d장이다 (%s) — 어느 것이 쓰일지 보장되지 않는다"
                 % (pid, len(fs), ", ".join(fs)))

    info("사진 %d장 / 관광지 %d곳 대조 (기존규칙 %d · 신규규칙 %d)"
         % (len(legacy) + sum(len(v) for v in by_id.values()), len(names), len(legacy), len(by_id)))


# ─── 6. 캐시 무효화 ──────────────────────────────────────────────────────────
# index.html:3891 의 "js/ 파일을 수정하면 ?v= 를 함께 올릴 것" 규율이
# 정작 데이터가 든 JSON 2개만 정확히 비껴간다.
def check_cachebust():
    h = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    targets = set()
    for f in ["index.html"] + [os.path.join("js", x) for x in sorted(os.listdir(os.path.join(ROOT, "js")))
                               if x.endswith(".js")]:
        s = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for m in re.finditer(r"""fetch\(\s*['"](js/[^'"]+)['"]""", s):
            targets.add((m.group(1), f, s.count("\n", 0, m.start()) + 1))
    nover = sorted(t for t in targets if "?v=" not in t[0])
    uniq  = sorted({t[0] for t in nover})
    if len(uniq) > CEILING["fetch_without_cachebust"]:
        fail("?v= 없는 fetch 대상이 상한 %d → %d 로 늘었다: %s"
             % (CEILING["fetch_without_cachebust"], len(uniq), uniq))
    elif nover:
        warn("?v= 없는 fetch %d곳 (알려진 결함, 상한 %d 로 고정): %s"
             % (len(nover), CEILING["fetch_without_cachebust"],
                ", ".join("%s:%d→%s" % (f, ln, t) for t, f, ln in nover)))
        warn("  → 갱신한 주차장·지역화폐 데이터가 재방문자 브라우저 캐시에 막힌다. "
             "index.html:3891 의 규율에 맞춰 이 fetch 들에도 ?v= 를 붙여라")
    # <script src="js/*.js?v="> 쪽은 전부 붙어 있는지 확인
    # js/ 뿐 아니라 css/ 도 본다. 파일명에 숫자·하이픈이 들어가므로([A-Za-z_] 만으로는
    # 00-base.css 류가 통째로 안 잡힌다) 문자클래스를 넓혔다. 2026-08-25 CSS 분리 때
    # 이 정규식이 css 6개를 0개로 세어, ?v= 갱신 누락을 잡을 수단이 없던 것을 고친 것이다.
    for m in re.finditer(r'(?:src|href)="((?:js|css)/[A-Za-z0-9_.-]+\.(?:js|css))(\?v=(\d+))?"', h):
        if not m.group(2):
            fail("index.html:%d  %s 에 ?v= 가 없다 — 이 파일을 고쳐도 재방문자에게 안 간다"
                 % (h.count("\n", 0, m.start()) + 1,
                    ('<link href="%s">' if m.group(1).startswith("css/") else '<script src="%s">') % m.group(1)))


# ─── 7. 따옴표 안전성 ─────────────────────────────────────────────────────────
# 데이터 반입 시 복사-붙여넣기로 오염되는 두 가지 패턴:
#   a. 스마트(굽은)따옴표 U+201C/D/8/9 가 문자열 구분자 위치에 쓰임
#      — 주의: 문자열 값 '안에' 있는 스마트따옴표는 한국어 인용 표현으로 정상이며 무해하다.
#      — JS 파서는 U+0022 만 문자열 구분자로 인식하므로 값 내부의 스마트따옴표는 오류가 아님.
#   b. 이스케이프 없는 곧은따옴표 " 가 문자열 안에 들어와 문자열을 비정상 종료시킴
#      — 조기종료(early termination) 케이스는 node vm.Script 가 잡는다 (tools/check_code.js).
#      — 여기서는 "파일 끝까지 열린 채로 남는" 단순 케이스와, 구분자 위치 스마트따옴표만 잡는다.
# state machine 으로 "문자열 안" vs "문자열 밖" 을 구분하여 오탐을 제거한다.
def check_quote_safety():
    SMART = {
        chr(0x201c): "(U+201C, 왼쪽 겹따옴표)",
        chr(0x201d): "(U+201D, 오른쪽 겹따옴표)",
        chr(0x2018): "(U+2018, 왼쪽 홑따옴표)",
        chr(0x2019): "(U+2019, 오른쪽 홑따옴표)",
    }

    for fname in ("js/data.js", "js/convenience.js"):
        fpath = os.path.join(ROOT, fname)
        if not os.path.exists(fpath):
            continue
        src = open(fpath, encoding="utf-8").read()

        # ── state machine: 문자열 구분자 위치 스마트따옴표 + 열린 문자열 감지 ──
        i, line, n = 0, 1, len(src)
        in_str = False
        open_line = None
        smart_outside = []  # 문자열 밖에서 발견된 스마트따옴표

        while i < n:
            c = src[i]
            if c == "\n":
                line += 1; i += 1; continue

            if not in_str:
                # 줄 주석
                if c == "/" and i + 1 < n and src[i + 1] == "/":
                    while i < n and src[i] != "\n":
                        i += 1
                    continue
                # 블록 주석
                if c == "/" and i + 1 < n and src[i + 1] == "*":
                    i += 2
                    while i < n:
                        if src[i] == "\n":
                            line += 1
                        if src[i:i + 2] == "*/":
                            i += 2; break
                        i += 1
                    continue
                # 문자열 밖 스마트따옴표 → 구분자 위치에 쓰인 것
                if c in SMART:
                    smart_outside.append((line, c))
                # 문자열 시작
                if c == '"':
                    in_str = True; open_line = line
            else:
                # 이스케이프
                if c == "\\":
                    i += 2; continue
                # 정상 종료
                if c == '"':
                    in_str = False; open_line = None; i += 1; continue
                # 문자열 안 스마트따옴표 → 한국어 인용 표현으로 정상, 무시
            i += 1

        # 파일 끝까지 열린 문자열
        if open_line is not None:
            fail("%s  줄 %d: 파일 끝까지 닫히지 않은 문자열 — "
                 "이스케이프 없는 '\"' (곧은따옴표) 가 문자열을 조기 종료시키고 "
                 "새 문자열이 열린 채로 끝난 것으로 보인다. "
                 "데이터 반입 시 desc/address 값 안의 '\"' 를 \\\" 로 이스케이프할 것"
                 % (fname, open_line))

        # 문자열 구분자 위치 스마트따옴표
        for ln, ch in smart_outside[:5]:
            label = SMART.get(ch, repr(ch))
            fail("%s  줄 %d: 문자열 구분자 위치에 스마트따옴표 %s — "
                 "JS가 문자열 시작을 인식 못 해 SyntaxError. "
                 "곧은따옴표 '\"' 로 교체할 것"
                 % (fname, ln, label))
        if len(smart_outside) > 5:
            fail("%s  문자열 밖 스마트따옴표 %d건 (위 5건 외 %d건 추가)"
                 % (fname, len(smart_outside), len(smart_outside) - 5))


def main():
    print("── 데이터 손실 검사 (tools/check_data.py) ─────────────────────────")
    got, total = check_counts()
    check_shape()
    check_printed(got)
    check_tool_regex()
    check_photos()
    check_cachebust()
    check_quote_safety()

    for m in INFO: print("  i   " + m)
    for m in WARN: print("  WARN " + m)
    for m in FAIL: print("  FAIL " + m)
    print("  ── 총 %d건 대조 / FAIL %d / WARN %d" % (total, len(FAIL), len(WARN)))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
