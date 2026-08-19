"""
화성잇다 — PLACES 좌표 일괄 재지오코딩
=======================================
data.js 의 tourist / festival 항목 주소를
카카오 REST API로 재지오코딩해 lat/lng를 바로잡습니다.

사용법:
  export KAKAO_REST_KEY="여기에_REST_API_키"
  python tools/regeocode.py

  또는 키를 직접 입력:
  python tools/regeocode.py --key YOUR_REST_API_KEY

옵션:
  --dry-run   data.js를 수정하지 않고 결과만 출력
  --category  tourist | festival (기본: 둘 다)
"""

import os, sys, re, json, time, argparse, requests

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
DATA_JS     = os.path.join(os.path.dirname(__file__), "..", "js", "data.js")

# ── 카카오 REST API 지오코딩 ──────────────────────────────────────────────────
def geocode(address, key):
    try:
        r = requests.get(
            GEOCODE_URL,
            headers={"Authorization": f"KakaoAK {key}"},
            params={"query": address},
            timeout=6,
        )
        r.raise_for_status()
        docs = r.json().get("documents", [])
        if docs:
            return round(float(docs[0]["y"]), 7), round(float(docs[0]["x"]), 7)
    except Exception as e:
        print(f"  ⚠  API 오류({address}): {e}", file=sys.stderr)
    return None

# ── data.js 파싱: 각 PLACE 항목의 위치(인덱스)·내용을 추출 ─────────────────
_PLACE_RE = re.compile(
    r'\{[^{}]*?id\s*:\s*(\d+)[^{}]*?category\s*:\s*"(tourist|festival)"[^{}]*?\}',
    re.DOTALL,
)
_LAT_RE = re.compile(r'(lat\s*:\s*)([\d.]+)')
_LNG_RE = re.compile(r'(lng\s*:\s*)([\d.]+)')
_ADDR_RE = re.compile(r'address\s*:\s*"([^"]+)"')

def parse_places(src, categories):
    """data.js 원문에서 지정 카테고리 항목의 (id, address, match span) 추출."""
    results = []
    for m in _PLACE_RE.finditer(src):
        cat = m.group(2)
        if cat not in categories:
            continue
        pid   = int(m.group(1))
        block = m.group(0)
        addr_m = _ADDR_RE.search(block)
        if not addr_m:
            continue
        addr = addr_m.group(1)
        results.append({
            "id":    pid,
            "cat":   cat,
            "addr":  addr,
            "start": m.start(),
            "end":   m.end(),
            "block": block,
        })
    return results

# ── 수정: 특정 항목 블록의 lat/lng를 새 값으로 교체 ─────────────────────────
def patch_block(block, new_lat, new_lng):
    block = _LAT_RE.sub(lambda m: m.group(1) + str(new_lat), block, count=1)
    block = _LNG_RE.sub(lambda m: m.group(1) + str(new_lng), block, count=1)
    return block

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key",      default=None, help="카카오 REST API 키")
    parser.add_argument("--dry-run",  action="store_true", help="파일 수정 없이 출력만")
    parser.add_argument("--category", default="tourist,festival",
                        help="쉼표 구분 카테고리 (tourist,festival)")
    args = parser.parse_args()

    key = args.key or os.environ.get("KAKAO_REST_KEY", "")
    if not key:
        sys.exit("❌ REST API 키를 설정하세요.\n"
                 "   export KAKAO_REST_KEY='your_key'\n"
                 "   또는 python tools/regeocode.py --key YOUR_KEY")

    # 키 유효성 빠른 검사
    test = requests.get(GEOCODE_URL,
                        headers={"Authorization": f"KakaoAK {key}"},
                        params={"query": "경기도 화성시"}, timeout=5)
    if test.status_code == 401:
        sys.exit("❌ API 키가 올바르지 않습니다 (401 Unauthorized).")

    categories = [c.strip() for c in args.category.split(",")]

    data_js_path = os.path.normpath(DATA_JS)
    if not os.path.exists(data_js_path):
        sys.exit(f"❌ 파일 없음: {data_js_path}")

    with open(data_js_path, "r", encoding="utf-8") as f:
        src = f.read()

    places = parse_places(src, categories)
    print(f"📍 대상 항목: {len(places)}개 ({', '.join(categories)})")

    patches   = []   # (start, end, new_block) — 뒤에서부터 적용
    ok, fail, skip = 0, 0, 0

    for i, p in enumerate(places):
        print(f"  [{i+1:3d}/{len(places)}] id={p['id']:3d}  {p['addr'][:50]:<50} ... ", end="", flush=True)
        coords = geocode(p["addr"], key)
        if coords is None:
            # 주소 앞에 "경기도 화성시 " 추가해 재시도
            fallback = "경기도 화성시 " + p["addr"].replace("경기도 화성시 ", "")
            coords = geocode(fallback, key)
        if coords is None:
            print("❌ 실패 (원본 유지)")
            fail += 1
            continue

        new_lat, new_lng = coords
        # 현재 lat/lng 추출
        lat_m = _LAT_RE.search(p["block"])
        lng_m = _LNG_RE.search(p["block"])
        cur_lat = float(lat_m.group(2)) if lat_m else 0
        cur_lng = float(lng_m.group(2)) if lng_m else 0

        diff = abs(new_lat - cur_lat) + abs(new_lng - cur_lng)
        marker = "✅" if diff < 0.001 else f"🔄 (차이 {diff:.4f}°)"
        print(f"({new_lat}, {new_lng}) {marker}")

        if diff > 0.0001:
            new_block = patch_block(p["block"], new_lat, new_lng)
            patches.append((p["start"], p["end"], new_block))
            ok += 1
        else:
            skip += 1
        time.sleep(0.11)   # API 부하 방지

    print(f"\n── 결과 ─────────────────────────────────────────────")
    print(f"  수정: {ok}개  |  동일(유지): {skip}개  |  실패: {fail}개")

    if args.dry_run:
        print("  [dry-run] data.js 수정을 건너뜁니다.")
        return

    if not patches:
        print("  수정할 항목이 없습니다.")
        return

    # 뒤에서부터 교체해야 앞쪽 offset이 밀리지 않음
    patches.sort(key=lambda x: x[0], reverse=True)
    result = src
    for start, end, new_block in patches:
        result = result[:start] + new_block + result[end:]

    with open(data_js_path, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"\n✅ js/data.js 업데이트 완료 ({ok}개 좌표 수정)")
    print("   다음 단계: git add js/data.js && git commit && git push")

if __name__ == "__main__":
    main()
