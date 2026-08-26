'use strict';

var lcData        = [];
var lcMap         = null;
var lcVisible     = false;
var lcDisplayItems = [];   /* 현재 지도에 올라간 Marker / CustomOverlay */
var lcFilter      = 'all'; /* 업종 필터 */

var LC_PIN_LEVEL  = 5;     /* 이 레벨 이하에서만 개별 핀 표시 */
var LC_MAX_PINS   = 300;   /* 한 뷰포트에 그릴 개별 핀 상한 — 동탄 레벨5는 3,000곳이 넘는다 */
var _lcCapNotifiedLevel = null;  /* 상한 안내 토스트는 레벨당 1회만 */

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
  /* 레이어를 끄면 핀이 사라지므로 선택 링도 함께 지운다.
   * (idle 마다 도는 clearLcDisplay 가 아니라 여기가 맞는 자리다 — 그 함수 주석 참고) */
  if (!visible) { _lcSelClear(); clearLcDisplay(); return; }
  /* 데이터 미로드 시 지연 fetch 후 렌더 */
  if (!lcData.length) {
    if (typeof _loadLcData === 'function') {
      _loadLcData(function () { if (lcVisible) updateLcDisplay(); });
    }
    return;
  }
  updateLcDisplay();
}

/* ── 현재 표시 중인 것 전부 제거 ── */
/* ⚠ 여기서 _lcSelClear() 를 부르면 안 된다 — 이 함수는 updateLcDisplay() 첫 줄에서
 * idle 마다 불린다. 선택 직후 _panPinAboveSlide 가 일으키는 pan 도 idle 이라
 * 링이 뜨자마자 지워진다. 링 정리는 레이어를 끌 때(setLcVisible)만 한다. */
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

  var hits = lcData.filter(function (p) {
    if (!p.lat || !p.lng) return false;
    if (activeCats && activeCats.indexOf(p.c) === -1) return false;
    return p.lat >= sw.getLat() - latPad && p.lat <= ne.getLat() + latPad &&
           p.lng >= sw.getLng() - lngPad && p.lng <= ne.getLng() + lngPad;
  });

  /* ⚠ 같은 좌표에 여러 가맹점이 쌓여 있다 — 한 건물에 입점한 상가들이다.
   * 전체 27,374건의 고유 좌표는 10,755개뿐이고, 한 점에 최대 241건이 겹친다
   * (동탄대로시범길 134 한 건물).
   *
   * 예전에는 '가맹점' 단위로 300개를 잘랐다. 그러면 동탄 중심에서
   * 핀을 300개 그려도 화면에는 겹친 탓에 28개 점만 보이고, 후보 2,567건 중
   * 2,267건이 잘려 나갔다(2026-08-26 실측). 상한을 겹친 핀이 잡아먹은 것이다.
   *
   * 그래서 '좌표' 단위로 묶은 뒤 좌표 기준으로 자른다. 같은 300 상한으로도
   * 화면에 보이는 점이 28 → 300개가 되고, 담기는 가맹점 수는 훨씬 많아진다.
   * 겹친 자리는 마커 하나로 두고 누르면 그 건물의 목록을 보여 준다. */
  var buckets = {};
  hits.forEach(function (p) {
    var k = p.lat + ',' + p.lng;
    (buckets[k] || (buckets[k] = { lat: p.lat, lng: p.lng, items: [] })).items.push(p);
  });
  var spots = Object.keys(buckets).map(function (k) { return buckets[k]; });

  if (spots.length > LC_MAX_PINS) {
    var ctr = lcMap.getCenter(), cy = ctr.getLat(), cx = ctr.getLng();
    spots.sort(function (a, b) {
      return ((a.lat - cy) * (a.lat - cy) + (a.lng - cx) * (a.lng - cx)) -
             ((b.lat - cy) * (b.lat - cy) + (b.lng - cx) * (b.lng - cx));
    });
    spots = spots.slice(0, LC_MAX_PINS);
    var shown = spots.reduce(function (n, s) { return n + s.items.length; }, 0);
    if (_lcCapNotifiedLevel !== lcMap.getLevel() && typeof showToast === 'function') {
      _lcCapNotifiedLevel = lcMap.getLevel();
      showToast('가맹점 ' + hits.length.toLocaleString() + '곳 중 가까운 ' +
                shown.toLocaleString() + '곳 표시 — 더 확대하면 전부 보여요');
    }
  }

  spots.forEach(function (sp) {
    var marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(sp.lat, sp.lng),
      map: lcMap,
    });
    marker._clickHandler = (function (bucket) {
      return function () {
        if (bucket.items.length === 1) showLcSlide(bucket.items[0]);
        else showLcSpotSlide(bucket);
      };
    })(sp);
    kakao.maps.event.addListener(marker, 'click', marker._clickHandler);
    lcDisplayItems.push(marker);
  });

  /* 겹친 자리에 몇 곳이 있는지 숫자로 알린다. 마커는 네이티브라 배지를 못 붙이므로
   * 작은 오버레이를 얹는다. 2곳 이상인 자리만 — 전부 붙이면 화면이 숫자로 덮인다. */
  spots.forEach(function (sp) {
    if (sp.items.length < 2) return;
    var el = document.createElement('div');
    el.className = 'lc-count-badge';
    el.textContent = sp.items.length > 99 ? '99+' : sp.items.length;
    var ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(sp.lat, sp.lng),
      content: el, yAnchor: 2.2, xAnchor: -0.15, zIndex: 5, map: lcMap,
    });
    lcDisplayItems.push(ov);
  });
}

/* 한 좌표에 여러 가맹점이 있을 때 — 그 건물의 목록을 보여 준다.
 * 예전에는 마지막 하나만 클릭됐고 나머지는 닿을 방법이 없었다. */
function showLcSpotSlide(bucket) {
  if (typeof clearSelectedPin === 'function') clearSelectedPin();
  _lcSelect(bucket.items[0]);
  if (typeof registerSelectedPin === 'function') registerSelectedPin(_lcSelClear);
  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(bucket.lat, bucket.lng, 50, 300);

  var addr = (bucket.items[0].a || '').replace('경기도 화성시 ', '');
  var inner = document.getElementById('slide-inner');
  if (!inner) return;
  inner.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">' +
      '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;' +
      'padding:3px 10px;border-radius:20px">지역화폐 가맹점 ' + bucket.items.length + '곳</span>' +
    '</div>' +
    '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">' + addr + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">이 건물에 있는 가맹점이에요</div>' +
    '<div class="lc-spot-list">' +
      bucket.items.map(function (p, i) {
        return '<div class="lc-spot-item" onclick="showLcSlide(_lcSpotPick(' + i + '))">' +
                 '<div class="lc-spot-name">' + (p.n || '') + '</div>' +
                 '<div class="lc-spot-cat">' + (p.c || '') + '</div>' +
               '</div>';
      }).join('') +
    '</div>';
  _lcSpotBucket = bucket;

  var slide = document.getElementById('place-slide');
  var dim   = document.getElementById('map-dim');
  if (slide) slide.classList.add('open');
  if (dim) dim.classList.add('show');
}
/* 목록에서 하나를 고를 때 쓰는 임시 참조 — onclick 문자열에 객체를 못 넣는다 */
var _lcSpotBucket = null;
function _lcSpotPick(i) { return (_lcSpotBucket && _lcSpotBucket.items[i]) || null; }

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
/* ── 선택 강조 ──────────────────────────────────────────────────────────────
   지역화폐 핀만 네이티브 kakao.maps.Marker 다 — 한 화면에 최대 300개(LC_MAX_PINS)라
   CustomOverlay 로 만들면 무겁기 때문이다. DOM 이 없으니 다른 핀들처럼
   .selected 클래스를 붙일 수 없다. 그래서 같은 '선택됨' 신호를 링 오버레이로 낸다.
   링은 좌표에 붙어 있어, 핀이 idle 마다 새로 만들어져도 그대로 남는다. */
var _lcSelOv = null;

function _lcSelect(p) {
  _lcSelClear();
  /* 핀이 안 보이는 상태(즐겨찾기·홈 검색으로 바로 진입)면 링만 떠서 이상하다. */
  if (!lcVisible || !lcMap || typeof kakao === 'undefined') return;
  if (!p || !p.lat || !p.lng) return;
  var el = document.createElement('div');
  el.className = 'lc-sel-ring';
  _lcSelOv = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(p.lat, p.lng),
    content:  el,
    yAnchor:  1.0,   /* 네이티브 마커의 기준점이 바닥 끝이라 링도 거기에 맞춘다 */
    zIndex:   150,
    map:      lcMap,
  });
}

function _lcSelClear() {
  if (_lcSelOv) { _lcSelOv.setMap(null); _lcSelOv = null; }
}

function showLcSlide(p) {
  /* 관광지 핀에만 있던 선택 강조를 여기에도 적용한다 (2026-08-26 사용자 요청). */
  if (typeof clearSelectedPin === 'function') clearSelectedPin();
  _lcSelect(p);
  if (typeof registerSelectedPin === 'function') registerSelectedPin(_lcSelClear);

  if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(p.lat, p.lng, 50, 240);
  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;'
    + 'padding:3px 10px;border-radius:20px"><img src="img/gyeonggi_currency_logo.png" alt="" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:3px"> 지역화폐 가맹점</span>'
    + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:4px">' + p.n + '</div>'
    + '<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:6px">' + p.c + '</div>'
    + '<div class="sl-addr" style="margin-bottom:16px" data-addr="' + (p.a || '').replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + (p.a || '') + '</div>'
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute('
    + p.lat + ',' + p.lng + ',\'' + (p.n || '').replace(/'/g, '') + '\')">🗺️ 길찾기</button>'
    + '<button class="sl-btn" style="background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" onclick="goNearestParkingLc('
    + p.lat + ',' + p.lng + ',\'' + (p.n || '').replace(/'/g, '') + '\')">🅿️ 가장 가까운<br>공영주차장 찾기</button>'
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
