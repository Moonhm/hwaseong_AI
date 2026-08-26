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

    /* ⚠ 즐겨찾기를 다시 그린다 (2026-08-26).
     * 이 fetch 는 비동기인데 바로 아래 renderHomePage() 는 동기로 먼저 돈다.
     * 그래서 renderFavSection() 이 parkingData 가 비어 있을 때 실행되고,
     * 주차장 남은 대수 배지(_favParkBadge)가 parkingData.find 에서 빈손으로
     * 돌아와 배지가 통째로 빠진 채 굳었다. 로드가 끝나도 다시 그리지 않으니
     * 홈에서는 배지가 영영 안 보였다.
     *   메뉴 쪽(renderMenuFavs)은 사용자가 메뉴를 여는 시점이면 이 fetch 가
     *   이미 끝나 있어 배지가 보였다 — 같은 코드인데 화면마다 달라 보인 이유다.
     * getFavs() 는 localStorage 만 읽어 비용이 없고, 즐겨찾기가 없으면
     * renderFavSection 이 스스로 숨으므로 헛일도 아니다. */
    if (typeof renderFavSection === 'function') renderFavSection();
  }).catch(function() {});
  /* localcurrency-static.json(4.2MB)은 탭 클릭 시 지연 로드 */

  renderHomePage();
  renderFestivalScroll();
});

/* ══════════════════════════════════════════════════════════════════════════
   키보드 조작 지원 (2026-08-26 감사 HIGH)

   문제: onclick 을 단 <div> 가 48곳(정적 마크업 기준, JS 가 그리는 것까지 하면
   더 많다)인데 tabindex 는 2개뿐이었다. <div> 는 기본 포커스 대상이 아니라
   칩·메뉴 항목·카테고리 아이콘·목록 행이 **키보드로는 아예 닿지 않았다.**
   마우스를 못 쓰는 사용자에게는 앱의 절반이 없는 것과 같다.

   왜 마크업 48곳을 고치지 않았나:
    · JS 가 innerHTML 로 그리는 항목이 더 많아서, 정적 마크업만 고쳐도 절반은 남는다.
    · 새 목록을 만들 때마다 tabindex 를 잊으면 그 자리만 조용히 닿지 않게 된다.
    · 여기 한 곳에 두면 '앞으로 생길 것' 까지 자동으로 걸린다.

   ⚠ <button>·<a>·<input> 은 건드리지 않는다. 이미 포커스 대상이고
     role="button" 을 덧씌우면 스크린리더가 링크를 버튼으로 잘못 읽는다.
   ⚠ Space 는 기본 동작이 '스크롤' 이라 preventDefault 가 필요하다.
     Enter 는 막지 않는다 — 폼 안에서 다른 뜻을 가질 수 있다.
   ========================================================================== */
var _KB_NATIVE = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1 };

function _kbEnhance() {
  /* :not([tabindex]) 로 이미 처리한 것을 건너뛴다 — 멱등하고 비용이 거의 없다. */
  document.querySelectorAll('[onclick]:not([tabindex])').forEach(function (el) {
    if (_KB_NATIVE[el.tagName]) return;
    /* ⚠ 배경 오버레이(.dim / #*-dim)는 제외한다. '바깥을 눌러 닫는' 자리라
     * 버튼이 아니고, 포커스 대상으로 만들면 탭 순서에 빈 정거장이 생긴다.
     * 닫기는 이미 각 패널의 ✕ 버튼과 Esc 로 되므로 기능 손실이 없다. */
    if (el.classList.contains('dim') || /(^|-)dim$/.test(el.id || '')) return;
    el.setAttribute('tabindex', '0');
    /* role 이 이미 있으면(예: 앞으로 role="tab" 을 쓸 수도 있다) 존중한다. */
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  var el = e.target;
  if (!el || !el.getAttribute || !el.hasAttribute('onclick')) return;
  if (_KB_NATIVE[el.tagName]) return;      /* 네이티브가 알아서 한다 */
  if (e.key !== 'Enter') e.preventDefault();  /* Space 의 스크롤을 막는다 */
  el.click();
});

document.addEventListener('DOMContentLoaded', function () {
  _kbEnhance();
  /* 목록은 innerHTML 로 통째로 다시 그려진다. 그때 새로 생긴 항목에도 붙여야 한다.
   * js/hscroll.js 와 같은 방식·같은 디바운스 폭을 쓴다 — 그쪽도 같은 이유로 관찰한다. */
  if (!window.MutationObserver) return;
  var t = null;
  new MutationObserver(function () {
    clearTimeout(t);
    t = setTimeout(_kbEnhance, 150);
  }).observe(document.body, { childList: true, subtree: true });
});

