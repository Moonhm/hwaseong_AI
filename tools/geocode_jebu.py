"""
제부도 숙박 115개 좌표 geocoding → convenience.js에 lat/lng 추가
"""
import re, time, sys, requests, json

REST_KEY    = "1bd845da5756d1c78955463b800731ef"
ADDR_URL    = "https://dapi.kakao.com/v2/local/search/address.json"
KW_URL      = "https://dapi.kakao.com/v2/local/search/keyword.json"
CONV_JS     = "js/convenience.js"

JEBU_LAT, JEBU_LNG = 37.1578, 126.5764
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

# convenience.js에서 jebu 섹션 파싱
with open(CONV_JS, encoding="utf-8") as f:
    src = f.read()

# 각 항목에 lat/lng 추가 — {name:"...", addr:"..."} 패턴
ITEM_RE = re.compile(r'\{name:"([^"]+)",\s*addr:"([^"]+)"(?:,\s*tel:"[^"]*")?\}')

results = []  # (name, addr, lat, lng)

matches = list(ITEM_RE.finditer(src))
total = len(matches)
print(f"📍 대상 항목: {total}개\n")

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

with open(CONV_JS, "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"✅ {CONV_JS} 업데이트 완료")
