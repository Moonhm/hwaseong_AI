"""
좌표 집중 항목 일괄 재보정 — 이름 기반 Kakao 키워드 검색
"""
import re, time, sys, requests
from collections import defaultdict

REST_KEY    = "1bd845da5756d1c78955463b800731ef"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
DATA_JS     = "js/data.js"

# 화성시 중심 (검색 기준점)
HWASEONG_X, HWASEONG_Y = 126.831, 37.199

def kw_search(query):
    """카카오 키워드 검색 — 화성시 중심 반경 40km 내 1순위 결과"""
    for q in [query, query + " 화성", "화성시 " + query]:
        try:
            r = requests.get(KEYWORD_URL,
                headers={"Authorization": f"KakaoAK {REST_KEY}"},
                params={"query": q, "size": 1},
                timeout=6)
            r.raise_for_status()
            docs = r.json().get("documents", [])
            if docs:
                d = docs[0]
                lat = round(float(d["y"]), 7)
                lng = round(float(d["x"]), 7)
                # 화성시 인근(±0.5°) 좌표인지 확인
                if abs(lat - HWASEONG_Y) < 0.5 and abs(lng - HWASEONG_X) < 0.5:
                    return lat, lng, d.get("place_name",""), d.get("road_address_name","") or d.get("address_name","")
        except Exception as e:
            print(f"    ⚠ API 오류: {e}", file=sys.stderr)
        time.sleep(0.12)
    return None

BLOCK_RE = re.compile(
    r'(\{ id:(\d+), name:"([^"]+)", category:"(tourist|festival)", lat:([\d.]+), lng:([\d.]+), address:"([^"]*?)")',
    re.DOTALL
)
LAT_RE = re.compile(r'(lat\s*:\s*)([\d.]+)')
LNG_RE = re.compile(r'(lng\s*:\s*)([\d.]+)')

def patch_block(block, new_lat, new_lng):
    block = LAT_RE.sub(lambda m: m.group(1) + str(new_lat), block, count=1)
    block = LNG_RE.sub(lambda m: m.group(1) + str(new_lng), block, count=1)
    return block

with open(DATA_JS, encoding="utf-8") as f:
    src = f.read()

# 전체 파싱
all_places = []
for m in BLOCK_RE.finditer(src):
    full, pid, name, cat, lat, lng, addr = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6), m.group(7)
    all_places.append({
        "id": int(pid), "name": name, "cat": cat,
        "lat": float(lat), "lng": float(lng), "addr": addr,
        "start": m.start(1), "end": m.end(1), "block": full
    })

# 좌표 집중 그룹 찾기 (소수점 2자리 반올림 기준, 3개 이상 뭉친 곳)
coord_groups = defaultdict(list)
for p in all_places:
    key = (round(p["lat"], 2), round(p["lng"], 2))
    coord_groups[key].append(p)

# 수정 대상: 3개 이상 같은 좌표에 몰린 tourist 항목
targets = []
for key, items in coord_groups.items():
    # 축제 미정은 제외, tourist만
    tourist_items = [p for p in items if p["cat"] == "tourist"]
    if len(tourist_items) >= 3:
        targets.extend(tourist_items)

# 중복 제거 (set of ids)
seen_ids = set()
targets_uniq = []
for p in targets:
    if p["id"] not in seen_ids:
        seen_ids.add(p["id"])
        targets_uniq.append(p)

print(f"📍 수정 대상 tourist: {len(targets_uniq)}개\n")

patches = []
ok = fail = skip = 0

for i, p in enumerate(targets_uniq):
    print(f"[{i+1:3d}/{len(targets_uniq)}] id:{p['id']:3d} {p['name'][:30]:<30} ... ", end="", flush=True)

    result = kw_search(p["name"])
    if not result:
        print("❌ 결과 없음 (원본 유지)")
        fail += 1
        continue

    new_lat, new_lng, place_name, road_addr = result
    diff = abs(new_lat - p["lat"]) + abs(new_lng - p["lng"])

    if diff < 0.0001:
        print(f"✅ 동일 ({new_lat}, {new_lng})")
        skip += 1
        continue

    print(f"🔄 → ({new_lat}, {new_lng})  {place_name}")
    new_block = patch_block(p["block"], new_lat, new_lng)
    patches.append((p["start"], p["end"], new_block))
    ok += 1

print(f"\n── 결과 ──────────────────────────────────")
print(f"  수정: {ok}개 | 동일: {skip}개 | 실패: {fail}개")

if not patches:
    print("  수정할 항목이 없습니다.")
    sys.exit(0)

patches.sort(key=lambda x: x[0], reverse=True)
result_src = src
for start, end, new_block in patches:
    result_src = result_src[:start] + new_block + result_src[end:]

with open(DATA_JS, "w", encoding="utf-8") as f:
    f.write(result_src)

print(f"✅ js/data.js 업데이트 완료 ({ok}개 좌표 수정)")
