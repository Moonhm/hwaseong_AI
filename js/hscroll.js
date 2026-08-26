/* ============================================================================
 * js/hscroll.js — 가로 스크롤 영역에 좌우 화살표를 자동으로 붙인다
 *                 (2026-08-26, 개발 Claude)
 *
 * 왜 필요한가: 가로로 넘기는 목록이 11곳인데 화살표가 붙어 있는 건 3곳뿐이었다
 * (축제 캐러셀·지도 칩·지역화폐 필터). 나머지 8곳은 손가락으로 밀 수는 있어도
 * 마우스로는 넘길 방법이 없다 — 데스크톱에서 뒤쪽 항목에 아예 닿지 못했다.
 * 사용자 지적(2026-08-26): "폰이면 될 수도 있지만 컴퓨터는 이게 안 되잖아".
 *
 * 설계
 *  · 영역마다 따로 구현하지 않는다. 선택자 목록만 두고 공통으로 붙인다 —
 *    새 가로 목록을 만들면 HS_SELECTORS 에 한 줄 더하면 끝이다.
 *  · 화살표는 평소 숨어 있고 **마우스를 올려야** 보인다(사용자 지시).
 *  · 끝에 닿은 쪽 화살표는 사라진다. 눌러 봐야 아무 일도 안 나는 버튼을
 *    남겨 두면 고장으로 보인다.
 *  · 터치 기기에서는 아예 안 그린다(@media (hover:none)) — 손가락으로 밀면 되고,
 *    작은 화면에서 화살표가 내용을 가린다.
 *
 * ⚠ 이 목록들은 innerHTML 로 통째로 다시 그려진다(예: #dl-popular-body).
 *   그때 화살표도 같이 날아가므로 MutationObserver 로 다시 붙인다.
 *   렌더 함수마다 호출을 심는 방식은 새 렌더러가 생길 때마다 빠뜨린다.
 *
 * ⚠ 이미 자기 화살표를 가진 3곳(.festival-scroll · .map-chips · #lc-filter-scroll)은
 *   건드리지 않는다. 두 벌이 겹치면 서로 다른 위치에 두 개가 뜬다.
 * ========================================================================== */

var HS_SELECTORS = [
  '.recent-row',      /* 홈 · 최근 본 곳 */
  '.dl-photo-row',    /* 추천 · 인기 있는 곳(사진) */
  '.dl-rank-row',     /* 추천 · 요즘 뜨는 곳 */
  '.dl-tour-row',     /* 추천 · 시티투어 */
  '.dl-chip-row',     /* 추천 · 구·연령·탭 칩 */
  '.theme-chips',     /* 추천 · 테마별 */
  '.tourism-subnav',  /* 추천 · 서브탭 */
  '#rs-filter-scroll' /* 지도 · 음식점 업종 */
];

var HS_STEP = 0.8;   /* 한 번 누르면 보이는 폭의 80% 만큼 — 끝이 살짝 겹쳐 맥락이 남는다 */

function _hsSvg(dir) {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
         'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
         (dir < 0 ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>') +
         '</svg>';
}

/* 스크롤 위치를 보고 어느 화살표를 보일지 정한다. */
function _hsSync(row) {
  var wrap = row._hsWrap;
  if (!wrap) return;
  /* 소수점 오차로 끝에서 화살표가 깜빡이는 것을 막는다 */
  var max = row.scrollWidth - row.clientWidth;
  var can = max > 2;
  wrap._hsL.classList.toggle('can', can && row.scrollLeft > 2);
  wrap._hsR.classList.toggle('can', can && row.scrollLeft < max - 2);
}

function _hsScroll(row, dir) {
  row.scrollBy({ left: dir * row.clientWidth * HS_STEP, behavior: 'smooth' });
  /* smooth 가 끝난 뒤 상태를 확정한다. scroll 이벤트로도 갱신되지만
   * 마지막 프레임이 늦게 오는 브라우저가 있어 한 번 더 찍는다 — 멱등하다. */
  setTimeout(function () { _hsSync(row); }, 380);
}

function _hsAttach(row) {
  if (row._hsWrap) { _hsSync(row); return; }

  var parent = row.parentNode;
  if (!parent) return;
  /* 부모가 positioned 가 아니면 화살표(absolute)가 엉뚱한 조상을 기준으로 잡는다.
   * 부모를 바꾸면 기존 레이아웃이 흔들릴 수 있으므로 전용 래퍼를 끼운다. */
  var wrap = document.createElement('div');
  wrap.className = 'hs-wrap';
  parent.insertBefore(wrap, row);
  wrap.appendChild(row);

  var L = document.createElement('button');
  L.className = 'hs-arr hs-arr-l';
  L.type = 'button';
  L.setAttribute('aria-label', '이전');
  L.innerHTML = _hsSvg(-1);
  var R = document.createElement('button');
  R.className = 'hs-arr hs-arr-r';
  R.type = 'button';
  R.setAttribute('aria-label', '다음');
  R.innerHTML = _hsSvg(1);

  L.addEventListener('click', function (e) { e.stopPropagation(); _hsScroll(row, -1); });
  R.addEventListener('click', function (e) { e.stopPropagation(); _hsScroll(row, 1); });

  wrap.appendChild(L);
  wrap.appendChild(R);
  wrap._hsL = L; wrap._hsR = R;
  row._hsWrap = wrap;

  row.addEventListener('scroll', function () { _hsSync(row); }, { passive: true });
  _hsSync(row);
}

/* 화면에 있는 대상 전부에 붙인다. 이미 붙은 것은 상태만 갱신한다(멱등). */
function initHScroll() {
  /* 터치 전용 기기는 건너뛴다 — CSS 로도 숨기지만 DOM 을 아예 안 만드는 편이 낫다. */
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
  HS_SELECTORS.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (row) {
      /* 이미 자기 화살표를 가진 영역은 제외 — 파일 상단 주석 참고 */
      if (row.closest('.fscroll-wrap')) return;
      _hsAttach(row);
    });
  });
}

/* 목록이 innerHTML 로 다시 그려지면 화살표가 날아간다. 다시 붙인다.
 * 렌더마다 호출을 심으면 새 렌더러에서 빠뜨리므로 관찰로 처리한다. */
var _hsTimer = null;
function _hsObserve() {
  if (!window.MutationObserver) return;
  new MutationObserver(function () {
    clearTimeout(_hsTimer);
    _hsTimer = setTimeout(initHScroll, 120);
  }).observe(document.body, { childList: true, subtree: true });
}

/* 창 크기가 바뀌면 넘칠지 말지가 달라진다 */
window.addEventListener('resize', function () {
  clearTimeout(_hsTimer);
  _hsTimer = setTimeout(initHScroll, 150);
});

document.addEventListener('DOMContentLoaded', function () {
  initHScroll();
  _hsObserve();
});
