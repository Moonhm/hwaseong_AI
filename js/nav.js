/* ============================================================================
 * js/nav.js — 화면 전환과 사이드 메뉴
 *
 * 왜 따로 있나: 탭 전환 go() 는 모든 화면의 공통 진입점이라 어느 기능 파일에도 속하지 않는다. 여기서 퀴즈·메뉴를 닫는다.
 * 함께 볼 것:   go() 에 화면을 추가하면 index.html 의 .page div 와 하단 탭 버튼도 함께 봐야 한다.
 *
 * index.html 인라인 <script> 1804~1852줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

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

