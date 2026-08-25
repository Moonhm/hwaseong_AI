# 모바일 기본 3종 · prefers-reduced-motion · 화면 전환 슬라이드

> 개발 Claude · 2026-08-25 · 커밋 `70d69fa`(앞 둘) + 이 커밋(전환)

같은 해커톤 11개 팀 저장소를 전부 클론해 CSS·JS 를 직접 읽고, 우리 현황과 대조해 얻은 결과다.

## 배경 — 우리는 인터랙션 기초가 이미 상위권이었다

4개 관점이 "도입하자"고 제안한 것 중 **6개는 이미 구현돼 있었다.**

| 제안 | 우리 현황 |
|---|---|
| 버튼 크기별 `:active` scale 차등 | `20-map.css:277-290` — nav 0.88 / 칩 0.93 / 카드 0.97. 경쟁팀 값과 거의 동일 |
| 리스트 스태거 12개 상한 | `js/tourism.js:244` `Math.min(i,12)*0.045s` |
| 바텀시트 전환 | 우리 350ms `cubic-bezier(0.32,0.72,0,1)` — 상대(220ms)보다 정교 |
| 드로어 `visibility` 지연 트릭 | `30-panel.css:29,36` — 완전히 같은 기법 |
| 히트영역 넓히기 | `00-base.css:149-151` — padding+content-box 방식(`::after` 보다 나음) |

UI/인터랙션으로 우리보다 확실히 나은 팀은 **justdream**(모바일 물리 배려)과 **hwaseong-dashboard**(규율) 둘뿐이었다.

## 1. 모바일 기본 3종 — 버그 수정이었다

`viewport-fit=cover` 가 없어서 **`env(safe-area-inset-*)` 이 항상 0 을 반환**하고 있었다.
우리는 그걸 6곳(`00-base:63,75` · `20-map:19,208` · `90-misc:63`)에서 쓰는데 전부 무효였다 —
iPhone 홈 인디케이터가 하단 내비 5칸을 가리는 상태였다. 개선이 아니라 고장 수리다.

- `index.html` viewport 에 `viewport-fit=cover`
- `css/00-base.css` 에 `* { -webkit-tap-highlight-color: transparent }` 전역 (기존 3곳뿐)
- `css/00-base.css` 에 `html { -webkit-text-size-adjust: 100% }`

**하이라이트를 끄면 `:active` 가 없던 요소는 피드백이 0 이 된다.** 그래서 짝을 반드시 함께 채웠다 —
`css/90-misc.css` 끝에 12개 클래스. 크기 차등은 기존 규칙을 따랐다(작을수록 많이 눌린다).
목록 '행'은 scale 대신 배경만, 주소 텍스트는 opacity 만.

## 2. prefers-reduced-motion — 기존 0건

11개 팀 중 이걸 한 팀은 `hwaseong-dashboard`(11건)와 `justdream`(4건) 둘뿐이었다.

우리 애니메이션 5개를 전부 멈추되 **스피너만 예외로 0.8s → 2.4s 감속**한다.
멈춘 스피너는 '기다리는 중'이 아니라 '고장'으로 읽히기 때문이다(hwaseong-dashboard 의 판단).

`item-enter`·`quiz-enter`·`fade-down` 은 `fill-mode:both` 라 0.01ms 로 줄여도 최종 상태에 정상 도달한다 —
요소가 사라지는 사고는 없다.

## 3. 화면 전환 슬라이드

전에는 `display:none ↔ block` 즉시 교체라 중간이 없었다. 이제 방향을 가진 전환이 생겼다.

**전체 폭이 아니라 18% 이동 + 페이드**를 골랐다. 이유 둘:
1. 지도 화면은 커스텀 오버레이가 수백 개다 — 전체 폭 이동은 합성 비용이 크다
2. 짧은 이동 + 페이드가 '방향은 알겠는데 기다리게 하지 않는' 느낌을 준다

`.page` 가 이미 `position:absolute` 로 겹쳐 있어 **래퍼 없이** 두 장을 동시에 띄울 수 있었다 —
`index.html` 구조를 하나도 안 건드렸다(배포 Claude 와 충돌 여지 0).

방향은 하단 내비 순서(`PAGE_ORDER`)로 정한다. 오른쪽 탭으로 가면 오른쪽에서 들어온다.

### 함정 3가지

1. **`animationend` 백업 필수.** 애니메이션이 어떤 이유로든 발생하지 않으면 이벤트가 영영 안 오고,
   나가던 장이 `display:block` 인 채 얼어붙는다. `setTimeout(done, 600)` 을 뒀다.
2. **연타.** 이전 전환이 안 끝났는데 또 누르면 `.pg-leaving` 이 남아 두 장이 겹친 채 굳는다.
   전환 시작 전에 `_pgCleanup()` 으로 흔적부터 지운다.
3. **지도 크기.** `transform` 은 레이아웃 크기를 안 바꾸므로 애니 중에도 컨테이너 크기는 정확하다.
   그래도 전환 후 `initMap()` 을 한 번 더 부른다 — `mapReady` 가드 덕에 `relayout` 만 돈다.

## 실브라우저 검증 (Chromium 390×844)

| 항목 | 결과 |
|---|---|
| `reducedMotion=no-preference` | nav 전환 0.14s (정상) |
| `reducedMotion=reduce` | 1e-05s (차단됨) |
| tap-highlight | `rgba(0,0,0,0)` 투명 |
| 홈→지도 | `home:pg-leaving\|pg-out-l` + `map:pg-in-r\|active` — 오른쪽에서 진입 |
| 지도→홈 | 반대 방향 정확 |
| 연타 6회 | 보이는 페이지 1장, 잔상 0 |
| 전환 후 지도 | 컨테이너 390×798, 잔여 클래스 0 |
| 런타임 에러 | 0건 |

## 하지 않은 것

`viewport` 의 `maximum-scale=1.0, user-scalable=no` 는 **그대로 뒀다.** 핀치 줌을 막는 접근성 문제이긴 하나,
지도 앱에서 페이지 줌과 지도 줌이 충돌할 위험이 실재한다. 별도 판단이 필요해 손대지 않았다.
