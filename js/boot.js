/* ============================================================================
 * js/boot.js — 초기화 — 전역 리스너·칩 스크롤·DOMContentLoaded
 *
 * 왜 따로 있나: **즉시 실행되는 코드는 전부 여기 모았다.** 나머지 파일은 선언만 하므로 로드 순서에 영향받지 않는다. 이 파일은 반드시 마지막에 로드해야 한다.
 * 함께 볼 것:   순서를 바꾸면 안 된다. index.html 의 <script src> 나열에서 boot.js 가 마지막인지 확인할 것.
 *
 * index.html 인라인 <script> 3780~3887줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 홈탭 생활 아이콘 → 생활 탭 + 특정 카테고리 (BUG-12) ── */
function goLivingCat(cat) {
  go('living');
  var el = document.getElementById('liv-cat-' + cat);
  if (el) switchLivingCat(el, cat);
}

/* ── Escape 키로 슬라이드 닫기 ── */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.getElementById('place-slide').classList.contains('open')) closePlaceSlide();
});

/* ── 지도 필터 칩 — 화살표 + 마우스 드래그 스크롤 ── */
function updateChipArrows() {
  var el = document.getElementById('map-chips');
  var lBtn = document.getElementById('chip-arrow-left');
  var rBtn = document.getElementById('chip-arrow-right');
  if (!el || !lBtn || !rBtn) return;
  var atStart = el.scrollLeft <= 2;
  var atEnd   = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
  lBtn.classList.toggle('visible', !atStart);
  rBtn.classList.toggle('visible', !atEnd);
}

function scrollChips(dir) {
  var el = document.getElementById('map-chips');
  el.scrollBy({ left: dir * 130, behavior: 'smooth' });
  setTimeout(updateChipArrows, 250);
}

function updateLcArrows() {
  var el   = document.getElementById('lc-filter-scroll');
  var lBtn = document.getElementById('lc-arr-left');
  var rBtn = document.getElementById('lc-arr-right');
  if (!el || !lBtn || !rBtn) return;
  lBtn.classList.toggle('visible', el.scrollLeft > 2);
  rBtn.classList.toggle('visible', el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
}
function scrollLcFilter(dir) {
  var el = document.getElementById('lc-filter-scroll');
  if (el) el.scrollBy({ left: dir * 130, behavior: 'smooth' });
  setTimeout(updateLcArrows, 250);
}
(function () {
  var el = document.getElementById('lc-filter-scroll');
  if (!el) return;
  el.addEventListener('scroll', updateLcArrows, { passive: true });
  var down = false, startX = 0, scrollLeft = 0;
  el.addEventListener('mousedown', function (e) {
    down = true; el.classList.add('dragging');
    startX = e.pageX - el.getBoundingClientRect().left;
    scrollLeft = el.scrollLeft;
  });
  document.addEventListener('mouseup', function () {
    if (!down) return; down = false; el.classList.remove('dragging'); updateLcArrows();
  });
  el.addEventListener('mousemove', function (e) {
    if (!down) return; e.preventDefault();
    el.scrollLeft = scrollLeft - (e.pageX - el.getBoundingClientRect().left - startX);
  });
})();

(function () {
  var el = document.getElementById('map-chips');
  var down = false, startX = 0, scrollLeft = 0;
  el.addEventListener('scroll', updateChipArrows, { passive: true });
  el.addEventListener('mousedown', function (e) {
    down = true; el.classList.add('dragging');
    startX = e.pageX - el.getBoundingClientRect().left;
    scrollLeft = el.scrollLeft;
  });
  document.addEventListener('mouseup', function () {
    if (!down) return;
    down = false; el.classList.remove('dragging');
    updateChipArrows();
  });
  document.addEventListener('mouseleave', function () { down = false; el.classList.remove('dragging'); });
  el.addEventListener('mousemove', function (e) {
    if (!down) return;
    e.preventDefault();
    var x    = e.pageX - el.getBoundingClientRect().left;
    var dist = (x - startX) * 1.4;
    el.scrollLeft = scrollLeft - dist;
  });
})();

/* ── 초기 렌더 ── */
/* 검색창 외부 클릭 시 결과 닫기 */
/* ⚠ 검색창은 홈과 지도 둘이다. 예전에는 홈 것만 보고 닫아서, 지도 검색 결과가
 * 뜬 상태로 '지도 검색창' 을 다시 누르면(오타 고치려고) 결과가 즉시 사라졌다 —
 * 자기 자신을 눌렀는데 닫히는 셈이었다. 활성 창(_srWhere)의 DOM 을 본다.
 * _SR_DOM/_srWhere 는 js/home.js 의 top-level var 이고 index.html 에서 home.js 가
 * boot.js 보다 먼저 로드되므로 여기서 참조해도 안전하다. (2026-08-26 감사) */
document.addEventListener('click', function(e) {
  var where = (typeof _srWhere !== 'undefined' && _srWhere) ? _srWhere : 'home';
  var ids   = (typeof _SR_DOM !== 'undefined' && _SR_DOM[where])
    ? _SR_DOM[where] : { bar: 'home-search-bar', results: 'home-search-results' };
  var bar = document.getElementById(ids.bar);
  var res = document.getElementById(ids.results);
  if (bar && res && !bar.contains(e.target) && !res.contains(e.target)) {
    closeHomeSearch(where);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  /* '내 위치 추천' CTA 원본 마크업 스냅샷 (index.html 의 #nearby-section).
   * 2026-08-26 홈 → 추천 탭으로 옮겼고, 복원은 resetTourismPage() 가 한다.
   * requestNearbyRec() 이 innerHTML 을 덮어쓰기 전에 떠야 하므로
   * 반드시 여기, 다른 어떤 렌더보다 먼저. */
  var _nb0 = document.getElementById('nearby-section');
  if (_nb0 && typeof _homeNearbyInitHtml !== 'undefined') _homeNearbyInitHtml = _nb0.innerHTML;

  /* 주차장 데이터 사전 로드 (76KB) — 홈·가까운관광지 즉시 표시용 */
  fetch('js/parking-static.json?v=20260825').then(function(r) { return r.json(); }).then(function(d) {
    if (typeof mergeParkingData === 'function' && !parkingData.length) mergeParkingData(d, []);
    /* 소식 탭 통계 4칸(#stat-parking)은 2026-08-26 에 없앴다 — 갱신할 대상이 없다.
     * 건수는 카테고리를 고르면 목록 머리(#living-list-count)가 보여 준다. */
  }).catch(function() {});
  /* localcurrency-static.json(4.2MB)은 탭 클릭 시 지연 로드 */

  renderHomePage();
  renderFestivalScroll();
});
