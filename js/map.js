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
var CONV_CATS = ['mobeom','touristrest','hotel','camping','temple','jebu'];

/* ── 실제 컨테이너 너비 계산 (max-width:480px 반영) ── */
function mapW() { return Math.min(window.innerWidth, 480); }
function mapH() { return window.innerHeight - 46; }

/* ── 지도 초기화 ── */
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
    showMapError('카카오맵을 불러올 수 없습니다.<br>페이지를 새로고침 해주세요.');
    return;
  }

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
    'padding:10px 20px;font-size:13px;cursor:pointer">새로고침</button></div>';
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
  PLACES.forEach(function (p) {
    if (p.category === 'tourist') return;

    var color = CAT_COLOR[p.category] || '#6B7280';
    var cfg   = CATEGORY_CONFIG[p.category];
    var label = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;
    var wrap  = _mkCmPin(color, cfg.emoji, label);

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
      position: new kakao.maps.LatLng(p.lat, p.lng),
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
  var cfg   = CATEGORY_CONFIG.tourist;

  PLACES.forEach(function (p) {
    if (p.category !== 'tourist') return;
    if (p.lat < sw.getLat() || p.lat > ne.getLat()) return;
    if (p.lng < sw.getLng() || p.lng > ne.getLng()) return;

    var label = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;
    var wrap  = _mkCmPin(color, cfg.emoji, label);

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

/* ── 핀 클릭 ── */
function onPinClick(id) {
  var place = PLACES.find(function (p) { return p.id === id; });
  if (!place) return;

  /* 이전 선택 해제 */
  if (selectedId !== null) {
    if (overlayEls[selectedId])       overlayEls[selectedId].classList.remove('selected');
    if (overlayMap[selectedId])       overlayMap[selectedId].setZIndex(1);
    var prevTk = touristOverlayMap[selectedId];
    if (prevTk) { prevTk.el.classList.remove('selected'); prevTk.overlay.setZIndex(1); }
  }
  selectedId = id;
  if (overlayEls[id]) overlayEls[id].classList.add('selected');
  if (overlayMap[id]) overlayMap[id].setZIndex(200);
  var curTk = touristOverlayMap[id];
  if (curTk) { curTk.el.classList.add('selected'); curTk.overlay.setZIndex(200); }

  /* 슬라이드 카드 표시 */
  showPlaceSlide(place);
  _panPinAboveSlide(place.lat, place.lng, 50);
}

/* 핀을 슬라이드 카드 위 가시 영역 중앙으로 이동
 * setCenter(즉시) 후 50ms 대기 → panBy (참고 레포 패턴) */
function _panPinAboveSlide(lat, lng, delay) {
  if (!kakaoMap || !lat || !lng) return;
  kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
  setTimeout(function () {
    var h        = mapH();
    var slideH   = Math.min(h * 0.6, 420);
    var visibleH = h - slideH;
    var targetY  = visibleH * 0.40;
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
  var cfg = CATEGORY_CONFIG[place.category];
  var src = 'assets/images/places/' + place.name + '.jpg';

  if (place.category === 'tourist') {
    /* 이미지 있으면 커버, 없으면 그라데이션 + 🏞️ */
    return '<div style="width:100%;height:120px;border-radius:12px;overflow:hidden;margin-bottom:12px;' +
      'position:relative;background:linear-gradient(135deg,#FFF7ED,#FFEDD5)">' +
      '<img src="' + src + '" alt="" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" ' +
      'onerror="this.style.display=\'none\'">' +
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:40px;pointer-events:none">🏞️</div>' +
      '</div>';
  }

  return '<div style="width:100%;height:160px;border-radius:12px;overflow:hidden;margin-bottom:12px;background:' + cfg.bg + ';display:flex;align-items:center;justify-content:center;">' +
    '<img src="' + src + '" alt="' + place.name + '" ' +
    'style="width:100%;height:100%;object-fit:cover;" ' +
    'onerror="this.parentNode.innerHTML=\'<span style=\\\"font-size:36px\\\">' + cfg.emoji + '</span>\'">' +
    '</div>';
}

/* ── 장소 슬라이드 카드 ── */
function showPlaceSlide(place) {
  var cfg       = CATEGORY_CONFIG[place.category];
  var color     = CAT_COLOR[place.category];
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
  var safeName = place.name.replace(/'/g, '');
  var routeBtn = '<button class="sl-btn" style="' +
    (isTourist ? 'background:' + color + ';color:#fff;border-color:' + color : '') +
    '" onclick="openRoute(' + place.lat + ',' + place.lng + ',\'' + safeName + '\')">🗺 길찾기</button>';

  var actionsHtml;
  if (isTourist) {
    actionsHtml =
      '<button class="sl-btn" onclick="window.open(\'https://map.kakao.com/?q=' +
      encodeURIComponent(place.name) + '\',\'_blank\')">🔍 카카오지도</button>' +
      routeBtn +
      '<button class="sl-btn" style="background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" ' +
      'onclick="goNearestParking(' + place.lat + ',' + place.lng + ',' + place.id + ')">🅿 가장 가까운 공영주차장 찾기</button>';
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
    (place.status === 'ongoing' ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : '') +
    '</div>' +
    '<div class="sl-name">' + place.name + '</div>' +
    ratingHtml +
    '<div class="sl-addr" data-addr="' + (place.address || '').replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + (place.address || '') + '</div>' +
    (place.date ? '<div class="sl-date">📅 ' + place.date + '</div>' : '') +
    descHtml +
    '<div class="sl-tags">' +
    (place.tags || []).map(function (t) { return '<span class="sl-tag" ' + tagStyle + '>' + t + '</span>'; }).join('') +
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

/* ── 공통 핵심 로직 ── */
function _goNPCore(placeLat, placeLng, label, icon, onBack) {
  if (typeof parkingData === 'undefined' || !parkingData.length) {
    if (typeof showToast === 'function') showToast('주차장 정보를 불러오는 중입니다.');
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
    if (typeof showToast === 'function') showToast('주변 공영주차장을 찾을 수 없습니다.');
    return;
  }

  /* 이전 NP 모드 정리 */
  _exitNpMode(false);
  closePlaceSlide();

  /* 모든 레이어 숨김 */
  setTouristVisible(false);
  if (typeof setLcVisible      === 'function') setLcVisible(false);
  if (typeof hideAllConv       === 'function') hideAllConv();
  if (typeof setParkingVisible === 'function') setParkingVisible(false);
  document.querySelectorAll('#map-chips .chip').forEach(function (c) { c.classList.remove('active'); });
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
  document.body.appendChild(backBtn);

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
    function () { setTouristVisible(true); setTimeout(function () { onPinClick(placeId); }, 60); });
}

/* ── 편의정보(conv) 핀에서 호출 ── */
function goNearestParkingConv(placeLat, placeLng, convCat, convName) {
  var cfg = (typeof CONV_CAT_CFG !== 'undefined') && CONV_CAT_CFG[convCat];
  var icon = cfg ? cfg.emoji : '🍽';
  _goNPCore(placeLat, placeLng, convName, icon, function () {
    var p = ((typeof CONV_PLACES !== 'undefined' && CONV_PLACES[convCat]) || [])
      .find(function (x) { return x.name === convName; });
    if (p && typeof _showConvSlide === 'function') _showConvSlide(p);
  });
}

/* ── 지역화폐 가맹점 핀에서 호출 ── */
function goNearestParkingLc(placeLat, placeLng, lcName) {
  _goNPCore(placeLat, placeLng, lcName, '🏪', function () {
    var p = (typeof lcData !== 'undefined' ? lcData : [])
      .find(function (x) { return x.n === lcName; });
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
  if (cb) setTimeout(cb, 120);
}

/* NP 모드 오버레이·버튼만 정리 */
function exitNpModeOnly() { _exitNpMode(false); }

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
  if (selectedId !== null) {
    if (overlayEls[selectedId]) overlayEls[selectedId].classList.remove('selected');
    if (overlayMap[selectedId]) overlayMap[selectedId].setZIndex(1);
    var tk = touristOverlayMap[selectedId];
    if (tk) { tk.el.classList.remove('selected'); tk.overlay.setZIndex(1); }
    selectedId = null;
  }
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

/* ── 카테고리 필터 (같은 칩 재클릭 시 토글 해제, 주차장 칩은 독립 유지) ── */
function setFilter(cat) {
  if (cat === 'parking') { toggleParking(); return; }

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
  document.querySelectorAll('#map-chips .chip:not([data-cat="parking"])').forEach(function (c) {
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
  if (typeof setLcVisible === 'function') setLcVisible(cat === 'all' || cat === 'localcurrency');
  if (typeof setParkingVisible  === 'function') setParkingVisible(parkActive || cat === 'all');
  if (typeof updateParkingCount === 'function') updateParkingCount();

  /* LC 칩 단독 선택 시에만 업종 필터 바 표시 */
  if (cat === 'localcurrency' && _lcFBar) _lcFBar.style.display = 'block';

  var targets = cat === 'all' ? PLACES : PLACES.filter(function (p) { return p.category === cat; });
  fitPlaces(targets);
}

/* ── 반경 500m 지역화폐 가맹점 ── */
function findNearby(lat, lng) {
  /* lcData: localcurrency.js에서 로드한 배열 */
  var pool = (typeof lcData !== 'undefined' && lcData.length)
    ? lcData
    : PLACES.filter(function (p) { return p.category === 'localcurrency'; });

  var cosLat = Math.cos(lat * Math.PI / 180);
  var nearby = pool.filter(function (p) {
    return Math.hypot(p.lat - lat, (p.lng - lng) * cosLat) <= 0.0045;
  });
  closePlaceSlide();
  if (!nearby.length) {
    showToast('반경 500m 내 지역화폐 가맹점이 없습니다.');
    return;
  }
  /* 이미 활성화된 경우 toggle 방지 */
  var lcChip = document.querySelector('#map-chips .chip[data-cat="localcurrency"]');
  if (!lcChip || !lcChip.classList.contains('active')) setFilter('localcurrency');
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
      showToast('위치 정보를 지원하지 않는 브라우저입니다.');
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

