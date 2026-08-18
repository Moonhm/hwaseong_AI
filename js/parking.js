'use strict';

/*
 * 화성잇다 — 실시간 주차장 모듈
 * /api/parking/list + /api/parking/realtime 에서 데이터를 가져와
 * 카카오맵 위에 실시간 여유 현황 오버레이를 표시합니다.
 *
 * 외부에서 사용하는 함수:
 *   initParking(kakaoMapInstance)  — 지도 초기화 후 1회 호출
 *   refreshParking()               — 수동 새로고침
 */

var parkingOverlays  = [];   // CustomOverlay 목록
var parkingData      = [];   // 병합된 주차장 데이터
var parkingMap       = null; // kakao.maps.Map 참조
var parkingTimer     = null;
var REFRESH_INTERVAL = 60000; // 60초마다 실시간 갱신

/* ── 초기화 ─────────────────────────────────────────────────────── */
function initParking(map) {
  parkingMap = map;
  fetchParkingAll();
  if (parkingTimer) clearInterval(parkingTimer);
  parkingTimer = setInterval(refreshParking, REFRESH_INTERVAL);
}

/*
 * 로드 전략:
 *   1단계: js/parking-static.json (정적 파일, 서버 없이도 항상 동작) → 핀 즉시 표시
 *   2단계: /api/parking/realtime (Flask 프록시, 실패해도 무시) → 색상만 업데이트
 */
function fetchParkingAll() {
  fetch('js/parking-static.json')
    .then(function (r) { return r.json(); })
    .then(function (staticList) {
      mergeParkingData(staticList, []);
      drawParkingOverlays();
      updateParkingCount();
      /* 실시간 정보 추가 시도 (Flask 없으면 조용히 실패) */
      return fetch('/api/parking/realtime').then(function (r) { return r.json(); }).catch(function () { return null; });
    })
    .then(function (res) {
      if (!res || !res.ok) return;
      var rtMap = {};
      res.data.forEach(function (p) { rtMap[p.id] = p; });
      parkingData.forEach(function (p) {
        var rt = rtMap[p.id];
        if (rt) { p.used = rt.used; p.avail = rt.avail; p.open = rt.open; }
      });
      updateAllPins();
      updateParkingCount();
    })
    .catch(function (e) { console.warn('[주차장] 로드 실패:', e); });
}

/* ── 실시간만 갱신 ───────────────────────────────────────────────── */
function refreshParking() {
  fetch('/api/parking/realtime')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.ok) return;
      var rtMap = {};
      res.data.forEach(function (p) { rtMap[p.id] = p; });
      parkingData.forEach(function (p) {
        var rt = rtMap[p.id];
        if (rt) {
          p.used  = rt.used;
          p.avail = rt.avail;
          p.open  = rt.open;
        }
      });
      updateAllPins();
      updateParkingCount();
    })
    .catch(function () {});
}

/* ── 데이터 병합 ─────────────────────────────────────────────────── */
function mergeParkingData(list, rt) {
  var rtMap = {};
  rt.forEach(function (p) { rtMap[p.id] = p; });
  parkingData = list.map(function (p) {
    var r = rtMap[p.id] || {};
    return {
      id:            p.id,
      name:          p.name,
      address:       p.address,
      lat:           p.lat,
      lng:           p.lng,
      total:         p.total,
      free:          p.free,
      type:          p.type,
      tel:           p.tel,
      zone:          p.zone,
      open:          r.open !== undefined ? r.open : p.open,
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

/* ── 오버레이 색상 ───────────────────────────────────────────────── */
function pinColor(p) {
  if (!p.open)           return '#9CA3AF'; // 회색 — 미운영
  if (p.total <= 0)      return '#9CA3AF';
  var ratio = p.avail / p.total;
  if (ratio <= 0)        return '#EF4444'; // 빨강 — 만차
  if (ratio < 0.3)       return '#F97316'; // 주황 — 혼잡
  return '#16A34A';                        // 초록 — 여유
}

function statusText(p) {
  if (!p.open)      return '미운영';
  if (p.avail <= 0) return '만차';
  return p.avail + '면';
}

/* ── 오버레이 HTML ───────────────────────────────────────────────── */
function pinHtml(p) {
  var color  = pinColor(p);
  var status = statusText(p);
  var label  = p.name.length > 7 ? p.name.slice(0, 6) + '…' : p.name;
  return '<div class="pk-pin" id="pkpin-' + p.id + '" onclick="onParkingClick(' + p.id + ')">'
    + '<div class="pk-circle" style="background:' + color + '">'
    + 'P <span style="font-size:10px">' + status + '</span>'
    + '</div>'
    + '<div class="pk-tail" style="border-top-color:' + color + '"></div>'
    + '</div>';
}

/* ── 오버레이 그리기 ─────────────────────────────────────────────── */
function drawParkingOverlays() {
  parkingOverlays.forEach(function (o) { o.setMap(null); });
  parkingOverlays = [];
  if (!parkingMap) return;

  parkingData.forEach(function (p) {
    if (!p.lat || !p.lng) return;
    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  pinHtml(p),
      yAnchor:  1.5,
      zIndex:   2,
    });
    overlay.setMap(parkingMap);
    overlay._pkId = p.id;
    parkingOverlays.push(overlay);
  });
}

/* ── 핀 HTML만 갱신 (오버레이 재생성 없이) ──────────────────────── */
function updateAllPins() {
  parkingData.forEach(function (p) {
    var el = document.getElementById('pkpin-' + p.id);
    if (!el) return;
    var color  = pinColor(p);
    var status = statusText(p);
    var circle = el.querySelector('.pk-circle');
    var tail   = el.querySelector('.pk-tail');
    if (circle) { circle.style.background = color; circle.innerHTML = 'P <span style="font-size:10px">' + status + '</span>'; }
    if (tail)   { tail.style.borderTopColor = color; }
  });
}

/* ── 주차장 필터 표시/숨김 ────────────────────────────────────────── */
function setParkingVisible(visible) {
  parkingOverlays.forEach(function (o) {
    o.setMap(visible ? parkingMap : null);
  });
}

/* ── 핀 클릭 → 슬라이드 카드 ────────────────────────────────────── */
function onParkingClick(id) {
  var p = parkingData.find(function (x) { return x.id === id; });
  if (!p) return;
  if (parkingMap) parkingMap.panTo(new kakao.maps.LatLng(p.lat, p.lng));
  showParkingSlide(p);
}

function feeSection(p) {
  if (p.free) {
    return '<div style="background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;color:#166534">'
      + '💚 <strong>무료 주차장</strong>입니다.</div>';
  }
  if (!p.feeFreePeriod && !p.feeSteps.length) {
    return '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">요금 정보 없음</div>';
  }
  var rows = '';
  if (p.feeFreePeriod && p.feeFreePeriod !== '없음') {
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
      + '<span style="color:var(--text-muted)">무료 기본</span>'
      + '<span style="font-weight:600;color:#16A34A">' + p.feeFreePeriod + '</span></div>';
  }
  if (p.feeNight && p.feeNight !== '없음') {
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
      + '<span style="color:var(--text-muted)">야간 무료</span>'
      + '<span style="font-weight:600;color:#6366F1">' + p.feeNight + '</span></div>';
  }
  p.feeSteps.forEach(function (s) {
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
      + '<span style="color:var(--text-muted)">요금</span>'
      + '<span style="font-weight:500">' + s + '</span></div>';
  });
  if (p.feeCap && p.feeCap !== '없음') {
    rows += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
      + '<span style="color:var(--text-muted)">상한선</span>'
      + '<span style="font-weight:500">' + p.feeCap + '</span></div>';
  }
  if (p.feeNote) {
    rows += '<div style="margin-top:6px;font-size:11px;color:#6366F1">ℹ ' + p.feeNote + '</div>';
  }
  return '<div style="background:#F9FAFB;border-radius:10px;padding:12px;margin-bottom:12px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">💰 요금 안내'
    + (p.zone ? ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">(' + p.zone + ')</span>' : '')
    + '</div>'
    + '<div style="font-size:12px">' + rows + '</div>'
    + '</div>';
}

function showParkingSlide(p) {
  var color    = pinColor(p);
  var avail    = p.open ? p.avail : '-';
  var freeTag  = p.free ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">무료</span>'
                        : '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">유료</span>';
  var openTag  = p.open ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">운영중</span>'
                        : '<span style="background:#F3F4F6;color:#9CA3AF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">미운영</span>';

  /* 여유율 바 */
  var ratio   = p.total > 0 ? Math.round((p.avail / p.total) * 100) : 0;
  var barColor = color;

  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">🅿 주차장</span>'
    + freeTag + openTag
    + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:6px">' + p.name + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">📍 ' + p.address + '</div>'
    /* 여유 현황 */
    + '<div style="background:#F9FAFB;border-radius:10px;padding:12px;margin-bottom:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">'
    + '<span style="font-size:13px;color:var(--text-sub)">현재 여유</span>'
    + '<span style="font-size:22px;font-weight:900;color:' + barColor + '">' + avail + '<span style="font-size:13px;font-weight:500;color:var(--text-muted)"> / ' + p.total + '면</span></span>'
    + '</div>'
    + '<div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden">'
    + '<div style="height:100%;width:' + ratio + '%;background:' + barColor + ';border-radius:3px;transition:width 0.4s ease"></div>'
    + '</div>'
    + '</div>'
    /* 정보 */
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">구분: ' + (p.type || '-') + ' · ' + (p.zone || '-') + '</div>'
    + (p.tel ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">📞 ' + p.tel + '</div>' : '')
    /* 요금 정보 */
    + feeSection(p)
    /* 버튼 */
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute(' + p.lat + ',' + p.lng + ',\'' + p.name + '\')">🗺 길찾기</button>'
    + '<button class="sl-btn" onclick="refreshParking();showToast(\'새로고침 완료\')">🔄 새로고침</button>'
    + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

/* ── 지도 상단 여유 카운터 업데이트 ─────────────────────────────── */
function updateParkingCount() {
  var el = document.getElementById('parking-count-badge');
  if (!el) return;
  var avail = parkingData.filter(function (p) { return p.open && p.avail > 0; }).length;
  el.textContent = '여유 ' + avail + '곳';
  el.style.display = avail > 0 ? 'inline-block' : 'none';
}
