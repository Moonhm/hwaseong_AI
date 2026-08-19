"""
향남읍 좌표 중복 항목 11개 — 키워드 검색으로 정확 좌표 보정
"""
import re, time, sys, requests

REST_KEY = "1bd845da5756d1c78955463b800731ef"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
DATA_JS = "js/data.js"

# (id, 검색 키워드)
TARGETS = [
    (14,  "화성시 우리꽃식물원"),
    (18,  "도원체육공원 화성"),
    (22,  "쌍봉산 화성시 향남"),
    (26,  "화성시 역사박물관"),
    (35,  "소다미술관 화성"),
    (40,  "화성시 작은영화관"),
    (41,  "화성예술의전당"),
    (153, "호텔푸르미르 화성"),
    (159, "롯데시네마 향남"),
    (172, "할아버지동물농장 화성"),
    (175, "화산체육공원 화성"),
]

def search(keyword):
    r = requests.get(KEYWORD_URL,
                     headers={"Authorization": f"KakaoAK {REST_KEY}"},
                     params={"query": keyword},
                     timeout=6)
    r.raise_for_status()
    docs = r.json().get("documents", [])
    if docs:
        return round(float(docs[0]["y"]), 7), round(float(docs[0]["x"]), 7), docs[0].get("place_name",""), docs[0].get("address_name","")
    return None

with open(DATA_JS, encoding="utf-8") as f:
    src = f.read()

patches = []
for pid, keyword in TARGETS:
    print(f"  id:{pid:3d}  [{keyword}] ... ", end="", flush=True)
    result = search(keyword)
    time.sleep(0.15)
    if not result:
        print("❌ 결과 없음")
        continue
    lat, lng, place_name, addr = result
    print(f"→ ({lat}, {lng})  {place_name} / {addr}")

    # id 매칭 블록에서 lat/lng 교체
    block_re = re.compile(
        r'(\{ id:' + str(pid) + r',[^{}]*?\})',
        re.DOTALL
    )
    m = block_re.search(src)
    if not m:
        print(f"    ⚠ id:{pid} 블록을 찾지 못했습니다.")
        continue
    old_block = m.group(1)
    new_block = re.sub(r'(lat\s*:\s*)[\d.]+', lambda x: x.group(1) + str(lat), old_block, count=1)
    new_block = re.sub(r'(lng\s*:\s*)[\d.]+', lambda x: x.group(1) + str(lng), new_block, count=1)
    patches.append((m.start(), m.end(), new_block))

# 뒤에서부터 교체
patches.sort(key=lambda x: x[0], reverse=True)
for start, end, new_block in patches:
    src = src[:start] + new_block + src[end:]

with open(DATA_JS, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\n✅ {len(patches)}개 좌표 보정 완료")
