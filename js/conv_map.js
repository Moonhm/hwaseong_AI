'use strict';

/* ── 편의정보 지도 표시 모듈 ──────────────────────────────────
 * Kakao Maps services.Geocoder로 주소 → 좌표 변환 후 오버레이 표시
 * setFilter('mobeom' | 'touristrest' | 'hotel' | 'camping' | 'temple' | 'jebu')
 * ────────────────────────────────────────────────────────── */

var CONV_CAT_CFG = {
  mobeom: {
    label: '모범음식점', color: '#D97706', bg: '#FEF3C7', emoji: '🍽',
    getItems: function () { return CONVENIENCE.restaurants; },
    extraHtml: function (ex) { return ''; },
  },
  touristrest: {
    label: '관광식당업', color: '#DC2626', bg: '#FEE2E2', emoji: '🥢',
    getItems: function () { return CONVENIENCE.touristRestaurants; },
    extraHtml: function (ex) {
      return ex.cuisine ? '<div class="sl-addr">🍴 ' + ex.cuisine + (ex.area ? ' · ' + ex.area : '') + '</div>' : '';
    },
  },
  hotel: {
    label: '관광호텔', color: '#7C3AED', bg: '#EDE9FE', emoji: '🏨',
    getItems: function () { return CONVENIENCE.hotels; },
    extraHtml: function (ex) {
      return (ex.grade && ex.grade !== '-') ? '<div class="sl-addr">⭐ ' + ex.grade + ' · ' + ex.rooms + '실</div>' : '';
    },
  },
  camping: {
    label: '캠핑장', color: '#16A34A', bg: '#DCFCE7', emoji: '⛺',
    getItems: function () { return CONVENIENCE.camping; },
    extraHtml: function (ex) {
      return '<div class="sl-addr">🏕 야영 ' + ex.sites + '면 · ' + ex.fac + (ex.pub ? ' · 공영' : '') + '</div>';
    },
  },
  temple: {
    label: '템플스테이', color: '#92400E', bg: '#FDE68A', emoji: '🏯',
    getItems: function () { return [CONVENIENCE.templeStay]; },
    extraHtml: function (ex) {
      return '<div class="sl-addr">⏰ ' + (ex.schedule || '') + '</div>';
    },
  },
  jebu: {
    label: '제부도 숙박', color: '#0284C7', bg: '#E0F2FE', emoji: '⛱',
    getItems: function () {
      var j = CONVENIENCE.jebu;
      var all = [];
      (j.pension_outside || []).forEach(function (x) { all.push(Object.assign({}, x, { type: '관광펜션' })); });
      (j.inside          || []).forEach(function (x) { all.push(Object.assign({}, x, { type: '도서내 숙박' })); });
      (j.nearby          || []).forEach(function (x) { all.push(Object.assign({}, x, { type: '인근 숙박' })); });
      (j.minbak_inside   || []).forEach(function (x) { all.push(Object.assign({}, x, { type: '민박(도서내)' })); });
      (j.minbak_nearby   || []).forEach(function (x) { all.push(Object.assign({}, x, { type: '민박(인근)' })); });
      return all;
    },
    getFullAddr: function (item) {
      /* 서신면 제부도 주소 — 면 이름 필수 */
      return '경기도 화성시 서신면 ' + (item.addr || '');
    },
    extraHtml: function (ex) {
      return '<div class="sl-addr">🏠 ' + (ex.type || '숙박') + (ex.tel ? ' · 📞 ' + ex.tel : '') + '</div>';
    },
  },
};

/* 제부도: 지도 중심 좌표 (fitBounds 폴백용) */
var JEBU_LAT = 37.1578, JEBU_LNG = 126.5764;

/* state */
var CONV_PLACES = {};   /* cat → [{id, name, category, address, lat, lng, tags, desc, extra}] */
var CONV_OVMAP  = {};   /* id  → kakao.maps.CustomOverlay */
var CONV_ELMAP  = {};   /* id  → DOM el */
var CONV_STATUS = {};   /* cat → 'idle'|'loading'|'done' */
var _jebuOv     = null;

var CONV_CACHE_VER = 'v3'; /* 좌표 데이터 변경 시 올려서 캐시 무효화 */

/* localStorage 캐시 키 */
function _convCacheKey(cat) { return 'hwaseong_conv_' + CONV_CACHE_VER + '_' + cat; }

/* 캐시에서 좌표 로드 시도 → 성공하면 true */
function _loadConvCache(cat) {
  try {
    var raw = localStorage.getItem(_convCacheKey(cat));
    if (!raw) return false;
    var places = JSON.parse(raw);
    if (!places || !places.length) return false;
    CONV_PLACES[cat] = places;
    CONV_STATUS[cat] = 'done';
    _buildOverlays(cat, places);
    return true;
  } catch (e) { return false; }
}

/* 좌표 결과를 캐시에 저장 */
function _saveConvCache(cat, places) {
  try { localStorage.setItem(_convCacheKey(cat), JSON.stringify(places)); } catch (e) {}
}

/* ── 외부 진입점: 카테고리 표시 ── */
function showConvCat(cat) {
  if (!kakaoMap) return;

  var status = CONV_STATUS[cat] || 'idle';

  if (status === 'done') {
    (CONV_PLACES[cat] || []).forEach(function (p) {
      CONV_OVMAP[p.id] && CONV_OVMAP[p.id].setMap(kakaoMap);
    });
    _fitConv(cat);
    return;
  }

  if (status === 'loading') return;

  /* 캐시 우선 — 없으면 Geocoder 호출 */
  if (_loadConvCache(cat)) {
    (CONV_PLACES[cat] || []).forEach(function (p) {
      CONV_OVMAP[p.id] && CONV_OVMAP[p.id].setMap(kakaoMap);
    });
    _fitConv(cat);
    return;
  }

  _geocodeCat(cat);
}

/* ── 외부 진입점: 전체 숨기기 ── */
function hideAllConv() {
  Object.keys(CONV_PLACES).forEach(function (cat) {
    (CONV_PLACES[cat] || []).forEach(function (p) {
      CONV_OVMAP[p.id] && CONV_OVMAP[p.id].setMap(null);
    });
  });
  if (_jebuOv) _jebuOv.setMap(null);
}

/* ── Geocoding ── */
function _geocodeCat(cat) {
  if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
    showToast('Geocoder 서비스를 불러올 수 없습니다.');
    return;
  }

  var cfg      = CONV_CAT_CFG[cat];
  if (!cfg) return;
  CONV_STATUS[cat] = 'loading';

  var rawItems = cfg.getItems();
  if (!rawItems || !rawItems.length) { CONV_STATUS[cat] = 'done'; return; }

  showToast(cfg.label + ' 위치 로딩 중...');

  var geocoder = new kakao.maps.services.Geocoder();
  var results  = [];
  var total    = rawItems.length;
  var finished = 0;

  rawItems.forEach(function (item, i) {
    /* 괄호 내 동명 제거 — 도로명만 남겨 geocoding 정확도 향상 */
    var cleanAddr = (item.addr || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    var fullAddr  = cfg.getFullAddr
      ? cfg.getFullAddr(Object.assign({}, item, { addr: cleanAddr }))
      : '경기도 화성시 ' + cleanAddr;

    /* 10개씩 배치로 나눠 200ms 간격 — API 부하 분산 */
    var delay = Math.floor(i / 10) * 200;

    setTimeout(function () {
      geocoder.addressSearch(fullAddr, function (data, status) {
        if (status === 'OK' && data.length > 0) {
          results.push({
            id:       'conv_' + cat + '_' + i,
            name:     item.name,
            category: cat,
            address:  '화성시 ' + item.addr,
            lat:      parseFloat(data[0].y),
            lng:      parseFloat(data[0].x),
            tags:     [],
            desc:     '',
            extra:    item,
          });
        }
        finished++;

        if (finished === total) {
          CONV_STATUS[cat] = 'done';
          CONV_PLACES[cat] = results;
          _buildOverlays(cat, results);
          _saveConvCache(cat, results); /* 다음 방문 시 재사용 */
          showToast(cfg.label + ' ' + results.length + '/' + total + '곳 표시됨');
          _fitConv(cat);
        }
      });
    }, delay);
  });
}

/* ── 오버레이 생성 ── */
function _buildOverlays(cat, places) {
  var cfg = CONV_CAT_CFG[cat];
  places.forEach(function (p) {
    if (CONV_OVMAP[p.id]) { CONV_OVMAP[p.id].setMap(kakaoMap); return; }

    var label  = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;
    var wrap   = document.createElement('div');
    wrap.className = 'cm-pin';
    var circle = document.createElement('div');
    circle.className = 'cm-circle';
    circle.style.background = cfg.color;
    circle.textContent = cfg.emoji + ' ' + label;
    var tail   = document.createElement('div');
    tail.className = 'cm-tail';
    tail.style.borderTopColor = cfg.color;
    wrap.appendChild(circle);
    wrap.appendChild(tail);

    (function (place) {
      wrap.addEventListener('click', function (e) {
        e.stopPropagation();
        _showConvSlide(place);
      });
      wrap.addEventListener('mouseover', function () {
        CONV_OVMAP[place.id] && CONV_OVMAP[place.id].setZIndex(100);
      });
      wrap.addEventListener('mouseout', function () {
        CONV_OVMAP[place.id] && CONV_OVMAP[place.id].setZIndex(1);
      });
    })(p);

    var ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   1,
      map:      kakaoMap,
    });
    CONV_OVMAP[p.id] = ov;
    CONV_ELMAP[p.id] = wrap;
  });
}

/* ── 제부도 단일 마커 ── */
function _showJebuMarker() {
  if (!_jebuOv) {
    var wrap   = document.createElement('div');
    wrap.className = 'cm-pin';
    var circle = document.createElement('div');
    circle.className = 'cm-circle';
    circle.style.background = '#0284C7';
    circle.style.whiteSpace = 'nowrap';
    circle.textContent = '⛱ 제부도 숙박 115곳';
    var tail   = document.createElement('div');
    tail.className = 'cm-tail';
    tail.style.borderTopColor = '#0284C7';
    wrap.appendChild(circle);
    wrap.appendChild(tail);
    wrap.addEventListener('click', function (e) { e.stopPropagation(); _showJebuSlide(); });

    _jebuOv = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(JEBU_LAT, JEBU_LNG),
      content:  wrap,
      yAnchor:  1.5,
      zIndex:   10,
      map:      kakaoMap,
    });
  } else {
    _jebuOv.setMap(kakaoMap);
  }

  CONV_STATUS.jebu = 'done';
  kakaoMap.setCenter(new kakao.maps.LatLng(JEBU_LAT, JEBU_LNG));
  kakaoMap.setLevel(7);
}

/* ── 슬라이드 카드: 편의정보 장소 ── */
function _showConvSlide(place) {
  var cfg = CONV_CAT_CFG[place.category];
  var ex  = place.extra || {};

  var html =
    '<div style="width:100%;height:80px;border-radius:12px;background:' + cfg.bg + ';' +
    'display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:12px">' + cfg.emoji + '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:' + cfg.bg + ';color:' + cfg.color + '">' + cfg.emoji + ' ' + cfg.label + '</span>' +
    '</div>' +
    '<div class="sl-name">' + place.name + '</div>' +
    '<div class="sl-addr">📍 ' + place.address + '</div>' +
    (ex.tel ? '<div class="sl-addr">📞 ' + ex.tel + '</div>' : '') +
    cfg.extraHtml(ex) +
    '<div class="sl-actions">' +
    '<button class="sl-btn" onclick="openRoute(' + place.lat + ',' + place.lng + ',\'' + place.name.replace(/'/g, '') + '\')">🗺 길찾기</button>' +
    '<button class="sl-btn" onclick="window.open(\'https://map.kakao.com/?q=' + encodeURIComponent(place.name) + '\',\'_blank\')">🔍 카카오지도</button>' +
    '</div>';

  document.getElementById('slide-inner').innerHTML = html;
  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

/* ── 슬라이드 카드: 제부도 ── */
function _showJebuSlide() {
  var s = CONVENIENCE.jebu.summary;
  var html =
    '<div style="width:100%;height:80px;border-radius:12px;background:#E0F2FE;' +
    'display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:12px">⛱</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:#E0F2FE;color:#0284C7">⛱ 제부도 숙박</span>' +
    '</div>' +
    '<div class="sl-name">제부도 숙박 종합</div>' +
    '<div class="sl-addr">📍 화성시 서신면 제부도 일대 · 총 ' + s.total + '곳</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0;text-align:center">' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.pension_outside + '</div><div style="font-size:10px;color:#6b7280">관광펜션</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.inside + '</div><div style="font-size:10px;color:#6b7280">내부숙박</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.minbak_inside + '</div><div style="font-size:10px;color:#6b7280">민박(내)</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + (s.minbak_nearby + s.nearby) + '</div><div style="font-size:10px;color:#6b7280">인근</div></div>' +
    '</div>' +
    '<div class="sl-actions">' +
    '<button class="sl-btn" onclick="openRoute(37.1578,126.5764,\'제부도\')">🗺 길찾기</button>' +
    '</div>';

  document.getElementById('slide-inner').innerHTML = html;
  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

/* ── fitBounds ── */
function _fitConv(cat) {
  var places = CONV_PLACES[cat];
  if (!places || !places.length || !kakaoMap) return;
  var bounds = new kakao.maps.LatLngBounds();
  places.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
  kakaoMap.setBounds(bounds, 80);
  setTimeout(function () { if (kakaoMap.getLevel() > 9) kakaoMap.setLevel(9); }, 150);
}
