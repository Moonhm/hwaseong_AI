# 같은 해커톤 11개 팀 저장소 비교 — 코드 품질과 UI/인터랙션

> 개발 Claude · 2026-08-26 · 커밋 없음(조사) → 적용은 `70d69fa`·`7b51675`

사용자가 준 GitHub 주소 11개를 전부 클론해 CSS·JS 를 직접 읽고 우리 현황과 대조했다.
**이 문서가 그 조사의 유일한 기록이다** — 조사 자체는 코드를 남기지 않으므로.

## 대상 — 저장소 11개

전부 `git clone --depth 50` 로 받아 CSS·JS 를 직접 읽었다. 규모는 실측(`.git`·`node_modules` 제외).

| # | 저장소 | 규모 | 도메인 | 스택 |
|---|---|---|---|---|
| 1 | [Cazeko/ilmeori](https://github.com/Cazeko/ilmeori) | 515파일 / 53커밋 | 공무원 업무공유·인수인계 (HWPX 결재문서 자동 생성) | Next.js 16 + TS + Supabase |
| 2 | [ldy1118-git/ai-hwaseong](https://github.com/ldy1118-git/ai-hwaseong) | 353파일 / 50커밋 | 소상공인 정책자금 매칭 | React 18 + Vite + Vercel Python |
| 3 | [2026-AIHwaseong-project/hwaseong-dashboard](https://github.com/2026-AIHwaseong-project/hwaseong-dashboard) | 37파일 / 85커밋 | 버스 수요·공급 미스매칭 대시보드 | **순수 HTML/CSS/JS — 우리와 같은 제약** |
| 4 | [choys99999-maker/hwaseong-justdream-platform](https://github.com/choys99999-maker/hwaseong-justdream-platform) | 196파일 / 63커밋 | 청년 정책 플랫폼 | React + Tailwind v4 |
| 5 | [seongyeop1/hwaseong-policy](https://github.com/seongyeop1/hwaseong-policy) | 130파일 / 50커밋 | 정책 안내 | React + framer-motion |
| 6 | [Seongwonp/hwaseong-eats](https://github.com/Seongwonp/hwaseong-eats) | 380파일 / 67커밋 | 먹거리 지도 (화성페이 가맹점·모범음식점) | Flutter 본체 + React 발표용 데모 |
| 7 | [caiiyin/JustUs](https://github.com/caiiyin/JustUs) | 176파일 / 36커밋 | 생애주기별 나들이 코스 추천 | Next.js 16 + Prisma + Supabase |
| 8 | [HSB37373/CrackAI](https://github.com/HSB37373/CrackAI) | 46파일 / 46커밋 | 도로 균열 탐지 민원 | Flask + 순수 JS |
| 9 | [lse8422/pinpoint-dashboard](https://github.com/lse8422/pinpoint-dashboard) | 19파일 / 50커밋 | 데이터 대시보드 | 단일 HTML + Chart.js |
| 10 | [tjsrud4941/-AI-](https://github.com/tjsrud4941/-AI-) | 15파일 / 24커밋 | 재난 예측 | 단일 HTML (4.4MB) |
| 11 | [TeamBongCoding/-safety-platform](https://github.com/TeamBongCoding/-safety-platform) | 122파일 / 44커밋 | 안전 플랫폼 | React + FastAPI |

> **클론 함정** — 10·11번은 저장소 이름이 하이픈으로 시작해서
> `git clone https://github.com/tjsrud4941/-AI-.git` 이 그대로는 실패한다(git 이 옵션으로 읽는다).
> 대상 디렉터리를 명시하면 된다: `git clone <url> tjsrud-AI`

## 팀별로 배운 것 한 줄

| 팀 | 가져올 것 | 피할 것 |
|---|---|---|
| **ilmeori** | 디자인 규칙을 **시험으로 강제**(14개). 지운 토큰까지 "왜 지웠는지" 기록 | 프레임워크 이식 |
| **hwaseong-dashboard** | `:active` 규율 명문화, `prefers-reduced-motion` 11건, 스피너만 감속하는 판단 | 67개 색 토큰 체계(우리 도메인에 대응물 없음) |
| **justdream** | `max()` safe-area 19곳, 진입 모션 안무(160→520→600ms) | 관리자 화면의 임의 hex 412회 |
| **hwaseong-policy** | `--font-scale` 큰글씨 모드 | 정책 48건 3중 사본 |
| **ai-hwaseong** | 4겹 로딩 표현, 11팀 중 유일한 실제 라우트 전환 | **문서 두 벌**(`git-workflow.md` ↔ `CLAUDE.md` 가 정반대 규칙) |
| **pinpoint-dashboard** | **모바일 3종**(`viewport-fit`·tap-highlight·`text-size-adjust`), CSS 만으로 스파크라인 | 단일 파일 2,132줄에 함수 51개 평면 배치 |
| **tjsrud-AI** | `translateX` 캐러셀 + 스와이프(48px/400ms 임계값) | `body{height:100vh}`, `:hover` 전용 화살표, base64 4.4MB |
| **CrackAI** | 점 3개 stagger 로딩 표현 | `@media` 0건, 날짜별 CHANGES_*.md 8개 |
| **hwaseong-eats**(웹) | — | **별점을 `id*1234567%14` 로 생성**, 인라인 style 497회 |
| **JustUs** | — | 홈 검색창 `readOnly`, AI 버튼에 `onClick` 없음 |
| **bong-safety** | 백엔드 테스트 177건, 자기 성능을 불리하게 공개 | `App.jsx.orig` 1,017줄 통째로 커밋 |

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

## 하지 않기로 한 것 — 사용자 판단 (2026-08-26)

아래 셋은 분석에서 "나중에 볼 후보"로 올렸으나 **하지 않기로 했다.**

| 후보 | 출처 |
|---|---|
| SVG mask 온보딩 투어 (구멍 여러 개) | `hwaseong-dashboard/assets/js/core.js:635-800` |
| `--font-scale` 큰글씨 모드 | `hwaseong-policy` |
| CSS 만으로 그리는 스파크라인 | `pinpoint-dashboard/m.html:75-97` |

**"안 한다"를 적어 두는 이유** — 목록에 「나중에 볼 것」으로 남겨 두면
다음 세션이나 배포 Claude가 보고 **절반쯤 만들어 놓는다.**
`ilmeori/DESIGN.md` §10 이 같은 이유로 안 할 것을 명시한다:
*"다크 모드. 지금 dark: 가 한 곳도 없다. 안 한다고 여기 적어 둔다 —
적어 두지 않으면 누군가 절반만 만든다."*

셋 다 **결함 수정이 아니라 '있으면 좋은 것'**이다. 앞선 넷(모바일 3종·
reduced-motion·눌림 피드백·화면 전환)과 성격이 다르다 — 그쪽은 고장 난 것을
고치거나 없던 기본을 채운 것이었다.

다시 하기로 판단이 바뀌면 위 출처를 그대로 찾아가면 된다.
