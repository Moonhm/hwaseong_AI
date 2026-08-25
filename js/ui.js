/* ============================================================================
 * js/ui.js — 공용 UI — 토스트·공유·주소 복사·지역화폐 지연 로드
 *
 * 왜 따로 있나: 특정 화면에 속하지 않고 어디서나 불리는 것들. _loadLcData() 는 4.2MB 를 사용 시점에만 받는 공용 게이트라 여기 둔다.
 * 함께 볼 것:   _loadLcData() 를 부르지 않고 lcData 를 읽으면 0 건이 나온다 — home.js·living.js 가 그 자리다.
 *
 * index.html 인라인 <script> 3527~3612줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 토스트 ── */
let _tt;
/* ── 장소 사진 경로 ──────────────────────────────────────────────────────────
 * 인덱스(js/photos.js, tools/build_photo_index.py 산출물)를 먼저 보고,
 * 없으면 기존 {name}.jpg 규칙으로 떨어진다.
 *
 * 왜 인덱스인가: name 을 한 글자만 고쳐도 사진이 조용히 404 가 되기 때문이다.
 *   tourist 159건 중 50건이 공백·괄호·쉼표를 갖고 있고, 실제로 커밋 c941986 에서
 *   이름을 바꾸며 사진도 손으로 같이 고쳐야 했다.
 * 신규 파일명 규칙은 {읍면동}_{id}_{메모}.jpg 이며 매칭은 id 토큰만 쓴다.
 *   지역명을 틀리게 적어도 사진은 정상적으로 뜬다.
 *
 * ⚠ 하위 객체까지 가드하는 이유: 인덱스 생성이 실패한 photos.js 가 배포되면
 *   idx.byId 가 undefined 라 TypeError 가 나고, 그 예외가 placePhotoHtml 을 뚫고
 *   나가 슬라이드 카드가 통째로 백지가 된다. 조용한 404 보다 나쁜 실패다.
 * 인자는 place 객체 또는 이름 문자열 둘 다 받는다. */
/* 한 장소에 사진이 여러 장 올 수 있다(예: 제부도_입구 / 제부도_노을 / 제부도_항공샷).
 * 인덱스 값은 항상 배열이며 첫 장이 대표다.
 * 값이 문자열인 옛 인덱스가 배포돼 있어도 깨지지 않도록 둘 다 받는다. */
function placePhotoAll(place) {
  var p = (typeof place === 'string') ? { name: place } : (place || {});
  var idx = (typeof PHOTO_INDEX !== 'undefined' && PHOTO_INDEX) ? PHOTO_INDEX : null;
  var v = null;
  if (idx) {
    if (p.id != null && idx.byId)   v = idx.byId[p.id];
    if (!v && p.name && idx.byName) v = idx.byName[p.name];
  }
  if (!v) return [];
  var list = (typeof v === 'string') ? [v] : v;
  return list.map(function (f) { return 'assets/images/places/' + encodeURIComponent(f); });
}

function placePhotoSrc(place) {
  var all = placePhotoAll(place);
  if (all.length) return all[0];
  var p = (typeof place === 'string') ? { name: place } : (place || {});
  return 'assets/images/places/' + encodeURIComponent((p.name || '') + '.jpg');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ── 로고 클릭 → 앱 공유 ── */
function copyAppUrl() {
  var url = window.location.href.split('?')[0].split('#')[0];
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      showToast('🔗 주소를 복사했어요! 친구에게 공유해보세요');
    }).catch(function () { _shareFallback(url); });
  } else {
    _shareFallback(url);
  }
}
function shareApp() {
  var url   = window.location.href.split('?')[0].split('#')[0];
  var title = '화성잇다 — 화성특례시 통합 관광 앱';
  var text  = '화성시 관광지·축제·맛집·주차장을 한눈에! 🗺';
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function () {});
  } else {
    copyAppUrl();
  }
}
/* ── 주소 복사 ── */
function copyAddress(addr) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(addr).then(function () {
      showToast('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>주소가 복사되었어요!');
    }).catch(function () { _copyAddrFallback(addr); });
  } else {
    _copyAddrFallback(addr);
  }
}
function _copyAddrFallback(addr) {
  try {
    var el = document.createElement('textarea');
    el.value = addr; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    showToast('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>주소가 복사되었어요!');
  } catch (e) { showToast('주소: ' + addr); }
}

function _shareFallback(url) {
  try {
    var el = document.createElement('textarea');
    el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    showToast('🔗 주소를 복사했어요! 친구에게 공유해보세요');
  } catch (e) { showToast('주소: ' + url); }
}

/* BUG-11: 드래그 리스너는 map.js setupSlideCardDrag()에서만 등록 (중복 제거) */

/* ── localcurrency 지연 로드 헬퍼 (4.2MB — 사용 시점에만 fetch) ── */
var _lcLoading = false;
var _lcCallbacks = [];
function _loadLcData(callback) {
  if (typeof lcData !== 'undefined' && lcData.length) { if (callback) callback(); return; }
  if (callback) _lcCallbacks.push(callback);
  if (_lcLoading) return; /* 이미 fetch 중 — 중복 요청 방지 */
  _lcLoading = true;
  /* 4.2MB / 27,374건이라 저사양 기기에서 파싱 중 1초 가까이 메인스레드가 멈춘다.
   * 최소한 무반응 구간임을 알린다. */
  if (typeof showToast === 'function') showToast('지역화폐 가맹점을 불러오는 중입니다...');
  fetch('js/localcurrency-static.json?v=20260825').then(function(r) { return r.json(); }).then(function(d) {
    lcData = d;
    var sc = document.getElementById('stat-currency');
    if (sc) sc.textContent = lcData.length.toLocaleString();
    _lcLoading = false;
    var cbs = _lcCallbacks.splice(0);
    cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
  }).catch(function() {
    _lcLoading = false;
    var cbs = _lcCallbacks.splice(0);
    cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
  });
}

