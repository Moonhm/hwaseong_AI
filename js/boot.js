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
document.addEventListener('click', function(e) {
  var bar = document.getElementById('home-search-bar');
  var res = document.getElementById('home-search-results');
  if (bar && res && !bar.contains(e.target) && !res.contains(e.target)) {
    closeHomeSearch();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  /* 홈 '내 위치 추천' CTA 원본 마크업 스냅샷 (index.html 의 #home-nearby-section).
   * 홈 탭 재클릭 리셋이 이 값으로 되돌린다. requestNearbyRec() 이 innerHTML 을
   * 덮어쓰기 전에 떠야 하므로 반드시 여기, 다른 어떤 렌더보다 먼저. */
  var _nb0 = document.getElementById('home-nearby-section');
  if (_nb0 && typeof _homeNearbyInitHtml !== 'undefined') _homeNearbyInitHtml = _nb0.innerHTML;

  /* 주차장 데이터 사전 로드 (76KB) — 홈·가까운관광지 즉시 표시용 */
  fetch('js/parking-static.json?v=20260825').then(function(r) { return r.json(); }).then(function(d) {
    if (typeof mergeParkingData === 'function' && !parkingData.length) mergeParkingData(d, []);
    var sp = document.getElementById('stat-parking');
    if (sp) sp.textContent = parkingData.length;
  }).catch(function() {});
  /* localcurrency-static.json(4.2MB)은 탭 클릭 시 지연 로드 */

  renderHomePage();
  renderFestivalScroll();
});
