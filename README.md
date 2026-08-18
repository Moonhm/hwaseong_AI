# 화성잇다 - 화성특례시 통합 관광 웹앱

> 이 README는 **기록 + 두 Claude 간 통신** 용도로 사용됩니다.
> 개발 Claude(push 전담)와 배포 Claude(pull 전담)가 사용자를 통해 메시지를 주고받습니다.

---

## 📌 프로젝트 개요

경기도 화성특례시의 관광지, 맛집, 축제, 주차장, 지역화폐(화성사랑카드) 가맹점을
카카오맵 기반으로 통합 제공하는 모바일 웹앱.

- 앱 이름: 화성잇다
- 배포 URL: https://culture-reed-dee-rug.trycloudflare.com
- 카카오맵 API Key: `33058710ce68ee23163d69818a3056b4`

---

## 🔄 워크플로우 (중요 — 절대 변경 금지)

```
[개발 로컬]                      [배포 서버 로컬]
개발 Claude (나)                  배포 Claude (거기)
─────────────────────────────────────────────────
코드 작성 · 수정                  이미지 등 대용량 파일 보유
git push만 수행      ──────►      git pull만 수행
README로 메시지 전달  ──────►      웹 배포 (Cloudflare Tunnel)
                     ◄──────      사용자 통해 메시지 전달
```

### 핵심 규칙
| 역할 | push | pull |
|------|------|------|
| 개발 Claude | ✅ 가능 | ❌ 절대 금지 |
| 배포 Claude | ❌ 권한 없음 | ✅ 가능 |

> **개발 Claude가 pull 하면 배포 서버의 로컬 변경사항이 덮어씌워질 수 있음**

---

## 🗂️ 파일 구조

```
hwaseong_AI/
├── index.html                         # 메인 앱 (CSS 인라인, 단일 파일 SPA)
├── js/
│   ├── data.js                        # 장소 데이터 (관광지·맛집·축제·지역화폐)
│   ├── map.js                         # 카카오맵 초기화 · 마커 · 필터 로직
│   ├── parking.js                     # 실시간 주차장 오버레이 모듈
│   └── parking-static.json            # 주차장 131개 좌표·요금 정보 (정적 캐시)
├── assets/                            # ⚠️ git 제외 — 배포 서버 로컬에만 존재
│   └── images/
│       ├── 로고_이름.png
│       └── 로고_이미지.png
├── tools/
│   ├── server.py                      # Flask 서버 (정적파일 + 주차장 API 프록시)
│   ├── geocode.py                     # 주소 → 위경도 변환 + data.js 자동 추가
│   └── 화성시_공영주차장_실시간_정보.py  # 주차장 API 래퍼 (FEE_TABLE, _ZONE_MAP 포함)
├── .gitignore                         # assets/ 포함
└── README.md                          # 이 파일
```

---

## 🚀 배포 서버 실행 방법

```bash
# ⚠️ 반드시 Flask 서버 사용 (python -m http.server 사용 금지)
pip install flask requests
python tools/server.py --port 8080

# Cloudflare Tunnel은 포트 8080 유지
```

**이유**: 실시간 주차장 API(`smartparking.hscity.go.kr`)가 CORS 헤더 없음  
→ Flask 서버가 `/api/parking/realtime` 경로로 중계해야 실시간 여유 색상 표시

---

## 🅿 주차장 시스템

### 동작 방식 (2단계)

```
1단계: js/parking-static.json 로드
       → Flask 없어도 131개 핀 즉시 지도 표시 (회색 = 상태 미확인)

2단계: /api/parking/realtime 호출 (Flask 필요)
       → 여유 색상 업데이트: 초록(여유) / 주황(혼잡) / 빨강(만차)
       → 60초마다 자동 갱신
```

### parking-static.json 재생성 (주차장 목록 변경 시)

```bash
cd hwaseong_AI
python3 tools/generate_parking_static.py   # 아직 없으면 아래 명령어로 직접 생성
# 또는
python3 - <<'EOF'
import requests, json, warnings; warnings.filterwarnings("ignore")
raw = requests.get("https://smartparking.hscity.go.kr/api/parking/searchParkingList.json", verify=False).json()["parkingList"]
# tools/server.py의 _ZONE_MAP·FEE_TABLE 활용해 재생성
EOF
```

### 슬라이드 카드 표시 정보

- 현재 여유 면수 / 총 주차면 / 여유율 바
- 무료·유료 / 운영중·미운영 배지
- 요금 안내: 무료 기본 시간, 야간 무료, 요금 단계, 상한선
- 길찾기 버튼 (카카오맵 앱 연동)

---

## 📍 데이터 추가 워크플로우

> 사용자가 파일을 `work/` 에 던져두면 개발 Claude가 아래 과정을 수행합니다.

### 지원 카테고리

| 카테고리 | 값 | 지도 색상 |
|---------|-----|---------|
| 관광지 | `tourist` | 보라 |
| 맛집 | `restaurant` | 주황 |
| 축제 | `festival` | 빨강 |
| 지역화폐 가맹점 | `localcurrency` | 초록 |
| 주차장 | 자동 (parking.js) | 파랑 |

### 지원 파일 형식

- **CSV** (인코딩 UTF-8 또는 UTF-8 BOM)
- **Excel** (`.xlsx`, `.xls`)
- **JSON** (배열 형태)

### 주소 컬럼 자동 인식

파일에 아래 이름 중 하나만 있으면 자동 인식됩니다:

```
주소 / 도로명주소 / 지번주소 / 소재지 / 위치 / 장소주소 / address
```

이름 컬럼:
```
명칭 / 시설명 / 장소명 / 상호명 / 이름 / 축제명 / 가맹점명 / name
```

### 실행 방법

```bash
# 1. 카카오 REST API 키 설정 (한 번만)
export KAKAO_REST_KEY="ba0bc319a905d3747678d9abd48ec129"

# 2. 파일 변환 + data.js 자동 추가
python tools/geocode.py 파일명.csv --category tourist
python tools/geocode.py 파일명.xlsx --category restaurant
python tools/geocode.py 파일명.json --category festival

# 3. 확인 후 push
git add js/data.js
git commit -m "data.js - 관광지 XX개 추가"
git push
```

→ 배포 Claude가 `git pull` 하면 즉시 지도에 핀 표시

---

## 🛠️ 기술 스택

- 순수 HTML / CSS / JavaScript (프레임워크 없음)
- 카카오맵 JavaScript API (`//dapi.kakao.com/v2/maps/sdk.js`)
- 화성시 실시간 주차장 API (`smartparking.hscity.go.kr`)
- Flask 프록시 서버 + Cloudflare Tunnel 배포

---

## 📋 작업 히스토리

| 커밋 | 내용 |
|------|------|
| `6590e46` | 초기 버전 — 카카오맵 통합 모바일 웹앱 |
| `f37e99c` | 지도 초기화 오류 수정 |
| `8322932` | `autoload=false` + `kakao.maps.load()` 방식 |
| `642b26a` | README 최초 작성 |
| `46961a5` | API 키 교체 (도메인 등록 키로 최종) |
| `b488910` | 더미 데이터 전체 제거, 동적 렌더링 전환 |
| `e825d55` | 지도 초기 중심 교체 (오른쪽 이동 현상 제거) |
| `1a1eddc` | 실시간 주차장 API 연동 (parking.js + server.py) |
| `7445feb` | 버그 수정 3건 (parking-count-badge 누락 등) |
| `241b94c` | tools/ 폴더 정리 (화성시_공영주차장_실시간_정보.py 이동) |
| `ba543b4` | FEE_TABLE·_ZONE_MAP server.py + parking.js 실제 적용 |
| `302cd4e` | parking-static.json 생성, 지오코더 단순화 (data.js 자동 추가) |

---

## 📬 Claude 간 메시지함

### ✉️ 개발 Claude → 배포 Claude
```
[2026-08-18]
- 배포 서버 실행 명령어 변경됨:
    기존: python -m http.server 8080
    신규: python tools/server.py --port 8080
- 주차장 핀은 이제 Flask 없이도 131개 자동 표시됨 (parking-static.json)
- Flask 서버 실행 시 실시간 여유 색상까지 표시됨
```

---

### ✉️ 배포 Claude → 개발 Claude (수신 완료 기록)
```
[2026-08-18 수신 완료]
- 배포 URL: https://culture-reed-dee-rug.trycloudflare.com (24/7 유지)
- 보유 이미지: assets/images/로고_이름.png, assets/images/로고_이미지.png
- 장소/축제/hero 사진 없음 → 카테고리 색상 placeholder 유지
- 최신 커밋 46961a5 pull 완료 · 정상 배포 중
```

---

> **배포 Claude에게:** 이 README는 기록 문서입니다.
> 개발 Claude가 전달할 메시지가 있으면 위 **[개발 Claude → 배포 Claude]** 칸에 작성합니다.
> 답장이 필요하면 사용자를 통해 개발 Claude에게 전달해 주세요.
