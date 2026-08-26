# 가로 스크롤 목록 8곳에 좌우 화살표 — `js/hscroll.js` 신설

- 날짜: 2026-08-26
- 담당: 개발 Claude (hm8824@naver.com)
- 발단: 사용자 지적 — "옆으로 슬라이드해야하는데 폰이면 될 수도 있지만 컴퓨터는 이게
  안 되잖아. 좌우로 가는 화살표를 띄워놔야지. 끝으로 가면 그쪽 화살표는 안 보이게 하고.
  화살표도 계속 떠있는게 아니라 마우스를 가져다대면 나와주고. 이거 추천에도 그렇고
  다른탭에도 옆으로 슬라이드 목차인것들 전부다 고쳐."

> 커밋 `d307ec4` (2026-08-26 09:00). 이 기록은 하루 지나 되짚어 썼다 —
> WORKFLOW.md §0 이 경계하는 그 경우라, 다시 열어 확인한 것만 적었다.

---

## 1. 먼저 전수로 셌다 — 가로 목록 11곳, 화살표는 3곳

"전부다 고쳐"라는 요청이라 대상을 눈으로 고르면 안 된다. `css/` 7개 파일에서
`overflow-x: auto` 규칙을 전부 뽑았다(`index.html` 인라인 `style` 에는 0건).
`d307ec4^` 기준 11곳이다.

| 가로 목록 | 자리 | 화살표 |
|---|---|---|
| `.festival-scroll` | css/10-content.css:16 | ✅ `.fsc-arr` (`scrollFestArr`·`updateFestArrows`) |
| `.map-chips` | css/20-map.css:39 | ✅ `.chip-arrow` (js/boot.js:24-38) |
| `#lc-filter-scroll` | css/20-map.css:70 | ✅ `.lc-arr` (js/boot.js:41-52) |
| `#rs-filter-scroll` | css/20-map.css:98 | ✗ |
| `.tourism-subnav` | css/30-panel.css:50 | ✗ |
| `.dl-chip-row` | css/50-datalab.css:27 | ✗ |
| `.dl-rank-row` | css/50-datalab.css:45 | ✗ |
| `.dl-tour-row` | css/50-datalab.css:101 | ✗ |
| `.dl-photo-row` | css/50-datalab.css:413 | ✗ |
| `.theme-chips` | css/10-content.css:49 | ✗ |
| `.recent-row` | css/10-content.css:286 | ✗ |

8곳은 마우스로 뒤쪽 항목에 **닿는 방법이 아예 없었다.** 폰에서만 확인하던
동안에는 손가락으로 밀리니 아무도 못 봤다.

## 2. 영역마다 짜지 않고 선택자 목록 하나로

이미 있는 3곳은 전부 **한 곳씩 손으로** 만든 것이다.

| | 기존 3곳 (index.html + js/boot.js·js/home.js) | js/hscroll.js |
|---|---|---|
| 버튼 | index.html 에 박은 `<button>` + 인라인 `onclick` | JS 가 만든다 |
| 대상 지정 | `getElementById` 로 한 개씩 | 선택자 목록 `HS_SELECTORS` |
| 상태 클래스 | `.visible` | `.can` |
| 한 번 미는 폭 | 130px 고정(칩·지역화폐) / 190px 고정(축제) | `clientWidth × 0.8` |
| 붙는 시점 | js/boot.js 최상위 IIFE 한 번(:54·:73). 축제만 렌더마다 재부착(js/home.js:983-985) | 첫 스캔 + MutationObserver + resize |
| 함수 | 영역마다 2개(`update*Arrows`/`scroll*`) | 공통 |

같은 방식을 8곳으로 늘리는 안을 버렸다. 버튼 16개와 함수 16개가 index.html·js 에
흩어지는 것도 문제지만, 결정적 이유는 §3 이다 — **8곳 중 5곳은 마크업이 없다.**

선택자 목록으로 간 것이 옳았다는 증거가 같은 날 두 번 나왔다. 대상이 하루도 안 돼
두 번 줄었는데 **둘 다 `HS_SELECTORS` 한 줄을 지우는 것으로 끝났다** —
js/hscroll.js 의 다른 줄은 건드리지 않았다.

| 커밋 | 시각 | 무엇 | hscroll 쪽 변경 |
|---|---|---|---|
| `fcf2f62` | 09:11 | 지도에서 음식점 3,754건 제거 | `'#rs-filter-scroll'` 삭제 (-1/+0) |
| `0deaed2` | 09:53 | 인기 있는 곳 3위까지 3등분 격자 | `'.dl-photo-row'` 삭제, 그 자리에 이유 주석 (-1/+2) |

기존 방식이었다면 버튼 마크업·함수·CSS 를 각각 걷어내야 했다.

## 3. `innerHTML` 재렌더 — 왜 MutationObserver 인가

8곳 중 index.html 에 마크업이 있는 것은 `.theme-chips`(index.html:342) ·
`.tourism-subnav`(index.html:283) · `#rs-filter-scroll`(당시 index.html:534) 셋뿐이다.
나머지 5곳은 렌더러가 문자열로 찍어 `innerHTML` 에 넣는다.

- `.recent-row` — `renderRecentSection()` (js/home.js:1149) 이 `el.innerHTML = head + '<div class="recent-row">…'`
- `.dl-chip-row` — js/datalab.js 안에서만 **9곳**에서 찍힌다 (`grep -c 'class="dl-chip-row'` = 9)
- `.dl-rank-row`(js/datalab.js:708) · `.dl-tour-row`(:282) · `.dl-photo-row`(:151)

즉 화살표를 붙여 놔도 그 목록이 다시 그려지는 순간 **통째로 날아간다.**

**버린 안: 렌더 함수 끝마다 `initHScroll()` 을 부른다.**
심을 자리가 커밋 시점에 13곳이었고(`.dl-chip-row` 9 + `.dl-rank-row`·`.dl-tour-row`·
`.dl-photo-row` 3 + `.recent-row` 1), 렌더러 대부분이 fetch 콜백 안이라 '끝나는 지점'이
함수마다 다르다. 무엇보다 **새 렌더러가 생기면 반드시 빠뜨린다.** 빠뜨려도 예외가
안 나고 화살표만 조용히 없어지므로 아무도 모른다.
그래서 호출을 심지 않고 `document.body` 를 `{ childList: true, subtree: true }` 로 관찰한다.

관찰이 자기가 만든 DOM 때문에 무한히 되도는 것은 두 겹으로 막힌다.

1. `_hsAttach` 가 멱등하다 — `row._hsWrap` 이 있으면 `_hsSync` 만 하고 나온다(js/hscroll.js:66).
2. `_hsSync` 는 `classList.toggle` 만 한다. 그건 속성 변경인데 관찰 옵션에 `attributes`
   가 없다(js/hscroll.js:121). 그래서 재진입이 안 걸린다.

첫 부착이 만드는 삽입(래퍼 1 + 버튼 2)만 한 번 되울리고, 그 두 번째 패스는 아무 DOM 도
만들지 않아 멈춘다. 120ms 디바운스(js/hscroll.js:120)가 목록 하나를 그릴 때 쏟아지는
mutation 을 한 번으로 합친다.

`js/hscroll.js` 는 index.html 의 `<script>` 나열 **맨 마지막**에 둔다(현재 index.html:954).
관찰로 어차피 다시 붙지만 첫 스캔이 렌더 뒤에 오는 편이 깜빡임이 없다.

## 4. `.hs-wrap` 을 끼운 이유

화살표는 `position: absolute` 다. 기준이 되는 것은 가장 가까운 positioned 조상이다.
`.recent-row` 로 따져 봤다.

```
.recent-row  →  #home-recent-section (index.html:116, style="margin-top:16px" 뿐)
             →  #page-home  class="page"   ← css/00-base.css:70-76  position: absolute
```

래퍼가 없으면 화살표의 기준이 **페이지 전체**가 된다. `top: 50%` 는 목록의 세로
가운데가 아니라 페이지 높이의 가운데가 되고, 목록과 아무 관계 없는 자리에 뜬다.

**버린 안: 부모에 `position: relative` 를 준다.** 부모가 `#home-recent-section` 처럼
머리글까지 포함한 섹션 통째인 경우가 있어 화살표가 섹션 세로 가운데로 간다. 게다가
남의 레이아웃 규칙을 고치는 것이라 회귀 범위가 넓다. 전용 래퍼는 목록 상자와
크기가 정확히 같고, 기존 것에 손대지 않는다.

덤으로 얻은 것이 하나 더 있다 — `:hover` 범위다.
`.hs-wrap:hover .hs-arr.can { opacity: 1 }` (css/90-misc.css:324) 이라 **목록 어디에
마우스를 올려도** 화살표가 나온다. 화살표 자신에만 `:hover` 를 걸면 보이지 않는 버튼에
커서를 정확히 맞춰야 나타나는, 쓸 수 없는 물건이 된다.
구조 자체는 새 발명이 아니다 — 축제 캐러셀의 `.fscroll-wrap`(css/10-content.css:13,
`position: relative`)이 이미 같은 모양이다.

## 5. `(hover: none)` 에서는 DOM 자체를 안 만든다

두 겹으로 막았다.

- JS — `initHScroll()` 첫 줄에서 `matchMedia('(hover: none)').matches` 면 그냥 나온다(js/hscroll.js:103).
- CSS — `@media (hover: none) { .hs-arr { display: none; } }` (css/90-misc.css:330).

**CSS `display:none` 만으로 하지 않은 이유 둘.**

1. 화살표를 숨겨도 `.hs-wrap` 은 그대로 끼워진다. 화살표는 안 보이는데 **DOM 구조를
   바꾸는 래퍼만 남는다.** 이 앱은 모바일 웹앱이라 그쪽이 다수인데, 다수에게 얻는 것
   없이 조상 관계만 바꾸는 것은 순손해다.
2. 비용이 한 번이 아니다. 이 목록들은 계속 다시 그려지고 그때마다 관찰이 재부착을
   부른다(§3). 매 렌더마다 래퍼 1개 + 버튼 2개 + 인라인 SVG 2개를 만들어 곧바로
   숨기는 일을 반복하게 된다.

**그런데 CSS 도 남겼다. 둘은 중복이 아니다.**

- JS 가드는 `window.matchMedia && …` 다. `matchMedia` 가 없는 환경에서는 가드가
  통과해 DOM 이 만들어진다 — 그때는 CSS 가 받는다.
- `matchMedia` 판정은 `initHScroll()` 이 도는 순간에만 본다. 이미 붙인 뒤에 입력 방식이
  바뀌어도 JS 는 만들어 둔 화살표를 걷어내지 않는다. CSS 는 그 순간 바로 숨긴다.

## 6. 나머지 수치를 그렇게 잡은 이유

| 값 | 자리 | 왜 |
|---|---|---|
| `HS_STEP = 0.8` | js/hscroll.js:38 | 보이는 폭의 80%. 100% 면 화면이 통째로 갈려 방금 보던 항목이 사라진다. 끝을 조금 남기면 맥락이 이어진다. 기존 `scrollChips` 의 130px 고정은 칩 폭에 맞춘 값이라 사진 카드 목록에는 못 쓴다 |
| 2px 여유 | js/hscroll.js:52-55 | `scrollWidth - clientWidth` 에 소수점이 남는다. 0 과 정확히 비교하면 끝에서 화살표가 깜빡인다 |
| 380ms 재확인 | js/hscroll.js:62 | `behavior:'smooth'` 가 끝난 뒤 상태를 한 번 더 찍는다. `scroll` 이벤트로도 갱신되지만 마지막 프레임이 늦게 오는 경우가 있다. `_hsSync` 는 멱등이라 겹쳐도 무해하다 |
| `stopPropagation()` | js/hscroll.js:88-89 | 클릭이 조상으로 올라가는 것을 막는다 — 지금 걸리는 것은 검색 결과를 닫는 문서 전역 리스너(js/boot.js:116) 하나다. 칩·카드 핸들러에는 애초에 닿지 않는다: 버튼은 목록의 **형제**로 `.hs-wrap` 에 붙는다(js/hscroll.js:91-92) |

버튼은 `<button type="button">` 으로 만들었다. `div` 로 만들면 키보드 도달을 남에게
맡기게 된다. `.hs-arr.can:focus-visible`(css/90-misc.css:325)을 `:hover` 와 함께 걸어
Tab 으로 와도 보인다 — 사용자 지시는 "마우스를 가져다대면"이었지만 그 조건만 쓰면
키보드로는 영영 못 쓴다.

## 7. 되짚은 것·안 한 것

**`.fscroll-wrap` 가드는 지금 한 번도 걸리지 않는다.**
`initHScroll` 안에 `if (row.closest('.fscroll-wrap')) return;`(js/hscroll.js:107)을 뒀는데,
`.fscroll-wrap` 은 index.html:450 한 곳뿐이고 그 안의 가로 목록은 `.festival-scroll`
하나다. 그런데 `.festival-scroll` 은 애초에 `HS_SELECTORS` 에 없다. 즉 **기존 3곳을
거르는 실제 장치는 이 가드가 아니라 '선택자 목록에 안 넣은 것'이다.** 파일 주석이
가드 쪽을 가리키고 있어 읽는 사람이 오해하기 쉬워 여기 적어 둔다. 코드는 남겼다 —
나중에 `.theme-chips` 같은 것을 캐러셀 안에 넣는 날 두 벌이 겹치는 것을 막는다.

**기존 3곳을 이쪽으로 통합하지 않았다.** 하려면 index.html 의 버튼 6개와
js/boot.js·js/home.js 의 함수 6개를 걷어내고 CSS 도 합쳐야 한다. 특히 지도 칩은
드래그 스크롤·`dragging` 클래스·클릭 억제 가드가 얽혀 있어(js/boot.js:73-107) 별건이다.
요청은 "안 되는 8곳을 되게 해 달라"였고, 되고 있는 3곳을 건드리면 회귀만 산다.
**미룬 것이지 안 할 일은 아니다.**

**드래그 스크롤은 새 8곳에 넣지 않았다.** 기존 3곳 중 `#lc-filter-scroll`·`.map-chips`
둘에는 마우스로 끌어 미는 기능이 있다(js/boot.js:54-71, 73-107). 요청은 화살표였고,
드래그는 원치 않는 click 을 만들어 내는 부작용이 있어 억제 가드까지 딸려 온다.
그 부작용 자체는 다음 날 별건으로 정리했다 →
`docs/log/2026-08-27-dev-flow-state-bugfix.md` 「8. 마우스 드래그 스크롤은 click 을 만든다」.

**`.hs-arr` 의 누름 축소는 애니메이션이 안 걸린다.**
`.hs-arr:active { transform: translateY(-50%) scale(0.92) }`(css/90-misc.css:327)인데
`.hs-arr` 의 `transition` 에는 `opacity`·`background` 만 있다. 눈에 띄는 정도는 아니라
두었다. 고칠 때는 css/90-misc.css:264 줄에 `.hs-arr` 을 더하면 된다.

## 8. 검증

커밋에 남긴 실측(Chromium 390×844)은 그대로 옮긴다.

```
홈 최근 본: 처음 [왼쪽 ✗ / 오른쪽 ✓] → 끝까지 밀면 [✓ / ✗]
평소 opacity 0 → hover 시 1
추천 탭 래퍼 7개, 대상 6종 전부 부착
축제 캐러셀 제외됨(중복 없음)
오른쪽 화살표 클릭 → scrollLeft 0 → 312
화살표 30×30, 예외 0건, check.sh 다섯 축 FAIL 0
?v= 2026082664 → 2026082665
```

되짚으며 이번에 다시 확인한 것 — `node --check js/hscroll.js` 통과, 파일 133줄,
§1 표의 11곳 전수, `.dl-chip-row` 렌더 자리 9곳, `.page` 의 `position: absolute`,
이 문서를 쓰기 전 `docs/log` 전체에 `hscroll`·`hs-arr`·`hs-wrap` 언급 0건.

**다시 측정하지 않은 것** — 위 실측 수치(래퍼 7개 · `scrollLeft` 312 · 30×30)는 커밋
당시 값이고 이 컨테이너에서 다시 띄우지 않았다. 탭 리셋이
`scrollLeft = 0`(js/tourism.js:752-755)으로 되돌릴 때 화살표가 따라오는 것도
`scroll` 이벤트 경로로만 논증했다.

## 9. 이 파일을 전제하는 뒷 작업 — 그리고 헷갈리기 쉬운 것

이 커밋 뒤의 코드가 `js/hscroll.js` 를 이름으로 불러 쓴다. 출처는 여기다.

- `js/boot.js:212-213` — 키보드 보강(`_kbEnhance`)의 재부착 주석:
  "*목록은 innerHTML 로 통째로 다시 그려진다. … `js/hscroll.js` 와 같은 방식·같은
  디바운스 폭을 쓴다 — 그쪽도 같은 이유로 관찰한다.*" §3 의 판단을 그대로 빌려 갔다.
  (다만 폭은 같지 않다 — hscroll 관찰은 120ms, `_kbEnhance` 는 150ms 다.)
- `css/50-datalab.css:447` — 인기 순위를 3등분 격자로 바꾸며
  "*js/hscroll.js 의 대상 목록에서도 함께 뺐다 — 더 이상 안 넘친다*".

**반대로, 이 두 곳은 이 파일과 무관하다.**

- `docs/log/2026-08-26-dev-tourism-layout-festival-move.md` §3 의 `updateFestArrows`
- `docs/log/2026-08-26-dev-audit-a11y-optimization.md` §4 의 `.chip-arrow`·`.fsc-arr` transition

둘 다 **이 작업 전부터 있던 3곳**(축제 캐러셀·지도 칩·지역화폐 필터) 이야기다.
근거: `d307ec4^` 의 index.html 에 `#chip-arrow-left/right`·`#fsc-arr-left/right`·
`#lc-arr-left/right` 가 이미 있고 js/home.js 에도 `updateFestArrows` 가 이미 있다.
앞 문서는 커밋 시각도 이 커밋보다 앞선다(`e7ab53a` 05:50 vs `d307ec4` 09:00).
감사 문서가 되살린 `.chip-arrow, .lc-arr, .fsc-arr` transition 목록에 `.hs-arr` 이 없는
것도 그래서다 — 빠뜨린 게 아니라 다른 물건이다. css/90-misc.css:259 의
"좌우 스크롤 화살표 3종" 도 옛 3종을 가리킨다. **이 커밋 뒤로 화살표는 4종이다.**
