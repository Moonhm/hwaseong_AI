"""
화성잇다 — 주소 → 카카오맵 등록 도구
=====================================
사용법:
  python tools/geocode.py <파일> --category <카테고리>

카테고리:
  tourist       관광지
  restaurant    맛집
  festival      축제
  localcurrency 지역화폐 가맹점

파일 형식: CSV, Excel(.xlsx), JSON
  - 주소 컬럼: 주소 / 도로명주소 / 소재지 / address 등 자동 인식
  - 이름 컬럼: 명칭 / 시설명 / 장소명 / name 등 자동 인식

예시:
  python tools/geocode.py 관광지목록.csv --category tourist
  python tools/geocode.py 맛집.xlsx     --category restaurant
  python tools/geocode.py 축제.json     --category festival

준비사항:
  pip install requests pandas openpyxl
  카카오 REST API 키를 아래에 입력하거나 환경변수로 설정
    export KAKAO_REST_KEY="여기에_REST_API_키"
"""

import os, sys, json, time, argparse, requests

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ── 카카오 REST API 키 ────────────────────────────────────────────────────────
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "여기에_REST_API_키_입력")
GEOCODE_URL    = "https://dapi.kakao.com/v2/local/search/address.json"

# ── 카테고리별 기본 태그 ──────────────────────────────────────────────────────
DEFAULT_TAGS = {
    "tourist":       ["관광지"],
    "restaurant":    ["맛집"],
    "festival":      ["축제"],
    "localcurrency": ["가맹점"],
}

# ── 컬럼 자동 인식 후보 ───────────────────────────────────────────────────────
_ADDR_COLS = ["주소", "도로명주소", "지번주소", "소재지", "위치", "장소주소", "address"]
_NAME_COLS = ["명칭", "시설명", "장소명", "상호명", "이름", "축제명", "가맹점명", "name"]
_DESC_COLS = ["설명", "내용", "비고", "운영시간", "description", "desc"]
_TAG_COLS  = ["태그", "유형", "분류", "종류", "tags"]


def _pick(cols, candidates):
    for c in candidates:
        for col in cols:
            if col.strip().lower() == c.lower():
                return col
    return None


def geocode(address):
    """주소 → (위도, 경도). 실패 시 None."""
    try:
        r = requests.get(
            GEOCODE_URL,
            headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"},
            params={"query": address},
            timeout=5,
        )
        r.raise_for_status()
        docs = r.json().get("documents", [])
        if docs:
            return round(float(docs[0]["y"]), 6), round(float(docs[0]["x"]), 6)
    except Exception as e:
        print(f"  ⚠ 실패({address}): {e}", file=sys.stderr)
    return None


def load_file(path):
    """CSV / Excel / JSON → 레코드 리스트."""
    ext = path.rsplit(".", 1)[-1].lower()
    if ext == "json":
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, list) else [d]
    if not HAS_PANDAS:
        sys.exit("CSV/Excel 읽기에는 pandas 필요: pip install pandas openpyxl")
    if ext == "csv":
        df = pd.read_csv(path, encoding="utf-8-sig")
    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(path)
    else:
        sys.exit(f"지원하지 않는 형식: {ext}")
    return df.where(pd.notna(df), None).to_dict("records")


def process(records, category):
    cols     = list(records[0].keys()) if records else []
    addr_col = _pick(cols, _ADDR_COLS)
    name_col = _pick(cols, _NAME_COLS)
    desc_col = _pick(cols, _DESC_COLS)
    tag_col  = _pick(cols, _TAG_COLS)

    print(f"\n인식된 컬럼 — 이름:{name_col or '없음'}  주소:{addr_col or '❌없음'}  설명:{desc_col or '없음'}")
    if not addr_col:
        sys.exit(f"주소 컬럼을 찾을 수 없습니다. 파일 컬럼: {cols}\n인식 가능 이름: {_ADDR_COLS}")

    places   = []
    next_id  = 100
    total    = len(records)

    for i, row in enumerate(records):
        address = str(row.get(addr_col) or "").strip()
        name    = str(row.get(name_col) or f"{category}_{i+1}").strip() if name_col else f"{category}_{i+1}"
        desc    = str(row.get(desc_col) or "").strip() if desc_col else ""
        tags    = DEFAULT_TAGS.get(category, [])[:]
        if tag_col and row.get(tag_col):
            tags += [t.strip() for t in str(row[tag_col]).split(",") if t.strip()]

        if not address:
            print(f"  [{i+1}/{total}] ⏭  {name} — 주소 없음, 건너뜀")
            continue

        print(f"  [{i+1}/{total}] {name} → {address} ...", end=" ", flush=True)
        coords = geocode(address)
        if not coords:
            print("실패 ❌")
            continue

        lat, lng = coords
        print(f"({lat}, {lng}) ✅")

        entry = {
            "id":       next_id,
            "name":     name,
            "category": category,
            "lat":      lat,
            "lng":      lng,
            "address":  address,
            "tags":     tags,
            "desc":     desc,
        }
        if category == "festival":
            for k in ["기간", "date", "시작일", "종료일", "상태", "status"]:
                if row.get(k): entry[k] = str(row[k])

        places.append(entry)
        next_id += 1
        time.sleep(0.12)

    return places


def append_to_data_js(places, data_js_path):
    """js/data.js 의 PLACES 배열 끝에 새 항목을 추가."""
    with open(data_js_path, "r", encoding="utf-8") as f:
        src = f.read()

    lines = []
    for p in places:
        tags = json.dumps(p["tags"], ensure_ascii=False)
        extra = ""
        for k in ["기간", "date", "status"]:
            if k in p:
                extra += f', {k}: "{p[k]}"'
        lines.append(
            f'  {{ id:{p["id"]}, name:"{p["name"]}", category:"{p["category"]}", '
            f'lat:{p["lat"]}, lng:{p["lng"]}, address:"{p["address"]}", '
            f'tags:{tags}, desc:"{p["desc"]}"{extra} }},'
        )
    snippet = "\n".join(lines)

    # PLACES = []; 또는 PLACES = [ ... ]; 찾아서 닫는 ] 앞에 삽입
    import re
    def inserter(m):
        body = m.group(1).rstrip()
        sep  = ",\n" if body.rstrip().endswith("}") else ""
        return f"const PLACES = [{body}{sep}\n{snippet}\n];"

    new_src = re.sub(r"const PLACES\s*=\s*\[([\s\S]*?)\];", inserter, src)
    if new_src == src:
        print("⚠ data.js에서 PLACES 배열을 찾지 못했습니다. 수동으로 추가해 주세요.")
        return False

    with open(data_js_path, "w", encoding="utf-8") as f:
        f.write(new_src)
    return True


def main():
    parser = argparse.ArgumentParser(description="주소 → 위경도 변환 후 data.js 자동 추가")
    parser.add_argument("input",      help="입력 파일 (CSV / Excel / JSON)")
    parser.add_argument("--category", required=True,
                        choices=["tourist", "restaurant", "festival", "localcurrency"],
                        help="카테고리")
    parser.add_argument("--data-js",  default=None,
                        help="data.js 경로 (기본: 자동 탐색)")
    args = parser.parse_args()

    if KAKAO_REST_KEY == "여기에_REST_API_키_입력":
        sys.exit("❌ KAKAO_REST_KEY를 설정하세요.\n"
                 "  export KAKAO_REST_KEY='your_key'  또는\n"
                 "  스크립트 상단 KAKAO_REST_KEY 변수에 직접 입력")

    # data.js 경로 자동 탐색
    data_js = args.data_js
    if not data_js:
        here = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(here, "..", "js", "data.js"),
            os.path.join(os.getcwd(), "js", "data.js"),
        ]
        for c in candidates:
            if os.path.exists(c):
                data_js = os.path.normpath(c)
                break
    if not data_js or not os.path.exists(data_js):
        sys.exit("❌ js/data.js를 찾을 수 없습니다. --data-js 옵션으로 경로를 지정하세요.")

    print(f"📂 파일 읽는 중: {args.input}")
    records = load_file(args.input)
    print(f"   {len(records)}건 로드됨")

    places = process(records, args.category)
    print(f"\n✅ 변환 완료: {len(places)}/{len(records)}건")

    if not places:
        print("추가할 항목이 없습니다.")
        return

    if append_to_data_js(places, data_js):
        print(f"📝 data.js 업데이트 완료 ({data_js})")
        print(f"   → 지도에 {len(places)}개 핀이 추가되었습니다.")
        print(f"\n다음 단계: git add js/data.js && git commit && git push")
    else:
        # 수동 추가용 코드 출력
        print("\n── data.js 에 직접 붙여넣을 코드 ──")
        for p in places:
            tags = json.dumps(p["tags"], ensure_ascii=False)
            print(f'  {{ id:{p["id"]}, name:"{p["name"]}", category:"{p["category"]}", '
                  f'lat:{p["lat"]}, lng:{p["lng"]}, address:"{p["address"]}", '
                  f'tags:{tags}, desc:"{p["desc"]}" }},')


if __name__ == "__main__":
    main()
