/* ============================================================================
 * js/nav.js — 화면 전환과 사이드 메뉴
 *
 * 왜 따로 있나: 탭 전환 go() 는 모든 화면의 공통 진입점이라 어느 기능 파일에도 속하지 않는다. 여기서 퀴즈·메뉴를 닫는다.
 * 함께 볼 것:   go() 에 화면을 추가하면 index.html 의 .page div 와 하단 탭 버튼도 함께 봐야 한다.
 *
 * index.html 인라인 <script> 1804~1852줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 하단 내비 전용 진입점 (2026-08-25) ──
 * 하단 탭을 눌렀는데 '이미 그 탭'이면 = 새로고침처럼 첫 진입 화면으로 되돌린다.
 *
 * go() 에 직접 넣지 않은 이유: go() 는 menuGoTourism/goMapFocus/goLivingCat/_srClick/navToFav 등
 * 15곳에서 프로그램적으로도 불리고, 그 중 다수가 '이미 그 탭'인 상태에서 불린 뒤
 * 200~400ms 지연 콜백으로 원하는 상태를 세팅한다(js/mapnav.js:14,22,37,112,146,170).
 * go() 안에서 리셋하면 그 콜백들이 방금 지운 상태를 다시 세팅해 깜빡임이 생긴다.
 * 리셋 트리거는 '사람이 하단 버튼을 누른 순간' 하나뿐이어야 한다.
 *
 * .page.active 가 현재 화면의 유일한 진실 소스다(css/00-base.css:52-60, 조작은 아래 go() 뿐).
 * 별도 전역 변수를 두면 둘이 어긋날 수 있어 DOM 클래스를 그대로 읽는다.
 * 반드시 go() '전에' 읽어야 한다 — go() 는 매번 전부 remove 후 add 한다. */
function navTap(page) {
  var el        = document.getElementById('page-' + page);
  var wasActive = !!(el && el.classList.contains('active'));
  go(page);
  if (wasActive) resetPage(page);
}

/* 페이지별 리셋 디스패치. 리셋 함수는 각 기능 파일에 있다(홈=home.js, 관광=tourism.js,
 * 생활=living.js, 지도=map.js). 여기서는 어느 파일이 담당하는지만 알면 된다. */
function resetPage(page) {
  if      (page === 'home'    && typeof resetHomePage    === 'function') resetHomePage();
  else if (page === 'tourism' && typeof resetTourismPage === 'function') resetTourismPage();
  else if (page === 'living'  && typeof resetLivingPage  === 'function') resetLivingPage();
  else if (page === 'map'     && typeof resetMapPage     === 'function') resetMapPage();

  /* go() 의 scrollTop=0(아래 :21 근처)은 리셋 렌더 '전'에 실행된다.
   * 목록이 길어지는 방향이라 보통 유지되지만, 재렌더로 높이가 바뀌는 경우까지
   * 확실히 하려고 마지막에 한 번 더 확정한다. 4개 탭 공통 규칙. */
  var p = document.getElementById('page-' + page);
  if (p) p.scrollTop = 0;
}

/* ── 페이지 전환 ── */
function go(page) {
  closeQuiz();
  closeMenu();
  /* 맵 탭을 벗어날 때 NP 모드 버튼만 정리 (상태는 유지) */
  if (page !== 'map' && typeof exitNpModeOnly === 'function') exitNpModeOnly();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
  var newPage = document.getElementById('page-' + page);
  newPage.classList.add('active');
  newPage.scrollTop = 0; // 페이지 자체 스크롤 초기화 (body 스크롤 아님)
  document.querySelector('.nav-item[data-page="' + page + '"]')?.classList.add('active');
  if (page === 'map')     { requestAnimationFrame(() => requestAnimationFrame(initMap)); setTimeout(updateChipArrows, 120); }
  if (page === 'living')  renderLivingPage();
  /* BUG-7: 서브탭 상태 유지 — 'all'로 강제 리셋하지 않음 */
  if (page === 'tourism') {
    /* 축제 상세·캘린더를 연 채 탭을 벗어나면 인라인 display 가 남아
     * 재진입 시 목록 대신 그 화면이 그대로 보인다. 목록 뷰로 되돌린다. */
    var _fd = document.getElementById('view-festival-detail');
    var _cv = document.getElementById('view-calendar');
    var _vl = document.getElementById('view-tourism-list');
    if (_fd) _fd.style.display = 'none';
    if (_cv) _cv.style.display = 'none';
    if (_vl) _vl.style.display = 'block';
    var sub = _tourismSub || 'all';
    if (sub === 'stay' || sub === 'camp' || sub === 'temple') {
      /* 비리스트 서브탭은 switchTourismSub로 상태 복원 */
      var chip = document.querySelector('.tourism-subnav .chip.active');
      if (chip) switchTourismSub(chip, sub);
      else renderTourismList('all');
    } else {
      _resetThemeChips();
      renderTourismList(sub === 'festival' ? 'festival-only' : sub === 'spot' ? 'tourist-only' : 'all');
    }
    setTimeout(updateFestArrows, 60);
  }
}

/* ── 사이드 메뉴 ── */
function openMenu() {
  document.getElementById('menu-dim').classList.add('open');
  document.getElementById('menu-drawer').classList.add('open');
  if (typeof renderMenuFavs === 'function') renderMenuFavs();
}
function closeMenu() {
  document.getElementById('menu-dim').classList.remove('open');
  document.getElementById('menu-drawer').classList.remove('open');
}

