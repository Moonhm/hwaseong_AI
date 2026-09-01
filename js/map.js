'use strict';

let kakaoMap      = null;
let mapReady      = false;
let overlayMap    = {};   /* id → CustomOverlay (tourist 제외) */
let overlayEls    = {};   /* id → DOM element */
let overlayCatMap = {};   /* id → category (setFilter 최적화용 — buildOverlays에서 구축) */
let selectedId    = null;
let slideStartY   = 0;

/* ── tourist 클러스터/뷰포트 렌더링 (parking 동일 패턴) ── */
var touristVisible      = false;
var touristDisplayItems = [];
var touristOverlayMap   = {};   /* id → { overlay, el } */

var TK_PIN_LEVEL = 7;           /* ≤ 이 레벨: 개별 핀 / 초과: 클러스터 원 (tourist 전용, localcurrency의 TK_PIN_LEVEL과 분리) */
var TK_GRID = {
  14: 0.30, 13: 0.15, 12: 0.08, 11: 0.05, 10: 0.03, 9: 0.02, 8: 0.015
};

/* 화성특례시 중심 좌표 (시청 인근) */
const HWASEONG = { lat: 37.199, lng: 126.831 };

const CAT_COLOR = {
  tourist:       '#FB923C',
  restaurant:    '#EF4444',
  festival:      '#F97316',
  heritage:      '#7C3AED',
  parking:       '#2563EB',
  localcurrency: '#16A34A',
  mobeom:        '#D97706',
  touristrest:   '#DC2626',
  hotel:         '#7C3AED',
  camping:       '#16A34A',
  temple:        '#92400E',
  jebu:          '#0284C7',
};

/* 편의정보 카테고리 목록 */
/* ⚠ 이 목록에서 빠진 카테고리는 지도 칩이 있어도 '죽은 칩' 이 된다 —
 * setFilter 가 isConvCat=false 로 보고 일반 PLACES 필터 경로로 흘려보내는데,
 * PLACES 에는 그 category 가 없어 핀이 0개가 되고 화면이 통째로 비워진다.
 * 2026-08-26 감사에서 touristfacility·cinema 가 빠져 있는 것을 발견했다 —
 * 칩·CONV_CAT_CFG·데이터(각 10건)는 8/25 에 들어왔는데 이 줄만 8/19 그대로였다.
 * 편의정보 카테고리를 새로 추가하면 반드시 여기에도 넣을 것. */
var CONV_CATS = ['mobeom','touristrest','hotel','camping','temple','jebu','touristfacility','cinema'];

/* ── 실제 컨테이너 너비 계산 (max-width:480px 반영) ── */
function mapW() { return Math.min(window.innerWidth, 480); }
function mapH() { return window.innerHeight - 46; }

/* ── 지도 초기화 ─────────────────────────────────────────────────────────
   SDK 를 &autoload=false 로 부른다(index.html). 그러면 스크립트가 내려와도
   kakao.maps 본체(약 43KB)는 아직 실행되지 않고 kakao.maps.load 만 있다.
   그래서 지도 탭을 한 번도 안 여는 사용자는 그 43KB 를 쓰지 않고,
   홈 콘텐츠가 SDK 실행을 기다리며 멈추지도 않는다.

   ⚠ autoload=false 를 붙였으면 반드시 kakao.maps.load() 로 감싸야 한다.
     안 그러면 kakao.maps.Map 이 없어 지도가 영영 안 뜬다.
     load 는 이미 로드된 뒤 다시 불러도 콜백을 즉시 실행하므로 재진입에 안전하다.
   ⚠ 다른 파일(conv_map·localcurrency·parking·restaurants)이 kakao.maps 를 쓰지만
     전부 이 초기화 뒤에 도는 경로라 그대로 둬도 된다 — 최상위에서 kakao 를
     즉시 만지는 코드는 없다(감사에서 확인). */
function initMap() {
  var container = document.getElementById('kakao-map');
  if (!container) return;

  /* 이미 초기화된 경우: 크기 재계산만 */
  if (mapReady) {
    container.style.width  = mapW() + 'px';
    container.style.height = mapH() + 'px';
    kakaoMap.relayout();
    return;
  }

  if (typeof kakao === 'undefined' || !kakao.maps) {
    /* ⚠ 여기서 '새로고침 해주세요' 라고 하면 안 된다 — 새로고침으로 안 고쳐지는
     * 원인이 더 흔하다. JS 앱 키에 도메인 제한이 걸려 있어서, 배포 주소가 바뀌면
     * SDK 가 401 domain mismatched! 를 내고 kakao 가 아예 정의되지 않는다.
     * 2026-08-31 에 터널 주소를 바꾼 뒤 실제로 이 상태였는데, 화면은 새로고침을
     * 권하고 check.sh --live 는 exit 0 이라 아무도 원인을 못 짚었다.
     * 사람에게는 할 수 있는 것만 말하고, 진단은 콘솔로 넘긴다(§12 「Kakao API」). */
    _warnMapKey('kakao 전역이 없다');
    showMapError('지도를 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.');
    return;
  }

  /* 본체가 아직 실행 전이면 여기서 로드하고 끝난 뒤 이어서 그린다. */
  if (!kakao.maps.Map) {
    if (typeof kakao.maps.load !== 'function') {
      _warnMapKey('kakao.maps.load 가 없다 — SDK 가 반쯤 실렸다');
      showMapError('지도를 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.');
      return;
    }
    /* 안전망: load 콜백이 끝내 안 오면 빈 지도가 아니라 새로고침 버튼을 보여 준다.
     * autoload=false 는 2026-08-26 에 넣었는데 개발 환경에서 카카오 CDN 이 막혀
     * 실동작을 검증하지 못했다 — 조용히 실패하는 것만은 막아 둔다. */
    var _guard = setTimeout(function () {
      if (!mapReady) { _warnMapKey('kakao.maps.load 콜백이 8초 안에 안 왔다');
        showMapError('지도를 불러오지 못했어요.<br>연결을 확인하고 잠시 뒤 다시 열어 주세요.'); }
    }, 8000);
    kakao.maps.load(function () {
      clearTimeout(_guard);
      _initMapCore(container);
    });
    return;
  }
  _initMapCore(container);
}

function _initMapCore(container) {
  if (mapReady) return;   /* load 콜백이 두 번 도는 경우를 막는다 */

  var loader = document.getElementById('map-loader');
  if (loader) loader.remove();

  /* 실제 보이는 영역 기준으로 컨테이너 크기 설정
   * (window.innerWidth 대신 min(innerWidth, 480) — page max-width 반영) */
  container.style.width  = mapW() + 'px';
  container.style.height = mapH() + 'px';

  kakaoMap = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng),
    level:  9,
  });

  buildOverlays();
  setupMyLocation();
  setupSlideCardDrag();
  setupZoomSlider();
  if (typeof initParking       === 'function') initParking(kakaoMap);
  if (typeof initLocalCurrency === 'function') initLocalCurrency(kakaoMap);
  if (typeof initRestaurants   === 'function') initRestaurants(kakaoMap);   /* 2026-08-26 */
  /* 지역(구) 라벨을 채운다. coord2RegionCode 는 SDK 가 뜬 뒤에만 쓸 수 있어서
   * 지도 초기화 시점이 가장 이른 안전 지점이다. PLACES(축제 제외)+주차장 382건을
   * 10건/200ms 로 약 8초에 끝내고 localStorage 에 캐시한다 — 두 번째부터는 0건 호출.
   * 실패해도 검색은 주소·bbox 폴백으로 그대로 동작한다. */
  if (typeof resolveDistricts === 'function') setTimeout(resolveDistricts, 1200);
  mapReady = true;
  /* 최초 진입 시 아무것도 표시하지 않음 */
  kakao.maps.event.addListener(kakaoMap, 'click', closePlaceSlide);
  kakao.maps.event.addListener(kakaoMap, 'idle', function () {
    if (touristVisible) updateTouristDisplay();
  });

  /* display:none → block 전환 후 크기 재계산 */
  setTimeout(function () {
    container.style.width  = mapW() + 'px';
    container.style.height = mapH() + 'px';
    kakaoMap.relayout();
  }, 300);

  window.addEventListener('resize', function () {
    if (!mapReady) return;
    var c = document.getElementById('kakao-map');
    if (!c) return;
    c.style.width  = mapW() + 'px';
    c.style.height = mapH() + 'px';
    kakaoMap.relayout();
  });
}

/* ── 특정 카테고리 장소 범위로 맞춤 (필터 전용) ── */
function fitPlaces(list) {
  if (!list || !list.length || !kakaoMap || typeof kakao === 'undefined') return;
  var valid = list.filter(function (p) { return p.lat && p.lng; });
  if (!valid.length) return;
  var bounds = new kakao.maps.LatLngBounds();
  valid.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
  kakaoMap.setBounds(bounds, 80);
  setTimeout(function () {
    if (kakaoMap.getLevel() > 9) kakaoMap.setLevel(9);
  }, 150);
}

/* ── 에러 화면 ── */
/* 지도가 안 뜨는 원인 중 '새로고침으로 안 고쳐지는 것' 을 콘솔에 남긴다.
 * 화면 문구는 사용자가 할 수 있는 것만 말해야 하므로 진단을 여기로 뺐다.
 * 도메인 제한은 개발자 콘솔에서 고치는 것이라 사용자·Claude 둘 다 코드로 못 고친다 —
 * 그래서 '어디를 봐야 하는지' 를 정확히 찍어 주는 것이 이 함수의 전부다. */
function _warnMapKey(why) {
  if (typeof console === 'undefined' || !console.warn) return;
  console.warn(
    '[지도] 카카오 SDK 를 못 썼습니다 — ' + why + '\n' +
    '  현재 주소: ' + location.origin + '\n' +
    '  가장 흔한 원인은 JS 앱 키의 도메인 제한입니다. 배포 주소(Quick Tunnel)가 바뀌면\n' +
    '  SDK 가 401 domain mismatched! 를 내고 kakao 전역이 아예 생기지 않습니다.\n' +
    '  → Kakao Developers > 내 애플리케이션 > 플랫폼 > Web 에 위 주소를 등록하십시오.\n' +
    '  → 이건 새로고침으로 안 고쳐집니다. WORKFLOW.md §12 「Kakao API」 참고.'
  );
}

function showMapError(msg) {
  var container = document.getElementById('kakao-map');
  if (!container) return;
  var loader = document.getElementById('map-loader');
  if (loader) loader.remove();
  container.innerHTML =
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:12px;padding:24px;' +
    'background:#f9fafb;text-align:center;">' +
    '<div style="font-size:48px">🗺️</div>' +
    '<div style="color:#6b7280;font-size:14px;line-height:1.6">' + msg + '</div>' +
    '<button onclick="location.reload()" ' +
    'style="background:#6366f1;color:#fff;border:none;border-radius:20px;' +
    'padding:10px 20px;font-size:13px;cursor:pointer">다시 시도</button></div>';
}

/* ── 핀 DOM 요소 생성 공통 헬퍼 (buildOverlays·showTkViewport 공유) ── */
function _mkCmPin(color, emoji, label) {
  var wrap   = document.createElement('div');
  wrap.className = 'cm-pin';
  var circle = document.createElement('div');
  circle.className = 'cm-circle';
  circle.style.background = color;
  circle.textContent = label;
  var tail = document.createElement('div');
  tail.className = 'cm-tail';
  tail.style.borderTopColor = color;
  wrap.appendChild(circle);
  wrap.appendChild(tail);
  return wrap;
}

/* ── 커스텀 오버레이 생성 (tourist 제외 — 별도 동적 렌더링) ── */
function buildOverlays() {
  /* 장소 미정 축제 21건이 지도 중심 좌표(37.199,126.831)에 완전히 겹쳐 있어
   * 그대로 두면 마지막 1개만 클릭된다. 같은 좌표가 반복되면 나선형으로 조금씩 흩어 놓는다. */
  var _seenPos = {};
  function _spread(lat, lng) {
    var key = lat + ',' + lng;
    var n = (_seenPos[key] = (_seenPos[key] || 0) + 1) - 1;
    if (n === 0) return new kakao.maps.LatLng(lat, lng);
    var ang = n * 2.39996;                      /* 황금각 — 겹치지 않게 퍼짐 */
    var rad = 0.00045 * Math.sqrt(n);           /* 약 50m 부터 점진 확대 */
    return new kakao.maps.LatLng(lat + rad * Math.cos(ang), lng + rad * Math.sin(ang));
  }

  PLACES.forEach(function (p) {
    /* 축제는 지도에 그리지 않는다 (2026-08-26 사용자 결정).
       축제 정보는 화성시 공식 사이트와 연계돼 있고, 장소보다 '언제 하는가'가 본질이라
       지도에서 찾을 일이 없다. 게다가 50건 중 21건이 장소 미정이라 시청 좌표를
       나선으로 흩뿌려 '가짜 위치'에 찍히고 있었다.
       지도로 보내는 진입점은 goMapFocus(js/mapnav.js)가 한 곳에서 막는다. */
    if (p.category === 'tourist' || p.category === 'festival') return;

    var color = CAT_COLOR[p.category] || '#6B7280';
    var cfg   = CATEGORY_CONFIG[p.category] || {};
    var label = (p.name || '').length > 6 ? (p.name || '').slice(0, 5) + '…' : (p.name || '');
    var wrap  = _mkCmPin(color, cfg.emoji || '📍', label);

    /* 클로저로 place id 캡처 */
    (function (placeId) {
      wrap.addEventListener('click', function (e) {
        e.stopPropagation();
        onPinClick(placeId);
      });
      /* 호버 시 핀을 최상단으로 */
      wrap.addEventListener('mouseover', function () {
        if (selectedId !== placeId) overlayMap[placeId] && overlayMap[placeId].setZIndex(100);
      });
      wrap.addEventListener('mouseout', function () {
        if (selectedId !== placeId) overlayMap[placeId] && overlayMap[placeId].setZIndex(1);
      });
    })(p.id);

    var overlay = new kakao.maps.CustomOverlay({
      position: _spread(p.lat, p.lng),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   1,
    });
    /* 초기에는 숨김 — setFilter() 호출 시에만 표시 */
    overlay.setMap(null);
    overlayMap[p.id]    = overlay;
    overlayEls[p.id]    = wrap;
    overlayCatMap[p.id] = p.category;
  });
}

/* ── 관광지 클러스터/뷰포트 렌더링 (parking 동일 패턴) ── */
function setTouristVisible(visible) {
  touristVisible = visible;
  if (!visible) {
    clearTimeout(_tkTimer);
    clearTouristDisplay();
  } else {
    updateTouristDisplay();
  }
}

function clearTouristDisplay() {
  touristDisplayItems.forEach(function (o) { o.setMap(null); });
  touristDisplayItems = [];
  touristOverlayMap   = {};
}

var _tkTimer = null;
function updateTouristDisplay() {
  clearTimeout(_tkTimer);
  _tkTimer = setTimeout(function () {
    if (!kakaoMap) return;
    clearTouristDisplay();
    var level  = kakaoMap.getLevel();
    var bounds = kakaoMap.getBounds();
    if (level <= TK_PIN_LEVEL) showTkViewport(bounds);
    else                       showTkClusters(bounds, level);
  }, 100);
}

/* 줌인 상태: 뷰포트 내 개별 핀 */
function showTkViewport(bounds) {
  var sw    = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var color = CAT_COLOR.tourist;
  var cfg   = CATEGORY_CONFIG.tourist || {};

  PLACES.forEach(function (p) {
    if (p.category !== 'tourist') return;
    if (p.lat < sw.getLat() || p.lat > ne.getLat()) return;
    if (p.lng < sw.getLng() || p.lng > ne.getLng()) return;

    var label = (p.name || '').length > 6 ? (p.name || '').slice(0, 5) + '…' : (p.name || '');
    var wrap  = _mkCmPin(color, cfg.emoji || '🌟', label);

    if (p.id === selectedId) wrap.classList.add('selected');

    (function (pid) {
      wrap.addEventListener('click', function (e) {
        e.stopPropagation();
        onPinClick(pid);
      });
    })(p.id);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   p.id === selectedId ? 200 : 1,
      map:      kakaoMap,
    });

    touristDisplayItems.push(overlay);
    touristOverlayMap[p.id] = { overlay: overlay, el: wrap };
  });
}

/* 줌아웃 상태: 그리드 기반 클러스터 원 */
function showTkClusters(bounds, level) {
  var sw    = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var grid  = TK_GRID[level] || 0.02;
  var pad   = grid * 0.5;
  var minLat = sw.getLat() - pad, maxLat = ne.getLat() + pad;
  var minLng = sw.getLng() - pad, maxLng = ne.getLng() + pad;

  var cells = {};
  PLACES.forEach(function (p) {
    if (p.category !== 'tourist') return;
    if (p.lat < minLat || p.lat > maxLat) return;
    if (p.lng < minLng || p.lng > maxLng) return;
    var key = Math.floor(p.lat / grid) + ',' + Math.floor(p.lng / grid);
    if (!cells[key]) cells[key] = { sumLat: 0, sumLng: 0, count: 0 };
    cells[key].sumLat += p.lat;
    cells[key].sumLng += p.lng;
    cells[key].count++;
  });

  Object.keys(cells).forEach(function (key) {
    var c   = cells[key];
    var cnt = c.count;
    var lat = c.sumLat / cnt;
    var lng = c.sumLng / cnt;

    var el = document.createElement('div');
    el.style.cssText =
      'width:38px;height:38px;border-radius:50%;background:#FB923C;' +
      'border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.22);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'cursor:pointer;box-sizing:border-box;';
    el.innerHTML =
      '<span style="color:#fff;font-size:13px;line-height:1">★</span>' +
      (cnt > 1 ? '<span style="color:rgba(255,255,255,0.88);font-size:8px;line-height:1.3">' + cnt + '</span>' : '');

    (function (clat, clng, lv) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var dest = new kakao.maps.LatLng(clat, clng);
        /* TK_PIN_LEVEL(7) 이하로 한 번에 이동 — 단계별 클릭 없이 바로 핀 표시 */
        var targetLevel = Math.max(1, Math.min(lv - 2, TK_PIN_LEVEL));
        kakaoMap.panTo(dest);
        setTimeout(function () {
          kakaoMap.setLevel(targetLevel, { animate: { duration: 400 } });
        }, 180);
      });
    })(lat, lng, level);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content:  el,
      yAnchor:  0.5,
      zIndex:   5,
      map:      kakaoMap,
    });
    touristDisplayItems.push(overlay);
  });
}

/* ── 지도 전체에서 '선택된 핀'은 하나뿐이다 ──────────────────────────────────
   핀 시스템이 네 개다 — 관광지·축제·문화재(cm-pin, 이 파일) / 편의시설·제부도
   (cm-pin, conv_map.js) / 주차장(pk-pin, parking.js) / 지역화폐(네이티브 Marker,
   localcurrency.js). 각자 자기 강조만 지우면 주차장을 고른 뒤 관광지를 고를 때
   주차장 강조가 그대로 남아 '두 개가 선택된' 화면이 된다.

   그래서 선택하는 쪽이 '나를 어떻게 지우는가'를 함께 맡기고,
   다음 선택은 clearSelectedPin() 으로 그것부터 실행한다.
   js/map.js 가 스크립트 순서상 이 넷 중 가장 앞이라(index.html) 여기에 둔다. */
var _pinSelClear = null;

function clearSelectedPin() {
  if (!_pinSelClear) return;
  var f = _pinSelClear;
  _pinSelClear = null;   /* 먼저 비운다 — f() 안에서 또 불려도 무한 재귀가 안 되게 */
  try { f(); } catch (e) {}
}

function registerSelectedPin(fn) {
  _pinSelClear = (typeof fn === 'function') ? fn : null;
}

/* ── 핀 클릭 ── */
function onPinClick(id) {
  var place = PLACES.find(function (p) { return p.id === id; });
  if (!place) return;

  clearSelectedPin();            /* 어느 시스템의 선택이든 여기서 해제된다 */
  selectedId = id;
  if (overlayEls[id]) overlayEls[id].classList.add('selected');
  if (overlayMap[id]) overlayMap[id].setZIndex(200);
  var curTk = touristOverlayMap[id];
  if (curTk) { curTk.el.classList.add('selected'); curTk.overlay.setZIndex(200); }
  registerSelectedPin(_deselectPlacePin);

  /* 슬라이드 카드 표시 */
  showPlaceSlide(place);
  _panPinAboveSlide(place.lat, place.lng, 50);
}

function _deselectPlacePin() {
  if (selectedId === null) return;
  if (overlayEls[selectedId]) overlayEls[selectedId].classList.remove('selected');
  if (overlayMap[selectedId]) overlayMap[selectedId].setZIndex(1);
  var tk = touristOverlayMap[selectedId];
  if (tk) { tk.el.classList.remove('selected'); tk.overlay.setZIndex(1); }
  selectedId = null;
}

/* 핀을 슬라이드 카드 위 가시 영역 중앙으로 이동
 * customSlideH: 슬라이드 실제 예상 높이(px). 미지정 시 자동 계산(최대 420px) */
function _panPinAboveSlide(lat, lng, delay, customSlideH) {
  if (!kakaoMap || !lat || !lng) return;
  kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
  setTimeout(function () {
    if (!kakaoMap) return;
    var h        = mapH();
    var slideH   = customSlideH != null ? customSlideH : Math.min(h * 0.6, 420);
    var visibleH = h - slideH;
    var targetY  = visibleH * 0.50;
    kakaoMap.panBy(0, Math.round(h / 2 - targetY));
  }, delay != null ? delay : 50);
}

/* ── 슬라이드 카드 드래그-투-클로즈 (참고 깃 패턴) ── */
function setupSlideCardDrag() {
  var dragZone = document.getElementById('slide-drag-zone');
  if (!dragZone) return;

  dragZone.addEventListener('touchstart', function (e) {
    slideStartY = e.touches[0].clientY;
  }, { passive: true });

  dragZone.addEventListener('touchend', function (e) {
    var endY = e.changedTouches[0].clientY;
    if (endY - slideStartY > 60) closePlaceSlide();
  });

  var _dragFromHandle = false;

  dragZone.addEventListener('mousedown', function (e) {
    slideStartY = e.clientY;
    _dragFromHandle = true;
  });

  document.addEventListener('mouseup', function (e) {
    if (!_dragFromHandle) return;
    _dragFromHandle = false;
    var slide = document.getElementById('place-slide');
    if (slide && slide.classList.contains('open') && e.clientY - slideStartY > 60) {
      closePlaceSlide();
    }
  });
}

/* ── 장소 사진 HTML ── */
function placePhotoHtml(place) {
  var cfg = CATEGORY_CONFIG[place.category] || { bg: '#F3F4F6', emoji: '📍' };
  var src = placePhotoSrc(place);

  if (place.category === 'tourist') {
    /* 이미지 있으면 커버, 없으면 그라데이션 + 🏞️ */
    return '<div style="width:100%;height:120px;border-radius:12px;overflow:hidden;margin-bottom:12px;' +
      'position:relative;background:linear-gradient(135deg,#FFF7ED,#FFEDD5)">' +
      '<img src="' + src + '" alt="" decoding="async" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" ' +
      'onerror="this.style.display=\'none\'">' +
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:40px;pointer-events:none">🏞️</div>' +
      '</div>';
  }

  return '<div style="width:100%;height:160px;border-radius:12px;overflow:hidden;margin-bottom:12px;background:' + cfg.bg + ';display:flex;align-items:center;justify-content:center;">' +
    '<img src="' + src + '" alt="' + place.name + '" decoding="async" ' +
    'style="width:100%;height:100%;object-fit:cover;" ' +
    'onerror="this.parentNode.innerHTML=\'<span style=\\\"font-size:36px\\\">' + cfg.emoji + '</span>\'">' +
    '</div>';
}

/* ── 장소 슬라이드 카드 ── */
function showPlaceSlide(place) {
  /* '최근 둘러본 관광지' 기록 지점 (js/home.js pushRecent).
   * 지도 핀 클릭·관광 목록 클릭·홈 검색 결과·즐겨찾기 진입이 전부 이 함수를 거치므로
   * 여기 한 곳만 걸면 모든 경로가 잡힌다. 관광지가 아니면 pushRecent 가 알아서 무시한다. */
  if (typeof pushRecent === 'function') pushRecent(place, 'tourist');

  var cfg       = CATEGORY_CONFIG[place.category] || { label: '', bg: '#F3F4F6', emoji: '📍' };
  var color     = CAT_COLOR[place.category] || '#6B7280';
  var isTourist = place.category === 'tourist';

  /* 관광지: 긴 설명 truncation */
  var fullDesc  = place.desc || '';
  var descHtml;
  if (isTourist && fullDesc.length > 130) {
    var short = fullDesc.slice(0, 130) + '…';
    descHtml =
      '<div class="sl-desc">' +
      '<span id="sl-desc-short">' + short + '</span>' +
      '<span id="sl-desc-full" style="display:none">' + fullDesc + '</span>' +
      '<button id="sl-desc-btn" onclick="toggleTouristDesc()" ' +
      'style="font-size:12px;color:' + color + ';background:none;border:none;' +
      'cursor:pointer;padding:0 0 0 2px;font-weight:600">더보기</button>' +
      '</div>';
  } else {
    descHtml = '<div class="sl-desc">' + fullDesc + '</div>';
  }

  /* 태그: 관광지는 주황 테마, 나머지는 기본(파란) */
  var tagStyle = isTourist
    ? 'style="background:' + cfg.bg + ';color:' + color + '"'
    : '';

  /* 액션 버튼 — 이름에 작은따옴표 포함 시 onclick 오류 방지 */
  var safeName = (place.name || '').replace(/['"]/g, '');
  var routeBtn = '<button class="sl-btn" style="' +
    (isTourist ? 'background:' + color + ';color:#fff;border-color:' + color : '') +
    '" onclick="openRoute(' + place.lat + ',' + place.lng + ',\'' + safeName + '\')">🗺️ 길찾기</button>';

  var actionsHtml;
  if (isTourist) {
    actionsHtml =
      '<button class="sl-btn" onclick="window.open(\'https://map.kakao.com/?q=' +
      encodeURIComponent(place.name) + '\',\'_blank\')">🔍 카카오지도</button>' +
      routeBtn +
      '<button class="sl-btn" style="background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" ' +
      'onclick="goNearestParking(' + place.lat + ',' + place.lng + ',' + place.id + ')">🅿️ 가장 가까운<br>공영주차장 찾기</button>';
  } else {
    actionsHtml =
      '<button class="sl-btn primary" onclick="findNearby(' + place.lat + ',' + place.lng + ')">💳 반경 500m 가맹점</button>' +
      routeBtn;
  }
  var _favId = 'pl-' + place.id;
  var _favSaved = typeof isFav !== 'undefined' && isFav(_favId);
  actionsHtml +=
    '<button class="sl-btn fav-btn' + (_favSaved ? ' saved' : '') + '" id="slide-fav-btn"' +
    ' data-fid="' + _favId + '" data-type="place" data-pid="' + place.id + '"' +
    ' data-cat="' + place.category + '" data-lat="' + place.lat + '" data-lng="' + place.lng + '"' +
    ' data-name="' + safeName.replace(/"/g, '') + '"' +
    ' onclick="toggleFavBtn(this)">' + (_favSaved ? '♥ 저장됨' : '♡ 저장') + '</button>';

  var ratingHtml = '';
  if (isTourist && place.rating) {
    var full = Math.floor(place.rating), half = (place.rating - full) >= 0.3 ? 1 : 0, empty = 5 - full - half;
    var _hs = '<span style="position:relative;display:inline-block"><span style="color:#D1D5DB">★</span><span style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;color:#F59E0B">★</span></span>';
    var stars = '<span style="color:#F59E0B">' + '★'.repeat(full) + '</span>' + (half ? _hs : '') + (empty ? '<span style="color:#D1D5DB">' + '★'.repeat(empty) + '</span>' : '');
    ratingHtml =
      '<div class="sl-rating">' +
      '<span class="sl-stars">' + stars + '</span>' +
      '<span class="sl-rating-num">' + place.rating + '</span>' +
      '<span class="sl-rating-cnt">(' + (place.reviewCount || 0).toLocaleString() + '개 리뷰)</span>' +
      '</div>';
  }

  document.getElementById('slide-inner').innerHTML =
    placePhotoHtml(place) +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:' + cfg.bg + ';color:' + color + '">' + cfg.emoji + ' ' + cfg.label + '</span>' +
    ((typeof festStatus === 'function' && festStatus(place) === 'ongoing') ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : '') +
    '</div>' +
    '<div class="sl-name">' + place.name + '</div>' +
    ratingHtml +
    '<div class="sl-addr" data-addr="' + (place.address || '').replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + (place.address || '') + '</div>' +
    (place.date ? '<div class="sl-date">📅 ' + place.date + '</div>' : '') +
    descHtml +
    '<div class="sl-tags">' +
    /* '세계문화유산' 만 강조한다 (2026-08-26 사용자 지시). 나머지 태그는 분류일
     * 뿐이지만 이건 유네스코 등재라는 사실 자체라 무게가 다르다.
     * 카테고리 색(tagStyle)을 덮어써야 하므로 이 태그에는 tagStyle 을 붙이지 않는다 —
     * 붙이면 뒤에 오는 인라인 style 이 클래스 규칙을 이겨 강조가 통째로 사라진다.
     * 지금 붙은 곳은 융릉·건릉(id:24) 한 곳뿐이다(js/data.js 주석 참고). */
    (place.tags || []).map(function (t) {
      return (t === '세계문화유산')
        ? '<span class="sl-tag sl-tag--unesco">🏛️ ' + t + '</span>'
        : '<span class="sl-tag" ' + tagStyle + '>' + t + '</span>';
    }).join('') +
    '</div>' +
    '<div class="sl-actions">' + actionsHtml + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

function toggleTouristDesc() {
  var s = document.getElementById('sl-desc-short');
  var f = document.getElementById('sl-desc-full');
  var b = document.getElementById('sl-desc-btn');
  if (!s || !f || !b) return;
  var isExpanded = f.style.display !== 'none';
  s.style.display = isExpanded ? 'inline' : 'none';
  f.style.display = isExpanded ? 'none'   : 'inline';
  b.textContent   = isExpanded ? '더보기' : '접기';
}

/* ══════════════════════════════════════════
   가장 가까운 공영주차장 모드 (NP Mode)
   ── 두 핀만 강조 표시, 나머지 레이어 숨김
   ══════════════════════════════════════════ */
var _npMode = null; /* { onBack, touristOv, parkOv, backBtn } */

/* NP 진입 직전에 켜져 있던 카테고리 칩. NP 모드는 모든 레이어를 끄고 칩을 전부
 * 비우는데, 그 상태로 다른 탭에 나갔다 지도로 돌아오면 아무도 되살려 주지 않아
 * '확대된 빈 지도' 가 됐다 — 칩을 직접 다시 눌러야만 복구됐다. */
var _npPrevCats = [];

/* NP 진입 직전의 카메라. _npRestoreCats 가 부르는 setFilter 는 마지막에 fitPlaces
 * (편의정보는 showConvCat → _fitConv, js/conv_map.js)로 카메라를 카테고리 전체
 * bounds 까지 끌고 간다 — 관광지 151곳이면 화성시 전역·레벨 9 다. 이 함수가 할 일은
 * '칩과 레이어 복구' 뿐이고 화면은 NP 로 들어가기 전 그대로여야 한다. */
var _npPrevView = null;

function _npRestoreCats() {
  var cats = _npPrevCats, view = _npPrevView;
  _npPrevCats = [];
  _npPrevView = null;
  if (!cats.length) return;
  /* 주차장을 먼저 — setFilter 는 주차장 칩만은 건드리지 않고 보존한다. */
  if (cats.indexOf('parking') >= 0 && typeof activateParking === 'function') activateParking();
  cats.forEach(function (c) {
    if (c !== 'parking' && typeof setFilter === 'function') setFilter(c);
  });
  /* setFilter 가 옮겨 놓은 카메라를 NP 진입 직전으로 되돌린다.
   * 안 되돌리면 ← 로 나온 화면이 레벨 9 가 되는데, touristOverlayMap 은
   * TK_PIN_LEVEL 이하에서만 채워지므로(showTkClusters 는 안 채운다) 뒤이어
   * exitNearestParkMode 가 부르는 onPinClick 이 강조를 걸 대상 자체를 못 찾았다.
   * fitPlaces·_fitConv 의 150ms 클램프는 레벨 9 '초과'일 때만 도므로
   * 여기서 먼저 낮춰 두면 그 타이머가 무효가 된다. */
  if (view && kakaoMap && typeof kakao !== 'undefined') {
    kakaoMap.setLevel(view.level);
    kakaoMap.setCenter(view.center);
  }
}

/* ── 공통 핵심 로직 ── */
function _goNPCore(placeLat, placeLng, label, icon, onBack) {
  if (typeof parkingData === 'undefined' || !parkingData.length) {
    if (typeof showToast === 'function') showToast('주차장 정보를 불러오는 중이에요.');
    return;
  }

  /* 유클리드 거리로 최근접 주차장 탐색 */
  var nearest = null, minDist = Infinity;
  parkingData.forEach(function (pk) {
    if (!pk.lat || !pk.lng) return;
    var d = Math.pow(pk.lat - placeLat, 2) + Math.pow((pk.lng - placeLng) * 0.89, 2);
    if (d < minDist) { minDist = d; nearest = pk; }
  });

  if (!nearest) {
    if (typeof showToast === 'function') showToast('주변에 공영주차장을 찾지 못했어요.');
    return;
  }

  /* 이전 NP 모드 정리. 이미 NP 중이면 그때 기록해 둔 칩을 그대로 들고 간다 —
   * 여기서 다시 읽으면 (칩이 이미 비어 있으므로) 빈 배열로 덮어쓴다. */
  if (!_npMode) {
    _npPrevCats = Array.prototype.map.call(
      document.querySelectorAll('#map-chips .chip.active'),
      function (c) { return c.dataset.cat || null; }
    ).filter(Boolean);
    /* 칩과 같은 가드 안에서 카메라도 함께 잡아 둔다 — 아래 setBounds 로 두 핀에
     * 맞추기 '전' 값이라야 ← 로 돌아왔을 때 원래 보던 화면이 된다. */
    _npPrevView = (kakaoMap && typeof kakao !== 'undefined')
      ? { center: kakaoMap.getCenter(), level: kakaoMap.getLevel() } : null;
  }
  _exitNpMode(false);
  closePlaceSlide();

  /* 모든 레이어 숨김 */
  setTouristVisible(false);
  if (typeof setLcVisible      === 'function') setLcVisible(false);
  if (typeof hideAllConv       === 'function') hideAllConv();
  if (typeof setParkingVisible === 'function') setParkingVisible(false);
  document.querySelectorAll('#map-chips .chip').forEach(function (c) { c.classList.remove('active'); });
    if (typeof resetGuView === 'function') resetGuView();   /* 지역 상태도 함께 (2026-08-26) */
  Object.keys(overlayMap).forEach(function (id) { overlayMap[id].setMap(null); });

  /* 장소 하이라이트 핀 */
  var touristEl = _makeNpPin('#FB923C', icon || '🌟', label || '장소', function () {
    exitNearestParkMode();
  });
  var touristOv = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(placeLat, placeLng),
    content: touristEl, yAnchor: 1.55, zIndex: 50, map: kakaoMap,
  });

  /* 주차장 하이라이트 핀 — 잔여 대수·색상 반영 */
  var nearestId = nearest.id;
  var parkEl = _makeNpParkPin(nearest, function () {
    if (typeof showParkingSlide === 'function') {
      var pk = parkingData.find(function (x) { return x.id === nearestId; });
      if (pk) showParkingSlide(pk);
    }
  });
  var parkOv = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(nearest.lat, nearest.lng),
    content: parkEl, yAnchor: 1.55, zIndex: 50, map: kakaoMap,
  });

  /* 뒤로가기 버튼 생성 */
  var backBtn = document.createElement('div');
  backBtn.id = 'np-back-btn';
  backBtn.setAttribute('aria-label', '이전으로');
  backBtn.innerHTML = '&#8592;';
  backBtn.onclick = exitNearestParkMode;
  /* ⚠ document.body 에 붙이면 안 된다. .place-slide 의 z-index 200 은
   * #page-map(.page.active{z-index:2}) 이 만든 스태킹 컨텍스트 '안' 값이라,
   * body 직속인 이 버튼은 190 vs 200 이 아니라 **190 vs 2** 로 겨뤄
   * 카드를 포함한 지도 화면 전부 위에 떴다 — 주차장 카드 위 46px 이
   * '길찾기' 왼쪽을 덮어 탭이 NP 종료로 먹혔다.
   * 같은 컨텍스트에 넣어야 css/40-quiz.css 의 '슬라이드에 가리도록' 주석이
   * 비로소 사실이 된다. (2026-08-27 배포 Claude 지적)
   * 페이지 전환 애니메이션(transform)과는 무관하다 — 지도 탭을 벗어날 때
   * exitNpModeLeavingMap 이 전환 '전에' 이 버튼을 제거한다(js/nav.js go). */
  (document.getElementById('page-map') || document.body).appendChild(backBtn);

  _npMode = { onBack: onBack || null, touristOv: touristOv, parkOv: parkOv, backBtn: backBtn };

  /* 두 핀 모두 보이도록 bounds 조정 */
  setTimeout(function () {
    if (!kakaoMap || typeof kakao === 'undefined') return;
    var bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(placeLat, placeLng));
    bounds.extend(new kakao.maps.LatLng(nearest.lat, nearest.lng));
    kakaoMap.setBounds(bounds, 120);
    setTimeout(function () {
      var lv = kakaoMap.getLevel();
      if (lv < 3) kakaoMap.setLevel(3);
      if (lv > 8) kakaoMap.setLevel(8);
    }, 200);
  }, 320);
}

/* ── 관광지 핀에서 호출 ── */
function goNearestParking(placeLat, placeLng, placeId) {
  var tPlace = PLACES.find(function (pl) { return pl.id === placeId; });
  _goNPCore(placeLat, placeLng, tPlace ? tPlace.name : '관광지', '🌟',
    function () {
      var chip = document.querySelector('#map-chips .chip[data-cat="tourist"]');
      if (chip) chip.classList.add('active');
      setTouristVisible(true);
      setTimeout(function () { onPinClick(placeId); }, 350);
    });
}

/* ── 편의정보(conv) 핀에서 호출 ── */
function goNearestParkingConv(placeLat, placeLng, convCat, convName) {
  var cfg = (typeof CONV_CAT_CFG !== 'undefined') && CONV_CAT_CFG[convCat];
  var icon = cfg ? cfg.emoji : '🍽️';
  _goNPCore(placeLat, placeLng, convName, icon, function () {
    /* NP 진입 시 꺼 둔 편의정보 레이어와 칩을 되살린다.
     * 복원하지 않으면 뒤로가기 후 빈 지도만 남는다. */
    var chip = document.querySelector('#map-chips .chip[data-cat="' + convCat + '"]');
    if (chip) chip.classList.add('active');
    if (typeof showConvCat === 'function') showConvCat(convCat);
    var p = ((typeof CONV_PLACES !== 'undefined' && CONV_PLACES[convCat]) || [])
      .find(function (x) { return x.name === convName; });
    if (p && typeof _showConvSlide === 'function') _showConvSlide(p);
  });
}

/* ── 지역화폐 가맹점 핀에서 호출 ──
 * ⚠ 돌아올 때 되찾는 건 이름이 아니라 id 다. 가맹점 27,374건 중 이름이 겹치는
 *   항목이 2,086건(904종) 있어(김밥천국 11곳·아모레카운셀러 23곳 …)
 *   x.n === lcName 으로 찾으면 배열의 첫 동명 지점이 잡혔다 — 동탄 김밥천국에서
 *   ← 로 돌아오면 병점 지점 카드가 열리고 showLcSlide 의 _panPinAboveSlide 가
 *   지도까지 그리로 옮겼다. 이름이 같아 카드가 바뀐 줄도 몰랐다.
 * lcName 은 NP 하이라이트 핀의 이름표로만 쓴다 — lcData 지연 로드가 아직인
 *   순간에도 이름표는 제대로 나와야 한다. */
function goNearestParkingLc(placeLat, placeLng, lcId, lcName) {
  _goNPCore(placeLat, placeLng, lcName || '가맹점', '🏪', function () {
    var chip = document.querySelector('#map-chips .chip[data-cat="localcurrency"]');
    if (chip) chip.classList.add('active');
    if (typeof setLcVisible === 'function') setLcVisible(true);
    var p = (typeof lcData !== 'undefined' ? lcData : [])
      .find(function (x) { return x.id === lcId; });
    if (p && typeof showLcSlide === 'function') showLcSlide(p);
  });
}

/* 관광지 하이라이트 핀 — 타원형 pill */
function _makeNpPin(color, icon, name, onClickFn) {
  var wrap = document.createElement('div');
  wrap.className = 'np-pin';

  var pillWrap = document.createElement('div');
  pillWrap.className = 'np-pill-wrap';
  if (onClickFn) {
    pillWrap.style.cursor = 'pointer';
    pillWrap.addEventListener('click', function (e) { e.stopPropagation(); onClickFn(); });
  }

  var ring1 = document.createElement('div');
  ring1.className = 'np-pill-ring';
  ring1.style.borderColor = color;

  var ring2 = document.createElement('div');
  ring2.className = 'np-pill-ring r2';
  ring2.style.borderColor = color;

  var pill = document.createElement('div');
  pill.className = 'np-pill';
  pill.style.background = color;

  var iconSpan = document.createElement('span');
  iconSpan.textContent = icon;
  iconSpan.style.fontSize = '14px';

  var nameSpan = document.createElement('span');
  nameSpan.textContent = name.length > 10 ? name.slice(0, 9) + '…' : name;
  nameSpan.style.fontSize = '11px';

  pill.appendChild(iconSpan);
  pill.appendChild(nameSpan);
  pillWrap.appendChild(ring1);
  pillWrap.appendChild(ring2);
  pillWrap.appendChild(pill);

  var tail = document.createElement('div');
  tail.className = 'np-tail';
  tail.style.borderTopColor = color;

  wrap.appendChild(pillWrap);
  wrap.appendChild(tail);
  return wrap;
}

/* 주차장 하이라이트 핀 — 색상(잔여 비율) + P배지 + 잔여 대수 */
function _makeNpParkPin(pkData, onClickFn) {
  /* 잔여 비율로 색상 결정 (parking.js의 pinColor 재현) */
  var color;
  if (!pkData.open || pkData.total <= 0) {
    color = '#9CA3AF';
  } else {
    var ratio = pkData.avail / pkData.total;
    color = ratio <= 0 ? '#EF4444' : 'hsl(' + Math.round(ratio * 118) + ',72%,42%)';
  }
  var countTxt = !pkData.open ? '미운영' : pkData.avail <= 0 ? '만차' : pkData.avail + '대';

  var wrap = document.createElement('div');
  wrap.className = 'np-pin';

  var pillWrap = document.createElement('div');
  pillWrap.className = 'np-pill-wrap';
  if (onClickFn) {
    pillWrap.style.cursor = 'pointer';
    pillWrap.addEventListener('click', function (e) { e.stopPropagation(); onClickFn(); });
  }

  var ring1 = document.createElement('div');
  ring1.className = 'np-pill-ring';
  ring1.style.borderColor = color;

  var ring2 = document.createElement('div');
  ring2.className = 'np-pill-ring r2';
  ring2.style.borderColor = color;

  var pill = document.createElement('div');
  pill.className = 'np-pill';
  pill.style.background = color;

  var badge = document.createElement('span');
  badge.style.cssText = 'font-size:16px;line-height:1;flex-shrink:0';
  badge.textContent = '🅿️';

  var countSpan = document.createElement('span');
  countSpan.className = 'np-count';   /* 그림자는 css/40-quiz.css 가 준다 — .pk-count 와 같은 값 */
  countSpan.style.cssText = 'font-size:12px;font-weight:900';
  countSpan.textContent = countTxt;

  pill.appendChild(badge);
  pill.appendChild(countSpan);
  pillWrap.appendChild(ring1);
  pillWrap.appendChild(ring2);
  pillWrap.appendChild(pill);

  var tail = document.createElement('div');
  tail.className = 'np-tail';
  tail.style.borderTopColor = color;

  wrap.appendChild(pillWrap);
  wrap.appendChild(tail);
  return wrap;
}

/* NP 모드 종료 + 관광지 슬라이드 복원 */
function exitNearestParkMode() {
  if (!_npMode) return;
  var cb = _npMode.onBack;
  _exitNpMode(false);
  _npRestoreCats();
  if (cb) setTimeout(cb, 120);
}

/* NP 모드 오버레이·버튼만 정리.
 * ⚠ 여기서 칩을 되살리면 안 된다 — setFilter()·resetMapPage() 가 '새 필터를 켜기
 *   직전' 과 '전부 끄는 중' 에 부르는 자리다. 옛 칩이 되살아나면 서로 싸운다. */
function exitNpModeOnly() { _exitNpMode(false); }

/* 지도 탭을 벗어날 때(js/nav.js go). 나가면서 칩을 원래대로 돌려놔야
 * 돌아왔을 때 빈 지도가 아니다. */
function exitNpModeLeavingMap() {
  if (!_npMode) return;
  _exitNpMode(false);
  _npRestoreCats();
}

function _exitNpMode(restoreLayer) {
  if (!_npMode) return;
  if (_npMode.touristOv) _npMode.touristOv.setMap(null);
  if (_npMode.parkOv)    _npMode.parkOv.setMap(null);
  if (_npMode.backBtn && _npMode.backBtn.parentNode) {
    _npMode.backBtn.parentNode.removeChild(_npMode.backBtn);
  }
  _npMode = null;
  if (restoreLayer) setTouristVisible(true);
}

function closePlaceSlide() {
  document.getElementById('place-slide').classList.remove('open');
  document.getElementById('map-dim').classList.remove('show');
  /* 관광지·주차장·편의시설·지역화폐 중 무엇이 선택돼 있든 전부 해제된다.
   * 예전에는 여기서 관광지 강조만 지워서, 주차장 핀을 고르고 카드를 닫으면
   * 주차장 핀이 커진 채로 남았다. */
  clearSelectedPin();
}

/* ── 모든 핀 숨김 (필터 없음 상태) ── */
function clearFilter() {
  Object.keys(overlayMap).forEach(function (id) {
    overlayMap[id].setMap(null);
  });
  setTouristVisible(false);
  if (typeof setParkingVisible  === 'function') setParkingVisible(false);
  if (typeof updateParkingCount === 'function') updateParkingCount();
  if (typeof setLcVisible       === 'function') setLcVisible(false);
  if (typeof hideAllConv        === 'function') hideAllConv();
  document.querySelectorAll('#map-chips .chip').forEach(function (c) {
    c.classList.remove('active');
  });
}

/* ── 주차장 독립 토글 (다른 필터와 동시 선택 가능) ── */
function toggleParking() {
  /* NP 모드 오버레이와 ← 버튼이 남아 새 필터 위에 겹치는 것을 막는다. */
  if (typeof exitNpModeOnly === 'function') exitNpModeOnly();
  closePlaceSlide();
  var chip = document.querySelector('.chip[data-cat="parking"]');
  var nowActive = !!(chip && !chip.classList.contains('active'));
  if (chip) chip.classList.toggle('active');
  if (typeof setParkingVisible  === 'function') setParkingVisible(nowActive);
  if (typeof updateParkingCount === 'function') updateParkingCount();
}

/* 주차장 강제 활성화 (goMapPark 등에서 사용) */
function activateParking() {
  var chip = document.querySelector('.chip[data-cat="parking"]');
  if (chip && !chip.classList.contains('active')) toggleParking();
}

/* ── 지역화폐 강제 활성화 ────────────────────────────────────────────────
 * setFilter 는 토글이다. '이 가맹점을 지도에서 보여줘' 라는 요청(즐겨찾기·
 * 소식 목록·축제 상세)에 그걸 그대로 부르면, 칩이 이미 켜져 있을 때 오히려
 * 레이어를 **꺼서** 핀 하나 없는 빈 지도를 보여준다.
 * 업종 필터도 함께 푼다 — '카페'가 걸린 채로 편의점을 열면 그 자리로 확대만
 * 되고 핀은 안 그려져, 목록에서 고른 곳이 왜 없는지 알 방법이 없다. */
function activateLc() {
  var chip = document.querySelector('#map-chips .chip[data-cat="localcurrency"]');
  if (!chip || !chip.classList.contains('active')) { setFilter('localcurrency'); return; }
  if (typeof lcFilter !== 'undefined' && lcFilter !== 'all' && typeof setLcFilter === 'function') {
    setLcFilter('all');
  }
}

/* ── 카테고리 필터 (같은 칩 재클릭 시 토글 해제, 주차장 칩은 독립 유지) ── */
function setFilter(cat) {
  if (cat === 'parking') { toggleParking(); return; }

  /* NP 모드 중 칩을 누르면 하이라이트 핀 2개와 ← 버튼이 새 필터 위에 남는다. */
  if (typeof exitNpModeOnly === 'function') exitNpModeOnly();
  closePlaceSlide();

  /* LC 업종 필터 바 항상 초기화 — localcurrency 활성화 시 마지막에 다시 표시 */
  var _lcFBar = document.getElementById('lc-filter-bar');
  if (_lcFBar) { _lcFBar.style.display = 'none'; }
  if (typeof lcFilter !== 'undefined') { lcFilter = 'all'; }
  document.querySelectorAll('.lc-fchip').forEach(function(c) {
    c.classList.toggle('active', c.dataset.lcat === 'all');
  });

  /* 주차장 칩 상태 보존 */
  var parkChip    = document.querySelector('.chip[data-cat="parking"]');
  var parkActive  = !!(parkChip && parkChip.classList.contains('active'));

  var chip      = document.querySelector('#map-chips .chip[data-cat="' + cat + '"]');
  var wasActive = chip && chip.classList.contains('active');

  /* 주차장 제외 모든 칩 비활성화 */
  /* [data-gu] 제외 — 지역 칩은 다른 축이다. 카테고리를 바꾼다고 보고 있던 동네가
   * 풀리면 안 된다(2026-08-26). */
  document.querySelectorAll('#map-chips .chip:not([data-cat="parking"]):not([data-gu])').forEach(function (c) {
    c.classList.remove('active');
  });

  /* overlayMap은 tourist 제외 핀만 담고 있음 — tourist 체크 불필요 */
  function _hideOverlays() {
    Object.keys(overlayMap).forEach(function (id) { overlayMap[id].setMap(null); });
  }

  if (wasActive) {
    /* 같은 칩 재클릭 → 일반 필터 해제, 주차장 상태 복원 */
    _hideOverlays();
    setTouristVisible(false);
    if (typeof setLcVisible  === 'function') setLcVisible(false);
    if (typeof setRsVisible  === 'function') setRsVisible(false);
    if (typeof hideAllConv   === 'function') hideAllConv();
    if (typeof setParkingVisible  === 'function') setParkingVisible(parkActive);
    if (typeof updateParkingCount === 'function') updateParkingCount();
    return;
  }

  /* 새 칩 활성화 */
  if (chip) chip.classList.add('active');

  /* 편의정보 카테고리: 핀 숨기고 conv 오버레이 표시 */
  var isConvCat = CONV_CATS.indexOf(cat) !== -1;

  if (typeof hideAllConv === 'function') hideAllConv();

  if (isConvCat) {
    _hideOverlays();
    setTouristVisible(false);
    if (typeof setLcVisible === 'function') setLcVisible(false);
    if (typeof setRsVisible === 'function') setRsVisible(false);
    if (typeof showConvCat  === 'function') showConvCat(cat);
    if (typeof setParkingVisible  === 'function') setParkingVisible(parkActive);
    if (typeof updateParkingCount === 'function') updateParkingCount();
    return;
  }

  /* 카테고리별 핀 표시/숨김 — overlayCatMap으로 PLACES 재순회 없이 처리 */
  Object.keys(overlayMap).forEach(function (id) {
    overlayMap[id].setMap(
      (cat === 'all' || overlayCatMap[id] === cat) ? kakaoMap : null
    );
  });

  setTouristVisible(cat === 'all' || cat === 'tourist');
  /* '전체'에 가맹점을 포함하면 칩 한 번에 4.2MB 다운로드가 시작된다.
   * 27,374건은 전용 칩으로 명시 선택했을 때만 로드한다. */
  if (typeof setLcVisible === 'function') setLcVisible(cat === 'localcurrency');
  /* 음식점 3,754건은 지도에서 뺐다 (2026-08-26 사용자 결정).
     js/restaurants.js 를 index.html 에서 로드하지 않으므로 setRsVisible 은 없다.
     아래 두 줄은 그 모듈이 남아 있던 흔적을 끄는 안전장치다 —
     다시 붙일 때는 이 줄과 지도 칩, check_data.py PRINTED 항목을 함께 되살려라. */
  if (typeof setRsVisible === 'function') setRsVisible(false);
  if (typeof setParkingVisible  === 'function') setParkingVisible(parkActive);
  if (typeof updateParkingCount === 'function') updateParkingCount();

  /* LC 칩 단독 선택 시에만 업종 필터 바 표시 */
  if (cat === 'localcurrency' && _lcFBar) {
    _lcFBar.style.display = 'block';
    setTimeout(function () {
      if (typeof updateLcArrows === 'function') updateLcArrows();
    }, 50);
  }

  var targets = cat === 'all' ? PLACES : PLACES.filter(function (p) { return p.category === cat; });
  fitPlaces(targets);
}

/* ── 반경 500m 지역화폐 가맹점 ── */
function findNearby(lat, lng, _retried) {
  /* lcData 는 4.2MB 라 지역화폐 칩을 켠 적이 있어야 채워진다.
   * 그전에는 여기가 빈 배열을 훑고 '반경 500m 안에는 없어요' 라고 단정했다 —
   * 동탄 한복판에서도 그랬고, 나중에 소식 탭에서 가맹점을 한 번 열고 오면
   * 같은 버튼이 같은 자리에서 'N곳을 찾았어요' 로 말을 바꿨다.
   * 없다고 말하기 전에 받아 온다. _retried 는 로드 실패 시 무한 재귀 방지용. */
  if ((typeof lcData === 'undefined' || !lcData.length) && !_retried
      && typeof _loadLcData === 'function') {
    _loadLcData(function () {
      /* ⚠ 4.2MB 를 받는 사이 사용자가 다른 탭으로 갔을 수 있다. 그대로 재진입하면
       * 소식·홈 화면에 '반경 500m 내 가맹점 N곳' 토스트가 뜨고(#toast 는 .page 바깥),
       * closePlaceSlide + activateLc(= setFilter('localcurrency')) 까지 몰래 돌아
       * 보고 있던 카드가 닫히고 켠 적 없는 지역화폐 칩이 켜진 채 남았다.
       * .page.active 가 현재 화면의 유일한 진실 소스다(js/nav.js go).
       * goMapNearbyLc(js/mapnav.js)는 go('map') 뒤 350ms 에 부르므로 안 걸린다. */
      var mapPage = document.getElementById('page-map');
      if (!mapPage || !mapPage.classList.contains('active')) return;
      findNearby(lat, lng, true);
    });
    return;
  }
  var pool = (typeof lcData !== 'undefined' && lcData.length)
    ? lcData
    : PLACES.filter(function (p) { return p.category === 'localcurrency'; });

  /* ⚠ 여기가 비었다는 것은 '가맹점이 없다'가 아니라 '못 불러왔다'는 뜻이다.
   * _loadLcData(js/ui.js)의 catch 가 성공과 똑같이 콜백을 부르기 때문에,
   * 4.2MB fetch 가 실패하면 위 지연로드가 _retried=true 로 되돌아와 빈 배열을
   * 훑고 '반경 500m 안에는 없어요'라고 거짓 단정했다 — 동탄 한복판처럼 실제로는
   * 수백 곳(실측 311곳)이 있는 자리에서도 똑같이 떴다.
   * PLACES 의 localcurrency 폴백은 실측 0건이라 이 분기는 로드 실패와 같은 뜻이다.
   * (2026-08-27 배포 Claude 지적 — 전날 내가 붙인 지연로드가 남긴 구멍이다) */
  if (!pool.length) {
    closePlaceSlide();
    showToast('가맹점 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return;
  }

  var cosLat = Math.cos(lat * Math.PI / 180);
  var nearby = pool.filter(function (p) {
    return Math.hypot(p.lat - lat, (p.lng - lng) * cosLat) <= 0.0045;
  });
  closePlaceSlide();
  if (!nearby.length) {
    showToast('반경 500m 안에는 지역화폐 가맹점이 없어요.');
    return;
  }
  activateLc();
  showToast('반경 500m 내 가맹점 ' + nearby.length + '곳을 찾았어요');
}

/* ── 길찾기 ── */
function openRoute(lat, lng, name) {
  window.open(
    'https://map.kakao.com/link/to/' + encodeURIComponent(name) + ',' + lat + ',' + lng,
    '_blank'
  );
}

/* ── 내 위치 버튼 ── */
var myLocationOverlay = null;

function setupMyLocation() {
  document.getElementById('btn-mylocation').addEventListener('click', function () {
    if (!navigator.geolocation) {
      showToast('이 브라우저는 위치 정보를 지원하지 않아요.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        kakaoMap.setCenter(latlng);
        kakaoMap.setLevel(5);
        showMyLocationDot(latlng);
      },
      function () { showToast('위치 권한을 허용해 주세요.'); }
    );
  });
}

function showMyLocationDot(latlng) {
  /* 이전 내 위치 마커 제거 */
  if (myLocationOverlay) {
    myLocationOverlay.setMap(null);
    myLocationOverlay = null;
  }

  var dot = document.createElement('div');
  dot.style.cssText = [
    'position:relative',
    'width:14px',
    'height:14px',
  ].join(';');

  /* 외부 pulse 링 */
  var ring = document.createElement('div');
  ring.style.cssText = [
    'position:absolute',
    'inset:-6px',
    'border-radius:50%',
    'background:rgba(239,68,68,0.22)',
    'animation:my-loc-pulse 1.8s ease-out infinite',
  ].join(';');

  /* 빨간 점 본체 */
  var core = document.createElement('div');
  core.style.cssText = [
    'width:14px',
    'height:14px',
    'border-radius:50%',
    'background:#EF4444',
    'border:2.5px solid #fff',
    'box-shadow:0 1px 6px rgba(239,68,68,0.55)',
    'position:relative',
    'z-index:1',
  ].join(';');

  dot.appendChild(ring);
  dot.appendChild(core);

  /* pulse 키프레임이 없으면 한 번만 주입 */
  if (!document.getElementById('my-loc-style')) {
    var style = document.createElement('style');
    style.id = 'my-loc-style';
    style.textContent =
      '@keyframes my-loc-pulse{' +
      '0%{transform:scale(0.6);opacity:0.9}' +
      '70%{transform:scale(1.8);opacity:0}' +
      '100%{transform:scale(1.8);opacity:0}}';
    document.head.appendChild(style);
  }

  myLocationOverlay = new kakao.maps.CustomOverlay({
    position: latlng,
    content:  dot,
    yAnchor:  0.5,
    zIndex:   50,
  });
  myLocationOverlay.setMap(kakaoMap);
}

/* ── 커스텀 줌 슬라이더 ── */
function setupZoomSlider() {
  var slider  = document.getElementById('zoom-track');
  var btnIn   = document.getElementById('zoom-in-btn');
  var btnOut  = document.getElementById('zoom-out-btn');
  if (!slider || !kakaoMap) return;

  function levelToSlider(level) { return 15 - level; }
  function sliderToLevel(val)   { return 15 - parseInt(val); }

  slider.value = levelToSlider(kakaoMap.getLevel());

  slider.addEventListener('input', function () {
    kakaoMap.setLevel(sliderToLevel(this.value));
  });

  btnIn.addEventListener('click', function () {
    kakaoMap.setLevel(Math.max(1, kakaoMap.getLevel() - 1));
  });

  btnOut.addEventListener('click', function () {
    kakaoMap.setLevel(Math.min(14, kakaoMap.getLevel() + 1));
  });

  kakao.maps.event.addListener(kakaoMap, 'zoom_changed', function () {
    var sl = document.getElementById('zoom-track');
    if (sl) sl.value = levelToSlider(kakaoMap.getLevel());
  });
}

/* ══════════════════════════════════════════════════
   지도 탭 재클릭 리셋 (2026-08-25)
   첫 진입 화면의 정의 = 중심 HWASEONG(이 파일의 const HWASEONG) / 레벨 9(initMap 의 level: 9) /
   핀·칩·슬라이드·배지 전부 없음 (initMap 의 "최초 진입 시 아무것도 표시하지 않음" 주석).

   절대 하지 않는 것:
     · mapReady=false 로 되돌려 initMap() 재실행  → 지도 인스턴스 이중 생성, 오버레이 누수,
       리스너(resize/zoom_changed/idle/mylocation) 전량 중복 등록
       (initMap 의 addListener 들 · js/parking.js 와 js/localcurrency.js 의 'idle' 등록)
     · setFilter() 호출  → 토글이라 이미 켜진 칩에 부르면 '해제'가 되고,
       setFilter('all') 은 첫 진입에 없는 '전체' 칩을 켜고 fitPlaces 로 카메라까지 옮긴다 (setFilter 본문)
     · exitNearestParkMode()  → 120ms 뒤 onBack 콜백이 방금 지운 칩·레이어를 되살린다(_npMode 의 onBack, _goNPCore 참조)
     · localStorage 삭제  → 'hsida_favs'(사용자 데이터) / 'hwaseong_conv_*'(지오코딩 캐시, 재실행 시 수십 초)
     · lcData=[] / CONV_STATUS='idle'  → 4.2MB 재다운로드, 수백 건 Geocoder 재요청
     · #map-loader 되살리기  → initMap 첫 실행에서 영구 remove 됐다.
       '초기화'는 로딩 화면 재현이 아니다.
══════════════════════════════════════════════════ */
var _mapResetGen = 0;

function resetMapPage() {
  /* 지도 인스턴스가 없어도(SDK 로드 실패·지연) DOM 상태는 반드시 되돌린다.
   * 칩·슬라이드·배지·필터바는 카카오 SDK 없이도 클릭되고 클래스가 붙기 때문이다.
   * 여기서 통째로 return 하면 'SDK 가 안 뜬 환경에서는 재클릭이 아무것도 안 하는' 상태가 된다.
   * 지도 객체가 필요한 작업(오버레이 setMap·카메라)만 아래에서 개별로 가드한다. */
  var hasMap = !!(mapReady && kakaoMap);

  /* ① NP 모드. #np-back-btn 은 _goNPCore 가 document.body 에 append 해서 #page-map 밖에 살고
   *    position:fixed z-index:190(css/40-quiz.css 의 #np-back-btn) 이라 페이지 클래스로는 안 사라진다.
   *    go() 의 정리(js/nav.js)는 page!=='map' 일 때만 돌아서 재클릭은 지금 전혀 커버되지 않는다. */
  if (typeof exitNpModeOnly === 'function') exitNpModeOnly();
  _npPrevCats = [];                     /* 전부 끄는 자리다 — 되살릴 것도 없다 */
  _npPrevView = null;                   /* 아래 ⑨ 가 홈 화면 카메라로 확정한다 */

  /* ② 슬라이드 카드 + 딤 + 선택 핀 강조 + selectedId=null (closePlaceSlide 본문) */
  if (typeof closePlaceSlide === 'function') closePlaceSlide();

  /* ③ 레이어 전부 끄기 — 반드시 카메라(⑨)보다 '먼저'.
   *    setCenter/setLevel 은 idle 을 쏘고, 거기 붙은 3개 핸들러
   *    (initMap 의 idle · js/parking.js 의 idle · js/localcurrency.js 의 onLcMapIdle)는
   *    visible 플래그로만 가드된다 — 순서를 뒤집으면 옛 레이어가 다시 그려진다.
   *    객체(핀 인스턴스)는 유지하고 '표시'만 끈다. buildOverlays() 를 다시 부르면 핀이 이중 생성된다. */
  if (hasMap) {
    Object.keys(overlayMap).forEach(function (id) {
      overlayMap[id].setMap(null);
      overlayMap[id].setZIndex(1);
      if (overlayEls[id]) overlayEls[id].classList.remove('selected');
    });
    setTouristVisible(false);                                          /* _tkTimer clearTimeout 포함 */
    if (typeof setParkingVisible === 'function') setParkingVisible(false);
    if (typeof setLcVisible      === 'function') setLcVisible(false);  /* clearLcDisplay 만 — lcData 보존 */
    if (typeof hideAllConv       === 'function') hideAllConv();        /* setMap(null) 만 — 캐시 보존 */
  }
  /* 지오코딩이 'loading' 중이어도 취소할 필요 없다 — 완료 콜백이 _isConvCatActive(cat)
   * 로 칩 상태를 다시 확인하므로(js/conv_map.js 의 _isConvCatActive), ④에서 칩을 끄면 화면에 튀어나오지 않는다. */

  /* ④ 칩 전부 비활성. 첫 진입 마크업엔 active 칩이 하나도 없다(index.html 의 #map-chips).
   *    updateParkingCount() 는 반드시 이 '뒤'에 — 칩 active 를 보고 배지 display 를 정한다(js/parking.js 의 updateParkingCount).
   *    (clearFilter() 는 그 호출을 칩 제거보다 '먼저' 해서 배지가 남는다. 복붙 금지.) */
  document.querySelectorAll('#map-chips .chip').forEach(function (c) { c.classList.remove('active'); });
  if (typeof updateParkingCount === 'function') updateParkingCount();
  /* 구 칩과 짝인 _guActive 도 함께. 안 되돌리면 칩은 꺼졌는데 상태가 남아
   * 다음 '○○구 전체 보기' 가 '해제'로 먹힌다 — js/district.js resetGuView 주석이
   * 선언한 계약인데 실제로는 여기서 부르지 않고 있었다. */
  if (typeof resetGuView === 'function') resetGuView();

  /* ④-b 지도 검색창. 홈은 resetHomePage 가 검색어까지 지우는데 지도만 빠져 있어,
   *     '초기화했다'는 신호와 달리 옛 검색어와 ✕ 가 남고 다음 타이핑이 뒤에 붙었다. */
  if (typeof clearHomeSearch === 'function') clearHomeSearch('map');

  /* ⑤ 지역화폐 업종 필터 바. CSS 기본은 display:none(css/20-map.css 의 #lc-filter-bar)인데
   *    setFilter 가 인라인 block 을 박는다 → 인라인이 CSS 를 이긴다.
   *    setFilter 의 초기화 블록과 동일하게 처리한다. */
  var _lcBar = document.getElementById('lc-filter-bar');
  if (_lcBar) _lcBar.style.display = 'none';
  if (typeof lcFilter !== 'undefined') lcFilter = 'all';
  document.querySelectorAll('.lc-fchip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.lcat === 'all');
  });
  var _lcScroll = document.getElementById('lc-filter-scroll');
  if (_lcScroll) _lcScroll.scrollLeft = 0;
  if (typeof updateLcArrows === 'function') updateLcArrows();

  /* ⑥ 상단 칩 바 가로 스크롤. js/nav.js 의 go() 는 updateChipArrows 만 부르고
   *    scrollLeft 는 안 되돌려서 '제부도 숙박'까지 밀어둔 상태가 남는다. */
  var _chips = document.getElementById('map-chips');
  if (_chips) _chips.scrollLeft = 0;
  if (typeof updateChipArrows === 'function') updateChipArrows();

  /* ⑦ GPS 로 찍은 빨간 '내 위치' 점. 첫 진입은 null.
   *    주입된 <style id="my-loc-style">(_hideOverlays 위에서 주입)은 보이지 않는 CSS 정의라 지우지 않는다. */
  if (hasMap && myLocationOverlay) { myLocationOverlay.setMap(null); myLocationOverlay = null; }

  /* ⑧ '가까운 300곳만 표시' 토스트 dedupe (js/localcurrency.js 의 _lcCapNotifiedLevel) */
  if (typeof _lcCapNotifiedLevel !== 'undefined') _lcCapNotifiedLevel = null;

  /* ⑨ 마지막에 카메라. 재클릭 직전 동작이 걸어둔 카메라 타이머가 뒤늦게 도착해 화면을 옮길 수 있다:
   *    _panPinAboveSlide 의 panBy 50ms / fitPlaces 의 setLevel 150ms
   *    / showTkClusters 의 클러스터 panTo 180ms / _goNPCore 의 setBounds 320ms + 중첩 200ms.
   *    최대 ~520ms 이므로 550ms 뒤 한 번 더 확정한다. 그 사이 사용자가 조작했으면 건드리지 않는다. */
  if (!hasMap) return;                  /* 여기부터는 지도 객체가 있어야 의미가 있다 */
  var _gen = ++_mapResetGen;
  _applyMapHomeView();
  setTimeout(function () {
    if (_gen !== _mapResetGen) return;                                     /* 그 사이 또 리셋됨 */
    if (document.querySelector('#map-chips .chip.active')) return;         /* 사용자가 칩을 눌렀다 */
    var sl = document.getElementById('place-slide');
    if (sl && sl.classList.contains('open')) return;                       /* 슬라이드를 열었다 */
    _applyMapHomeView();
  }, 550);
}

function _applyMapHomeView() {
  if (!kakaoMap || typeof kakao === 'undefined') return;
  kakaoMap.setCenter(new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng));
  kakaoMap.setLevel(9);
  /* 슬라이더 동기화. setLevel 이 zoom_changed 를 쏘면 setupZoomSlider 의 zoom_changed 리스너가 알아서 맞추지만,
   * 이미 레벨 9 였으면 이벤트가 안 뜬다. 명시 대입이 확실하다.
   * 식은 setupZoomSlider 의 levelToSlider() 와 같다 — 15 - level. */
  var z = document.getElementById('zoom-track');
  if (z) z.value = 15 - kakaoMap.getLevel();
}
