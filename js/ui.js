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

/* 사진이 인덱스에 실제로 있는가. 없는데 <img> 를 넣으면 404 를 한 번 치고
 * onerror 로 숨기는데, 목록 수십 개면 그 요청이 전부 나간다. */
function hasPhoto(place) {
  return placePhotoAll(place).length > 0;
}

/* 작은 슬롯용 240px 썸네일 (2026-08-26). tools/optimize_images.py --thumbs 가 굽는다.
 *
 * 왜: 홈 첫 화면이 38·48·76px 슬롯에 1160x550 원본을 그대로 내리고 있었다.
 *   인기 5장 + 축제 대표 1장이 약 1,061KB — 3G(187KB/s)로 5.7초다.
 *   썸네일 평균이 10KB 라 같은 화면이 약 75KB 로 끝난다.
 *
 * 240px 한 종류인 이유는 tools/optimize_images.py make_thumbs 주석 참고.
 * 상세 화면·지도 슬라이드처럼 큰 슬롯은 계속 placePhotoSrc(원본)를 쓴다.
 *
 * 썸네일이 아직 없을 수 있다(사진을 새로 넣고 --thumbs 를 안 돌린 경우).
 * 그래서 호출부는 반드시 _thumbFallback() 을 onerror 에 걸어 원본으로 되돌아간다. */
function placeThumbSrc(place) {
  var all = placePhotoAll(place);
  if (!all.length) return '';
  /* 확장자를 통째로 .jpg 로 바꾼다. 썸네일은 원본 형식과 무관하게 항상
   * 소문자 .jpg 로 굽기 때문이다(tools/optimize_images.py make_thumbs).
   * ⚠ 예전에는 (png|webp|jpeg) 만 갈았다 — '.JPG' 같은 대문자나 '.jpg' 자신은
   * 그대로 남아 없는 썸네일을 요청하고 폴백까지 타서 요청이 2배가 된다.
   * 지금 인덱스 343장이 전부 소문자 .jpg 라 안 터지지만, 사진을 새로 넣으면
   * 언제든 생긴다(개발 Claude 지적, 2026-08-26). */
  return all[0].replace('/images/places/', '/images/thumbs/')
               .replace(/\.[A-Za-z0-9]+$/, '.jpg');
}

/* 썸네일 → 원본 → 포기(이모지 폴백) 순으로 한 단계씩만 내려간다.
 * data-f 로 재시도 여부를 표시해 무한 루프를 막는다 — onerror 안에서 src 를
 * 바꾸면 그 실패가 다시 onerror 를 부르기 때문이다. */
function _thumbFallback(img, fullSrc) {
  if (img.dataset.f) { img.style.display = 'none'; return; }
  img.dataset.f = '1';
  img.src = fullSrc;
}

/* 장소 썸네일 한 조각. 사진이 없으면 빈 문자열을 돌려주므로
 * 호출부에서 `photoThumb(p) || 기존이모지` 로 쓰면 된다.
 *
 * 2026-08-26: 축제 50장·문화재 43장을 받아 놓고도 화면 어디에도 안 뜨고 있었다.
 * 목록·소식·캘린더·상세가 각자 다른 방식으로 사진을 안 그렸기 때문인데,
 * 같은 것을 7곳에 복붙하면 다음에 또 어긋나므로 여기 한 곳에 둔다.
 *
 *   size  픽셀. 정사각형이다.
 *   fb    사진이 깨졌을 때 뒤에서 비치는 이모지 (보통 iconContent(cat))
 *   cls   추가 클래스. 호출부에서 여백·모서리를 조정할 때 쓴다.
 */
function photoThumb(place, size, fb, cls) {
  if (!hasPhoto(place)) return '';
  var s = size || 56;
  /* 240px 썸네일로 덮이는 크기면 그쪽을 쓴다(2026-08-26). DPR3 까지 고려한 값이다.
   * 그보다 큰 슬롯은 원본을 써야 흐려지지 않는다. */
  var full  = placePhotoSrc(place);
  var thumb = (s <= 80) ? placeThumbSrc(place) : '';
  var src   = thumb || full;
  var onerr = thumb
    ? '_thumbFallback(this,\'' + full.replace(/'/g, '%27') + '\')'
    : 'this.style.display=\'none\'';
  return '<div class="ph-thumb ' + (cls || '') + '" style="width:' + s + 'px;height:' + s + 'px">' +
           '<span class="ph-thumb-fb">' + (fb || '📍') + '</span>' +
           '<img src="' + src + '" alt="" loading="lazy" decoding="async" ' +
                'width="' + s + '" height="' + s + '" onerror="' + onerr + '">' +
         '</div>';
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
  var text  = '화성시 관광지·축제·맛집·주차장을 한눈에! 🗺️';
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
function _loadLcData(callback, silent) {
  if (typeof lcData !== 'undefined' && lcData.length) { if (callback) callback(); return; }
  if (callback) _lcCallbacks.push(callback);
  if (_lcLoading) return; /* 이미 fetch 중 — 중복 요청 방지 */
  _lcLoading = true;
  /* 4.2MB / 27,374건이라 저사양 기기에서 파싱 중 1초 가까이 메인스레드가 멈춘다.
   * 최소한 무반응 구간임을 알린다. */
  /* silent — 배경에서 미리 받을 때는 토스트를 띄우지 않는다. 사용자가 검색창에
   * 글자를 치는 도중에 '불러오는 중이에요' 가 뜨면 자기가 누른 적 없는 안내다.
   * 기존 호출부 4곳(home.js·living.js·localcurrency.js·map.js)은 인자를 안
   * 넘기므로 동작이 그대로다. */
  if (!silent && typeof showToast === 'function') showToast('지역화폐 가맹점을 불러오는 중이에요...');
  fetch('js/localcurrency-static.json?v=20260826159').then(function(r) { return r.json(); }).then(function(d) {
    lcData = d;
    /* 소식 탭 통계 4칸(#stat-currency)은 2026-08-26 에 없앴다 — 갱신할 대상이 없다.
     * 로드가 끝나면 아래 콜백이 renderLivingCatList('currency') 를 다시 부른다. */
    _lcLoading = false;
    var cbs = _lcCallbacks.splice(0);
    cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
  }).catch(function() {
    _lcLoading = false;
    var cbs = _lcCallbacks.splice(0);
    cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
  });
}

