/* ============================================================================
 * js/restaurants.js — 화성시 음식점 3,754곳 (2026-08-26, 개발 Claude)
 *
 * 왜 필요한가: 그동안 앱의 '맛집'은 모범음식점 94곳뿐이었다. 실제 데이터는
 * 3,754곳이 좌표 100% 로 준비돼 있었는데(js/restaurants-static.json) 화면이 없어
 * 통째로 놀고 있었다. 40배다.
 *
 * 데이터 모양: { meta, rows:[{n,c,a,t,x,y}, ...] }
 *   n=이름 c=업종 a=주소 t=전화 x=위도(문자열) y=경도(문자열)
 *   ⚠ x/y 가 문자열이라 그대로 쓰면 지도가 조용히 엉뚱한 곳을 잡는다. 로드할 때 숫자로 바꾼다.
 *   ⚠ x=lat, y=lng 다. 이름만 보면 x=경도로 착각하기 쉽다 — meta.schema 에 명시돼 있다.
 *
 * 구조는 js/localcurrency.js 를 그대로 따랐다. 27,374건을 이미 그 방식으로
 * 감당하고 있으므로, 3,754건에 새 방식을 발명할 이유가 없다:
 *   · 지연 로드 — 칩을 눌러야 649KB 를 받는다. '전체' 칩에는 포함하지 않는다
 *   · 줌 레벨로 개별 핀 / 격자 클러스터를 가른다
 *   · 뷰포트 밖은 안 그리고, 상한을 넘으면 화면 중심에서 가까운 순으로 자른다
 * ========================================================================== */

var rsData        = [];
var rsMap         = null;
var rsVisible     = false;
var rsDisplayItems = [];
var rsFilter      = 'all';
var rsLoaded      = false;
var _rsLoading    = false;

var RS_PIN_LEVEL  = 5;    /* 이 레벨 이하에서만 개별 핀. 지역화폐와 같은 기준 */
var RS_MAX_PINS   = 300;
var _rsCapNotifiedLevel = null;

/* 업종 18종을 6개 묶음으로 접는다. 칩이 18개면 가로 스크롤만 길어지고 아무도 안 쓴다.
 * 원본 분류는 슬라이드 카드에 그대로 보여 준다. */
var RS_CAT_GROUPS = [
  { k: 'all',   label: '전체',    cats: null },
  { k: 'korean',label: '한식',    cats: ['한식', '탕/국밥'] },
  { k: 'cafe',  label: '카페·간식', cats: ['카페/음료', '베이커리', '분식'] },
  { k: 'meat',  label: '고기·구이', cats: ['한식_고기', '족발/보쌈'] },
  { k: 'world', label: '양·중·일', cats: ['양식', '중식', '일식', '아시안/외국', '피자'] },
  { k: 'sea',   label: '해산물',   cats: ['해산물'] },
  { k: 'fast',  label: '치킨·패스트푸드', cats: ['치킨', '패스트푸드'] },
  { k: 'etc',   label: '기타',     cats: ['면류', '뷔페', '술집/포차'] },
];
function _rsCatsOf(k) {
  var g = RS_CAT_GROUPS.filter(function (x) { return x.k === k; })[0];
  return g ? g.cats : null;
}

var RS_GRID = { 6: 0.020, 7: 0.030, 8: 0.045, 9: 0.070, 10: 0.110, 11: 0.170, 12: 0.260 };
var _rsIdleTimer = null;

function initRestaurants(map) {
  rsMap = map;
  kakao.maps.event.addListener(map, 'idle', onRsMapIdle);
}
function onRsMapIdle() {
  if (!rsVisible) return;
  clearTimeout(_rsIdleTimer);
  _rsIdleTimer = setTimeout(function () {
    if (rsVisible) updateRsDisplay();
  }, 100);
}

function setRsFilter(k) {
  rsFilter = k;
  document.querySelectorAll('.rs-fchip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.rcat === k);
  });
  _rsCapNotifiedLevel = null;   /* 필터가 바뀌면 상한 안내를 다시 낼 수 있어야 한다 */
  if (rsVisible) updateRsDisplay();
}

function setRsVisible(visible) {
  rsVisible = visible;
  var bar = document.getElementById('rs-filter-bar');
  if (!visible) {
    _rsSelClear();
    clearRsDisplay();
    if (bar) bar.style.display = 'none';
    return;
  }
  if (bar) bar.style.display = 'block';
  if (!rsLoaded) { _loadRsData(function () { if (rsVisible) updateRsDisplay(); }); return; }
  updateRsDisplay();
}

/* 649KB. 칩을 눌러야 받는다 — '전체' 칩에 끼우면 지도를 열자마자 내려받게 된다. */
function _loadRsData(cb) {
  if (rsLoaded || _rsLoading) { if (rsLoaded && cb) cb(); return; }
  _rsLoading = true;
  var el = document.getElementById('rs-filter-scroll');
  if (el) el.dataset.loading = '1';
  fetch('js/restaurants-static.json?v=' + (typeof DL_VER !== 'undefined' ? DL_VER : '20260826'))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      /* x/y 가 문자열이라 여기서 한 번에 숫자로 바꾼다. 뒤에서 매 프레임 변환하면
       * 3,754건 × idle 마다라 헛일이 크다. 좌표가 깨진 행은 아예 버린다. */
      rsData = (j.rows || []).map(function (r) {
        var lat = parseFloat(r.x), lng = parseFloat(r.y);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { n: r.n, c: r.c, a: r.a, t: r.t, lat: lat, lng: lng };
      }).filter(Boolean);
      rsLoaded = true; _rsLoading = false;
      if (el) delete el.dataset.loading;
      if (cb) cb();
    })
    .catch(function () {
      _rsLoading = false;
      if (el) delete el.dataset.loading;
      if (typeof showToast === 'function') showToast('음식점 정보를 불러오지 못했어요');
    });
}

/* ⚠ 여기서 _rsSelClear() 를 부르면 안 된다 — updateRsDisplay 첫 줄에서 idle 마다
 * 불리므로, 선택 직후 카메라 이동이 일으키는 idle 에 강조가 즉시 사라진다.
 * (js/localcurrency.js 에서 실제로 겪은 문제다.) 정리는 setRsVisible(false) 에서만. */
function clearRsDisplay() {
  rsDisplayItems.forEach(function (item) {
    if (item._clickHandler) kakao.maps.event.removeListener(item, 'click', item._clickHandler);
    item.setMap(null);
  });
  rsDisplayItems = [];
}

function updateRsDisplay() {
  if (!rsMap || !rsData.length) return;
  clearRsDisplay();
  var level = rsMap.getLevel();
  var bounds = rsMap.getBounds();
  if (level <= RS_PIN_LEVEL) showRsViewportMarkers(bounds);
  else showRsClusters(bounds, level);
}

function showRsViewportMarkers(bounds) {
  var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var latPad = (ne.getLat() - sw.getLat()) * 0.1;
  var lngPad = (ne.getLng() - sw.getLng()) * 0.1;
  var cats = _rsCatsOf(rsFilter);

  var hits = rsData.filter(function (p) {
    if (cats && cats.indexOf(p.c) === -1) return false;
    return p.lat >= sw.getLat() - latPad && p.lat <= ne.getLat() + latPad &&
           p.lng >= sw.getLng() - lngPad && p.lng <= ne.getLng() + lngPad;
  });

  /* 상한을 넘으면 화면 중심에서 가까운 순으로 자른다.
   * 배열 순서로 자르면 화면 구석 것만 남을 수 있다. */
  if (hits.length > RS_MAX_PINS) {
    var ctr = rsMap.getCenter(), cy = ctr.getLat(), cx = ctr.getLng();
    hits.sort(function (a, b) {
      return ((a.lat - cy) * (a.lat - cy) + (a.lng - cx) * (a.lng - cx)) -
             ((b.lat - cy) * (b.lat - cy) + (b.lng - cx) * (b.lng - cx));
    });
    if (_rsCapNotifiedLevel !== rsMap.getLevel() && typeof showToast === 'function') {
      _rsCapNotifiedLevel = rsMap.getLevel();
      showToast('음식점 ' + hits.length.toLocaleString() + '곳 중 가까운 ' +
                RS_MAX_PINS + '곳만 표시 — 더 확대해 주세요');
    }
    hits = hits.slice(0, RS_MAX_PINS);
  }

  hits.forEach(function (p) {
    var marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      map: rsMap,
    });
    marker._clickHandler = (function (pp) { return function () { showRsSlide(pp); }; })(p);
    kakao.maps.event.addListener(marker, 'click', marker._clickHandler);
    rsDisplayItems.push(marker);
  });
}

function showRsClusters(bounds, level) {
  var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var grid = RS_GRID[level] || 0.26;
  var pad  = grid * 0.5;
  var minLat = sw.getLat() - pad, maxLat = ne.getLat() + pad;
  var minLng = sw.getLng() - pad, maxLng = ne.getLng() + pad;
  var cats = _rsCatsOf(rsFilter);
  var cells = {};

  rsData.forEach(function (p) {
    if (cats && cats.indexOf(p.c) === -1) return;
    if (p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng) return;
    var key = Math.floor(p.lat / grid) + '_' + Math.floor(p.lng / grid);
    var c = cells[key] || (cells[key] = { n: 0, lat: 0, lng: 0 });
    c.n++; c.lat += p.lat; c.lng += p.lng;
  });

  Object.keys(cells).forEach(function (k) {
    var c = cells[k];
    var lat = c.lat / c.n, lng = c.lng / c.n;
    var size = c.n >= 500 ? 54 : c.n >= 200 ? 48 : c.n >= 50 ? 42 : 36;
    var el = document.createElement('div');
    el.className = 'rs-cluster';
    el.style.width = el.style.height = size + 'px';
    el.textContent = c.n >= 1000 ? (c.n / 1000).toFixed(1) + 'k' : c.n;
    el.onclick = (function (clat, clng, lv) {
      return function () {
        rsMap.setLevel(Math.max(RS_PIN_LEVEL, lv - 2), { anchor: new kakao.maps.LatLng(clat, clng) });
        setTimeout(function () { rsMap.setCenter(new kakao.maps.LatLng(clat, clng)); }, 180);
      };
    })(lat, lng, level);
    var ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: el, yAnchor: 0.5, zIndex: 4, map: rsMap,
    });
    rsDisplayItems.push(ov);
  });
}

/* ── 선택 강조 ────────────────────────────────────────────────────────────
   네이티브 Marker 라 .selected 클래스를 못 붙인다. 지역화폐와 같은 링 오버레이를 쓴다
   (js/localcurrency.js _lcSelect 참고). 링은 좌표에 붙어 있어 핀이 다시 그려져도 남는다. */
var _rsSelOv = null;
function _rsSelect(p) {
  _rsSelClear();
  if (!rsVisible || !rsMap || typeof kakao === 'undefined') return;
  var el = document.createElement('div');
  el.className = 'lc-sel-ring';   /* 같은 신호이므로 같은 규칙을 쓴다 */
  _rsSelOv = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(p.lat, p.lng),
    content: el, yAnchor: 1.0, zIndex: 150, map: rsMap,
  });
}
function _rsSelClear() {
  if (_rsSelOv) { _rsSelOv.setMap(null); _rsSelOv = null; }
}

function showRsSlide(p) {
  if (typeof clearSelectedPin === 'function') clearSelectedPin();
  _rsSelect(p);
  if (typeof registerSelectedPin === 'function') registerSelectedPin(_rsSelClear);
  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(p.lat, p.lng, 50, 240);

  var safeName = (p.n || '').replace(/'/g, '');
  var inner = document.getElementById('slide-inner');
  if (!inner) return;
  inner.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">' +
      '<span style="background:#FEF3C7;color:#B45309;font-size:11px;font-weight:700;' +
      'padding:3px 10px;border-radius:20px">🍽️ 음식점</span>' +
      (p.c ? '<span style="background:#F1F5F9;color:var(--text-sub);font-size:11px;' +
             'font-weight:600;padding:3px 10px;border-radius:20px">' + p.c + '</span>' : '') +
    '</div>' +
    '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:6px">' + (p.n || '') + '</div>' +
    (p.a ? '<div class="sl-addr" style="margin-bottom:' + (p.t ? '6px' : '16px') + '" ' +
           'data-addr="' + (p.a || '').replace(/"/g, '&quot;') + '" ' +
           'onclick="copyAddress(this.dataset.addr)">' + p.a + '</div>' : '') +
    (p.t ? '<div style="font-size:13px;margin-bottom:16px">' +
           '<a href="tel:' + p.t + '" style="color:var(--primary);font-weight:700;text-decoration:none">📞 ' + p.t + '</a>' +
           '</div>' : '') +
    '<div class="sl-actions">' +
      '<button class="sl-btn primary" onclick="openRoute(' + p.lat + ',' + p.lng + ',\'' + safeName + '\')">🗺️ 길찾기</button>' +
      '<button class="sl-btn" onclick="window.open(\'https://map.kakao.com/?q=' + encodeURIComponent(p.n || '') + '\',\'_blank\')">🔍 카카오지도</button>' +
    '</div>' +
    '<button class="sl-btn" style="width:100%;margin-top:8px;background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" ' +
      'onclick="goNearestParkingRs(' + p.lat + ',' + p.lng + ',\'' + safeName + '\')">🅿️ 가장 가까운<br>공영주차장 찾기</button>';

  var slide = document.getElementById('place-slide');
  var dim   = document.getElementById('map-dim');
  if (slide) slide.classList.add('open');
  if (dim) dim.classList.add('show');
}

/* 지역화폐(goNearestParkingLc)와 같은 골격이다 — 새 NP 로직을 만들지 않는다.
 * 콜백은 NP 진입 때 꺼 둔 레이어·칩을 되살린다. 복원하지 않으면 뒤로가기 후 빈 지도만 남는다. */
function goNearestParkingRs(lat, lng, name) {
  if (typeof _goNPCore !== 'function') {
    if (typeof goMapCat === 'function') goMapCat('parking');
    return;
  }
  _goNPCore(lat, lng, name, '🍽️', function () {
    var chip = document.querySelector('#map-chips .chip[data-cat="restaurant"]');
    if (chip) chip.classList.add('active');
    setRsVisible(true);
    var p = rsData.find(function (x) { return x.n === name; });
    if (p) showRsSlide(p);
  });
}
