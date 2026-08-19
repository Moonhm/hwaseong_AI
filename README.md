<div align="center">

# 화성잇다 · Hwaseong-itda

### All-in-One Tourism Web App for Hwaseong Special City (화성특례시)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Try%20Now-orange?style=for-the-badge&logo=cloudflare)](https://culture-reed-dee-rug.trycloudflare.com)
[![Kakao Maps](https://img.shields.io/badge/Kakao%20Maps-JS%20API-FFCD00?style=for-the-badge&logo=kakao)](https://apis.map.kakao.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI Powered](https://img.shields.io/badge/AI%20Powered-Claude-5A67D8?style=for-the-badge)](https://claude.ai)

**2026 Hwaseong City AI Hackathon (2026 화성시 해커톤)**

*경기도 화성특례시의 관광지·축제·주차·지역화폐 정보를 한 곳에서 — 모바일 최적화 통합 관광 웹앱*

</div>

---

## 화성잇다란?

**화성잇다**는 *"화성을 잇다"* — 관광객과 화성특례시를 연결한다는 뜻입니다.

화성시 공식 데이터를 기반으로 159개 관광지, 48개 축제·행사, 131개 공영주차장(실시간), 27,374개 지역화폐 가맹점을 지도 위에서 한눈에 탐색할 수 있습니다. AI 기반 추천 시스템으로 내 취향에 맞는 여행지를 찾을 수도 있습니다.

---

## 주요 기능

| 화면 | 설명 |
|------|------|
| **🏠 홈** | GPS 기반 가장 가까운 관광지 추천 · 실시간 인근 주차 현황 · 장소 검색 · 앱 URL 공유 |
| **🗺 지도** | 카카오맵 위 카테고리 칩 필터 — 관광지 클러스터/핀 · 실시간 주차장(🟢🟡🔴) · 지역화폐 가맹점 · 편의정보 |
| **🎉 관광** | 관광지 159개 목록(테마 필터) · 2026 축제 캘린더 · 월별 이벤트 탐색 |
| **🧭 AI 추천** | 5문항 여행 취향 설문 → AI가 최적 관광지 Top 3 추천 · 사진 카드 + 지도 바로가기 |
| **⭐ 별점** | 159개 관광지 전체 별점(3.2–4.9) · 리뷰 수 · 목록·홈카드·슬라이드 패널에서 표시 |

### 편의정보 (지도 → 편의정보 칩)

| 카테고리 | 수량 | 내용 |
|----------|-----:|------|
| 모범음식점 | 94개 | 화성시 지정 우수 음식점 |
| 관광식당업 | 35개 | 관광식당업 등록업소 |
| 관광호텔 | 14개 | 등급·객실 수 표시 |
| 캠핑장 | 11개 | 야영면 수·부대시설 |
| 템플스테이 | 1개 | 용주사 프로그램 안내 |
| 제부도 숙박 | 115개 | 펜션·민박·모텔·콘도 전체 목록 |

---

## 데이터 출처

| 데이터 | 출처 | 비고 |
|--------|------|------|
| 관광지 159개 (자연·역사 41개) | 화성시 문화관광 (`tour.hscity.go.kr`) | 공식 API |
| 체험마을·체험지 51개 | 화성시 문화관광 (`tour.hscity.go.kr/2exp`) | |
| 관광지 추가 67개 | 한국관광 데이터랩 (`datalab.visitkorea.or.kr`) | 쇼핑·골프·호텔·공원 등 |
| 축제·행사 48개 (2026) | 화성시 예약시스템 (`yeyak.hscity.go.kr`) | |
| 공영주차장 131개 (실시간) | 화성 스마트파킹 API (`smartparking.hscity.go.kr`) | Flask 프록시 경유 |
| 지역화폐 가맹점 27,374개 | 화성사랑카드 공개 데이터 | 4.2MB 지연 로드 |
| 편의정보 157개 | 화성시 공식 데이터 (`tour.hscity.go.kr`) | 음식점·호텔·캠핑 등 |
| 제부도 숙박 115개 | 화성시 문화관광 사이트 | 펜션·민박·모텔·콘도 |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Vanilla HTML · CSS · JavaScript (단일 파일 SPA, 프레임워크 없음) |
| 지도 | Kakao Maps JavaScript SDK v2 |
| 프록시 서버 | Flask (Python) — 주차장 API CORS 우회 |
| 배포 | Cloudflare Quick Tunnel |
| AI | Claude Sonnet 4.6 (Anthropic) |

---

## 로컬 실행

```bash
# 1. 클론
git clone https://github.com/Moonhm/hwaseong_AI.git
cd hwaseong_AI

# 2. Flask 설치
pip install flask requests

# 3. 프록시 서버 실행 (실시간 주차장 데이터에 필요)
python tools/server.py --port 8080

# 4. http://localhost:8080 접속
```

> 카카오맵 API 키는 Cloudflare 도메인 기준으로 설정되어 있습니다.
> 로컬 개발 시 [developers.kakao.com](https://developers.kakao.com)에서 별도 키를 발급하세요.

---

## 팀

| 이름 | 역할 |
|------|------|
| 문형민 (Moon Hyeongmin) | 개발, 데이터 파이프라인 |
| 서교연 (Seo Gyoyeon) | UI/UX 디자인 (Figma), QA |

> Contact: hm8824@naver.com

---

<div align="center">

*Made with ♥ for Hwaseong (화성), Korea · 2026 화성시 AI 해커톤*

**[라이브 앱 바로가기 →](https://culture-reed-dee-rug.trycloudflare.com)**

</div>
