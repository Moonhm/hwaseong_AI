"""
제부도 숙박 좌표 geocoding → convenience.js 의 jebu 섹션에 lat/lng 추가

⚠ 일회성 도구. 현재 jebu 115건은 좌표가 모두 채워져 있어 대상이 0건이다.
   기본 동작은 dry-run 이며, 파일을 쓰려면 --apply 를 명시해야 한다.

2026-08-25 수정 (배포 Claude) — WORKFLOW.md §19-3 인계 건
  1) ITEM_RE 가 파일 전체를 훑어 restaurants 92건에 매치되고 있었다.
     그대로 실행하면 모범음식점 92곳에 제부도 좌표가 박힌다.
     → jebu 섹션 범위 안에서만 스캔하도록 제한.
  2) JEBU_LAT/JEBU_LNG 가 제부도가 아니라 안산시 단원구 대부남동을 가리키고 있었다
     (coord2regioncode 확인). 반경 필터의 중심이 3.8km 어긋난 채 동작했다.
     → data.js id:1 제부도 좌표로 교정.
     ※ js/conv_map.js:65 의 동일 상수는 '지도 중심(fitBounds 폴백)' 용도이므로 건드리지 말 것.
"""
import re, time, sys, argparse, requests

REST_KEY    = "1bd845da5756d1c78955463b800731ef"
ADDR_URL    = "https://dapi.kakao.com/v2/local/search/address.json"
KW_URL      = "https://dapi.kakao.com/v2/local/search/keyword.json"
CONV_JS     = "js/convenience.js"

JEBU_LAT, JEBU_LNG = 37.1696176, 126.6228376   # 서신면 제부리 (data.js id:1)
RADIUS = 0.12  # ±0.12° (~13km) 이내만 유효

def _get(url, params):
    try:
        r = requests.get(url, headers={"Authorization": f"KakaoAK {REST_KEY}"},
                         params=params, timeout=6)
        r.raise_for_status()
        return r.json().get("documents", [])
    except Exception as e:
        print(f"    ⚠ {e}", file=sys.stderr)
        return []

def geocode(name, addr):
    """주소→좌표 우선, 실패 시 키워드 검색"""
    full = "화성시 서신면 " + addr
    # 1) 주소 검색
    docs = _get(ADDR_URL, {"query": full, "size": 1})
    if docs:
        d = docs[0]
        lat, lng = float(d["y"]), float(d["x"])
        if abs(lat - JEBU_LAT) < RADIUS and abs(lng - JEBU_LNG) < RADIUS:
            return round(lat, 7), round(lng, 7)
    time.sleep(0.1)
    # 2) 키워드 검색 (이름 + 제부도)
    for q in [name + " 제부도", name + " 화성시 서신면"]:
        docs = _get(KW_URL, {"query": q, "size": 1})
        if docs:
            d = docs[0]
            lat, lng = float(d["y"]), float(d["x"])
            if abs(lat - JEBU_LAT) < RADIUS and abs(lng - JEBU_LNG) < RADIUS:
                return round(lat, 7), round(lng, 7)
        time.sleep(0.1)
    return None

ap = argparse.ArgumentParser(description="제부도 숙박 좌표 보정 (기본 dry-run)")
ap.add_argument("--apply", action="store_true", help="실제로 js/convenience.js 를 수정")
ARGS = ap.parse_args()

# convenience.js 읽기
with open(CONV_JS, encoding="utf-8") as f:
    src = f.read()


def jebu_span(text):
    """jebu 섹션의 [시작, 끝) 오프셋. 못 찾으면 종료한다."""
    m = re.search(r"(?m)^\s{2}jebu\s*:\s*\{", text)
    if not m:
        sys.exit("❌ jebu 섹션을 찾지 못했습니다. convenience.js 구조가 바뀌었습니다.")
    start = m.start()
    nxt = [x.start() for x in re.finditer(r"(?m)^\s{2}\w+\s*:\s*[\[{]", text) if x.start() > start]
    return start, (nxt[0] if nxt else len(text))


JSTART, JEND = jebu_span(src)

# 좌표가 아직 없는 항목만 대상 — {name:"...", addr:"..."} (뒤에 lat 가 붙지 않은 것)
ITEM_RE = re.compile(r'\{name:"([^"]+)",\s*addr:"([^"]+)"(?:,\s*tel:"[^"]*")?\}')

results = []  # (start, end, orig, name, addr, lat, lng)

matches = [m for m in ITEM_RE.finditer(src) if JSTART <= m.start() < JEND]
total = len(matches)
out_of_scope = sum(1 for m in ITEM_RE.finditer(src) if not (JSTART <= m.start() < JEND))

print(f"📍 jebu 섹션 범위: {JSTART}~{JEND}")
print(f"📍 대상 항목: {total}개  (섹션 밖 {out_of_scope}건은 제외 — 건드리지 않음)\n")

if total == 0:
    print("✅ 좌표가 비어 있는 제부도 숙박 항목이 없습니다. 할 일이 없어 종료합니다.")
    sys.exit(0)
if not ARGS.apply:
    print("ℹ️  dry-run 입니다. 실제로 쓰려면 --apply 를 붙이십시오.\n")

ok = fail = 0
for i, m in enumerate(matches):
    name, addr = m.group(1), m.group(2)
    print(f"[{i+1:3d}/{total}] {name[:28]:<28} {addr[:30]:<30} ... ", end="", flush=True)
    res = geocode(name, addr)
    if res:
        lat, lng = res
        results.append((m.start(), m.end(), m.group(0), name, addr, lat, lng))
        print(f"✅ ({lat}, {lng})")
        ok += 1
    else:
        results.append((m.start(), m.end(), m.group(0), name, addr, None, None))
        print("❌ 실패")
        fail += 1

print(f"\n── 결과 ──  성공:{ok}  실패:{fail}\n")

# convenience.js 패치: lat/lng 삽입
def patch(orig, lat, lng):
    # tel 있는 경우
    if 'tel:"' in orig:
        return orig[:-1] + f', lat:{lat}, lng:{lng}' + '}'
    else:
        return orig[:-1] + f', lat:{lat}, lng:{lng}' + '}'

new_src = src
for start, end, orig, name, addr, lat, lng in reversed(results):
    if lat is None:
        continue
    new_item = patch(orig, lat, lng)
    new_src = new_src[:start] + new_item + new_src[end:]

if not ARGS.apply:
    print(f"ℹ️  dry-run 종료 — {CONV_JS} 는 수정하지 않았습니다. (--apply 로 실행하십시오)")
    sys.exit(0)

with open(CONV_JS, "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"✅ {CONV_JS} 업데이트 완료")
