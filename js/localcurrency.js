'use strict';

var lcData        = [];
var lcMap         = null;
var lcVisible     = false;
var lcDisplayItems = [];   /* 현재 지도에 올라간 Marker / CustomOverlay */

var LC_PIN_LEVEL  = 5;     /* 이 레벨 이하에서만 개별 핀 표시 */

/* 줌 레벨별 격자 크기(도 단위) — 격자 하나 = 클러스터 원 하나 */
var LC_GRID = {
  14: 0.30, 13: 0.15, 12: 0.08, 11: 0.05, 10: 0.03,
   9: 0.02,  8: 0.012, 7: 0.008, 6: 0.005
};

/* ── 초기화: 데이터만 로드, Marker 생성 없음 ── */
function initLocalCurrency(map) {
  lcMap = map;
  fetch('js/localcurrency-static.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      lcData = data;
      kakao.maps.event.addListener(map, 'idle', onLcMapIdle);
    })
    .catch(function (e) { console.warn('[가맹점]', e); });
}

function onLcMapIdle() {
  if (lcVisible) updateLcDisplay();
}

/* ── 표시/숨김 ── */
function setLcVisible(visible) {
  lcVisible = visible;
  if (!visible) {
    clearLcDisplay();
    if (typeof removeMapRadius === 'function') removeMapRadius('localcurrency');
  } else {
    updateLcDisplay();
  }
}

/* ── 현재 표시 중인 것 전부 제거 ── */
function clearLcDisplay() {
  lcDisplayItems.forEach(function (item) { item.setMap(null); });
  lcDisplayItems = [];
}

/* ── 줌 레벨에 따라 클러스터 원 or 개별 핀 ── */
function updateLcDisplay() {
  if (!lcMap || !lcData.length) return;
  clearLcDisplay();

  var level  = lcMap.getLevel();
  var bounds = lcMap.getBounds();

  if (level <= LC_PIN_LEVEL) {
    showViewportMarkers(bounds);
  } else {
    showClusters(bounds, level);
  }
}

/* ── 뷰포트 안 가맹점만 개별 마커로 표시 (반경 원 기반 필터) ── */
function showViewportMarkers(bounds) {
  var ctr  = lcMap.getCenter();
  var cLat = ctr.getLat(), cLng = ctr.getLng();
  var radius = typeof _viewportRadiusKm === 'function' ? _viewportRadiusKm() : 1;
  var buf    = radius * 1.28;

  if (typeof drawMapRadius === 'function') drawMapRadius('localcurrency', cLat, cLng, radius);

  lcData.filter(function (p) {
    if (!p.lat || !p.lng) return false;
    if (typeof _mapDistKm === 'function')
      return _mapDistKm(cLat, cLng, p.lat, p.lng) <= buf;
    var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    return p.lat >= sw.getLat() && p.lat <= ne.getLat() &&
           p.lng >= sw.getLng() && p.lng <= ne.getLng();
  }).forEach(function (p) {
    var marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      map: lcMap,
    });
    kakao.maps.event.addListener(marker, 'click', (function (pp) {
      return function () { showLcSlide(pp); };
    })(p));
    lcDisplayItems.push(marker);
  });
}

/* ── 격자 기반 클러스터 원 표시 (줌아웃 시 반경 원 제거) ── */
function showClusters(bounds, level) {
  if (typeof removeMapRadius === 'function') removeMapRadius('localcurrency');
  var sw  = bounds.getSouthWest();
  var ne  = bounds.getNorthEast();
  var pad = (LC_GRID[level] || 0.02) * 0.5;
  var minLat = sw.getLat() - pad, maxLat = ne.getLat() + pad;
  var minLng = sw.getLng() - pad, maxLng = ne.getLng() + pad;
  var grid   = LC_GRID[level] || 0.02;

  /* 뷰포트 내 데이터를 격자 셀로 묶기 */
  var cells = {};
  lcData.forEach(function (p) {
    if (p.lat < minLat || p.lat > maxLat ||
        p.lng < minLng || p.lng > maxLng) return;
    var key = Math.floor(p.lat / grid) + ',' + Math.floor(p.lng / grid);
    if (!cells[key]) cells[key] = { sumLat: 0, sumLng: 0, count: 0 };
    cells[key].sumLat += p.lat;
    cells[key].sumLng += p.lng;
    cells[key].count++;
  });

  Object.keys(cells).forEach(function (key) {
    var c   = cells[key];
    var lat = c.sumLat / c.count;
    var lng = c.sumLng / c.count;
    var cnt = c.count;
    var size  = cnt >= 1000 ? 56 : cnt >= 100 ? 48 : cnt >= 10 ? 40 : 34;
    var alpha = cnt >= 100  ? 0.50 : 0.38;
    var label = cnt >= 1000 ? (cnt / 1000).toFixed(1) + 'k' : String(cnt);

    var el = document.createElement('div');
    el.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;line-height:' + (size - 4) + 'px;' +
      'background:rgba(22,163,74,' + alpha + ');' +
      'border-radius:50%;border:2px solid rgba(255,255,255,0.75);' +
      'color:#fff;text-align:center;font-size:11px;font-weight:700;' +
      'cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,0.14);' +
      'box-sizing:border-box;';
    el.textContent = label;

    /* 클릭 시 해당 지점으로 줌인 */
    el.onclick = (function (clat, clng, lv) {
      return function () {
        kakaoMap.setCenter(new kakao.maps.LatLng(clat, clng));
        kakaoMap.setLevel(Math.max(1, lv - 2));
      };
    })(lat, lng, level);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content:  el,
      yAnchor:  0.5,
      zIndex:   5,
      map:      lcMap,
    });
    lcDisplayItems.push(overlay);
  });
}

/* ── 가맹점 슬라이드 카드 ── */
function showLcSlide(p) {
  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;'
    + 'padding:3px 10px;border-radius:20px">💳 지역화폐 가맹점</span>'
    + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:4px">' + p.n + '</div>'
    + '<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:6px">' + p.c + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">📍 ' + p.a + '</div>'
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute('
    + p.lat + ',' + p.lng + ',\'' + p.n.replace(/'/g, '') + '\')">🗺 길찾기</button>'
    + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}
