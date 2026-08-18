"""
화성잇다 — 주소 → 위도/경도 변환 도구
카카오 REST API 사용 (지오코딩)

사용법:
  python geocode.py <입력파일> [--category <카테고리>] [--out <출력파일>]

지원 입력 형식:
  - CSV  : 주소 컬럼이 있는 파일
  - JSON : 주소 필드가 있는 배열
  - Excel: .xlsx / .xls

출력: js/data.js 에 바로 붙여넣을 수 있는 JSON 배열

예시:
  python geocode.py parking.csv --category parking
  python geocode.py festival.json --category festival --out result.json

준비사항:
  pip install requests pandas openpyxl
  Kakao REST API 키를 아래 KAKAO_REST_KEY 에 입력 (또는 환경변수 KAKAO_REST_KEY)
"""

import os
import sys
import json
import time
import argparse
import requests

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ── 설정 ──────────────────────────────────────────────
# Kakao 개발자 콘솔 → 내 애플리케이션 → 앱 키 → REST API 키
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "여기에_REST_API_키_입력")

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"

# 카테고리별 기본 태그
DEFAULT_TAGS = {
    "tourist":       ["관광지"],
    "restaurant":    ["맛집"],
    "festival":      ["축제"],
    "parking":       ["주차장"],
    "localcurrency": ["가맹점"],
}

# 주소 컬럼으로 인식할 후보 이름들
ADDRESS_COL_CANDIDATES = ["주소", "address", "도로명주소", "지번주소", "소재지", "위치", "장소주소"]
NAME_COL_CANDIDATES    = ["명칭", "name", "시설명", "장소명", "주차장명", "축제명", "가맹점명"]
DESC_COL_CANDIDATES    = ["설명", "description", "desc", "내용", "비고", "운영시간"]
TAG_COL_CANDIDATES     = ["태그", "tags", "유형", "분류", "종류"]


def geocode_address(address):  # (str) -> Optional[Tuple[float, float]]
    """카카오 API로 주소를 위도/경도로 변환. 실패 시 None 반환."""
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_KEY}"}
    params  = {"query": address}

    try:
        resp = requests.get(GEOCODE_URL, headers=headers, params=params, timeout=5)
        resp.raise_for_status()
        docs = resp.json().get("documents", [])
        if docs:
            x = float(docs[0]["x"])  # 경도 (longitude)
            y = float(docs[0]["y"])  # 위도 (latitude)
            return round(y, 5), round(x, 5)
    except Exception as e:
        print(f"  ⚠ 지오코딩 실패 ({address}): {e}", file=sys.stderr)
    return None


def pick_col(df_cols, candidates):
    """후보 컬럼명 중 실제로 존재하는 첫 번째 반환."""
    for c in candidates:
        for col in df_cols:
            if col.strip().lower() == c.lower():
                return col
    return None


def load_records(filepath: str) -> list[dict]:
    """CSV / Excel / JSON 파일을 레코드 리스트로 읽기."""
    ext = filepath.rsplit(".", 1)[-1].lower()

    if ext == "json":
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else [data]

    if not HAS_PANDAS:
        print("CSV/Excel 읽기에는 pandas 가 필요합니다: pip install pandas openpyxl")
        sys.exit(1)

    if ext == "csv":
        df = pd.read_csv(filepath, encoding="utf-8-sig")
    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(filepath)
    else:
        print(f"지원하지 않는 파일 형식: {ext}")
        sys.exit(1)

    return df.where(pd.notna(df), None).to_dict("records")


def records_to_places(records: list[dict], category: str) -> list[dict]:
    """레코드 리스트를 PLACES 형식으로 변환 (지오코딩 포함)."""
    places = []
    next_id = 100  # 실제 데이터 ID는 100번부터 시작

    # 컬럼 자동 감지
    cols = list(records[0].keys()) if records else []
    addr_col = pick_col(cols, ADDRESS_COL_CANDIDATES)
    name_col = pick_col(cols, NAME_COL_CANDIDATES)
    desc_col = pick_col(cols, DESC_COL_CANDIDATES)
    tag_col  = pick_col(cols, TAG_COL_CANDIDATES)

    print(f"\n감지된 컬럼:")
    print(f"  이름  : {name_col or '없음 (자동 생성)'}")
    print(f"  주소  : {addr_col or '없음 (필수!)'}")
    print(f"  설명  : {desc_col or '없음'}")
    print(f"  태그  : {tag_col  or '없음'}")
    print(f"  카테고리: {category}\n")

    if not addr_col:
        print("❌ 주소 컬럼을 찾을 수 없습니다.")
        print(f"   파일의 컬럼: {cols}")
        print(f"   인식 가능한 이름: {ADDRESS_COL_CANDIDATES}")
        sys.exit(1)

    total = len(records)
    for i, row in enumerate(records):
        address = str(row.get(addr_col, "")).strip()
        name    = str(row.get(name_col, f"{category}_{i+1}")).strip() if name_col else f"{category}_{i+1}"
        desc    = str(row.get(desc_col, "")).strip() if desc_col else ""
        tags    = DEFAULT_TAGS.get(category, []).copy()

        if tag_col and row.get(tag_col):
            extra = str(row[tag_col]).split(",")
            tags += [t.strip() for t in extra if t.strip()]

        if not address:
            print(f"  [{i+1}/{total}] ⏭  이름 없음 — 주소 빈칸, 건너뜀")
            continue

        print(f"  [{i+1}/{total}] 📍 {name} — {address}", end=" ... ", flush=True)
        coords = geocode_address(address)

        if coords is None:
            print("실패 ❌")
            continue

        lat, lng = coords
        print(f"({lat}, {lng}) ✅")

        place = {
            "id":       next_id,
            "name":     name,
            "category": category,
            "lat":      lat,
            "lng":      lng,
            "address":  address,
            "tags":     tags,
            "desc":     desc,
        }

        # 주차장 전용 필드
        if category == "parking":
            for key in ["운영시간", "요금", "총주차면", "주차면수", "유무료"]:
                if key in row and row[key] is not None:
                    place[key] = str(row[key])

        # 축제 전용 필드
        if category == "festival":
            for key in ["기간", "date", "시작일", "종료일", "상태", "status"]:
                if key in row and row[key] is not None:
                    place[key] = str(row[key])

        places.append(place)
        next_id += 1
        time.sleep(0.12)  # API 호출 간격 (초당 10건 제한)

    return places


def places_to_js_snippet(places: list[dict]) -> str:
    """PLACES 배열에 바로 추가할 JS 코드 조각 생성."""
    lines = []
    for p in places:
        tags_str  = json.dumps(p["tags"], ensure_ascii=False)
        extra = ""
        for key in ["운영시간", "요금", "총주차면", "date", "status"]:
            if key in p:
                extra += f', {key}: "{p[key]}"'
        lines.append(
            f'  {{ id:{p["id"]}, name:"{p["name"]}", category:"{p["category"]}", '
            f'lat:{p["lat"]}, lng:{p["lng"]}, address:"{p["address"]}", '
            f'tags:{tags_str}, desc:"{p["desc"]}"{extra} }},'
        )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="주소 → 위경도 변환 (카카오 API)")
    parser.add_argument("input",      help="입력 파일 경로 (CSV / Excel / JSON)")
    parser.add_argument("--category", default="tourist",
                        choices=["tourist","restaurant","festival","parking","localcurrency"],
                        help="카테고리 (기본: tourist)")
    parser.add_argument("--out",      default=None,
                        help="출력 JSON 파일 경로 (기본: <입력파일명>_geocoded.json)")
    args = parser.parse_args()

    if KAKAO_REST_KEY == "여기에_REST_API_키_입력":
        print("❌ KAKAO_REST_KEY 를 설정하세요.")
        print("   방법 1: 스크립트 상단 KAKAO_REST_KEY 변수에 직접 입력")
        print("   방법 2: export KAKAO_REST_KEY='your_key' 환경변수 설정")
        sys.exit(1)

    print(f"📂 파일 읽는 중: {args.input}")
    records = load_records(args.input)
    print(f"   {len(records)}건 로드됨")

    places = records_to_places(records, args.category)
    print(f"\n✅ 변환 완료: {len(places)}/{len(records)}건")

    # JSON 파일 저장
    out_path = args.out or args.input.rsplit(".", 1)[0] + "_geocoded.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(places, f, ensure_ascii=False, indent=2)
    print(f"💾 JSON 저장: {out_path}")

    # JS 코드 조각 출력
    print(f"\n── data.js 에 붙여넣을 코드 ──────────────────")
    print(places_to_js_snippet(places))
    print("────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
