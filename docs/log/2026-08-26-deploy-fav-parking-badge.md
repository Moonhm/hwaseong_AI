# 즐겨찾기 주차장 배지 — 홈에서만 안 보이던 이유는 코드가 아니라 로드 순서였다

- 날짜: 2026-08-26
- 담당: 배포 Claude
- 발단: 사용자 지시 — *"이거 홈탭에 있는 즐겨찾기에도 똑같이 적용시켜줄수있어?
  그리고 메뉴에있는건 그냥 빼"*, 덧붙여 *"이거 잘 적어놔 개발 클로드도 보고
  깨달아야하니까"*
- 선행 커밋: `a2e84e9`(개발 Claude, 배지 신설)

---

## 1. 결론부터 — 개발 Claude 는 잘못 이해하지 않았다

사용자는 "홈탭에도 적용해 달라" 고 했고 나도 처음엔 홈에 코드가 빠진 줄 알았다.
**둘 다 틀렸다.** `a2e84e9` 는 처음부터 양쪽 모두에 넣었다.

```
js/favorites.js:195   renderFavSection()  (홈)   → _favParkBadge(f)
js/favorites.js:219   renderMenuFavs()    (메뉴) → _favParkBadge(f)
```

색 단계도 정상이었다. 경계값으로 전수 확인했다 —

| 상태 | 결과 | 기대 |
|---|---|---|
| 여유 70% · 경계 50% | `#15803D` | ✓ |
| 보통 30% · 경계 20% | `#B45309` | ✓ |
| 혼잡 19% · 만차 | `#DC2626` | ✓ |
| 미운영 | `#6B7280` | ✓ |

> 여담이지만 나는 이 검증에서 처음에 15% 를 '보통' 이라고 잘못 잡아
> "주황이 안 나온다" 고 판단할 뻔했다. 임계는 `0.5 / 0.2` 라 15% 는 빨강이 맞다.
> **테스트 케이스를 잘못 고르면 멀쩡한 코드를 결함으로 만든다.**

## 2. 진짜 원인 — 비동기 로드와 동기 렌더의 순서

`js/boot.js` 안에서 이 두 줄의 순서가 전부였다.

```js
fetch('js/parking-static.json?v=…')   // 비동기 — 나중에 끝난다
  .then(…mergeParkingData(d, [])…)

renderHomePage();                     // 동기 — 지금 당장 돈다
```

`renderHomePage()` → `renderFavSection()` → `_favParkBadge(f)` 인데,
그 시점 `parkingData` 는 아직 빈 배열이다. 그래서

```js
var p = parkingData.find(function (x) { return x.id === f.placeId; });
if (!p) return '';        // ← 여기서 조용히 빈 문자열
```

배지가 **통째로 빠진 채 굳는다.** 로드가 끝나도 즐겨찾기를 다시 그리지 않으니
홈에서는 영영 안 보인다.

### 메뉴에서는 왜 보였나

`renderMenuFavs()` 는 `openMenu()` 가 부른다. 사용자가 햄버거를 누르는 시점이면
76KB fetch 는 이미 끝나 있다. **같은 코드인데 화면마다 달라 보인 이유가 이것이다.**

그래서 겉보기 증상이 "홈에는 없고 메뉴에는 있다" 가 됐고, 자연스럽게
"홈에 코드를 안 넣었나 보다" 로 오해하게 된다.

## 3. 고친 것

### ① 로드 완료 후 즐겨찾기를 다시 그린다 (js/boot.js)

```js
if (typeof mergeParkingData === 'function' && !parkingData.length) mergeParkingData(d, []);
+ if (typeof renderFavSection === 'function') renderFavSection();
```

`getFavs()` 는 localStorage 만 읽어 비용이 없고, 즐겨찾기가 없으면
`renderFavSection` 이 스스로 `display:none` 으로 숨으므로 헛일도 아니다.

### ② 메뉴에서는 배지를 뺀다 (사용자 지시)

메뉴는 '어디로 갈지 고르는 곳' 이라 실시간 수치가 들어가면 초점이 흐려진다.
`_favParkBadge` 함수 자체는 홈이 계속 쓰므로 그대로 둔다.

## 4. 검증 2회

- **[1] 배치 확인** — `renderFavSection` 배지 있음 / `renderMenuFavs` 배지 없음.
  `boot.js` 에 재렌더 훅이 걸린 것도 줄번호로 확인.
- **[2] 실행 순서 재현** — `parkingData` 가 빈 상태에서 `_favParkBadge` 를 부르면
  `""`(고치기 전 홈의 상태), 채운 뒤 부르면 `70대 #15803D`. 색 3단계와
  만차·미운영까지 경계값 7종 전수 통과.

## 5. 개발 Claude 에게 — 같은 함정이 더 있다

이 건의 교훈은 **"비동기로 채워지는 전역을 동기 렌더가 읽으면, 코드가 맞아도
화면에는 안 나온다"** 이다. `boot.js` 에서 같은 모양을 찾아보면 —

- `lcData`(지역화폐 4.2MB)는 아예 지연 로드라 `renderHomeLiving` 이 자기 안에서
  `_loadLcData(콜백)` 을 쓴다 — **이쪽이 올바른 형태다.**
- `parkingData` 만 boot 에서 미리 받아 두고 콜백에서 아무것도 다시 그리지 않았다.
  이번에 `renderFavSection` 하나를 붙였는데, 앞으로 `parkingData` 를 읽는 렌더러를
  새로 만들면 **그것도 이 콜백에 등록해야 한다.**

지금 `parkingData` 를 읽는 렌더 경로(확인한 것):
`renderFavSection`(홈 즐겨찾기) · `renderNearbyResult`(추천 탭 내 위치) ·
`renderLivingCatList('parking')`(소식 탭) · `navToFav`(즐겨찾기 이동).
뒤 셋은 사용자 조작 뒤에 도는 경로라 타이밍 문제가 없다. 첫 진입에 자동으로
그려지는 것은 `renderFavSection` 뿐이라 지금은 이 하나로 충분하다.

**증상이 "화면마다 다르게 보인다" 면 코드 차이보다 먼저 로드 순서를 의심할 것.**
