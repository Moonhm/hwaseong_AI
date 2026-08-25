# 2026-08-26 배포 Claude — 처리 데이터 전체 앱 반영

## 배경

사용자가 "데이터를 geocoded만 해놓고 앱에 합치지 않았다"고 지적.
이전 세션까지 `data/processed/`에 JSON만 쌓인 상태였으며, 지도에 실제로 표시되지 않았음.

---

## 완료 목록

### 1. 모범음식점 좌표 이식 (`js/convenience.js`)

- 원본: `data/processed/20260825_경기도_화성시_모범음식점_관리정보_20251121.json` (95건, 100% 지오코딩)
- 기존 `CONVENIENCE.restaurants` 94건 중 2건만 좌표 있었음
- 이름 일치 88건 → lat/lng 이식 완료
- 이식 실패 6건: 지오코딩 자체 실패 (복합 호실 주소)

### 2. 관광편의시설업 신규 10건 (`js/convenience.js`)

- 원본: 56건 중 46건은 jebu 펜션 중복
- 신규 10건 (관광펜션업 8, 관광극장식당업 1, 관광궤도업 1) → `CONVENIENCE.touristFacilities` 섹션 신설
- 전부 좌표 포함

### 3. 영화상영관 신규 10건 (`js/convenience.js`)

- 원본: 13건 중 3건은 PLACES(data.js)에 이미 있음 (CGV동탄역, CGV화성봉담, 화성시 작은영화관)
- 신규 10건 → `CONVENIENCE.cinemas` 섹션 신설
- 전부 좌표 포함

### 4. conv_map.js 카테고리 추가 (`js/conv_map.js`)

- `touristfacility` 카테고리: 🏘 관광편의시설, cyan 테마
- `cinema` 카테고리: 🎬 영화상영관, pink 테마
- `CONV_CACHE_VER`: v5 → v6 (localStorage 캐시 무효화)

### 5. index.html 필터 칩 추가

- `🏘 관광편의시설` 칩 (jebu 앞에 삽입)
- `🎬 영화상영관` 칩 (jebu 앞에 삽입)
- 스크립트 버전: `convenience.js?v=2026082608`, `conv_map.js?v=2026082608`

### 6. 음식점 정적 파일 생성 (`data/restaurants-static.json`)

- 원본: `data/processed/restaurants_hwaseong_2026.json` (3893건, 1.2MB)
- 좌표 있는 3754건만 추출, 경량 스키마 `{n,c,a,t,x,y}` 적용
- 크기: 665KB (< 3MB 기준, git 추적)
- 18개 카테고리 보존
- 지도 표시 모듈(`js/restaurants.js`) 구현은 **개발 Claude** 담당 (WORKFLOW.md §13-R 참조)

---

## 미반영 (개발 Claude 구현 필요)

| 데이터 | 파일 | 작업 |
|--------|------|------|
| 음식점 3754건 표시 | `data/restaurants-static.json` | `js/restaurants.js` 모듈 + map.js 연결 |
| 제부도 바닷길 시간표 | `data/processed/jebu_tide_2026.json` | PLACES id:1 상세 패널에 당일 통행시간 표시 |
| 데이터랩 통계 | `data/processed/datalab_tourism_stats.json` | 홈 추천 기능 연동 |

---

## 커밋

`b770fc8` — 2026-08-26
