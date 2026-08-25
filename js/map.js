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
    if (p.category === 'tourist') return;

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

/* ── 지역화폐 가맹점 핀에서 호출 ── */
function goNearestParkingLc(placeLat, placeLng, lcName) {
  _goNPCore(placeLat, placeLng, lcName, '🏪', function () {
    var chip = document.querySelector('#map-chips .chip[data-cat="localcurrency"]');
    if (chip) chip.classList.add('active');
    if (typeof setLcVisible === 'function') setLcVisible(true);
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
  /* '전체'에 가맹점을 포함하면 칩 한 번에 4.2MB 다운로드가 시작된다.
   * 27,374건은 전용 칩으로 명시 선택했을 때만 로드한다. */
  if (typeof setLcVisible === 'function') setLcVisible(cat === 'localcurrency');
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

/* ══════════════════════════════════════════════════
   지도 탭 재클릭 리셋 (2026-08-25)
   첫 진입 화면의 정의 = 중심 HWASEONG(js/map.js:22) / 레벨 9(js/map.js:73) /
   핀·칩·슬라이드·배지 전부 없음 (js/map.js:83 "최초 진입 시 아무것도 표시하지 않음").

   절대 하지 않는 것:
     · mapReady=false 로 되돌려 initMap() 재실행  → 지도 인스턴스 이중 생성, 오버레이 누수,
       리스너(resize/zoom_changed/idle/mylocation) 전량 중복 등록 (js/map.js:71-103, parking.js:23, localcurrency.js:35)
     · setFilter() 호출  → 토글이라 이미 켜진 칩에 부르면 '해제'가 되고(js/map.js:852-861),
       setFilter('all') 은 첫 진입에 없는 '전체' 칩을 켜고 fitPlaces 로 카메라까지 옮긴다(:864,:903-904)
     · exitNearestParkMode()  → 120ms 뒤 onBack 콜백이 방금 지운 칩·레이어를 되살린다(js/map.js:753-758, 612-617)
     · localStorage 삭제  → 'hsida_favs'(사용자 데이터) / 'hwaseong_conv_v5_*'(지오코딩 캐시, 재실행 시 수십 초)
     · lcData=[] / CONV_STATUS='idle'  → 4.2MB 재다운로드, 수백 건 Geocoder 재요청
     · #map-loader 되살리기  → initMap 첫 실행에서 영구 remove 됐다(js/map.js:63-64).
       '초기화'는 로딩 화면 재현이 아니다.
══════════════════════════════════════════════════ */
var _mapResetGen = 0;

function resetMapPage() {
  /* 지도 인스턴스가 없어도(SDK 로드 실패·지연) DOM 상태는 반드시 되돌린다.
   * 칩·슬라이드·배지·필터바는 카카오 SDK 없이도 클릭되고 클래스가 붙기 때문이다.
   * 여기서 통째로 return 하면 'SDK 가 안 뜬 환경에서는 재클릭이 아무것도 안 하는' 상태가 된다.
   * 지도 객체가 필요한 작업(오버레이 setMap·카메라)만 아래에서 개별로 가드한다. */
  var hasMap = !!(mapReady && kakaoMap);

  /* ① NP 모드. #np-back-btn 은 document.body 에 append 되어(js/map.js:589) #page-map 밖에 살고
   *    position:fixed z-index:190(css/40-quiz.css:105-119) 이라 페이지 클래스로는 안 사라진다.
   *    go() 의 정리(js/nav.js:16)는 page!=='map' 일 때만 돌아서 재클릭은 지금 전혀 커버되지 않는다. */
  if (typeof exitNpModeOnly === 'function') exitNpModeOnly();

  /* ② 슬라이드 카드 + 딤 + 선택 핀 강조 + selectedId=null (js/map.js:774-784) */
  if (typeof closePlaceSlide === 'function') closePlaceSlide();

  /* ③ 레이어 전부 끄기 — 반드시 카메라(⑨)보다 '먼저'.
   *    setCenter/setLevel 은 idle 을 쏘고, 거기 붙은 3개 핸들러
   *    (js/map.js:85-87 / js/parking.js:23-28 / js/localcurrency.js:38-43)는
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
   * 로 칩 상태를 다시 확인하므로(js/conv_map.js:232), ④에서 칩을 끄면 화면에 튀어나오지 않는다. */

  /* ④ 칩 전부 비활성. 첫 진입 마크업엔 active 칩이 하나도 없다(index.html:308-318).
   *    updateParkingCount() 는 반드시 이 '뒤'에 — 칩 active 를 보고 배지 display 를 정한다(js/parking.js:351-352).
   *    (clearFilter()(js/map.js:787-799)는 :793 에서 칩 제거(:796)보다 먼저 불러 배지가 남는다. 복붙 금지.) */
  document.querySelectorAll('#map-chips .chip').forEach(function (c) { c.classList.remove('active'); });
  if (typeof updateParkingCount === 'function') updateParkingCount();

  /* ⑤ 지역화폐 업종 필터 바. CSS 기본은 display:none(css/20-map.css:62-65)인데
   *    setFilter 가 인라인 block 을 박는다(js/map.js:896-897) → 인라인이 CSS 를 이긴다.
   *    js/map.js:828-833 의 초기화 블록과 동일하게 처리한다. */
  var _lcBar = document.getElementById('lc-filter-bar');
  if (_lcBar) _lcBar.style.display = 'none';
  if (typeof lcFilter !== 'undefined') lcFilter = 'all';
  document.querySelectorAll('.lc-fchip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.lcat === 'all');
  });
  var _lcScroll = document.getElementById('lc-filter-scroll');
  if (_lcScroll) _lcScroll.scrollLeft = 0;
  if (typeof updateLcArrows === 'function') updateLcArrows();

  /* ⑥ 상단 칩 바 가로 스크롤. go() 는 updateChipArrows 만 부르고(js/nav.js:23)
   *    scrollLeft 는 안 되돌려서 '제부도 숙박'까지 밀어둔 상태가 남는다. */
  var _chips = document.getElementById('map-chips');
  if (_chips) _chips.scrollLeft = 0;
  if (typeof updateChipArrows === 'function') updateChipArrows();

  /* ⑦ GPS 로 찍은 빨간 '내 위치' 점. 첫 진입은 null(js/map.js:938).
   *    주입된 <style id="my-loc-style">(js/map.js:999-1008)은 보이지 않는 CSS 정의라 지우지 않는다. */
  if (hasMap && myLocationOverlay) { myLocationOverlay.setMap(null); myLocationOverlay = null; }

  /* ⑧ '가까운 300곳만 표시' 토스트 dedupe (js/localcurrency.js:11,116-117) */
  if (typeof _lcCapNotifiedLevel !== 'undefined') _lcCapNotifiedLevel = null;

  /* ⑨ 마지막에 카메라. 재클릭 직전 동작이 걸어둔 카메라 타이머가 뒤늦게 도착해 화면을 옮길 수 있다:
   *    _panPinAboveSlide panBy 50ms(js/map.js:357-364) / fitPlaces setLevel 150ms(:114-116)
   *    / 클러스터 panTo 180ms(:311-314) / NP setBounds 320ms + 중첩 200ms(:594).
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
  /* 슬라이더 동기화. setLevel 이 zoom_changed 를 쏘면 js/map.js:1043-1046 이 알아서 맞추지만,
   * 이미 레벨 9 였으면 이벤트가 안 뜬다. 명시 대입이 확실하다. levelToSlider = 15 - level (:1026). */
  var z = document.getElementById('zoom-track');
  if (z) z.value = 15 - kakaoMap.getLevel();
}
