# WORKFLOW.md — 화성잇다 개발 기록

> 이 문서는 **2026 화성시 해커톤** 프로젝트 **화성잇다**의 전체 개발 과정을 기록합니다.
> 양방향 Claude 협업 워크플로우, 세션별 작업 내역, 버그 수정 이력, 아키텍처 결정 사항을 포함합니다.

---

## 1. 프로젝트 개요

- **앱 이름**: 화성잇다 (Hwaseong-itda)
- **목표**: 경기도 화성특례시 통합 관광 정보 모바일 웹앱
- **저장소**: https://github.com/Moonhm/hwaseong_AI
- **배포 URL**: https://culture-reed-dee-rug.trycloudflare.com
- **팀**: 문형민, 서교연 + Claude Sonnet 4.6 (AI 개발 에이전트 2인 체계)
- **기간**: 2026년 8월 18~19일 (해커톤 당일 집중 개발)

---

## 2. 양방향 Claude 워크플로우 (핵심 협업 구조)

이 프로젝트의 가장 독특한 점은 **두 개의 Claude AI 인스턴스가 GitHub을 매개로 비동기 협업**한 것입니다.

### 역할 분리

```
┌────────────────────────────────────────────────────────────────┐
│  개발 Claude (Development Claude)                              │
│  ─────────────────────────────────────                         │
│  · git fetch로 최신 코드 확인 후 작업                           │
│  · index.html / map.js / parking.js 등 코드 작성·수정          │
│  · git push → 커밋 메시지로 변경 사항 기록                      │
│  · README [메시지함]으로 배포 Claude에게 메시지 전달            │
└────────────────────────────────────────────────────────────────┘
                              ⬇ push / ⬆ pull
                         GitHub (origin/main)
                              ⬇ pull / ⬆ push
┌────────────────────────────────────────────────────────────────┐
│  배포 Claude (Deployment Claude)                               │
│  ─────────────────────────────────────                         │
│  · Flask 서버 + Cloudflare Tunnel로 실시간 서빙                 │
│  · assets/images/places/ 장소 사진 159개 로컬 관리 (git 제외)  │
│  · 실제 앱 테스트 → 버그 발견 시 직접 수정 + push              │
│  · README [메시지함]으로 개발 Claude에게 답장                   │
└────────────────────────────────────────────────────────────────┘
```

### 소통 채널

- **GitHub README.md `[Claude 간 메시지함]` 섹션**을 비동기 메시지 채널로 사용
- 사용자(문형민)가 두 Claude를 중계 (메시지를 양쪽에 전달)
- 각 Claude는 README를 읽어 상대방의 최신 작업·요청 확인

### 핵심 규칙 (충돌 방지)

| 규칙 | 이유 |
|------|------|
| 작업 전 반드시 `git pull --rebase` | 두 인스턴스가 동시에 push → rebase 충돌 방지 |
| 사진·대용량 파일 절대 push 금지 | 저장소 용량 초과 방지, 배포 서버 전용 |
| 커밋 메시지에 변경 이유 명시 | 상대 Claude가 pull 시 맥락 즉시 파악 |
| ID 범위 규칙 준수 | tourist/festival ID 충돌 방지 |

---

## 3. 기술 스택 및 아키텍처

### 전체 구조

```
Frontend         순수 HTML · CSS · JavaScript (프레임워크 없음)
                 단일 파일 SPA: index.html (~3,100줄)
Map Engine       Kakao Maps JavaScript SDK v2
                 커스텀 오버레이 · 클러스터 · idle 이벤트 기반 동적 렌더링
Proxy Server     Flask (Python) — 주차장 API CORS 우회
Deployment       Cloudflare Quick Tunnel (cloudflared --url localhost:8080)
AI Workflow      Claude Sonnet 4.6 × 2 인스턴스 (개발 + 배포)
```

### 모바일 우선 설계 원칙

| 항목 | 값 |
|------|----|
| 기준 화면 | 모바일 세로 (portrait) |
| 최대 너비 | 480px |
| 하단 내비게이션 | 52px 고정 |
| 터치 타겟 최소 | 36×36px |

### 카테고리 색상 체계

| 카테고리 | 색상 | 이모지 |
|---------|------|--------|
| tourist (관광지) | `#FB923C` | ★ |
| restaurant (맛집) | `#D97706` | 🍽 |
| festival (축제) | `#DC2626` | 🎉 |
| parking (주차장) | `#2563EB` | 🅿 |
| localcurrency (지역화폐) | `#059669` | 💳 |

### 지도 렌더링 방식

```
줌레벨 > 7 (줌아웃):  그리드 기반 클러스터 원 (별/P/💳 + 개수)
줌레벨 ≤ 7 (줌인):   뷰포트 내 개별 핀 (cm-pin, cm-circle, cm-tail)

idle 이벤트 → 100ms 디바운스 → clearDisplay() → re-render
(panBy/setCenter 연속 호출 시 마지막 위치에서 1회만 렌더링)
```

---

## 4. 데이터 파이프라인

### 관광지 (tourist) — 159개

| 수집 시기 | 방법 | ID 범위 | 수량 |
|---------|------|---------|------|
| 초기 | tour.hscity.go.kr 공식 API 스크래핑 | id:1–41 | 41개 |
| 1차 추가 | tour.hscity.go.kr 체험마을·체험지 | id:66–83, 201–233 | 51개 |
| 2차 추가 | 한국관광 데이터랩 8개 zip → 29개 CSV 분석 | id:134–200 | 67개 |

**2차 추가 포함 카테고리**: 쇼핑(백화점), 골프장, 숙박(호텔·리조트), 영화관, 테마파크, 공원, 시장, 마리나, 낚시터, 사찰, 체험장, 문화시설

### 축제 (festival) — 48개

1. yeyak.hscity.go.kr에서 2026년 화성시 행사 전체 수집
2. `gen_data.py` 스크립트로 좌표 자동 매핑 (VENUE_COORDS 딕셔너리)
3. 과거 행사(8월 14일 이전) 전체 제거 → 미래 행사 48개만 유지
4. ID 범위: 42–133 (festival 전용)

### 주차장 — 131개

- `smartparking.hscity.go.kr` API에서 전체 목록 수집
- 정적 캐시: `js/parking-static.json` (Flask 없어도 즉시 표시)
- 실시간 여유: Flask 프록시 `/api/parking/realtime` → 60초마다 갱신

### 별점 시스템 — 159개

Playwright/Selenium 환경 미지원 → 알고리즘 기반 생성:
1. Kakao Local Search API REST 호출 (검색 순위 파악)
2. 설명 텍스트 분석 (한국관광100선, 세계문화유산, 명소 키워드 등)
3. 태그 수·설명 길이 보정
4. 결정론적 노이즈 (MD5 해시 기반, 항상 동일한 값)
5. 결과: `js/ratings.json` → `data.js` 주입

### 장소 사진

- `assets/images/places/{name}.jpg` (data.js name 필드와 정확히 일치)
- **git 제외** (용량 문제) — 배포 서버에만 존재
- 원본 32장 + 유사 카테고리 재사용 127장 = 총 159장
- onerror fallback: 주황 그라데이션 + 🏞️ 자동 표시

---

## 5. 세션별 작업 이력

### Session 1 — 기초 구축

| 커밋 | 내용 |
|------|------|
| `6590e46` | 화성잇다 초기 버전 — 카카오맵 통합 모바일 웹앱 |
| `f37e99c` | 지도 초기화 오류 수정 |
| `8322932` | autoload=false + kakao.maps.load() 방식 |
| `46961a5` | API 키 교체 (도메인 등록 키로 최종) |
| `b488910` | 더미 데이터 전체 제거, 동적 렌더링 전환 |
| `1a1eddc` | 실시간 주차장 API 연동 (parking.js + server.py) |
| `302cd4e` | parking-static.json 생성, 지오코더 단순화 |

### Session 2 — 데이터 대폭 확장

| 커밋 | 내용 |
|------|------|
| `3931360` | data.js — 체험지 51개 + 축제 24개 추가 (총 116개) |
| `c223d0b` | 장소 사진 시스템 구축 (assets/, onerror fallback) |
| `c98d94a` | 한국관광 데이터랩 관광지 67개 추가 (id:134–200) |
| `93fb388` | 관광지 줌레벨 클러스터/뷰포트 동적 렌더링 (idle 이벤트) |
| `901b4ab` | 관광지 슬라이드카드 전면 개선 |
| `a7037a9` | 관광지 좌표 9건 교정 + updateTouristDisplay 100ms 디바운스 |

### Session 3 — 기능 완성 (해커톤 당일)

| 커밋 | 내용 |
|------|------|
| `7e506e2` | 관광지 159개·주차장 131개 tags 추가 + README 전면 갱신 |
| `30e13fe` | 전체 탭 종합 버그 수정 (BUG-1~13) |
| `86c7f5a` | AI기반 관광지 추천 5문항 + 사이드 메뉴 드로어 |
| `7801150` | 지도 포커스 연동 + 주차장 대수 표시 |
| `fc9c95b` | 배포 Claude 검토 항목 4건 수정 |
| `2d96feb` | 성능·버그 7건 수정 (배포 Claude 직접 push) |
| `9ecd97f` | localcurrency 4.2MB 지연로드 + 달력 동적화 |
| `f76a447` | 지도 기본 빈 화면 + 주차장 칩 독립 멀티 선택 |
| `b5edec3` | 관광 탭 전체 목록 5개 미리보기 + 더보기 버튼 |
| `aabba6f` | 홈 로고 클릭 앱 주소 공유 기능 |
| `2d69c8b` | AI기반 관광지 추천 결과 화면 전면 재설계 |
| `afc7315` | 관광지 별점(★) 시스템 추가 |
| `5591bea` | 전체 코드 최적화 7가지 |
| `74e2f6d` | 경기지역화폐 공식 로고 적용 |
| `c50153c` | fix: 사이드 메뉴 shadow 버그 수정 |
| `ea3f134` | fix: 지도 핀 전수 검토 — 좌표 중복 15곳 분리 + 필터 토글 버그 수정 |

---

## 6. 주요 버그 수정 이력

| 버그 | 증상 | 원인 | 수정 |
|------|------|------|------|
| BUG-1 | tourist id:84–116이 festival과 충돌 | ID 범위 중복 설계 | tourist → id:201–233 재번호 |
| BUG-3/4 | localcurrency.js와 map.js 변수명 충돌 | `LC_PIN_LEVEL` 동일 변수명 | map.js는 `TK_PIN_LEVEL`/`TK_GRID`로 네임스페이스 분리 |
| BUG-8 | 달력 ‹/› 버튼 클릭 무반응 | onclick 연결 누락 | calNav() 함수에 연결 |
| BUG-9 | 축제 카드 배경 단색 | 인덱스 기반 클래스 미적용 | `IMG_CLASSES[festIdx % 5]` |
| BUG-11 | 슬라이드 drag 이벤트 2중 등록 | setupSlideCardDrag 중복 호출 | 1회만 호출하도록 수정 |
| 퀴즈 오버레이 계속 표시 | 탭 전환 후에도 퀴즈 떠있음 | `go()` 함수에 `closeQuiz()` 없음 | `go()` 첫 줄에 `closeQuiz()` + `closeMenu()` 추가 |
| ← 버튼 화면 삐져나옴 | 퀴즈 오버레이 버튼이 우측 뷰포트 밖 | `translateX(100%)` = 뷰포트 끝 | `translateX(110%)` + `visibility:hidden` |
| 사이드 메뉴 shadow 노출 | 메뉴 닫힌 상태에서 그림자 보임 | box-shadow 28px가 화면 끝 밖으로 새어나옴 | `translateX(110%)` + `visibility:hidden` + transition delay |
| 지도 핀 토글 버그 | 관광 탭→지도 이동 시 핀이 사라짐 | `goMapFocus()`에서 `setFilter('tourist')` 재호출 → 토글 OFF | `chip.classList.contains('active')` 확인 후 조건부 호출 |
| 좌표 중복 (15곳) | 같은 위치에 핀 겹쳐 한쪽 클릭 불가 | data.js 입력 오류 (동일 항구/단지 내 복수 시설) | 약 100m 오프셋으로 분리 |

---

## 7. 양방향 Claude 소통 기록 (요약)

### 개발 Claude → 배포 Claude

**1차 (Session 2):**
- 관광지 대폭 확장 공지 (92→159개), 클러스터 렌더링 방식 변경 안내
- 장소 사진 규칙 전달: `assets/images/places/{name}.jpg`

**2차 (Session 3 초반):**
- 배포 Claude 수정사항 7건 수신 확인 (달력, 크래시, 퀴즈, 지도포커스 등)
- 현재 세션 완료 작업 4건 공유
- 향후 개발 방향 의향 질문

**3차 (Session 3 중반):**
- 양방향 push 체계 전환 공지 (`git pull --rebase` 필수화)
- 퀴즈 결과 "지도에서 보기" 동작 확인 요청
- 최신 작업 4건 (칩 UI, 더보기, 공유, 퀴즈 재설계) 전달

### 배포 Claude → 개발 Claude

**1차:**
- 배포 성공 확인 (URL, 이미지 보유 현황)

**2차:**
- 사진 159개 할당 완료 (원본 32 + 재사용 127)
- push 권한 획득 (`gh auth login` 완료)
- BUG-1~13 직접 수정 후 push
- tags 시스템·주차장 tags 자동 생성 완료
- 권고사항 5건 (getSpotTags, 달력 동적화, Geocoder 캐싱 등)

**3차:**
- 홈 생활탭 데이터 버그 수정 + 성능 최적화 완료 직접 push
- 지역화폐 지연로드 적용
- 달력 동적화 완료

---

## 8. 남은 한계 및 향후 개선 방향

| 항목 | 현황 | 개선 방향 |
|------|------|---------|
| 별점 데이터 | 알고리즘 생성 (Selenium 환경 없음) | Kakao Place API 실제 별점 연동 |
| 장소 사진 | git 미포함, 배포 서버 전용 | CDN 적용 또는 Cloudflare Images |
| Geocoder 캐싱 | 편의시설 칩 클릭마다 157건 API 호출 | localStorage 1회 캐싱 |
| 달력 날짜 연동 | has-event 클래스 하드코딩 일부 | PLACES 배열의 date 필드 기반 동적 마킹 |
| 맛집 지도 칩 | 실제 restaurant 데이터 없음 | 모범음식점(conv_map.js)으로 리다이렉트 |

---

## 9. 파일별 역할 및 핵심 함수

### index.html

| 함수 | 역할 |
|------|------|
| `go(page)` | 탭 전환 (+ 퀴즈·메뉴 자동 닫기) |
| `goMapFocus(lat, lng, level, id)` | 관광 탭 → 지도 이동 + 핀 포커스 |
| `renderTourismList(theme, expanded)` | 관광 탭 목록 렌더링 (더보기 포함) |
| `showFestivalDetail(id)` | 축제 상세 뷰 |
| `openQuiz()` / `closeQuiz()` | 퀴즈 오버레이 제어 |
| `copyAppUrl()` | 앱 URL 클립보드 복사 |
| `ratingStars(r)` | 별점 → ★½☆ 문자열 변환 |

### map.js

| 함수 | 역할 |
|------|------|
| `initMap()` | Kakao 지도 초기화 + idle 리스너 |
| `buildOverlays()` | tourist 제외 카테고리 핀 사전 생성 |
| `updateTouristDisplay()` | 100ms 디바운스 관광지 렌더링 분기 |
| `showTkViewport(bounds)` | 뷰포트 내 개별 핀 생성 |
| `showTkClusters(bounds, lv)` | 줌아웃 시 그리드 클러스터 원 |
| `onPinClick(id)` | 핀 클릭 → 선택 상태 + 슬라이드 오픈 |
| `showPlaceSlide(place)` | 하단 슬라이드 카드 렌더링 |
| `setFilter(cat)` | 카테고리 칩 필터 토글 |
| `activateParking()` | 주차장 필터 단방향 활성화 |

### parking.js

| 함수 | 역할 |
|------|------|
| `mergeParkingData()` | parking-static.json 로드 |
| `fetchParkingAll()` | 실시간 API 최초 호출 |
| `_applyRealtime(data)` | 실시간 데이터 → parkingData 병합 |
| `pinColorCached(p)` | 여유율 기반 색상 (캐시) |
| `updateParkingDisplay()` | 100ms 디바운스 주차장 렌더링 |

---

*기록 종료: 2026년 8월 19일*
