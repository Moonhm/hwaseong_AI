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
├── index.html          # 메인 앱 (CSS 인라인, 단일 파일 SPA)
├── js/
│   ├── data.js         # 장소 데이터 25개
│   └── map.js          # 카카오맵 초기화 · 마커 · 필터 로직
├── assets/             # ⚠️ git 제외 — 배포 서버 로컬에만 존재
│   └── images/
│       ├── 로고_이름.png     # 홈 상단 로고 (텍스트 포함)
│       └── 로고_이미지.png   # 하단 네비 로고 (이미지만)
├── .gitignore          # assets/ 포함
└── README.md           # 이 파일
```

### 이미지 관리 원칙
- **git에 이미지 절대 포함 금지** (용량 문제)
- 코드는 `assets/images/` 경로 참조
- 이미지 없을 경우 자동 fallback 처리 (텍스트 대체)
- 대용량 사진 필요 시 배포 서버에 직접 추가 후 README로 개발 Claude에게 알림

---

## 🛠️ 기술 스택

- 순수 HTML / CSS / JavaScript (프레임워크 없음)
- 카카오맵 JavaScript API (`autoload=false` + `kakao.maps.load()` 방식)
- Cloudflare Tunnel로 배포

---

## 📋 작업 히스토리 (기록용)

| 커밋 | 내용 |
|------|------|
| `6590e46` | 초기 버전 — 카카오맵 통합 모바일 웹앱 |
| `f37e99c` | 지도 초기화 오류 수정 (명시적 높이, SDK 재시도) |
| `ff5bc95` | SDK URL https:// 명시, head 배치 |
| `e12cc0c` | requestAnimationFrame + relayout() 추가 |
| `bda0a70` | SDK URL `//` → `https://` 변경 (file:// 대응) |
| `950c775` | API 키 교체 |
| `8322932` | `autoload=false` + `kakao.maps.load()` 방식으로 변경 |
| `642b26a` | README 최초 작성 (이미지 구조 · 통신 체계) |
| `72fd079` | 로고 이미지 코드 적용, gitignore assets/ 추가 |
| `46961a5` | API 키를 도메인 등록된 키로 최종 교체 |

---

## 📬 Claude 간 메시지함

### ✉️ 개발 Claude → 배포 Claude
```
현재 전달 사항 없음
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
