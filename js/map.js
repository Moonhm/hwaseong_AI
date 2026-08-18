'use strict';

let kakaoMap   = null;
let mapReady   = false;
let overlayMap = {};
let selectedId = null;

/* 화성특례시 중심 좌표 (시청 인근, 초기 기준점) */
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
  /* container를 먼저 선언해야 mapReady early-return 블록에서도 사용 가능 */
  var container = document.getElementById('kakao-map');
  if (!container) return;

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

  /* 컨테이너 크기 명시 (Kakao Maps 필수 조건) */
  container.style.width  = window.innerWidth  + 'px';
  container.style.height = (window.innerHeight - 52) + 'px';

  /* 지도 생성 */
  kakaoMap = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng),
    level:  10,
  });

  kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
  mapReady = true;

  buildOverlays();
  setupMyLocation();
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
}

/* ── 화성시 전체 장소 범위로 자동 맞춤 ── */
function fitAllPlaces() {
  var bounds = new kakao.maps.LatLngBounds();
  PLACES.forEach(function (p) {
    bounds.extend(new kakao.maps.LatLng(p.lat, p.lng));
  });
  kakaoMap.setBounds(bounds, 60);
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

/* ── 커스텀 오버레이 생성 ── */
function buildOverlays() {
  PLACES.forEach(function (p) {
    var color = CAT_COLOR[p.category] || '#6B7280';
    var cfg   = CATEGORY_CONFIG[p.category];
    var label = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;

    var html =
      '<div class="cm-pin" id="pin-' + p.id + '" onclick="onPinClick(event,' + p.id + ')">' +
      '<div class="cm-circle" style="background:' + color + '">' + cfg.emoji + ' ' + label + '</div>' +
      '<div class="cm-tail" style="border-top-color:' + color + '"></div></div>';

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  html,
      yAnchor:  1.5,
      zIndex:   1,
    });
    overlay.setMap(kakaoMap);
    overlayMap[p.id] = overlay;
  });
}

/* ── 핀 클릭 ── */
function onPinClick(e, id) {
  e.stopPropagation();
  var place = PLACES.find(function (p) { return p.id === id; });
  if (!place) return;

  if (selectedId) {
    var prev = document.getElementById('pin-' + selectedId);
    if (prev) prev.classList.remove('selected');
  }
  selectedId = id;
  var cur = document.getElementById('pin-' + id);
  if (cur) cur.classList.add('selected');

  showPlaceSlide(place);

  /* 슬라이드 위 가시 영역 42%에 핀이 오도록 중심을 한 번만 이동
   * projection으로 정확한 목표 중심 좌표를 계산 → panTo 1회만 호출 */
  var navH     = 52;
  var mapH     = window.innerHeight - navH;
  var slideH   = Math.min(mapH * 0.6, 420);
  var visibleH = mapH - slideH;
  var targetY  = visibleH * 0.42;
  var offsetPx = Math.round(mapH / 2 - targetY); /* 핀이 중심 위로 올라가야 할 px */

  try {
    var proj      = kakaoMap.getProjection();
    var pinPt     = proj.pointFromCoords(new kakao.maps.LatLng(place.lat, place.lng));
    /* 중심을 핀보다 offsetPx픽셀 남쪽(y+)으로 지정 → panTo 후 핀이 가시 영역에 표시 */
    var newCenter = proj.coordsFromPoint(new kakao.maps.Point(pinPt.x, pinPt.y + offsetPx));
    kakaoMap.panTo(newCenter);
  } catch (ex) {
    kakaoMap.panTo(new kakao.maps.LatLng(place.lat, place.lng));
  }
}

/* ── 장소 사진 HTML (있으면 표시, 없으면 카테고리 색상 배너) ── */
function placePhotoHtml(place) {
  var cfg   = CATEGORY_CONFIG[place.category];
  var color = CAT_COLOR[place.category];
  var src   = 'assets/images/places/' + place.name + '.jpg';
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

  /* rAF으로 렌더 사이클 확보 후 슬라이드 오픈 (janky 방지) */
  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

function closePlaceSlide() {
  document.getElementById('place-slide').classList.remove('open');
  document.getElementById('map-dim').classList.remove('show');
  if (selectedId) {
    var el = document.getElementById('pin-' + selectedId);
    if (el) el.classList.remove('selected');
    selectedId = null;
  }
}

/* ── 카테고리 필터 ── */
function setFilter(cat) {
  closePlaceSlide();
  document.querySelectorAll('#map-chips .chip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.cat === cat);
  });

  /* data.js PLACES 오버레이 토글 */
  PLACES.forEach(function (p) {
    overlayMap[p.id] && overlayMap[p.id].setMap(
      (cat === 'all' || p.category === cat) ? kakaoMap : null
    );
  });

  /* 실시간 주차장 오버레이 토글 */
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
