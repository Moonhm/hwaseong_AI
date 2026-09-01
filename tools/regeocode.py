"""
화성잇다 — PLACES 좌표 일괄 재지오코딩
=======================================
data.js 의 tourist / festival 항목 주소를
카카오 REST API로 재지오코딩해 lat/lng를 바로잡습니다.

사용법:
  export KAKAO_REST_KEY="여기에_REST_API_키"
  python tools/regeocode.py            # 미리보기만 (기본 — 파일을 쓰지 않는다)
  python tools/regeocode.py --write    # 실제로 js/data.js 수정

  또는 키를 직접 입력:
  python tools/regeocode.py --key YOUR_REST_API_KEY

옵션:
  --write     실제로 data.js를 덮어쓴다 (이 옵션이 없으면 절대 쓰지 않는다)
  --dry-run   기본 동작. 호환을 위해 남겨 둔다
  --category  tourist | festival (기본: 둘 다)

주의:
  주소에 번지가 없는 항목은 건너뜁니다. 카카오 주소검색은 번지가 없으면
  읍·면·동 중심점을 돌려주기 때문입니다 — 서로 다른 장소가 한 점에 포개집니다.
  실측(2026-09-01): 대상 201건 중 182건의 주소에 번지가 없고, 그대로 돌리면
  tourist 97곳이 남의 좌표와 완전히 같아집니다. 2026-08-19 에 한 번 그렇게 되어
  ff4f796 이후 56d3163·8439d6d·ef7b793 으로 손수 되돌린 사고가 있습니다.
  그런 항목은 tools/ingest.py 의 geocode(name, addr) — 이름 키워드 우선 — 로 처리하세요.
"""

import os, sys, re, json, time, argparse, requests

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
DATA_JS     = os.path.join(os.path.dirname(__file__), "..", "js", "data.js")

# 패치 판정 임계값. 표시(marker)와 실제 패치가 같은 값을 봐야 ✅ 가 '원본 유지' 를 뜻한다.
# 예전에는 표시는 0.001, 패치는 0.0001 을 써서 그 사이(최대 110m 남짓)의 항목이
# ✅ 로 찍히면서 실제로는 파일에 반영됐다 — 미리보기를 봐도 알 수 없었다.
PATCH_EPS = 0.0001

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

def has_bunji(addr):
    """주소에 번지(숫자)가 있는가. tools/preprocess.py 의 has_no() 와 같은 판정이다.

    번지가 없으면 카카오 주소검색이 읍·면·동 중심점을 돌려준다. 그 좌표로 덮어쓰면
    서로 다른 장소가 한 점에 포개진다 — '경기도 화성시 봉담읍' 하나를 9곳이 공유한다.
    js/data.js 머리말이 못박은 대로 지금 좌표는 화성시 공식 대시보드 API 기준이라,
    번지 없는 주소로 만든 중심점보다 정확하다. 그래서 아예 대상에서 뺀다.
    """
    b = re.sub(r"^\s*경기도\s*화성시\s*", "", addr or "")
    b = re.sub(r"^(만세구|효행구|병점구|동탄구)\s*", "", b)
    return any(ch.isdigit() for ch in b)


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
    parser.add_argument("--write",    action="store_true",
                        help="실제로 js/data.js 를 덮어쓴다. 이 옵션 없이는 절대 쓰지 않는다")
    parser.add_argument("--dry-run",  action="store_true",
                        help="(기본 동작) 파일 수정 없이 출력만")
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
    ok, fail, skip, noaddr = 0, 0, 0, 0

    for i, p in enumerate(places):
        print(f"  [{i+1:3d}/{len(places)}] id={p['id']:3d}  {p['addr'][:50]:<50} ... ", end="", flush=True)
        if not has_bunji(p["addr"]):
            print("⏭ 번지 없음 — 건너뜀")
            noaddr += 1
            continue
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
        marker = "✅ (원본 유지)" if diff <= PATCH_EPS else f"🔄 (차이 {diff:.5f}°)"
        print(f"({new_lat}, {new_lng}) {marker}")

        if diff > PATCH_EPS:
            new_block = patch_block(p["block"], new_lat, new_lng)
            patches.append((p["start"], p["end"], new_block))
            ok += 1
        else:
            skip += 1
        time.sleep(0.11)   # API 부하 방지

    print(f"\n── 결과 ─────────────────────────────────────────────")
    print(f"  수정: {ok}개  |  동일(유지): {skip}개  |  "
          f"번지없음(건너뜀): {noaddr}개  |  실패: {fail}개")

    if not args.write:
        print("  [미리보기] js/data.js 를 수정하지 않았습니다. 실제로 쓰려면 --write 를 주세요.")
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
