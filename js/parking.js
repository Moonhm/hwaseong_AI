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
  if (!data || !data.ok || !Array.isArray(data.data)) return;
  var rtMap = {};
  data.data.forEach(function (p) { rtMap[p.id] = p; });
  parkingData.forEach(function (p) {
    var rt = rtMap[p.id];
    if (rt) { p.used = rt.used; p.avail = rt.avail; p.open = rt.open; }
  });
  _pinColorCache = {}; /* 색상 캐시 무효화 */
  if (parkingVisible) updateParkingDisplay();
  updateParkingCount();
  /* 카드를 열어 둔 채 두면 60초 자동 갱신에서도 핀만 바뀌고 카드는 굳었다.
   * 열려 있을 때만 다시 그린다 — 닫혀 있으면 건드릴 이유가 없다. */
  var _open = _openParkingCardId();
  if (_open != null) {
    var _cur = parkingData.find(function (x) { return x.id === _open; });
    if (_cur) showParkingSlide(_cur);
  }
}

/* ── 정적 + 실시간 데이터 로드 ── */
function fetchParkingAll() {
  /* DOMContentLoaded에서 이미 static JSON을 로드했으면 재사용 */
  var staticP = parkingData.length
    ? Promise.resolve(null)
    : fetch('js/parking-static.json?v=20260825').then(function (r) { return r.json(); });

  staticP
    .then(function (list) {
      if (list) { mergeParkingData(list, []); updateParkingCount(); }
      return fetch('/api/parking/realtime')
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    })
    .then(function (res) { _applyRealtime(res); })
    .catch(function (e) { console.warn('[주차장]', e); });
}

function refreshParking() {
  if (!parkingVisible) return;
  /* parkingVisible 은 탭을 옮겨도 유지되므로, 지도 탭을 보고 있을 때만 갱신한다.
   * 그렇지 않으면 60초마다 API 호출 + 오버레이 전량 재생성이 백그라운드에서 계속된다. */
  if (document.hidden) return;
  var mapPage = document.getElementById('page-map');
  if (!mapPage || !mapPage.classList.contains('active')) return;
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
      /* parking-static.json 에는 open 키가 없다. undefined 로 두면 실시간 API 가
       * 없을 때 131곳이 전부 '미운영' 회색으로 표시되므로 운영중을 기본값으로 쓴다. */
      open:          r.open  !== undefined ? r.open  : (p.open !== undefined ? p.open : true),
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
/* ── 핀 글자 대비 (2026-08-26 감사) ────────────────────────────────────────
 * 핀 배경은 빨강→초록 그라데이션이라 색상마다 밝기가 크게 다르다.
 * 흰 글씨를 고정으로 쓰면 노랑~연두 구간에서 대비가 2.1:1 까지 떨어진다
 * (WCAG AA 는 4.5:1). 명도를 30% 까지 낮춰 봐도 노랑은 3.99:1 이라 못 넘기고,
 * 색으로 상태를 알리는 게 이 핀의 존재 이유라 그라데이션을 포기할 수도 없다.
 * 그래서 배경을 어둡게 하는 대신 **글자를 뒤집는다** — 색은 그대로 두고
 * 밝은 핀에는 검은 글씨, 어두운 핀에는 흰 글씨를 쓴다.
 *
 * ⚠ 흰 원판 위의 'P'(.pk-p-badge)는 반대 방향이다 — 배경이 흰색이라
 *   밝은 핀 색을 그대로 글자에 쓰면 안 보인다. 그쪽은 어둡게 눌러 쓴다. */
function _pkLum(color) {
  var r, g, b;
  var h = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (h) {
    var n = parseInt(h[1], 16);
    r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255;
  } else {
    var m = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/.exec(color);
    if (!m) return 0;
    var H = +m[1] / 360, S = +m[2] / 100, L = +m[3] / 100;
    var c = (1 - Math.abs(2 * L - 1)) * S;
    var x = c * (1 - Math.abs(((H * 6) % 2) - 1));
    var mm = L - c / 2;
    var seg = Math.floor(H * 6) % 6;
    var t = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][seg];
    r = t[0] + mm; g = t[1] + mm; b = t[2] + mm;
  }
  var f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/* 흰 글씨 대비가 4.5:1 에 못 미치면 검은 글씨로 뒤집는다. */
function pkTextOn(color) {
  return (1.05 / (_pkLum(color) + 0.05)) >= 4.5 ? '#fff' : '#111827';
}
/* 흰 원판 위에 얹는 'P' — 밝은 색을 그대로 쓰면 안 보이므로 눌러 쓴다. */
function pkInkOn(color) {
  var m = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/.exec(color);
  if (!m) return color;                       /* #EF4444 · #9CA3AF 는 그대로 */
  return 'hsl(' + m[1] + ',' + m[2] + '%,28%)';
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
      /* 선택된 핀은 다시 그려질 때도 맨 앞이어야 한다 — 커진 원이 옆 핀에 가리면
       * '내가 이걸 고르고 있다'가 안 보인다. pinHtml 의 selected 클래스와 짝이다. */
      zIndex:   p.id === pkSelectedId ? 200 : 2,
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
  /* 핀은 idle 마다 통째로 새로 그려진다(위 showPkPins). 선택 상태를 DOM 에만
   * 두면 _panPinAboveSlide 의 panBy 가 곧바로 쏘는 idle 에서 강조가 사라진다.
   * 그래서 pkSelectedId 를 보고 생성 시점에 다시 붙인다 — 관광지 핀도 같은 방식이다
   * (js/map.js 의 `p.id === selectedId` 참고). */
  return '<div class="pk-pin' + (p.id === pkSelectedId ? ' selected' : '') + '" id="pkpin-' + p.id + '"'
    + ' onclick="onParkingClick(' + p.id + ')"'
    + ' onmouseover="pkHoverIn(' + p.id + ')"'
    + ' onmouseout="pkHoverOut(' + p.id + ')">'
    + '<div class="pk-circle" style="background:' + color + '">'
    + '<span class="pk-p-badge" style="color:' + pkInkOn(color) + '">P</span>'
    + '<span class="pk-count" style="color:' + pkTextOn(color) + '">' + status + '</span>'
    + '</div>'
    + '<div class="pk-tail" style="border-top-color:' + color + '"></div>'
    + '</div>';
}

/* ── 핀 클릭 ── */
/* 선택된 주차장 id. 핀 DOM 은 idle 마다 갈리므로 '무엇이 선택됐나'는 여기 남긴다. */
var pkSelectedId = null;

function onParkingClick(id) {
  var p = parkingData.find(function (x) { return x.id === id; });
  if (!p) return;

  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(p.lat, p.lng, 50, 300);
  showParkingSlide(p);   /* 선택 강조는 그 안에서 한다 */
}

/* 관광지 핀에만 있던 '선택하면 커지고 맨 앞으로'를 주차장에도 적용한다
 * (2026-08-26 사용자 요청). 중앙 이동은 원래 있었고 강조가 없었다.
 * 핀 클릭 말고도 홈의 '최근 본 주차장'(goMapPark)·NP 모드가 슬라이드를 직접 여는
 * 경로라, onParkingClick 이 아니라 showParkingSlide 쪽에 건다. */
function _pkSelect(id) {
  if (typeof clearSelectedPin === 'function') clearSelectedPin();
  pkSelectedId = id;
  _pkApplySelected(id, true);
  if (typeof registerSelectedPin === 'function') registerSelectedPin(_deselectParkingPin);
}

/* DOM 을 붙잡아 두지 않고 그때그때 id 로 찾는다 — 위 pinHtml 주석 참고. */
function _pkApplySelected(id, on) {
  var el = document.getElementById('pkpin-' + id);
  if (el) el.classList.toggle('selected', !!on);
  var ov = pkOverlayMap[id];
  if (ov) ov.setZIndex(on ? 200 : 2);   /* 2 = 핀 기본값 (pkHoverOut 과 같은 값) */
}

function _deselectParkingPin() {
  if (pkSelectedId === null) return;
  _pkApplySelected(pkSelectedId, false);
  pkSelectedId = null;
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
      + '💚 <strong>무료 주차장</strong>이에요.</div>';
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

/* 지금 열려 있는 카드가 '주차장 카드인지' 를 DOM 으로 판정한다.
 * 전역 플래그로 두면 주차장 카드를 봤다가 관광지 핀을 눌렀을 때 플래그가 남아,
 * 60초 자동 갱신이 관광지 카드를 주차장 카드로 갈아치운다. */
function _openParkingCardId() {
  var sl = document.getElementById('place-slide');
  if (!sl || !sl.classList.contains('open')) return null;
  var el = document.querySelector('#slide-inner [data-pkid]');
  return el ? +el.dataset.pkid : null;
}

/* 카드 안의 '🔄 새로고침' 전용.
 * 예전에는 onclick="refreshParking();showToast('새로고침 완료')" 였다.
 * ① 응답을 기다리지 않아 서버가 죽어 있어도 늘 '완료' 라고 말했고,
 * ② refreshParking() 은 핀만 다시 그려서 열려 있는 카드의 '현재 여유'·진행 막대·
 *    숫자 색은 옛 값 그대로 남았다 — 뒤의 핀과 앞의 카드가 서로 다른 값을 보였다. */
function refreshParkingSlide() {
  fetch('/api/parking/realtime')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.data)) throw new Error('bad');
      _applyRealtime(res);
      var id = _openParkingCardId();
      var p  = id != null ? parkingData.find(function (x) { return x.id === id; }) : null;
      if (p) showParkingSlide(p);            /* 카드도 새 값으로 다시 그린다 */
      showToast('새로고침 완료');
    })
    .catch(function () { showToast('지금은 실시간 정보를 받지 못했어요'); });
}

function showParkingSlide(p) {
  /* '최근 본' 기록 지점 (js/home.js pushRecent). 관광지는 js/map.js showPlaceSlide 가 건다.
   * 주차장 id 는 관광지 id 와 60개가 겹치므로 종류를 반드시 함께 넘긴다. */
  if (typeof pushRecent === 'function') pushRecent(p, 'parking');
  if (p && p.id != null) _pkSelect(p.id);   /* 선택 핀 강조 — 위 _pkSelect 주석 참고 */

  var color   = pinColorCached(p);
  var avail   = p.open ? p.avail : '-';
  var ratio   = (p.open && p.total > 0) ? Math.max(0, Math.round((p.avail / p.total) * 100)) : 0;
  var freeTag = p.free
    ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">무료</span>'
    : '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">유료</span>';
  var openTag = p.open
    ? '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">운영중</span>'
    : '<span style="background:#F3F4F6;color:#9CA3AF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">미운영</span>';

  document.getElementById('slide-inner').innerHTML =
    '<div data-pkid="' + p.id + '" style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DBEAFE;color:#2563EB;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">🅿️ 주차장</span>'
    + freeTag + openTag + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:6px">' + p.name + '</div>'
    + '<div class="sl-addr" style="margin-bottom:12px" data-addr="' + (p.address || '').replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + (p.address || '') + '</div>'
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
    + '<button class="sl-btn primary" onclick="openRoute(' + p.lat + ',' + p.lng + ',\'' + (p.name || '').replace(/'/g, '') + '\')">🗺️ 길찾기</button>'
    + '<button class="sl-btn" onclick="refreshParkingSlide()">🔄 새로고침</button>'
    + (function() {
        var fid = 'park-' + p.id;
        var saved = typeof isFav !== 'undefined' && isFav(fid);
        return '<button class="sl-btn fav-btn' + (saved ? ' saved' : '') + '" id="slide-fav-btn"'
          + ' data-fid="' + fid + '" data-type="parking" data-pid="' + p.id + '"'
          + ' data-lat="' + p.lat + '" data-lng="' + p.lng + '"'
          + ' data-name="' + (p.name || '').replace(/"/g, '') + '"'
          + ' onclick="toggleFavBtn(this)">' + (saved ? '♥ 저장됨' : '♡ 저장') + '</button>';
      })()
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
  el.textContent = '🅿️ 여유 ' + avail + ' / ' + total + '곳';
  el.style.display = 'inline-block';
}
