'use strict';

var parkingData    = [];
var parkingMap     = null;
var parkingTimer   = null;
var parkingVisible = false;
var pkDisplayItems = [];       /* 현재 지도에 올라간 CustomOverlay */
var pkOverlayMap   = {};       /* id → overlay (호버용) */

var PK_PIN_LEVEL   = 7;        /* 이 레벨 이하 = 개별 핀, 이상 = 클러스터 원 */
var PK_GRID = {
  14: 0.30, 13: 0.15, 12: 0.08, 11: 0.05, 10: 0.03, 9: 0.02, 8: 0.015
};
var REFRESH_INTERVAL = 60000;

/* ── 초기화 ── */
function initParking(map) {
  parkingMap = map;
  fetchParkingAll();
  if (parkingTimer) clearInterval(parkingTimer);
  parkingTimer = setInterval(refreshParking, REFRESH_INTERVAL);
  var _pkIdleTimer = null;
  kakao.maps.event.addListener(map, 'idle', function () {
    clearTimeout(_pkIdleTimer);
    _pkIdleTimer = setTimeout(function () {
      if (parkingVisible) updateParkingDisplay();
    }, 80);
  });
}

/* ── 실시간 데이터 적용 (공통 헬퍼) ── */
function _applyRealtime(data) {
  if (!data || !data.ok) return;
  var rtMap = {};
  data.data.forEach(function (p) { rtMap[p.id] = p; });
  parkingData.forEach(function (p) {
    var rt = rtMap[p.id];
    if (rt) { p.used = rt.used; p.avail = rt.avail; p.open = rt.open; }
  });
  _pinColorCache = {}; /* 색상 캐시 무효화 */
  if (parkingVisible) updateParkingDisplay();
  updateParkingCount();
}

/* ── 정적 + 실시간 데이터 로드 ── */
function fetchParkingAll() {
  fetch('js/parking-static.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      mergeParkingData(list, []);
      updateParkingCount();
      return fetch('/api/parking/realtime')
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    })
    .then(function (res) { _applyRealtime(res); })
    .catch(function (e) { console.warn('[주차장]', e); });
}

function refreshParking() {
  if (!parkingVisible) return;
  fetch('/api/parking/realtime')
    .then(function (r) { return r.json(); })
    .then(function (res) { _applyRealtime(res); })
    .catch(function () {});
}

/* ── 데이터 병합 ── */
function mergeParkingData(list, rt) {
  var rtMap = {};
  rt.forEach(function (p) { rtMap[p.id] = p; });
  parkingData = list.map(function (p) {
    var r = rtMap[p.id] || {};
    return {
      id: p.id, name: p.name, address: p.address,
      lat: p.lat, lng: p.lng, total: p.total,
      free: p.free, type: p.type, tel: p.tel, zone: p.zone, tags: p.tags || [],
      open:          r.open  !== undefined ? r.open  : p.open,
      used:          r.used  !== undefined ? r.used  : 0,
      avail:         r.avail !== undefined ? r.avail : p.total,
      feeFreePeriod: p.feeFreePeriod || '',
      feeNight:      p.feeNight      || '',
      feeSteps:      p.feeSteps      || [],
      feeCap:        p.feeCap        || '',
      feeNote:       p.feeNote       || '',
    };
  });
}

/* ── 색상 (빨강→초록 그라데이션) ── */
function pinColor(p) {
  if (!p.open || p.total <= 0) return '#9CA3AF';
  var ratio = p.avail / p.total;
  if (ratio <= 0) return '#EF4444';
  return 'hsl(' + Math.round(ratio * 118) + ',72%,42%)';
}
function statusText(p) {
  if (!p.open)      return '미운영';
  if (p.avail <= 0) return '만차';
  return p.avail + '대';
}
/* ── 핀 색상 캐시 (실시간 업데이트 시 무효화) ── */
var _pinColorCache = {};
function pinColorCached(p) {
  var key = p.id + ':' + p.open + ':' + p.avail;
  if (!_pinColorCache[key]) _pinColorCache[key] = pinColor(p);
  return _pinColorCache[key];
}

/* ── 표시/숨김 ── */
function setParkingVisible(visible) {
  parkingVisible = visible;
  if (!visible) {
    clearPkDisplay();
  } else {
    updateParkingDisplay();
  }
}

function clearPkDisplay() {
  pkDisplayItems.forEach(function (o) { o.setMap(null); });
  pkDisplayItems = [];
  pkOverlayMap   = {};
}

/* ── 줌 레벨에 따라 클러스터 or 개별 핀 ── */
function updateParkingDisplay() {
  if (!parkingMap || !parkingData.length) return;
  clearPkDisplay();
  var level  = parkingMap.getLevel();
  var bounds = parkingMap.getBounds();
  if (level <= PK_PIN_LEVEL) showPkViewport(bounds);
  else                       showPkClusters(bounds, level);
  updateParkingCount();
}

/* ── 뷰포트 개별 핀 ── */
function showPkViewport(bounds) {
  var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  /* bounds 기반 필터 (bounds 밖 20% 버퍼) */
  var latPad = (ne.getLat() - sw.getLat()) * 0.1;
  var lngPad = (ne.getLng() - sw.getLng()) * 0.1;

  parkingData.filter(function (p) {
    if (!p.lat || !p.lng) return false;
    return p.lat >= sw.getLat() - latPad && p.lat <= ne.getLat() + latPad &&
           p.lng >= sw.getLng() - lngPad && p.lng <= ne.getLng() + lngPad;
  }).forEach(function (p) {
    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  pinHtml(p),
      yAnchor:  1.5,
      zIndex:   2,
      map:      parkingMap,
    });
    overlay._pkId = p.id;
    pkDisplayItems.push(overlay);
    pkOverlayMap[p.id] = overlay;
  });
}

/* ── 격자 기반 클러스터 원 ── */
function showPkClusters(bounds, level) {
  var sw   = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var grid = PK_GRID[level] || 0.02;
  var pad  = grid * 0.5;
  var minLat = sw.getLat()-pad, maxLat = ne.getLat()+pad;
  var minLng = sw.getLng()-pad, maxLng = ne.getLng()+pad;

  var cells = {};
  parkingData.forEach(function (p) {
    if (!p.lat || !p.lng) return;
    if (p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng) return;
    var key = Math.floor(p.lat / grid) + ',' + Math.floor(p.lng / grid);
    if (!cells[key]) cells[key] = { sumLat: 0, sumLng: 0, items: [] };
    cells[key].sumLat += p.lat;
    cells[key].sumLng += p.lng;
    cells[key].items.push(p);
  });

  Object.keys(cells).forEach(function (key) {
    var c       = cells[key];
    var cnt     = c.items.length;
    var lat     = c.sumLat / cnt;
    var lng     = c.sumLng / cnt;
    var opens   = c.items.filter(function (p) { return p.open && p.total > 0; });
    var totCap  = opens.reduce(function (s, p) { return s + p.total; }, 0);
    var availCp = opens.reduce(function (s, p) { return s + Math.max(0, p.avail); }, 0);
    var ratio   = totCap > 0 ? availCp / totCap : 0;
    var bg      = opens.length === 0 ? '#9CA3AF' :
                  ratio <= 0 ? '#EF4444' :
                  'hsl(' + Math.round(ratio * 118) + ',68%,42%)';

    var el = document.createElement('div');
    el.style.cssText =
      'width:42px;height:42px;border-radius:50%;background:' + bg + ';' +
      'border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.22);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'cursor:pointer;box-sizing:border-box;';
    el.innerHTML =
      '<span style="color:#fff;font-size:14px;font-weight:900;line-height:1">P</span>' +
      (cnt > 1 ? '<span style="color:rgba(255,255,255,0.88);font-size:8px;line-height:1.3">' + cnt + '곳</span>' : '');

    el.onclick = (function (clat, clng, lv) {
      return function (e) {
        e.stopPropagation();
        var dest = new kakao.maps.LatLng(clat, clng);
        /* PK_PIN_LEVEL(7) 이하로 한 번에 이동 */
        var targetLevel = Math.max(1, Math.min(lv - 2, PK_PIN_LEVEL));
        parkingMap.panTo(dest);
        setTimeout(function () {
          parkingMap.setLevel(targetLevel, { animate: { duration: 400 } });
        }, 180);
      };
    })(lat, lng, level);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content:  el,
      yAnchor:  0.5,
      zIndex:   5,
      map:      parkingMap,
    });
    pkDisplayItems.push(overlay);
  });
}

/* ── 개별 핀 HTML ── */
function pinHtml(p) {
  var color  = pinColorCached(p);
  var status = statusText(p);
  return '<div class="pk-pin" id="pkpin-' + p.id + '"'
    + ' onclick="onParkingClick(' + p.id + ')"'
    + ' onmouseover="pkHoverIn(' + p.id + ')"'
    + ' onmouseout="pkHoverOut(' + p.id + ')">'
    + '<div class="pk-circle" style="background:' + color + '">'
    + '<span class="pk-p-badge" style="color:' + color + '">P</span>'
    + '<span class="pk-count">' + status + '</span>'
    + '</div>'
    + '<div class="pk-tail" style="border-top-color:' + color + '"></div>'
    + '</div>';
}

/* ── 핀 클릭 ── */
function onParkingClick(id) {
  var p = parkingData.find(function (x) { return x.id === id; });
  if (!p) return;
  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(p.lat, p.lng, 50);
  showParkingSlide(p);
}

/* ── 호버 z-index ── */
function pkHoverIn(id) {
  var o = pkOverlayMap[id];
  if (o) o.setZIndex(100);
}
function pkHoverOut(id) {
  var o = pkOverlayMap[id];
  if (o) o.setZIndex(2);
}

/* ── 슬라이드 카드 ── */
function feeSection(p) {
  if (p.free) {
    return '<div style="background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;color:#166534">'
      + '💚 <strong>무료 주차장</strong>입니다.</div>';
  }
  if (!p.feeFreePeriod && !p.feeSteps.length) {
    return '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">요금 정보 없음</div>';
  }
  var rows = '';
  if (p.feeFreePeriod && p.feeFreePeriod !== '없음')
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">무료 기본</span><span style="font-weight:600;color:#16A34A">' + p.feeFreePeriod + '</span></div>';
  if (p.feeNight && p.feeNight !== '없음')
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">야간 무료</span><span style="font-weight:600;color:#6366F1">' + p.feeNight + '</span></div>';
  p.feeSteps.forEach(function (s) {
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">요금</span><span style="font-weight:500">' + s + '</span></div>';
  });
  if (p.feeCap && p.feeCap !== '없음')
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">상한선</span><span style="font-weight:500">' + p.feeCap + '</span></div>';
  if (p.feeNote)
    rows += '<div style="margin-top:6px;font-size:11px;color:#6366F1">ℹ ' + p.feeNote + '</div>';
  return '<div style="background:#F9FAFB;border-radius:10px;padding:12px;margin-bottom:12px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">💰 요금 안내'
    + (p.zone ? ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">(' + p.zone + ')</span>' : '')
    + '</div><div style="font-size:12px">' + rows + '</div></div>';
}

function showParkingSlide(p) {
  var color   = pinColorCached(p);
  var avail   = p.open ? p.avail : '-';
  var ratio   = p.total > 0 ? Math.round((p.avail / p.total) * 100) : 0;
  var freeTag = p.free
    ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">무료</span>'
    : '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">유료</span>';
  var openTag = p.open
    ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">운영중</span>'
    : '<span style="background:#F3F4F6;color:#9CA3AF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">미운영</span>';

  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">🅿 주차장</span>'
    + freeTag + openTag + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:6px">' + p.name + '</div>'
    + '<div class="sl-addr" style="margin-bottom:12px" data-addr="' + p.address.replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + p.address + '</div>'
    + '<div style="background:#F9FAFB;border-radius:10px;padding:12px;margin-bottom:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">'
    + '<span style="font-size:13px;color:var(--text-sub)">현재 여유</span>'
    + '<span style="font-size:22px;font-weight:900;color:' + color + '">' + avail
    + '<span style="font-size:13px;font-weight:500;color:var(--text-muted)"> / ' + p.total + '면</span></span></div>'
    + '<div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden">'
    + '<div style="height:100%;width:' + ratio + '%;background:' + color + ';border-radius:3px;transition:width 0.4s ease"></div>'
    + '</div></div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">구분: ' + (p.type||'-') + ' · ' + (p.zone||'-') + '</div>'
    + (p.tel ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">📞 ' + p.tel + '</div>' : '')
    + feeSection(p)
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute(' + p.lat + ',' + p.lng + ',\'' + p.name.replace(/'/g, '') + '\')">🗺 길찾기</button>'
    + '<button class="sl-btn" onclick="refreshParking();showToast(\'새로고침 완료\')">🔄 새로고침</button>'
    + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

/* ── 여유 배지 ── */
function updateParkingCount() {
  var el = document.getElementById('parking-count-badge');
  if (!el) return;
  var chip = document.querySelector('#map-chips .chip[data-cat="parking"]');
  if (!chip || !chip.classList.contains('active')) { el.style.display = 'none'; return; }
  var open  = parkingData.filter(function (p) { return p.open; });
  var avail = open.filter(function (p) { return p.avail > 0; }).length;
  var total = open.length;
  var ratio = total > 0 ? avail / total : 0;
  el.style.background = 'hsl(' + Math.round(ratio * 118) + ',65%,40%)';
  el.textContent = '🅿 여유 ' + avail + ' / ' + total + '곳';
  el.style.display = 'inline-block';
}
