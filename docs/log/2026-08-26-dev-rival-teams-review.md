# 같은 해커톤 11개 팀 저장소 비교 — 코드 품질과 UI/인터랙션

> 개발 Claude · 2026-08-26 · 커밋 없음(조사) → 적용은 `70d69fa`·`7b51675`

사용자가 준 GitHub 주소 11개를 전부 클론해 CSS·JS 를 직접 읽고 우리 현황과 대조했다.
**이 문서가 그 조사의 유일한 기록이다** — 조사 자체는 코드를 남기지 않으므로.

## 대상

| 저장소 | 도메인 | 스택 |
|---|---|---|
| `Cazeko/ilmeori` | 공무원 업무공유·인수인계 (HWPX 결재문서 생성) | Next.js 16 + TS + Supabase |
| `ldy1118-git/ai-hwaseong` | 소상공인 정책자금 매칭 | React 18 + Vite + Vercel Python |
| `2026-AIHwaseong-project/hwaseong-dashboard` | 버스 수요·공급 미스매칭 대시보드 | **순수 HTML/CSS/JS (우리와 같은 제약)** |
| `choys99999-maker/hwaseong-justdream-platform` | 청년 정책 플랫폼 | React + Tailwind v4 |
| `seongyeop1/hwaseong-policy` | 정책 안내 | React + framer-motion |
| `Seongwonp/hwaseong-eats` | 먹거리 지도 | Flutter (웹은 발표용 데모) |
| `caiiyin/JustUs` | 생애주기 나들이 코스 | Next.js 16 + Prisma |
| `HSB37373/CrackAI` | 균열 탐지 민원 | Flask + 순수 JS |
| `lse8422/pinpoint-dashboard` | 데이터 대시보드 | 단일 HTML + Chart.js |
| `tjsrud4941/-AI-` | 재난 예측 | 단일 HTML (4.4MB) |
| `TeamBongCoding/-safety-platform` | 안전 플랫폼 | React + FastAPI |

## 평가 — 냉정하게

| 팀 | 코드 | UI/인터랙션 | 비고 |
|---|---|---|---|
| **ilmeori** | **A+** | B+ | 41,000줄에 TODO 0건. 디자인 규칙을 14개 시험으로 강제하고, **지운 토큰까지 "왜 지웠는지" 기록**. 전환은 일부러 안 넣음(업무 도구라 속도 우선) |
| **hwaseong-dashboard** | **A** | **A−** | **우리와 같은 제약(빌드 도구 없음)인데 규율이 더 강하다.** `app.css` 2,075줄에 19구획 목차, 자체 검사 스크립트, `:active` 규율 명문화. **가장 배울 팀** |
| **justdream** | A− | **A** | 진입 모션 안무(160→520→600ms), `max()` safe-area 19곳. **모바일 배려는 우리보다 위** |
| **hwaseong-policy** | B+ | A− | `--font-scale` 큰글씨 모드 |
| **ai-hwaseong** | B | A− | **11팀 중 유일하게 실제 라우트 전환**. 4겹 로딩 |
| **pinpoint-dashboard** | B | C+ | `@keyframes` 0개. **모바일 3종 세트만 우리보다 위** |
| **tjsrud-AI** | C− | B | 캐러셀+스와이프는 잘 만듦. 단 base64 4.4MB HTML |
| **hwaseong-eats**(웹) | C | D | `:hover`/`:active` **0건**. **별점을 `id*1234567%14` 로 지어냄** |
| **JustUs** | C | D | `:active` 0건. 홈 검색창이 `readOnly`, AI 버튼에 `onClick` 없음 |
| **CrackAI** | C+ | D+ | `@media` **0건** |
| **bong-safety** | 백엔드 A− / 프론트 D | D | `App.jsx.orig` 1,017줄을 통째로 커밋 |

**결론: UI/인터랙션으로 우리보다 확실히 나은 팀은 `justdream` 과 `hwaseong-dashboard` 둘뿐.**
그것도 "발상"이 나은 거지 구현량이 나은 게 아니다. 11팀 중 5팀은 우리보다 명백히 빈약하다.

## 우리가 이미 하고 있던 것 (제안에서 뺀 것)

분석이 "도입하자"고 한 것 중 **6개는 이미 구현돼 있었다.** 기록해 두지 않으면 다음에 또 제안된다.

| 제안 | 우리 현황 |
|---|---|
| 버튼 크기별 `:active` scale 차등 | `20-map.css:277-290` — nav 0.88 / 칩 0.93 / 카드 0.97 |
| 리스트 스태거 12개 상한 | `js/tourism.js:244` `Math.min(i,12)*0.045s` |
| 바텀시트 전환 | 우리 350ms `cubic-bezier(0.32,0.72,0,1)` — 상대(220ms)보다 정교 |
| 드로어 `visibility` 지연 트릭 | `30-panel.css:29,36` — 완전히 같은 기법 |
| 히트영역 넓히기 | `00-base.css:149-151` — padding+content-box(`::after` 보다 나음) |
| 터치 타겟 폭 계산 | `00-base.css:77-82` — 320px→64px 실측 주석까지 |

## 적용한 것

`70d69fa` · `7b51675` 로 반영. 상세는 [`2026-08-25-dev-mobile-motion.md`](2026-08-25-dev-mobile-motion.md).

1. **`viewport-fit=cover`** (pinpoint 에서) — 없어서 우리 `env(safe-area-inset-*)` 6곳이 전부 0 을 반환하던 **버그**
2. **전역 `-webkit-tap-highlight-color`** (pinpoint) + `:active` 짝 12개 보강
3. **`prefers-reduced-motion`** (hwaseong-dashboard·justdream) — 스피너만 감속하는 판단까지
4. **화면 전환** (ai-hwaseong·tjsrud-AI 절충) — 전체 폭 대신 18% + 페이드

## 따라 하면 안 되는 것

- **`tjsrud-AI` 의 `body{height:100vh}`** — iOS 주소창이 접힐 때 하단이 잘린다. `100dvh` 를 써야 한다
- **`tjsrud-AI` 의 `:hover` 전용 좌우 화살표** — 터치 기기에선 영영 안 보인다
- **`tjsrud-AI` 의 base64 인라인** — `map.jpg` 1.5MB 를 HTML 에 넣어 `index.html` 이 4.4MB. 캐시가 전혀 안 먹는다
- **`ai-hwaseong` 의 문서 두 벌** — `git-workflow.md` 와 `CLAUDE.md` 가 서로 반대 규칙을 말한다. 같은 주제를 두 파일에 두면 한쪽이 반드시 낡는다
- **`CrackAI` 의 날짜별 CHANGES\_*.md 8개** — git log 가 이미 하는 일의 중복
- **`hwaseong-dashboard` 의 67개 색 토큰 체계** — 1km 격자 지표용이라 우리 도메인에 대응물이 없다

## 아직 안 가져온 것 (나중에 볼 것)

- **`hwaseong-dashboard` 의 SVG mask 온보딩 투어** — 구멍을 **여러 개** 낼 수 있다(`box-shadow` 수법은 하나만).
  `<svg>` 에 `viewBox` 를 걸지 않아야 CSS px 과 1:1 이 되고, 말풍선 위치는 `visualViewport.height` 로 재야
  iOS 주소창 뒤로 [다음] 버튼이 숨지 않는다 — 저쪽이 실제로 겪고 고친 버그다
- **`hwaseong-policy` 의 `--font-scale` 큰글씨 모드** — 접근성 가점 요소
- **`pinpoint` 의 CSS 만으로 그리는 스파크라인** — 차트 라이브러리 없이 flex + height%
