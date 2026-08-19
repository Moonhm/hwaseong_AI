'use strict';

let kakaoMap   = null;
let mapReady   = false;
let overlayMap = {};   /* id → CustomOverlay */
let overlayEls = {};   /* id → DOM element (직접 조작용) */
let selectedId = null;
let slideStartY = 0;   /* 드래그-투-클로즈용 */

/* 화성특례시 중심 좌표 (시청 인근) */
const HWASEONG = { lat: 37.199, lng: 126.831 };

const CAT_COLOR = {
  tourist:       '#7C3AED',
  restaurant:    '#EF4444',
  festival:      '#F97316',
  parking:       '#2563EB',
  localcurrency: '#16A34A',
};

/* ── 실제 컨테이너 너비 계산 (max-width:480px 반영) ── */
function mapW() { return Math.min(window.innerWidth, 480); }
function mapH() { return window.innerHeight - 52; }

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

  mapReady = true;

  kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  buildOverlays();
  setupMyLocation();
  setupSlideCardDrag();
  if (typeof initParking === 'function') initParking(kakaoMap);
  kakao.maps.event.addListener(kakaoMap, 'click', closePlaceSlide);

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
  if (!list || !list.length) return;
  var bounds = new kakao.maps.LatLngBounds();
  list.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
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

/* ── 커스텀 오버레이 생성 (참고 깃: DOM 요소 직접 생성 방식) ── */
function buildOverlays() {
  PLACES.forEach(function (p) {
    var color = CAT_COLOR[p.category] || '#6B7280';
    var cfg   = CATEGORY_CONFIG[p.category];
    var label = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;

    var wrap   = document.createElement('div');
    wrap.className = 'cm-pin';

    var circle = document.createElement('div');
    circle.className = 'cm-circle';
    circle.style.background = color;
    circle.textContent = cfg.emoji + ' ' + label;

    var tail = document.createElement('div');
    tail.className = 'cm-tail';
    tail.style.borderTopColor = color;

    wrap.appendChild(circle);
    wrap.appendChild(tail);

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
    overlayMap[p.id] = overlay;
    overlayEls[p.id] = wrap;
  });
}

/* ── 핀 클릭 ── */
function onPinClick(id) {
  var place = PLACES.find(function (p) { return p.id === id; });
  if (!place) return;

  /* 이전 선택 해제 */
  if (selectedId !== null) {
    if (overlayEls[selectedId]) overlayEls[selectedId].classList.remove('selected');
    if (overlayMap[selectedId]) overlayMap[selectedId].setZIndex(1);
  }
  selectedId = id;
  if (overlayEls[id]) overlayEls[id].classList.add('selected');
  if (overlayMap[id]) overlayMap[id].setZIndex(200);

  /* 슬라이드 카드 표시 */
  showPlaceSlide(place);

  /* setCenter(즉시 이동) → panBy로 슬라이드 위 가시 영역에 핀 배치
   * panTo(애니메이션) + setTimeout panBy 는 두 애니메이션이 겹쳐 오작동
   * setCenter는 즉시 완료되므로 panBy 를 바로 호출해도 정확 */
  kakaoMap.setCenter(new kakao.maps.LatLng(place.lat, place.lng));

  var h        = mapH();                       /* 지도 높이 (px) */
  var slideH   = Math.min(h * 0.6, 420);       /* 슬라이드 카드 최대 높이 */
  var visibleH = h - slideH;                   /* 슬라이드 위 가시 영역 */
  var targetY  = visibleH * 0.42;              /* 핀 목표: 가시 영역 42% 위치 */
  var delta    = Math.round(h / 2 - targetY);  /* 이동 픽셀 (양수) */
  kakaoMap.panBy(0, delta);                    /* 양수 = 핀이 화면 위쪽으로 */
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

  dragZone.addEventListener('mousedown', function (e) {
    slideStartY = e.clientY;
  });

  document.addEventListener('mouseup', function (e) {
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
  return '<div style="width:100%;height:160px;border-radius:12px;overflow:hidden;margin-bottom:12px;background:' + cfg.bg + ';display:flex;align-items:center;justify-content:center;">' +
    '<img src="' + src + '" alt="' + place.name + '" ' +
    'style="width:100%;height:100%;object-fit:cover;" ' +
    'onerror="this.parentNode.innerHTML=\'<span style=\\\"font-size:36px\\\">' + cfg.emoji + '</span>\'">' +
    '</div>';
}

/* ── 장소 슬라이드 카드 ── */
function showPlaceSlide(place) {
  var cfg   = CATEGORY_CONFIG[place.category];
  var color = CAT_COLOR[place.category];

  document.getElementById('slide-inner').innerHTML =
    placePhotoHtml(place) +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:' + cfg.bg + ';color:' + color + '">' + cfg.emoji + ' ' + cfg.label + '</span>' +
    (place.status === 'ongoing' ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : '') +
    '</div>' +
    '<div class="sl-name">' + place.name + '</div>' +
    '<div class="sl-addr">📍 ' + place.address + '</div>' +
    (place.date ? '<div class="sl-date">📅 ' + place.date + '</div>' : '') +
    '<div class="sl-desc">' + place.desc + '</div>' +
    '<div class="sl-tags">' + place.tags.map(function (t) { return '<span class="sl-tag">' + t + '</span>'; }).join('') + '</div>' +
    '<div class="sl-actions">' +
    '<button class="sl-btn primary" onclick="findNearby(' + place.lat + ',' + place.lng + ')">💳 반경 500m 가맹점</button>' +
    '<button class="sl-btn" onclick="openRoute(' + place.lat + ',' + place.lng + ',\'' + place.name + '\')">🗺 길찾기</button>' +
    '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

function closePlaceSlide() {
  document.getElementById('place-slide').classList.remove('open');
  document.getElementById('map-dim').classList.remove('show');
  if (selectedId !== null) {
    if (overlayEls[selectedId]) overlayEls[selectedId].classList.remove('selected');
    if (overlayMap[selectedId]) overlayMap[selectedId].setZIndex(1);
    selectedId = null;
  }
}

/* ── 모든 핀 숨김 (필터 없음 상태) ── */
function clearFilter() {
  PLACES.forEach(function (p) {
    overlayMap[p.id] && overlayMap[p.id].setMap(null);
  });
  if (typeof setParkingVisible === 'function') setParkingVisible(false);
  if (typeof updateParkingCount === 'function') updateParkingCount();
}

/* ── 카테고리 필터 (같은 칩 재클릭 시 토글 해제) ── */
function setFilter(cat) {
  closePlaceSlide();

  var chip     = document.querySelector('#map-chips .chip[data-cat="' + cat + '"]');
  var wasActive = chip && chip.classList.contains('active');

  /* 모든 칩 비활성화 */
  document.querySelectorAll('#map-chips .chip').forEach(function (c) {
    c.classList.remove('active');
  });

  if (wasActive) {
    /* 같은 칩 재클릭 → 필터 해제, 핀 전체 숨김 */
    clearFilter();
    return;
  }

  /* 새 칩 활성화 */
  if (chip) chip.classList.add('active');

  PLACES.forEach(function (p) {
    overlayMap[p.id] && overlayMap[p.id].setMap(
      (cat === 'all' || p.category === cat) ? kakaoMap : null
    );
  });

  if (typeof setParkingVisible === 'function') {
    setParkingVisible(cat === 'all' || cat === 'parking');
  }

  var targets = cat === 'all' ? PLACES : PLACES.filter(function (p) { return p.category === cat; });
  fitPlaces(targets);

  if (typeof updateParkingCount === 'function') updateParkingCount();
}

/* ── 반경 500m 지역화폐 가맹점 ── */
function findNearby(lat, lng) {
  var nearby = PLACES.filter(function (p) {
    return p.category === 'localcurrency' && Math.hypot(p.lat - lat, p.lng - lng) <= 0.005;
  });
  closePlaceSlide();
  if (!nearby.length) {
    showToast('반경 500m 내 지역화폐 가맹점이 없습니다.');
    return;
  }
  setFilter('localcurrency');
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
