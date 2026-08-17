'use strict';

let kakaoMap   = null;
let mapReady   = false;
let overlayMap = {};
let selectedId = null;

const HWASEONG = { lat: 37.1620, lng: 126.8312 };

const CAT_COLOR = {
  tourist:       '#7C3AED',
  restaurant:    '#EF4444',
  festival:      '#F97316',
  parking:       '#2563EB',
  localcurrency: '#16A34A',
};

/* ── 지도 초기화 ── */
function initMap() {
  if (mapReady) {
    kakaoMap.relayout();
    return;
  }

  if (typeof kakao === 'undefined' || !kakao.maps) {
    showMapError('카카오맵 SDK를 불러올 수 없습니다.<br>페이지를 새로고침 해주세요.');
    return;
  }

  const container = document.getElementById('kakao-map');
  if (!container) return;

  const loader = document.getElementById('map-loader');
  if (loader) loader.remove();

  container.style.width  = window.innerWidth  + 'px';
  container.style.height = window.innerHeight + 'px';

  kakaoMap = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng),
    level:  10,
  });

  kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  /* 렌더링 안정화: 브라우저 페인트 후 크기 재계산 */
  setTimeout(function() {
    container.style.width  = window.innerWidth  + 'px';
    container.style.height = window.innerHeight + 'px';
    kakaoMap.relayout();
    kakaoMap.setCenter(new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng));
  }, 300);

  mapReady = true;
  buildOverlays();
  setupMyLocation();
  kakao.maps.event.addListener(kakaoMap, 'click', closePlaceSlide);

  window.addEventListener('resize', () => {
    if (!mapReady) return;
    container.style.width  = window.innerWidth  + 'px';
    container.style.height = window.innerHeight + 'px';
    kakaoMap.relayout();
  });
}

function showMapError(msg) {
  const container = document.getElementById('kakao-map');
  if (!container) return;
  const loader = document.getElementById('map-loader');
  if (loader) loader.remove();
  container.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:12px;padding:24px;
      background:#f9fafb;text-align:center;">
      <div style="font-size:48px">🗺️</div>
      <div style="color:#6b7280;font-size:14px;line-height:1.6">${msg}</div>
      <button onclick="location.reload()"
        style="background:#6366f1;color:#fff;border:none;border-radius:20px;
               padding:10px 20px;font-size:13px;cursor:pointer">
        새로고침
      </button>
    </div>`;
}

/* ── 커스텀 오버레이 빌드 ── */
function buildOverlays() {
  PLACES.forEach(p => {
    const color = CAT_COLOR[p.category] || '#6B7280';
    const cfg   = CATEGORY_CONFIG[p.category];
    const label = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;

    const html = `
      <div class="cm-pin" id="pin-${p.id}" onclick="onPinClick(event,${p.id})">
        <div class="cm-circle" style="background:${color}">${cfg.emoji} ${label}</div>
        <div class="cm-tail" style="border-top-color:${color}"></div>
      </div>`;

    const overlay = new kakao.maps.CustomOverlay({
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
  const place = PLACES.find(p => p.id === id);
  if (!place) return;

  if (selectedId) document.getElementById(`pin-${selectedId}`)?.classList.remove('selected');
  selectedId = id;
  document.getElementById(`pin-${id}`)?.classList.add('selected');

  kakaoMap.panTo(new kakao.maps.LatLng(place.lat, place.lng));
  showPlaceSlide(place);
}

/* ── 장소 슬라이드 카드 ── */
function showPlaceSlide(place) {
  const cfg   = CATEGORY_CONFIG[place.category];
  const color = CAT_COLOR[place.category];

  document.getElementById('slide-inner').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="sl-cat" style="background:${cfg.bg};color:${color}">${cfg.emoji} ${cfg.label}</span>
      ${place.status === 'ongoing' ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : ''}
    </div>
    <div class="sl-name">${place.name}</div>
    <div class="sl-addr">📍 ${place.address}</div>
    ${place.date ? `<div class="sl-date">📅 ${place.date}</div>` : ''}
    <div class="sl-desc">${place.desc}</div>
    <div class="sl-tags">${place.tags.map(t => `<span class="sl-tag">${t}</span>`).join('')}</div>
    <div class="sl-actions">
      <button class="sl-btn primary" onclick="findNearby(${place.lat},${place.lng})">💳 반경 500m 가맹점</button>
      <button class="sl-btn" onclick="openRoute(${place.lat},${place.lng},'${place.name}')">🗺 길찾기</button>
    </div>`;

  document.getElementById('place-slide').classList.add('open');
  document.getElementById('map-dim').classList.add('show');
}

function closePlaceSlide() {
  document.getElementById('place-slide').classList.remove('open');
  document.getElementById('map-dim').classList.remove('show');
  if (selectedId) {
    document.getElementById(`pin-${selectedId}`)?.classList.remove('selected');
    selectedId = null;
  }
}

/* ── 카테고리 필터 ── */
function setFilter(cat) {
  closePlaceSlide();
  document.querySelectorAll('#map-chips .chip').forEach(c =>
    c.classList.toggle('active', c.dataset.cat === cat)
  );
  PLACES.forEach(p => {
    overlayMap[p.id]?.setMap(
      (cat === 'all' || p.category === cat) ? kakaoMap : null
    );
  });
  const targets = cat === 'all' ? PLACES : PLACES.filter(p => p.category === cat);
  if (targets.length) {
    const bounds = new kakao.maps.LatLngBounds();
    targets.forEach(p => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    kakaoMap.setBounds(bounds, 80);
  }
}

/* ── 반경 500m 가맹점 ── */
function findNearby(lat, lng) {
  const nearby = PLACES.filter(p =>
    p.category === 'localcurrency' && Math.hypot(p.lat - lat, p.lng - lng) <= 0.005
  );
  closePlaceSlide();
  if (!nearby.length) { showToast('반경 500m 내 지역화폐 가맹점이 없습니다.'); return; }
  setFilter('localcurrency');
  showToast(`반경 500m 내 가맹점 ${nearby.length}곳을 찾았어요`);
}

/* ── 길찾기 ── */
function openRoute(lat, lng, name) {
  window.open(
    `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`,
    '_blank'
  );
}

/* ── 내 위치 버튼 ── */
function setupMyLocation() {
  document.getElementById('btn-mylocation').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('위치 정보를 지원하지 않는 브라우저입니다.'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        kakaoMap.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        kakaoMap.setLevel(7);
      },
      () => showToast('위치 권한을 허용해 주세요.')
    );
  });
}
