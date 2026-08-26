# 선택 핀 강조를 모든 핀 종류로 확대

- 날짜: 2026-08-26
- 담당: 개발 Claude (hm8824@naver.com)
- 발단: 사용자 지시 — "지도에서 관광지는 내가 선택했을때 얘가 딱 중앙에 뜨고 약간 크게 떠서
  내가 이걸 선택하고있다는게 눈에 보이거든? 근데 다른 핀들은 안그래.
  이 효과 다른핀들 모두에게도 적용시켜줘"

---

## 1. 기존 효과가 무엇으로 이뤄져 있었나

관광지 핀의 '선택됨' 표시는 세 가지가 겹친 것이었습니다.

| 요소 | 어디 |
|------|------|
| 원이 1.45배 + 흰 테두리 + 파란 링 | `css/20-map.css` `.cm-pin.selected .cm-circle` |
| 맨 앞으로 (`setZIndex(200)`) | `js/map.js` `onPinClick` |
| 카드 위 가시영역 중앙으로 이동 | `js/map.js` `_panPinAboveSlide` |

## 2. 핀 종류별 실태

| 핀 | 마크업 | 중앙 이동 | 강조 |
|----|--------|:---:|:---:|
| 관광지·축제·문화재 (`map.js`) | `.cm-pin` | ✅ | ✅ |
| 편의시설·제부도 숙박 (`conv_map.js`) | `.cm-pin` | ❌ | ❌ |
| 공영주차장 (`parking.js`) | `.pk-pin` | ✅ | ❌ |
| 지역화폐 가맹점 (`localcurrency.js`) | 네이티브 `Marker` | ✅ | ❌ |

**대상이 아닌 것** — 클러스터 원(`map.js:190`, `parking.js:159`, `localcurrency.js:192`)은
누르면 확대되는 집계 표시라 '선택' 개념이 없습니다. NP 모드 강조핀(`map.js:571,584`)은
그 자체가 이미 강조입니다. `_showJebuMarker` 는 호출처가 없는 죽은 코드입니다(확인함).

## 3. 핀 시스템이 4개라서 생기는 문제

각 시스템이 자기 강조만 지우면, **주차장을 고른 뒤 관광지를 고를 때 주차장 강조가 남아**
두 개가 동시에 선택된 화면이 됩니다. 종류별로 해제 코드를 서로 알게 만들면
4×4 로 얽혀 하나 추가할 때마다 전부 고쳐야 합니다.

그래서 `js/map.js` 에 **선택 등록소**를 하나 뒀습니다. 선택하는 쪽이
'나를 어떻게 지우는가'를 함께 맡기고, 다음 선택은 그것부터 실행합니다.

```js
var _pinSelClear = null;
function clearSelectedPin() {
  if (!_pinSelClear) return;
  var f = _pinSelClear;
  _pinSelClear = null;   /* 먼저 비운다 — f() 안에서 또 불려도 무한 재귀가 안 되게 */
  try { f(); } catch (e) {}
}
function registerSelectedPin(fn) { _pinSelClear = (typeof fn === 'function') ? fn : null; }
```

`map.js` 에 둔 이유는 스크립트 로드 순서상 네 파일 중 가장 앞이기 때문입니다
(`index.html`: map → conv_map → parking → localcurrency).

## 4. 종류별로 한 일

### 편의시설·제부도 (`conv_map.js`)
마크업이 관광지와 같은 `.cm-pin` 이라 **CSS 는 이미 있었습니다.** 클래스만 붙이면 됩니다.
중앙 이동은 아예 없어서 `_panPinAboveSlide` 도 함께 넣었습니다 —
핀이 화면 아래쪽에 있으면 슬라이드 카드에 가려 안 보였습니다.

핀 DOM 은 클릭 핸들러의 클로저가 아니라 `CONV_OVMAP[id].getContent()` 로 되찾습니다.
**핀 클릭 말고도 지도 검색·NP 모드가 `_showConvSlide` 로 바로 들어오기 때문**입니다.

### 공영주차장 (`parking.js`)
`.pk-pin.selected .pk-circle` 규칙을 `.cm-pin.selected` 와 같은 값으로 추가했습니다.

**여기가 제일 까다로웠습니다.** 주차장 핀은 idle 마다 통째로 다시 그려지는데,
선택 직후 `_panPinAboveSlide` 의 `panBy` 가 곧바로 idle 을 쏩니다.
선택 상태를 DOM 에만 두면 **강조가 뜨자마자 사라집니다.**
그래서 `pkSelectedId` 를 두고 `pinHtml()` 이 생성 시점에 다시 붙입니다
(관광지 핀의 `p.id === selectedId` 와 같은 방식). 오버레이 `zIndex` 도 같이 복원합니다.

### 지역화폐 (`localcurrency.js`)
이것만 **네이티브 `kakao.maps.Marker`** 입니다. 한 화면에 최대 300개(`LC_MAX_PINS`)라
CustomOverlay 로 만들면 무겁기 때문입니다. DOM 이 없어 클래스를 못 붙입니다.

그래서 같은 신호를 **링 오버레이**(`.lc-sel-ring`)로 냅니다. 테두리 색·두께·그림자를
`.cm-pin.selected` 와 맞춰 다른 핀과 같은 인상을 줍니다.
링은 좌표에 붙어 있어 핀이 idle 마다 새로 만들어져도 남습니다.

> ⚠ **`clearLcDisplay()` 에서 링을 지우면 안 됩니다.** 이 함수는 `updateLcDisplay()`
> 첫 줄에서 idle 마다 불립니다. 처음에 거기 넣었다가, 선택 직후의 `panBy` 가 일으키는
> idle 에 링이 즉시 지워지는 걸 발견했습니다. 정리는 레이어를 끌 때(`setLcVisible(false)`)만 합니다.

## 5. 진입 경로가 여러 갈래인 문제

핀을 눌러야만 카드가 열리는 게 아닙니다.

| 함수 | 핀 클릭 외 진입 경로 |
|------|---------------------|
| `showPlaceSlide` | `onPinClick` 한 곳뿐 — `goMapFocus`(목록)도 `onPinClick` 을 거친다 ✅ |
| `showParkingSlide` | `goMapPark`(홈 '최근 본 주차장') · NP 모드가 **직접** 부른다 |
| `_showConvSlide` | 지도 검색 · NP 모드가 **직접** 부른다 |
| `showLcSlide` | 즐겨찾기 · 홈 검색 · 지도 검색이 **직접** 부른다 |

그래서 주차장·편의시설은 클릭 핸들러가 아니라 **슬라이드 함수 쪽에** 강조를 걸었습니다.
그래야 어느 경로로 들어와도 핀이 강조됩니다.
(`showPlaceSlide` 가 `pushRecent` 를 거기 걸어 둔 것과 같은 이유입니다.)

## 6. 검증

카카오 SDK 가 이 컨테이너에서 로드되지 않아(`typeof kakao === 'undefined'`)
**실제 지도 위 클릭은 검증하지 못했습니다.** 대신 실제 함수를 그대로 호출해
가짜 핀 DOM·오버레이로 로직을 확인했습니다. 화면상의 최종 모습은 기기에서 봐야 합니다.

**A. 등록소 자체** — 해제 순서 `A→B→C` 일치, 두 번 불러도 한 번만, 재진입해도 무한루프 없음 ✅

**B. 교차 해제** — 실제 `onPinClick` / `_pkSelect` / `_convSelectPin` 호출

| 단계 | 관광지 | 주차장 | 편의시설 |
|------|:---:|:---:|:---:|
| 1) 관광지 선택 | ✅ | | |
| 2) 주차장 선택 | | ✅ | |
| 3) 편의시설 선택 | | | ✅ |
| 4) 다시 관광지 | ✅ | | |
| 5) 카드 닫기 | | | |

`항상 하나만 선택됨: true` · `닫으면 전부 해제: true` · 편의시설 zIndex 1 로 복원 ✅

**C. CSS 적용** — 관광지·편의시설 `.cm-pin.selected` 와 주차장 `.pk-pin.selected` 가
둘 다 `matrix(1.45,…)` + 흰 3px + 파랑 링으로 **동일**. `.lc-sel-ring` 30px / 3px solid / 50% ✅

**D. 재생성 내성** — `pinHtml()` 이 `pkSelectedId` 를 보고 다시 붙이는지

```
선택 전  class="pk-pin"
선택 후  class="pk-pin selected"     ← 재렌더 뒤에도 유지
다른 핀  selected 안 붙음
해제 후  class="pk-pin"
```

- `tools/check.sh` 다섯 축 FAIL 0, 예외 0건
- `?v=` 2026082615 → 2026082616

## 7. 알아 둘 것

`.cm-pin.selected .cm-tail { border-top-color: var(--primary) }` 규칙은
**원래부터 동작하지 않습니다.** `_mkCmPin` 이 `tail.style.borderTopColor` 를
인라인으로 넣어서 인라인이 이깁니다. 관광지 핀도 마찬가지였고,
사용자가 지금 모습에 만족하고 계셔서 일부러 건드리지 않았습니다.
꼬리 색까지 바꾸려면 `!important` 가 필요합니다.
