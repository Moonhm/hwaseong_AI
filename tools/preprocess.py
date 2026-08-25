#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/preprocess.py — 반입 원본 → 공통 스키마 + 좌표 (배포 Claude 담당)

관련 문서
  · 규칙·현황  WORKFLOW.md §18
  · 데이터 목록 data/CATALOG.md

data/raw/ 의 CSV 를 읽어 공통 스키마로 정규화하고 좌표를 붙여
data/processed/ 에 저장한다. 기존 앱 데이터(js/)는 건드리지 않는다.

공통 스키마
    {name, addr, lat, lng, gu, emd, cat, geo, src, extra{}}
      geo : addr(주소검색) | kw(이름검색) | given(원본에 좌표 있음) | fail
      gu  : 만세구|효행구|병점구|동탄구|""   emd : 읍면동|""

지오코딩 전략은 **파일마다 다르게** 잡는다.
  · 주소에 번지가 있으면(A등급) 주소 검색이 정확하다.
    이번 공공데이터는 A등급이 96~100% 라 주소 우선이 맞다.
  · 반대로 js/data.js 는 A등급이 4.8% 뿐이라 이름 키워드 검색이 주력이어야 한다.
    같은 캐스케이드를 모든 데이터에 쓰면 한쪽이 반드시 나빠진다.

사용법
    python3 tools/preprocess.py --list           # 대상 목록만
    python3 tools/preprocess.py <파일일부> ...    # 지정 파일 처리
    python3 tools/preprocess.py --all            # 전부 처리
"""
import argparse, csv, io, json, os, re, sys, time, unicodedata
import urllib.parse, urllib.request

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
PROC = os.path.join(ROOT, "data", "processed")
KEY = os.environ.get("KAKAO_REST_KEY", "1bd845da5756d1c78955463b800731ef")

HS_LAT, HS_LNG = (36.98, 37.35), (126.45, 127.16)

NAME_C = ["국가유산명", "문화재명", "상영관명", "음식점명", "상호", "구간이름",
          "명칭", "시설명", "장소명", "관광지명", "name"]
ADDR_C = ["소재지 도로명주소", "도로명주소", "상영관소재지(도로명)", "주소", "위 치",
          "소재지", "소재지 지번주소", "지번주소", "상영관소재지(지번)", "address"]
LAT_C = ["위도", "lat", "y"]
LNG_C = ["경도", "lng", "lon", "x"]

_cache = {}


def api(ep, params):
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
    time.sleep(0.05)
    return d


def hs_pick(docs):
    """화성시 결과 우선. region_2depth_name 이 '화성시 만세구' 형태라 indexOf 로 본다."""
    for d in docs:
        blob = (d.get("address_name") or "") + (d.get("road_address_name") or "")
        if "화성시" in blob:
            return d
    return None


def clean_addr(a):
    """공공데이터 주소의 흔한 잡음 제거 — 괄호 설명, 층·호, 중복 공백."""
    a = re.sub(r"\s+", " ", (a or "")).strip()
    a = re.sub(r"\([^)]*\)\s*$", "", a)           # 말미 괄호
    a = re.sub(r",\s*[^,]*(층|호|동)\s*$", "", a)  # ', 1층' / ', A동'
    # 2026 구 신설 표기를 떼면 매칭률이 올라간다 (Kakao 주소검색은 구 없이도 찾는다)
    a = re.sub(r"(경기도\s*화성시)\s*(만세구|효행구|병점구|동탄구)\s*", r"\1 ", a)
    return a.strip()


def region_of(lat, lng):
    d = api("geo/coord2regioncode.json", {"x": lng, "y": lat})
    H = [x for x in d.get("documents", []) if x.get("region_type") == "H"]
    if not H:
        return "", ""
    gu = (H[0].get("region_2depth_name") or "").replace("화성시", "").strip()
    return gu, (H[0].get("region_3depth_name") or "")


def geocode(name, addr, addr_first=True):
    """(lat, lng, 방법, 근거)"""
    a = clean_addr(addr)
    n = (name or "").strip()

    def by_addr():
        for q in ([a] if a else []) + ([("경기도 화성시 " + re.sub(r"^\s*경기도\s*화성시\s*", "", a))] if a else []):
            d = hs_pick(api("search/address.json", {"query": q, "size": 10}).get("documents", []))
            if d:
                return float(d["y"]), float(d["x"]), "addr", d.get("address_name", q)
        return None

    def by_kw():
        for q in ([n] if n else []) + ([("화성 " + n)] if n else []):
            d = hs_pick(api("search/keyword.json", {"query": q, "size": 15}).get("documents", []))
            if d:
                return float(d["y"]), float(d["x"]), "kw", d.get("place_name", q)
        return None

    order = (by_addr, by_kw) if addr_first else (by_kw, by_addr)
    for fn in order:
        r = fn()
        if r:
            return r
    return None, None, "fail", ""


def pick_col(cols, cands):
    for c in cands:
        for k in cols:
            if k and k.strip() == c:
                return k
    for c in cands:
        for k in cols:
            if k and c in k.strip():
                return k
    return None


def read_csv(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            txt = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        rows = list(csv.DictReader(io.StringIO(txt)))
        if rows:
            return rows, enc
    return [], "?"


def cat_of(fn):
    n = unicodedata.normalize("NFC", fn)
    for key, c in (("공영주차장", "parking"), ("관광통계", "stats"), ("버스정류장", "stats"),
                   ("관광편의시설", "touristfacility"), ("모범음식점", "restaurant"),
                   ("여행업", "travel"), ("영화상영관", "cinema"), ("지정문화재", "heritage")):
        if key in n:
            return c
    return "misc"


def process(path, verbose=True):
    fn = unicodedata.normalize("NFC", os.path.basename(path))
    rows, enc = read_csv(path)
    if not rows:
        return None
    cols = list(rows[0].keys())
    cat = cat_of(fn)
    nc, ac = pick_col(cols, NAME_C), pick_col(cols, ADDR_C)
    latc, lngc = pick_col(cols, LAT_C), pick_col(cols, LNG_C)

    if cat == "stats":                       # 집계표 — 좌표 없음, 그대로 정규화만
        out = {"kind": "stats", "source": fn, "cols": cols, "n": len(rows),
               "rows": [[("" if r.get(c) is None else str(r.get(c)).strip()) for c in cols]
                        for r in rows]}
        return cat, out, {"stats": len(rows)}

    # 주소 품질을 재서 캐스케이드 방향을 정한다
    def has_no(a):
        b = re.sub(r"^\s*경기도\s*화성시\s*", "", (a or ""))
        b = re.sub(r"^(만세구|효행구|병점구|동탄구)\s*", "", b)
        return any(ch.isdigit() for ch in b)
    aq = (sum(1 for r in rows if has_no(r.get(ac))) / len(rows)) if ac else 0.0
    addr_first = aq >= 0.7
    if verbose:
        print("   주소 A등급 %.0f%% → %s 우선" % (aq * 100, "주소" if addr_first else "이름"))

    recs, stat = [], {}
    for i, r in enumerate(rows):
        name = str(r.get(nc) or "").strip() if nc else ""
        addr = str(r.get(ac) or "").strip() if ac else ""
        lat = lng = None
        how = "fail"
        src = ""
        if latc and lngc:
            try:
                lat, lng = float(r.get(latc)), float(r.get(lngc))
                how, src = "given", "원본 좌표"
            except (TypeError, ValueError):
                lat = lng = None
        if lat is None:
            lat, lng, how, src = geocode(name, addr, addr_first)
        if lat is not None and not (HS_LAT[0] <= lat <= HS_LAT[1] and HS_LNG[0] <= lng <= HS_LNG[1]):
            how, lat, lng = "outside", None, None
        gu = emd = ""
        if lat is not None:
            gu, emd = region_of(lat, lng)
        stat[how] = stat.get(how, 0) + 1
        recs.append({"name": name, "addr": addr, "lat": lat, "lng": lng,
                     "gu": gu, "emd": emd, "cat": cat, "geo": how, "src": src,
                     "extra": {k: (str(v).strip() if v is not None else "")
                               for k, v in r.items() if k and k not in (nc, ac, latc, lngc)}})
        if verbose and (i + 1) % 40 == 0:
            print("   %d/%d" % (i + 1, len(rows)), flush=True)
    return cat, {"kind": "places", "source": fn, "cat": cat, "n": len(recs), "rows": recs}, stat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    os.makedirs(PROC, exist_ok=True)
    files = [f for f in sorted(os.listdir(RAW)) if f.lower().endswith(".csv")]
    if args.list:
        for f in files:
            print("  [%s] %s" % (cat_of(f), unicodedata.normalize("NFC", f)))
        return 0
    if not args.all:
        files = [f for f in files
                 if any(t in unicodedata.normalize("NFC", f) for t in args.targets)]
    if not files:
        print("대상 없음. --list 로 확인하십시오.")
        return 1

    for f in files:
        name = unicodedata.normalize("NFC", f)
        print("\n▶ %s" % name)
        got = process(os.path.join(RAW, f))
        if not got:
            print("   읽기 실패")
            continue
        cat, payload, stat = got
        stem = re.sub(r"\W+", "_", os.path.splitext(name)[0])[:50]
        out = os.path.join(PROC, "%s.json" % stem)
        with open(out, "w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, separators=(",", ":"))
        print("   분류 %s / %d건 / %s" % (cat, payload["n"],
                                        " ".join("%s %d" % kv for kv in sorted(stat.items()))))
        print("   → data/processed/%s (%.0fKB)" % (os.path.basename(out),
                                                   os.path.getsize(out) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
