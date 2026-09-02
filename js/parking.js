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
/* ── 실시간 값이 '지금 값' 인지 '상류가 죽어서 내주는 낡은 값' 인지 ──────────
 *
 * tools/server.py 의 _serve_upstream() 이 모든 응답에 헤더를 붙인다.
 *   X-Cache: fresh  상류에서 방금 받았다
 *          : cache  TTL(45초) 안이라 캐시를 준다 — 충분히 새 값이다
 *          : stale  **상류가 죽어서 낡은 값을 준다**
 *   X-Cache-Age: 초
 *
 * ⚠ `stale` 일 때만 화면에 알린다. `cache` 는 최대 45초라 알릴 값이 아니다.
 *   §1 이 「낡은 값을 새 값인 척 보여주지 않는다」를 규칙으로 두고 있고, 이 앱에서
 *   주차 실시간은 틀리면 사용자가 헛걸음하는 핵심 기능이라 그 구분이 중요하다.
 *
 * ⚠ age 만 보고 판단하지 마라. 캐시는 요청이 올 때만 갱신하는 지연 방식이라
 *   방문자가 없으면 age 는 계속 늘어난다 — 그건 장애가 아니라 트래픽 지표다
 *   (2026-09-02 배포 Claude 실측). 건강 판정은 X-Cache 로 한다. */
var _rtStale = false;   /* 마지막 응답이 stale 이었나 */
var _rtAge   = 0;       /* 그때의 X-Cache-Age (초) */

/* 세 곳(fetchParkingAll·refreshParking·refreshParkingSlide)이 같은 응답을 다르게
 * 읽고 있었다. 헤더를 살리려면 r.json() 앞에서 가로채야 해서 한 곳으로 모은다. */
function _fetchRealtime() {
  return fetch('/api/parking/realtime').then(function (r) {
    var c = r.headers.get('X-Cache');
    var a = parseFloat(r.headers.get('X-Cache-Age'));
    return r.json().then(function (j) {
      _rtStale = (c === 'stale');
      _rtAge   = isFinite(a) ? a : 0;
      return j;
    });
  });
}

/* '5시간 전 기준' 처럼 사람이 읽는 말로. stale 이 아니면 빈 문자열이다. */
function _staleNote() {
  if (!_rtStale) return '';
  var m = Math.round(_rtAge / 60);
  var when = m < 1 ? '방금 전' : (m < 60 ? m + '분 전' : Math.round(m / 60) + '시간 전');
  return when;
}

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
    /* ⚠ innerHTML 을 통째로 갈면 스크롤 주체인 #slide-inner(css/20-map.css 의 .slide-inner
     * 는 overflow-y:auto) 의 scrollTop 이 0 으로 잘린다 — 요금 안내를 보려고 내려 둔 카드가
     * 60초마다 저 혼자 맨 위로 튀고, 누르려던 버튼 자리에 다른 것이 올라온다.
     * 같은 요소의 '내용' 만 바뀌므로 대입 뒤 되돌리면 된다.
     * quiet=true 는 '사용자가 새로 연 게 아니다' 라는 뜻이다 — showParkingSlide 주석 참고. */
    if (_cur) {
      var _si = document.getElementById('slide-inner');
      var _sy = _si ? _si.scrollTop : 0;
      showParkingSlide(_cur, true);
      if (_si) _si.scrollTop = _sy;
    }
  }
}

/* ── 정적 + 실시간 데이터 로드 ── */
function fetchParkingAll() {
  /* DOMContentLoaded에서 이미 static JSON을 로드했으면 재사용 */
  var staticP = parkingData.length
    ? Promise.resolve(null)
    : fetch('js/parking-static.json?v=20260826168').then(function (r) { return r.json(); });

  staticP
    .then(function (list) {
      if (list) { mergeParkingData(list, []); updateParkingCount(); }
      return _fetchRealtime().catch(function () { return null; });
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
  _fetchRealtime()
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
/* ── 핀 글자색 (2026-08-27 사용자 지시) ──────────────────────────────────
 * 잔여 대수는 **전부 흰 글씨**다. 색은 css/20-map.css 의 .pk-count 가 준다.
 *
 * 2026-08-26 감사 때는 반대로 갔었다 — 핀 배경이 빨강→초록 그라데이션이라
 * 색마다 밝기가 달라서, 밝은 핀에는 검은 글씨를 어두운 핀에는 흰 글씨를 쓰도록
 * 뒤집었다. WCAG AA 4.5:1 을 맞추려던 것이다.
 * 그런데 그게 **핀마다 글자색이 달라 보이는** 결과를 낳았고 사용자가 지적했다 —
 * "이거 다 하얀색 글씨로 바꿔줘".
 *
 * ⚠ 대비는 실측해서 알고 간다. hsl(h,72%,42%) 위의 흰 글씨는
 *     빨강(h=0) 6.47:1 · 주황(h=24) 4.58:1 · **노랑(h=60) 2.11:1** · 초록(h=114) 2.62:1
 *   여유가 25% 를 넘는 구간부터 AA(4.5:1)를 못 넘긴다.
 *   명도를 30% 까지 낮춰 봐도 최저 3.99:1 이라 어차피 못 넘긴다 — 그래서
 *   '배경을 어둡게 해서 해결' 은 애초에 없는 선택지다.
 * ⚠ 그래도 정보가 사라지지는 않는다. 이 핀에서 잔여 상태를 알리는 1차 수단은
 *   **글자가 아니라 색 자체**이고 숫자는 보조다. 그리고 '가장 가까운 주차장'
 *   모드의 핀(.np-pill, css/40-quiz.css)은 처음부터 흰 글씨 고정이었다 —
 *   같은 데이터를 두 핀이 다른 색으로 쓰던 것이 오히려 어긋난 상태였다.
 * ⚠ 읽기 어렵다는 말이 나오면 글자색을 되돌리지 말고 .pk-count 에 text-shadow 를
 *   얹어라. 다시 뒤집으면 사용자가 지적한 그 상태로 돌아간다.
 *
 * 아래 pkInkOn 은 남는다. 방향이 반대다 — 흰 원판 위의 'P' 라서
 * 밝은 핀 색을 그대로 쓰면 안 보인다. */

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
    + '<span class="pk-count">' + status + '</span>'
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
 *    숫자 색은 옛 값 그대로 남았다 — 뒤의 핀과 앞의 카드가 서로 다른 값을 보였다.
 *    이제는 _applyRealtime 이 열린 카드까지 (스크롤을 지키며) 다시 그린다. */
function refreshParkingSlide() {
  _fetchRealtime()
    .then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.data)) throw new Error('bad');
      /* 여기서 카드를 한 번 더 그리면 안 된다 — _applyRealtime 이 이미 스크롤을
       * 지키며 그렸는데, 덧그리면 '🔄 새로고침' 을 누른 사람의 스크롤만 튄다. */
      _applyRealtime(res);
      showToast('새로고침 완료');
    })
    .catch(function () { showToast('지금은 실시간 정보를 받지 못했어요'); });
}

function showParkingSlide(p, quiet) {
  /* '최근 본' 기록 지점 (js/home.js pushRecent). 관광지는 js/map.js showPlaceSlide 가 건다.
   * 주차장 id 는 관광지 id 와 60개가 겹치므로 종류를 반드시 함께 넘긴다.
   * quiet = 자동 갱신에서 온 재렌더. 이미 목록 맨 앞에 있는 항목을 60초마다 다시 쓰고
   * renderRecentSection() 으로 홈 DOM 을 재생성하는 헛일을 막는다.
   * 기존 호출부(onParkingClick·js/map.js·js/mapnav.js)는 인자를 안 넘기므로 그대로다. */
  if (!quiet && typeof pushRecent === 'function') pushRecent(p, 'parking');
  if (p && p.id != null) _pkSelect(p.id);   /* 선택 핀 강조 — 위 _pkSelect 주석 참고 */

  var color   = pinColorCached(p);
  /* 상류(smartparking)가 초과 주차 구간에서 CURRENT_CNT 를 음수로 보낸다(2026-08-31 실측).
   * 핀은 statusText 가 '만차' 라고 쓰는데 카드만 '-10' 을 찍으면 같은 데이터의 앞뒤가
   * 서로 다른 말을 한다. 표시 문자열만 핀과 맞춘다 — p.avail 자체는 건드리지 않는다.
   * 총 면수보다 많은 값은 핀과 카드가 이미 일치하므로 상한을 두지 않는다(깎으면 오히려 어긋난다). */
  var avail   = !p.open ? '-' : (p.avail < 0 ? '만차' : p.avail);
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
    /* 상류가 죽어 낡은 값을 내주는 중이면 '현재' 라고 말하지 않는다.
     * 이 앱에서 주차 실시간은 틀리면 사용자가 헛걸음하는 핵심 기능이라(§1),
     * 「빈자리 12면」과 「5시간 전 기준 12면」을 같은 얼굴로 보여주면 안 된다. */
    + '<span style="font-size:13px;color:var(--text-sub)">' + (_rtStale ? '여유' : '현재 여유') + '</span>'
    + '<span style="font-size:22px;font-weight:900;color:' + color + '">' + avail
    + '<span style="font-size:13px;font-weight:500;color:var(--text-muted)"> / ' + p.total + '면</span></span></div>'
    + (_rtStale
        ? '<div style="font-size:12px;color:#B45309;background:#FEF3C7;border-radius:6px;padding:6px 8px;margin-bottom:8px">'
          + '⚠️ 실시간 정보를 받지 못해 <b>' + _staleNote() + ' 기준</b> 값을 보여 드려요. 가시기 전에 전화로 확인해 주세요.'
          + '</div>'
        : '')
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
