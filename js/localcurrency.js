'use strict';

var lcData        = [];
var lcMap         = null;
var lcVisible     = false;
var lcDisplayItems = [];   /* 현재 지도에 올라간 Marker / CustomOverlay */
var lcFilter      = 'all'; /* 업종 필터 */
var _selectedLcEl = null;  /* 현재 selected 상태인 cm-pin DOM el */

var LC_PIN_LEVEL  = 5;     /* 이 레벨 이하에서만 개별 핀 표시 */

/* 업종 그룹 → 원본 업종명 배열 */
var LC_CAT_MAP = {
  food:   ['일반음식점','치킨전문점','중식전문점','일식전문점','서양식전문점','기타식음료품','식음료기타','일반주점'],
  cafe:   ['커피전문점','제과.제빵'],
  mart:   ['편의점','슈퍼마켓.마트'],
  beauty: ['미용실두발전문','피부.체형미관리','화장품'],
  health: ['약국','치과','한의원'],
  car:    ['자동차정비','차량부품.용품','세차장'],
  edu:    ['기타교육.교습.학원','입시학원,보습학원','예체능계열학원','무수도장 등학원','외국어학원']
};

/* 줌 레벨별 격자 크기(도 단위) — 격자 하나 = 클러스터 원 하나 */
var LC_GRID = {
  14: 0.30, 13: 0.15, 12: 0.08, 11: 0.05, 10: 0.03,
   9: 0.02,  8: 0.012, 7: 0.008, 6: 0.005
};

/* ── 초기화: idle 이벤트만 등록, 데이터 fetch는 setLcVisible(true) 시 지연로드 ── */
var _lcIdleTimer = null;

function initLocalCurrency(map) {
  lcMap = map;
  kakao.maps.event.addListener(map, 'idle', onLcMapIdle);
}

function onLcMapIdle() {
  clearTimeout(_lcIdleTimer);
  _lcIdleTimer = setTimeout(function () {
    if (lcVisible) updateLcDisplay();
  }, 80);
}

/* ── 업종 필터 ── */
function setLcFilter(cat) {
  lcFilter = cat;
  document.querySelectorAll('.lc-fchip').forEach(function(c) {
    c.classList.toggle('active', c.dataset.lcat === cat);
  });
  if (lcVisible) updateLcDisplay();
}

/* ── 표시/숨김 ── */
function setLcVisible(visible) {
  lcVisible = visible;
  if (!visible) { clearLcDisplay(); return; }
  /* 데이터 미로드 시 지연 fetch 후 렌더 */
  if (!lcData.length) {
    if (typeof _loadLcData === 'function') {
      _loadLcData(function () { if (lcVisible) updateLcDisplay(); });
    }
    return;
  }
  updateLcDisplay();
}

/* ── 선택 상태 해제 (슬라이드 닫힐 때 호출) ── */
function clearLcSelection() {
  if (_selectedLcEl) {
    _selectedLcEl.classList.remove('selected');
    _selectedLcEl = null;
  }
}

/* ── 현재 표시 중인 것 전부 제거 ── */
function clearLcDisplay() {
  lcDisplayItems.forEach(function (item) {
    if (item._clickHandler) {
      kakao.maps.event.removeListener(item, 'click', item._clickHandler);
    }
    item.setMap(null);
  });
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

/* ── 뷰포트 안 가맹점만 개별 마커로 표시 ── */
function showViewportMarkers(bounds) {
  var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  var latPad = (ne.getLat() - sw.getLat()) * 0.1;
  var lngPad = (ne.getLng() - sw.getLng()) * 0.1;
  var activeCats = lcFilter !== 'all' ? (LC_CAT_MAP[lcFilter] || []) : null;

  lcData.filter(function (p) {
    if (!p.lat || !p.lng) return false;
    if (activeCats && activeCats.indexOf(p.c) === -1) return false;
    return p.lat >= sw.getLat() - latPad && p.lat <= ne.getLat() + latPad &&
           p.lng >= sw.getLng() - lngPad && p.lng <= ne.getLng() + lngPad;
  }).forEach(function (p) {
    var wrap = document.createElement('div');
    wrap.className = 'cm-pin';
    var circle = document.createElement('div');
    circle.className = 'cm-circle';
    circle.style.background = '#16A34A';
    circle.textContent = '₩';
    var tail = document.createElement('div');
    tail.className = 'cm-tail';
    tail.style.borderTopColor = '#16A34A';
    wrap.appendChild(circle);
    wrap.appendChild(tail);

    (function (pp, el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_selectedLcEl) _selectedLcEl.classList.remove('selected');
        _selectedLcEl = el;
        el.classList.add('selected');
        showLcSlide(pp);
      });
    })(p, wrap);

    var overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   5,
      map:      lcMap,
    });
    lcDisplayItems.push(overlay);
  });
}

/* ── 격자 기반 클러스터 원 표시 ── */
function showClusters(bounds, level) {
  var sw  = bounds.getSouthWest();
  var ne  = bounds.getNorthEast();
  var pad = (LC_GRID[level] || 0.02) * 0.5;
  var minLat = sw.getLat() - pad, maxLat = ne.getLat() + pad;
  var minLng = sw.getLng() - pad, maxLng = ne.getLng() + pad;
  var grid   = LC_GRID[level] || 0.02;

  /* 뷰포트 내 데이터를 격자 셀로 묶기 */
  var cells = {};
  var _activeCats = lcFilter !== 'all' ? (LC_CAT_MAP[lcFilter] || []) : null;
  lcData.forEach(function (p) {
    if (!p.lat || !p.lng) return;
    if (_activeCats && _activeCats.indexOf(p.c) === -1) return;
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

    /* 클릭 시 해당 지점으로 부드럽게 줌인 */
    el.onclick = (function (clat, clng, lv) {
      return function () {
        var dest = new kakao.maps.LatLng(clat, clng);
        var targetLevel = Math.max(1, lv - 2);
        lcMap.panTo(dest);
        setTimeout(function () {
          lcMap.setLevel(targetLevel, { animate: { duration: 400 } });
        }, 180);
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
  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(p.lat, p.lng, 50, 240);
  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;'
    + 'padding:3px 10px;border-radius:20px"><img src="img/gyeonggi_currency_logo.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:3px"> 지역화폐 가맹점</span>'
    + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:4px">' + p.n + '</div>'
    + '<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:6px">' + p.c + '</div>'
    + '<div class="sl-addr" style="margin-bottom:16px" data-addr="' + (p.a || '').replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + (p.a || '') + '</div>'
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute('
    + p.lat + ',' + p.lng + ',\'' + (p.n || '').replace(/'/g, '') + '\')">🗺 길찾기</button>'
    + '<button class="sl-btn" style="background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" onclick="goNearestParkingLc('
    + p.lat + ',' + p.lng + ',\'' + (p.n || '').replace(/'/g, '') + '\')">🅿 가장 가까운 공영주차장 찾기</button>'
    + (function() {
        var fid = 'lc-' + p.id;
        var saved = typeof isFav !== 'undefined' && isFav(fid);
        return '<button class="sl-btn fav-btn' + (saved ? ' saved' : '') + '" id="slide-fav-btn"'
          + ' data-fid="' + fid + '" data-type="lc" data-pid="' + p.id + '"'
          + ' data-lat="' + p.lat + '" data-lng="' + p.lng + '"'
          + ' data-name="' + (p.n || '').replace(/"/g, '') + '"'
          + ' data-lcat="' + (p.c || '').replace(/"/g, '') + '"'
          + ' data-laddr="' + (p.a || '').replace(/"/g, '') + '"'
          + ' onclick="toggleFavBtn(this)">' + (saved ? '♥ 저장됨' : '♡ 저장') + '</button>';
      })()
    + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}
