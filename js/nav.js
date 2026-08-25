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


/* ── 화면 전환 애니메이션 (2026-08-25) ─────────────────────────────────────
 * .page 는 position:absolute 로 겹쳐 있으므로, 나가는 장에 .pg-leaving 을 붙여
 * display:block 을 유지시키고 들어오는 장을 그 위에 얹으면 두 장이 함께 움직인다.
 * 방향은 하단 내비 순서(PAGE_ORDER)로 정한다 — 오른쪽 탭으로 가면 오른쪽에서 들어온다.
 *
 * 정리는 animationend 로 하되 setTimeout 백업을 둔다. 애니메이션이 어떤 이유로든
 * 발생하지 않으면(브라우저 설정·확장·오래된 엔진) animationend 가 영영 안 오고,
 * 그러면 나가던 장이 display:block 인 채 화면에 얼어붙는다. */
/* 반드시 하단 내비의 '보이는' 순서와 같아야 한다 — 전환 방향을 이 배열로 정한다.
 * 2026-08-26 추천을 가운데(3번째 칸)로 옮기면서 tourism 과 living 의 순서가 뒤집혔다.
 * 내비 버튼을 옮기면 이 배열도 같이 고칠 것. 안 고치면 방향이 반대로 나온다. */
var PAGE_ORDER = ['home', 'living', 'tourism', 'map'];
var _pgTimer = null;

function _pgCleanup() {
  clearTimeout(_pgTimer); _pgTimer = null;
  document.querySelectorAll('.page').forEach(function (p) {
    p.classList.remove('pg-leaving', 'pg-in-r', 'pg-in-l', 'pg-out-l', 'pg-out-r');
  });
}

function _playPageTransition(oldPage, newPage, name) {
  /* 같은 장이거나 첫 진입이면 애니메이션할 것이 없다. */
  if (!oldPage || !newPage || oldPage === newPage) { _pgCleanup(); return; }

  /* 연타 대비 — 이전 전환이 끝나지 않았으면 흔적부터 지운다.
   * 안 지우면 이전 .pg-leaving 이 남아 화면에 두 장이 겹친 채로 굳는다. */
  _pgCleanup();

  var from = PAGE_ORDER.indexOf((oldPage.id || '').replace('page-', ''));
  var to   = PAGE_ORDER.indexOf(name);
  if (from < 0 || to < 0) return;               /* 목록 밖 화면이면 조용히 건너뛴다 */
  var goingRight = to > from;

  oldPage.classList.add('pg-leaving', goingRight ? 'pg-out-l' : 'pg-out-r');
  newPage.classList.add(goingRight ? 'pg-in-r' : 'pg-in-l');

  var done = function () {
    newPage.removeEventListener('animationend', done);
    _pgCleanup();
    /* transform 은 레이아웃 크기를 바꾸지 않으므로 애니메이션 중에도 지도 컨테이너
     * 크기는 정확하다. 그래도 전환이 끝난 뒤 한 번 더 확정한다 — initMap 은
     * mapReady 가드(js/map.js:51-56) 덕에 재호출해도 relayout 만 한다. */
    if (name === 'map' && typeof initMap === 'function') initMap();
  };
  newPage.addEventListener('animationend', done);
  _pgTimer = setTimeout(done, 600);             /* 0.26s 애니 + 여유. animationend 가 안 올 때의 백업 */
}

/* ── 페이지 전환 ── */
function go(page) {
  closeQuiz();
  closeMenu();
  /* 맵 탭을 벗어날 때 NP 모드 버튼만 정리 (상태는 유지) */
  if (page !== 'map' && typeof exitNpModeOnly === 'function') exitNpModeOnly();
  var newPage = document.getElementById('page-' + page);
  var oldPage = document.querySelector('.page.active');
  _playPageTransition(oldPage, newPage, page);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
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

