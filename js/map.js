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

/* ── 지도 초기화 ── */
function initMap() {
  var container = document.getElementById('kakao-map');
  if (!container) return;

  /* 이미 초기화된 경우: 크기 재계산만 */
  if (mapReady) {
    container.style.width  = window.innerWidth  + 'px';
    container.style.height = (window.innerHeight - 52) + 'px';
    kakaoMap.relayout();
    return;
  }

  if (typeof kakao === 'undefined' || !kakao.maps) {
    showMapError('카카오맵을 불러올 수 없습니다.<br>페이지를 새로고침 해주세요.');
    return;
  }

  var loader = document.getElementById('map-loader');
  if (loader) loader.remove();

  container.style.width  = window.innerWidth  + 'px';
  container.style.height = (window.innerHeight - 52) + 'px';

  /* 참고 깃 패턴: kakao.maps.load() 콜백 안에서 지도 생성 */
  kakao.maps.load(function () {
    kakaoMap = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng),
      level:  10,
    });

    kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    mapReady = true;

    buildOverlays();
    setupMyLocation();
    setupSlideCardDrag();
    if (typeof initParking === 'function') initParking(kakaoMap);
    kakao.maps.event.addListener(kakaoMap, 'click', closePlaceSlide);

    /* display:none → block 전환 후 크기 재계산 + 화성시 전체 범위 자동 맞춤 */
    setTimeout(function () {
      container.style.width  = window.innerWidth  + 'px';
      container.style.height = (window.innerHeight - 52) + 'px';
      kakaoMap.relayout();
      fitAllPlaces();
    }, 300);

    window.addEventListener('resize', function () {
      if (!mapReady) return;
      container.style.width  = window.innerWidth  + 'px';
      container.style.height = (window.innerHeight - 52) + 'px';
      kakaoMap.relayout();
    });
  });
}

/* ── 화성시 전체 장소 범위로 자동 맞춤 ── */
function fitAllPlaces() {
  var bounds = new kakao.maps.LatLngBounds();
  PLACES.forEach(function (p) {
    bounds.extend(new kakao.maps.LatLng(p.lat, p.lng));
  });
  kakaoMap.setBounds(bounds, 60);
  /* 너무 축소되지 않도록 최대 레벨 9 제한 */
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
    })(p.id);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   1,
    });
    overlay.setMap(kakaoMap);
    overlayMap[p.id] = overlay;
    overlayEls[p.id] = wrap;
  });
}

/* ── 핀 클릭 ── */
function onPinClick(id) {
  var place = PLACES.find(function (p) { return p.id === id; });
  if (!place) return;

  /* 이전 선택 해제 */
  if (selectedId !== null && overlayEls[selectedId]) {
    overlayEls[selectedId].classList.remove('selected');
  }
  selectedId = id;
  if (overlayEls[id]) overlayEls[id].classList.add('selected');

  /* 슬라이드 카드 표시 */
  showPlaceSlide(place);

  /* ① panTo로 핀을 지도 중심으로 이동
   * ② 350ms 후 panBy로 슬라이드 위 가시 영역에 핀 위치 조정
   * 참고 깃 패턴 — panBy 양수(+) = 핀이 화면 위쪽으로 이동 */
  kakaoMap.panTo(new kakao.maps.LatLng(place.lat, place.lng));
  setTimeout(function () {
    var navH     = 52;
    var mapH     = window.innerHeight - navH;
    var slideH   = Math.min(mapH * 0.6, 420);
    var visibleH = mapH - slideH;
    var targetY  = visibleH * 0.42;               /* 슬라이드 위 가시 영역 42% 위치 */
    var delta    = Math.round(mapH / 2 - targetY); /* 이동해야 할 픽셀 (항상 양수) */
    kakaoMap.panBy(0, delta);                      /* 양수 = 핀이 화면 위쪽으로 */
  }, 350);
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
    selectedId = null;
  }
}

/* ── 카테고리 필터 ── */
function setFilter(cat) {
  closePlaceSlide();
  document.querySelectorAll('#map-chips .chip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.cat === cat);
  });

  PLACES.forEach(function (p) {
    overlayMap[p.id] && overlayMap[p.id].setMap(
      (cat === 'all' || p.category === cat) ? kakaoMap : null
    );
  });

  if (typeof setParkingVisible === 'function') {
    setParkingVisible(cat === 'all' || cat === 'parking');
  }

  var targets = cat === 'all' ? PLACES : PLACES.filter(function (p) { return p.category === cat; });
  if (targets.length) {
    var bounds = new kakao.maps.LatLngBounds();
    targets.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
    kakaoMap.setBounds(bounds, 80);
  }

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
function setupMyLocation() {
  document.getElementById('btn-mylocation').addEventListener('click', function () {
    if (!navigator.geolocation) {
      showToast('위치 정보를 지원하지 않는 브라우저입니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        kakaoMap.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        kakaoMap.setLevel(7);
      },
      function () { showToast('위치 권한을 허용해 주세요.'); }
    );
  });
}
