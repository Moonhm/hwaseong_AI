'use strict';

/* ── 편의정보 지도 표시 모듈 ──────────────────────────────────
 * Kakao Maps services.Geocoder로 주소 → 좌표 변환 후 오버레이 표시
 * setFilter('mobeom' | 'touristrest' | 'hotel' | 'camping' | 'temple' | 'jebu' | 'touristfacility' | 'cinema')
 * ────────────────────────────────────────────────────────── */

var CONV_CAT_CFG = {
  mobeom: {
    label: '모범음식점', color: '#D97706', bg: '#FEF3C7', emoji: '🍽️',
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
      return '<div class="sl-addr">🏕️ 야영 ' + ex.sites + '면 · ' + ex.fac + (ex.pub ? ' · 공영' : '') + '</div>';
    },
  },
  temple: {
    label: '템플스테이', color: '#92400E', bg: '#FDE68A', emoji: '🏯',
    getItems: function () { return CONVENIENCE.templeStay ? [CONVENIENCE.templeStay] : []; },
    extraHtml: function (ex) {
      return '<div class="sl-addr">⏰ ' + (ex.schedule || '') + '</div>';
    },
  },
  touristfacility: {
    label: '관광편의시설', color: '#0891B2', bg: '#CFFAFE', emoji: '🏘️',
    getItems: function () { return CONVENIENCE.touristFacilities || []; },
    extraHtml: function (ex) {
      return ex.biz ? '<div class="sl-addr">🏠 ' + ex.biz + '</div>' : '';
    },
  },
  cinema: {
    label: '영화상영관', color: '#BE185D', bg: '#FCE7F3', emoji: '🎬',
    getItems: function () { return CONVENIENCE.cinemas || []; },
    extraHtml: function (ex) { return ''; },
  },
  jebu: {
    label: '제부도 숙박', color: '#0284C7', bg: '#E0F2FE', emoji: '⛱️',
    getItems: function () {
      var j = CONVENIENCE.jebu || {};
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
/* 제부도 숙박 115곳의 실제 중심값이다(2026-08-26 감사에서 교정).
 * 이전 값 37.1578,126.5764 는 실제 중심에서 4.54km 서쪽 바다 위였다 —
 * 칩을 켜면 '115곳 표시됨' 토스트만 뜨고 화면은 빈 바다였다.
 * 숫자를 바꿀 때는 js/convenience.js 의 jebu 블록 좌표 평균을 다시 내라. */
var JEBU_LAT = 37.1670, JEBU_LNG = 126.6264;

/* state */
var CONV_PLACES = {};   /* cat → [{id, name, category, address, lat, lng, tags, desc, extra}] */
var CONV_OVMAP  = {};   /* id  → kakao.maps.CustomOverlay */
var CONV_ELMAP  = {};   /* id  → DOM el */
var CONV_STATUS = {};   /* cat → 'idle'|'loading'|'done' */
var _jebuOv     = null;

var CONV_CACHE_VER = 'v7'; /* 좌표 데이터 변경 시 올려서 캐시 무효화
                            * v7(2026-08-26): CONVENIENCE.cinemas 10 → 13곳.
                            * 이걸 안 올리면 재방문자는 localStorage 에 굳은 10곳만 보고,
                            * 새로 넣은 3곳(CGV동탄역·CGV화성봉담·화성시 작은영화관)은
                            * PLACES 에서도 뺐으므로 지도에서 영영 안 보인다. */

/* localStorage 캐시 키 */
/* 캐시 키 접두사를 만드는 유일한 자리. js/today.js 설정 패널이 이걸 써야 한다 —
 * 거기서 'hwaseong_conv_v5_' 를 하드코딩해 두는 바람에 v6 로 올린 뒤로 캐시 용량이
 * 늘 0건으로 나오고 '비우기' 버튼이 영영 안 떴다 (2026-08-26 감사). */
function convCachePrefix() { return 'hwaseong_conv_' + CONV_CACHE_VER + '_'; }
function _convCacheKey(cat) { return 'hwaseong_conv_' + CONV_CACHE_VER + '_' + cat; }

/* 해당 카테고리 칩이 켜져 있는지.
 * 주차장 칩은 다른 칩과 동시에 active 가 될 수 있고 DOM 순서상 가장 앞이라,
 * querySelector('.chip.active') 로 판단하면 항상 parking 이 잡힌다. */
function _isConvCatActive(cat) {
  var chip = document.querySelector('#map-chips .chip[data-cat="' + cat + '"]');
  return !!(chip && chip.classList.contains('active'));
}

/* 캐시에서 좌표 로드 시도 → 성공하면 true */
function _loadConvCache(cat) {
  var raw, places;
  try { raw = localStorage.getItem(_convCacheKey(cat)); } catch (e) { return false; }
  if (!raw) return false;
  try { places = JSON.parse(raw); } catch (e) { return false; }
  if (!places || !places.length) return false;
  CONV_PLACES[cat] = places;
  CONV_STATUS[cat] = 'done';
  try { _buildOverlays(cat, places); } catch (e) {
    /* 오버레이 생성 실패 시 캐시 무효화하고 재Geocoding 유도 */
    CONV_STATUS[cat] = 'idle';
    CONV_PLACES[cat] = [];
    try { localStorage.removeItem(_convCacheKey(cat)); } catch (_) {}
    return false;
  }
  return true;
}

/* 좌표 결과를 캐시에 저장 */
function _saveConvCache(cat, places) {
  try { localStorage.setItem(_convCacheKey(cat), JSON.stringify(places)); } catch (e) {}
}

/* ── 외부 진입점: 카테고리 표시 ── */
function showConvCat(cat) {
  if (!kakaoMap) return;

  if (cat === 'jebu') { _showJebuPins(); return; }

  var status = CONV_STATUS[cat] || 'idle';

  if (status === 'done') {
    /* geocoding 완료 시점에 다른 칩이 활성이면 오버레이 생성이 생략된다.
     * _buildOverlays 는 멱등이므로 여기서 다시 불러 누락분을 복구한다. */
    var donePlaces = CONV_PLACES[cat] || [];
    _buildOverlays(cat, donePlaces);
    donePlaces.forEach(function (p) {
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
}

/* ── Geocoding ── */
function _geocodeCat(cat) {
  if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
    showToast('위치 변환 서비스를 불러오지 못했어요.');
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
  var _done    = false;

  /* 콜백이 끝내 오지 않을 경우 대비 — 마지막 배치 발송 후 10초 뒤 강제 완료 */
  var maxDelay = Math.floor((total - 1) / 10) * 200 + 10000;
  setTimeout(function () {
    if (_done) return;
    _done = true;
    CONV_STATUS[cat] = 'done';
    CONV_PLACES[cat] = results;
    /* 타임아웃은 일시적 지연일 수 있다. 부분 결과를 캐시하면 누락이 영구히 굳는다. */
    if (results.length === total) _saveConvCache(cat, results);
    if (_isConvCatActive(cat)) {
      _buildOverlays(cat, results);
      showToast(cfg.label + ' ' + results.length + '/' + total + '곳 표시됨 (타임아웃)');
      _fitConv(cat);
    }
  }, maxDelay);

  rawItems.forEach(function (item, i) {
    /* 괄호·건물명 제거 — 도로명+번지만 남겨 geocoding 정확도 향상
     * 예) "동탄대로 469-12 Alice" → "동탄대로 469-12"
     *     "남양동 1365 선주빌딩" → "남양동 1365"
     *     "세자로 480 (안녕동)" → "세자로 480" */
    var cleanAddr = (item.addr || '')
      .replace(/\s*\([^)]*\)\s*$/, '')          /* 말미 괄호 */
      .replace(/\s+[가-힣A-Za-z][^\d]*$/, '')   /* 번지 뒤 한글·영문 건물명 */
      .trim();
    var fullAddr  = cfg.getFullAddr
      ? cfg.getFullAddr(Object.assign({}, item, { addr: cleanAddr }))
      : '경기도 화성시 ' + cleanAddr;

    /* 10개씩 배치로 나눠 200ms 간격 — API 부하 분산 */
    var delay = Math.floor(i / 10) * 200;

    setTimeout(function () {
      geocoder.addressSearch(fullAddr, function (data, status) {
        if (_done) return;
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

        if (finished === total && !_done) {
          _done = true;
          CONV_STATUS[cat] = 'done';
          CONV_PLACES[cat] = results;
          _saveConvCache(cat, results); /* 다음 방문 시 재사용 */
          /* 제오코딩 중 사용자가 다른 필터로 전환했으면 표시 안 함 */
          if (_isConvCatActive(cat)) {
            _buildOverlays(cat, results);
            showToast(cfg.label + ' ' + results.length + '/' + total + '곳 표시됨');
            _fitConv(cat);
          }
        }
      });
    }, delay);
  });
}

/* ── 오버레이 생성 ── */
function _buildOverlays(cat, places) {
  if (!kakaoMap) return;
  var cfg = CONV_CAT_CFG[cat];
  places.forEach(function (p) {
    if (CONV_OVMAP[p.id]) { CONV_OVMAP[p.id].setMap(kakaoMap); return; }

    var name   = p.name || '';
    var label  = name.length > 6 ? name.slice(0, 5) + '…' : name;
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
        _showConvSlide(place);   /* 선택 강조·중앙이동은 그 안에서 한다 */
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

/* ── 제부도 개별 핀 표시 ── */
function _showJebuPins() {
  if (CONV_STATUS.jebu === 'done') {
    (CONV_PLACES.jebu || []).forEach(function (p) {
      CONV_OVMAP[p.id] && CONV_OVMAP[p.id].setMap(kakaoMap);
    });
    kakaoMap.setCenter(new kakao.maps.LatLng(JEBU_LAT, JEBU_LNG));
    kakaoMap.setLevel(7);
    return;
  }
  var items = CONV_CAT_CFG.jebu.getItems();
  var places = [];
  items.forEach(function (item, i) {
    if (!item.lat || !item.lng) return;
    places.push({
      id:       'jebu_' + i,
      name:     item.name,
      category: 'jebu',
      address:  '화성시 서신면 ' + (item.addr || ''),
      lat:      item.lat,
      lng:      item.lng,
      tags:     [],
      desc:     '',
      extra:    { type: item.type || '숙박', tel: item.tel || '' },
    });
  });
  CONV_PLACES.jebu = places;
  CONV_STATUS.jebu  = 'done';
  _buildOverlays('jebu', places);
  kakaoMap.setCenter(new kakao.maps.LatLng(JEBU_LAT, JEBU_LNG));
  kakaoMap.setLevel(7);
  showToast('제부도 숙박 ' + places.length + '곳 표시됨');
}

/* ── 제부도 단일 마커 (레거시 — 미사용) ── */
function _showJebuMarker() {
  if (!_jebuOv) {
    var wrap   = document.createElement('div');
    wrap.className = 'cm-pin';
    var circle = document.createElement('div');
    circle.className = 'cm-circle';
    circle.style.background = '#0284C7';
    circle.style.whiteSpace = 'nowrap';
    circle.textContent = '⛱️ 제부도 숙박 115곳';
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
/* 관광지 핀에만 있던 '선택하면 커지고 맨 앞으로'를 편의시설 핀에도 적용한다
 * (2026-08-26 사용자 요청). 마크업이 관광지와 같은 .cm-pin 이라
 * css/20-map.css 의 .cm-pin.selected 규칙이 그대로 먹는다.
 * 핀 DOM 은 CustomOverlay 의 content 로 살아 있으므로 getContent() 로 되찾는다 —
 * 핀 클릭 말고도 지도 검색·NP 모드에서 이 함수로 바로 들어오는 경로가 있어서,
 * 클릭 핸들러의 클로저에 기대지 않고 여기서 다시 찾는 편이 안전하다. */
function _convSelectPin(place) {
  if (typeof clearSelectedPin === 'function') clearSelectedPin();
  var ov = CONV_OVMAP[place && place.id];
  if (!ov) return;
  var el = ov.getContent();
  if (el && el.classList) el.classList.add('selected');
  ov.setZIndex(200);
  if (typeof registerSelectedPin === 'function') {
    registerSelectedPin(function () {
      if (el && el.classList) el.classList.remove('selected');
      ov.setZIndex(1);   /* 생성값. hover 핸들러가 넣어 둔 100 도 여기서 정리된다 */
    });
  }
}

function _showConvSlide(place) {
  _convSelectPin(place);
  /* 선택한 핀을 슬라이드 카드 위 가시영역 중앙으로 옮긴다.
   * 관광지(map.js)·주차장(parking.js)·지역화폐(localcurrency.js)는 전부 하고 있었는데
   * 편의시설만 빠져서, 핀이 화면 아래쪽에 있으면 카드에 가려 안 보였다. */
  if (typeof _panPinAboveSlide === 'function' && place.lat && place.lng) {
    _panPinAboveSlide(place.lat, place.lng, 50, 300);
  }
  var cfg      = CONV_CAT_CFG[place.category];
  var ex       = place.extra || {};
  var safeName = (place.name || '').replace(/['"\\]/g, '');
  var addr     = place.address || '';

  /* 사진 (2026-08-26) — 영화관·캠핑장·관광호텔에도 사진이 있는데 여태 안 떴다.
   * tools/build_photo_index.py 가 js/data.js 만 읽어 CONVENIENCE 장소가 아예
   * 인덱스에 없었기 때문이다. 빌더를 고쳐 31곳 34장이 들어왔다.
   * 이모지를 상자 배경에 남겨 두고 그 위에 <img> 를 덮는다 — 사진이 404 나면
   * onerror 로 img 만 숨어 이모지가 그대로 보인다(빈 사각형이 남지 않는다). */
  var _phSrc = (typeof hasPhoto === 'function' && hasPhoto({ name: place.name }))
    ? placePhotoSrc({ name: place.name }) : '';

  var html =
    '<div style="width:100%;height:' + (_phSrc ? '150px' : '80px') + ';border-radius:12px;background:' + cfg.bg + ';' +
    'display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:12px;' +
    'position:relative;overflow:hidden">' + cfg.emoji +
    (_phSrc
      ? '<img src="' + _phSrc + '" alt="" loading="lazy" decoding="async" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" ' +
        'onerror="this.style.display=\'none\'">'
      : '') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:' + cfg.bg + ';color:' + cfg.color + '">' + cfg.emoji + ' ' + cfg.label + '</span>' +
    '</div>' +
    '<div class="sl-name">' + (place.name || '') + '</div>' +
    '<div class="sl-addr" data-addr="' + addr.replace(/"/g, '&quot;') + '" onclick="copyAddress(this.dataset.addr)">' + addr + '</div>' +
    (ex.tel ? '<div class="sl-addr">📞 ' + ex.tel + '</div>' : '') +
    cfg.extraHtml(ex) +
    '<div class="sl-actions">' +
    (place.lat && place.lng
      ? '<button class="sl-btn" onclick="openRoute(' + place.lat + ',' + place.lng + ',\'' + safeName + '\')">🗺️ 길찾기</button>'
      : '') +
    '<button class="sl-btn" onclick="window.open(\'https://map.kakao.com/?q=' + encodeURIComponent(place.name || '') + '\',\'_blank\')">🔍 카카오지도</button>' +
    (place.lat && place.lng
      ? '<button class="sl-btn" style="background:#EFF6FF;color:#2563EB;border-color:#BFDBFE;font-weight:700" onclick="goNearestParkingConv(' + place.lat + ',' + place.lng + ',\'' + place.category + '\',\'' + safeName + '\')">🅿️ 가장 가까운<br>공영주차장 찾기</button>'
      : '') +
    '</div>';

  document.getElementById('slide-inner').innerHTML = html;
  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}

/* ── 슬라이드 카드: 제부도 ── */
function _showJebuSlide() {
  if (!CONVENIENCE || !CONVENIENCE.jebu || !CONVENIENCE.jebu.summary) return;
  var j = CONVENIENCE.jebu;
  var s = j.summary;

  function _listHtml(arr) {
    return (arr || []).map(function (it) {
      return '<div style="padding:7px 0;border-bottom:1px solid #F1F5F9;display:flex;flex-direction:column;gap:2px">' +
        '<span style="font-size:13px;font-weight:600;color:#1E293B">' + it.name + '</span>' +
        '<span style="font-size:11px;color:#64748B">서신면 ' + it.addr + '</span>' +
        (it.tel ? '<span style="font-size:11px;color:#64748B">📞 ' + it.tel + '</span>' : '') +
        '</div>';
    }).join('');
  }

  function _section(label, arr) {
    if (!arr || !arr.length) return '';
    return '<div style="margin-top:14px">' +
      '<div style="font-size:12px;font-weight:700;color:#0284C7;background:#E0F2FE;' +
      'border-radius:6px;padding:5px 10px;margin-bottom:2px">' + label + ' · ' + arr.length + '곳</div>' +
      _listHtml(arr) +
      '</div>';
  }

  var html =
    '<div style="width:100%;height:80px;border-radius:12px;background:#E0F2FE;' +
    'display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:12px">⛱️</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span class="sl-cat" style="background:#E0F2FE;color:#0284C7">⛱️ 제부도 숙박</span>' +
    '</div>' +
    '<div class="sl-name">제부도 숙박 종합</div>' +
    '<div class="sl-addr">화성시 서신면 제부도 일대 · 총 ' + s.total + '곳</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0;text-align:center">' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.pension_outside + '</div><div style="font-size:10px;color:#6b7280">관광펜션</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.inside + '</div><div style="font-size:10px;color:#6b7280">내부숙박</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + s.minbak_inside + '</div><div style="font-size:10px;color:#6b7280">민박(내)</div></div>' +
    '<div style="background:#F0F9FF;border-radius:10px;padding:8px 4px"><div style="font-size:18px;font-weight:900;color:#0284C7">' + ((s.minbak_nearby || 0) + (s.nearby || 0)) + '</div><div style="font-size:10px;color:#6b7280">인근</div></div>' +
    '</div>' +
    '<div class="sl-actions">' +
    '<button class="sl-btn" onclick="openRoute(37.1578,126.5764,\'제부도\')">🗺️ 길찾기</button>' +
    '</div>' +
    _section('🏖️ 관광펜션', j.pension_outside) +
    _section('🏨 제부도 내 숙박', j.inside) +
    _section('🏡 인근 숙박', j.nearby) +
    _section('🏠 민박 (섬 내)', j.minbak_inside) +
    _section('🏘️ 민박 (인근)', j.minbak_nearby);

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
