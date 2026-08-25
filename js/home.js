/* ============================================================================
 * js/home.js — 홈 화면 — 내 주변 추천·통합 검색·요약 카드
 *
 * 왜 따로 있나: 홈에서만 쓰는 렌더러와 검색 상태(_srTimer·_REGIONS·_CAT_STYLE)가 한 덩어리다.
 * 함께 볼 것:   renderHomeLiving() 은 지연 로드되는 lcData 를 읽는다 — js/ui.js 의 _loadLcData() 와 함께 볼 것.
 *
 * index.html 인라인 <script> 2276~2858줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 내 위치 추천 ── */
function requestNearbyRec() {
  var sec = document.getElementById('home-nearby-section');
  if (!sec) return;

  if (!navigator.geolocation) {
    sec.innerHTML = '<div class="nearby-loading">위치 정보를 지원하지 않는 브라우저입니다.</div>';
    return;
  }

  sec.innerHTML = '<div class="nearby-loading">📡 위치 확인 중...</div>';

  navigator.geolocation.getCurrentPosition(
    function (pos) { renderNearbyResult(pos.coords.latitude, pos.coords.longitude); },
    function ()    {
      sec.innerHTML =
        '<div class="nearby-cta" onclick="requestNearbyRec()" style="border-color:#FCA5A5;background:linear-gradient(135deg,#FEF2F2,#FEE2E2)">' +
        '<div class="nearby-cta-icon">⚠️</div>' +
        '<div><div class="nearby-cta-text" style="color:#DC2626">위치 접근 권한이 필요합니다</div>' +
        '<div class="nearby-cta-sub">탭하여 다시 시도</div></div></div>';
    },
    { timeout: 8000, maximumAge: 60000 }
  );
}

function _distKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _distLabel(km) {
  return km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km';
}

function renderNearbyResult(myLat, myLng) {
  if (typeof PLACES === 'undefined') return;
  var sec = document.getElementById('home-nearby-section');
  if (!sec) return;

  /* 가장 가까운 관광지 */
  var tourists = PLACES.filter(function (p) { return p.category === 'tourist'; });
  var nearestTourist = null, minTDist = Infinity;
  tourists.forEach(function (p) {
    var d = _distKm(myLat, myLng, p.lat, p.lng);
    if (d < minTDist) { minTDist = d; nearestTourist = p; }
  });

  /* 가장 가까운 주차장 — parkingData 사용 */
  var parks = (typeof parkingData !== 'undefined') ? parkingData : [];

  /* 주차장 데이터 없으면 직접 로드 후 재렌더 */
  if (!parks.length) {
    fetch('js/parking-static.json?v=20260825').then(function (r) { return r.json(); }).then(function (d) {
      if (typeof mergeParkingData === 'function' && !parkingData.length) mergeParkingData(d, []);
      if (parkingData.length) renderNearbyResult(myLat, myLng);
    }).catch(function () {});
    return;
  }

  var nearestPark = null, minPDist = Infinity;
  parks.forEach(function (p) {
    var d = _distKm(myLat, myLng, p.lat, p.lng);
    if (d < minPDist) { minPDist = d; nearestPark = p; }
  });

  if (!nearestTourist) {
    sec.innerHTML = '<div class="nearby-loading">관광지 데이터를 불러오는 중입니다.</div>';
    return;
  }

  var tName  = nearestTourist.name;
  /* 템플릿이 '화성시' 를 앞에 붙이므로 주소에서 시·도 접두어를 제거한다.
   * slice(1) 은 '경기도'만 떼어내 '화성시 화성시 …' 가 된다. */
  var tAddr  = (nearestTourist.address || '').replace(/^\s*(경기도\s*)?(화성시\s*)?/, '');
  var imgSrc = 'assets/images/places/' + tName + '.jpg';
  var isFree = nearestPark && (nearestPark.free === true);
  /* 실시간 대수 우선, 없으면 total */
  var availSpots = nearestPark ? (nearestPark.avail != null ? nearestPark.avail : nearestPark.total) : null;

  /* ── 주차 여유 색상 계산 (빨강→녹색) ── */
  var parkColor = '#9CA3AF';
  var parkGlow  = 'rgba(156,163,175,0.18)';
  if (nearestPark) {
    if (nearestPark.open === false) {
      parkColor = '#9CA3AF'; parkGlow = 'rgba(156,163,175,0.18)';
    } else if (availSpots <= 0) {
      parkColor = '#EF4444'; parkGlow = 'rgba(239,68,68,0.18)';
    } else {
      var ratio = nearestPark.total > 0 ? Math.min(1, availSpots / nearestPark.total) : 1;
      var hue   = Math.round(ratio * 118);
      parkColor = 'hsl(' + hue + ',68%,40%)';
      parkGlow  = 'hsla(' + hue + ',68%,50%,0.20)';
    }
  }

  var parkClickFn = nearestPark
    ? 'goMapPark(' + nearestPark.lat + ',' + nearestPark.lng + ',' + nearestPark.id + ')'
    : 'goMapCat(\'parking\')';

  var parkHtml = nearestPark
    ? '<div class="nearby-park" onclick="' + parkClickFn + '" style="border-left:3px solid ' + parkColor + '">'
      + '<div class="nearby-park-icon" style="background:' + parkGlow + ';color:' + parkColor + ';box-shadow:0 0 0 3px ' + parkGlow + '">'
      + 'P</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div class="nearby-park-name">' + nearestPark.name + '</div>'
      + '<div class="nearby-park-meta">직선거리 ' + _distLabel(minPDist) + ' · '
      + (nearestPark.type || '') + (nearestPark.type ? ' · ' : '')
      + '<span style="color:' + (isFree ? 'var(--green)' : 'var(--primary)') + ';font-weight:700">'
      + (isFree ? '무료' : '유료') + '</span></div>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0">'
      + '<div style="font-size:15px;font-weight:900;color:' + parkColor + '">'
      + (nearestPark.open === false ? '-' : availSpots) + '</div>'
      + '<div style="font-size:10px;color:var(--text-muted)">'
      + (nearestPark.open === false ? '미운영' : '주차 가능') + '</div>'
      + '</div>'
      + '</div>'
    : '';

  sec.innerHTML =
    '<div class="nearby-card">'

    /* 사진 영역 — 클릭 시 해당 관광지로 지도 포커스 */
    + '<div class="nearby-photo" onclick="goMapFocus(' + nearestTourist.lat + ',' + nearestTourist.lng + ',4,' + nearestTourist.id + ')">'
    + '<img src="' + imgSrc + '" alt="' + tName + '" onerror="this.style.display=\'none\'">'
    + '<div class="nearby-photo-overlay"></div>'
    + '<div class="nearby-dist-badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="#fff" style="vertical-align:middle;margin-right:3px"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>' + _distLabel(minTDist) + '</div>'
    + '<div class="nearby-photo-info">'
    + '<div class="nearby-photo-cat">★ 가장 가까운 관광지</div>'
    + '<div class="nearby-photo-name">' + tName + '</div>'
    + '</div>'
    + '</div>'

    /* 하단 정보 */
    + '<div class="nearby-body">'
    + '<div class="nearby-addr"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>화성시 ' + tAddr + '</div>'
    + (nearestTourist.rating ? '<div style="display:flex;align-items:center;gap:4px;margin:3px 0 6px"><span style="color:#F59E0B;font-size:12px">' + ratingStars(nearestTourist.rating) + '</span><span style="font-size:12px;font-weight:700;color:#D97706">' + nearestTourist.rating + '</span><span style="font-size:11px;color:var(--text-muted)">(' + (nearestTourist.reviewCount||0).toLocaleString() + ')</span></div>' : '')
    + '<div class="nearby-actions">'
    + '<button class="nearby-btn primary" onclick="goMapFocus(' + nearestTourist.lat + ',' + nearestTourist.lng + ',4,' + nearestTourist.id + ')">🗺 지도에서 보기</button>'
    + '<button class="nearby-btn" onclick="openRoute(' + nearestTourist.lat + ',' + nearestTourist.lng + ',\'' + tName.replace(/'/g,'') + '\')">길찾기</button>'
    + '</div>'
    + '</div>'
    + '</div>'

    /* 주차장 카드 */
    + parkHtml

    /* 다시 검색 */
    + '<div style="text-align:right;margin-top:6px;padding:0 2px">'
    + '<button onclick="requestNearbyRec()" style="font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px">🔄 위치 다시 확인</button>'
    + '</div>';

}

/* ── 홈 페이지 렌더 ── */
function renderHomePage() {
  renderHomeTourism();
  renderHomeLiving();
  if (typeof renderFavSection === 'function') renderFavSection();
}

/* ══════════════════════════════════════════════════
   홈 검색
══════════════════════════════════════════════════ */
var _srTimer = null;

var _REGIONS = [
  { name: '동탄',   lat: 37.2004, lng: 127.0781, level: 6 },
  { name: '병점',   lat: 37.2266, lng: 127.0483, level: 6 },
  { name: '봉담',   lat: 37.2119, lng: 126.9248, level: 6 },
  { name: '향남',   lat: 37.0835, lng: 126.9072, level: 6 },
  { name: '남양',   lat: 37.1996, lng: 126.8219, level: 6 },
  { name: '우정',   lat: 37.0638, lng: 126.8290, level: 6 },
  { name: '비봉',   lat: 37.1912, lng: 126.8631, level: 6 },
  { name: '마도',   lat: 37.1637, lng: 126.7897, level: 6 },
  { name: '팔탄',   lat: 37.1361, lng: 126.9397, level: 6 },
  { name: '양감',   lat: 37.1052, lng: 126.9733, level: 6 },
  { name: '정남',   lat: 37.1669, lng: 127.0007, level: 6 },
  { name: '반월',   lat: 37.2315, lng: 127.0527, level: 6 },
  { name: '진안',   lat: 37.2436, lng: 126.9968, level: 6 },
  { name: '장안',   lat: 37.0870, lng: 126.8628, level: 6 },
  { name: '서신',   lat: 37.1549, lng: 126.5757, level: 7 },
  { name: '송산',   lat: 37.2152, lng: 126.6774, level: 6 },
  { name: '화성',   lat: 37.1996, lng: 126.8316, level: 9 },
  { name: '제부도', lat: 37.1578, lng: 126.5764, level: 7 },
  { name: '공룡알화석지', lat: 37.2441, lng: 126.7498, level: 5 },
  { name: '화성행궁', lat: 37.2844, lng: 127.0130, level: 5 },
];

var _CAT_STYLE = {
  tourist:      { bg: '#EEF2FF', em: '🏛' },
  festival:     { bg: '#FFF7ED', em: '🎉' },
  restaurant:   { bg: '#FEF3C7', em: '🍽' },
  mobeom:       { bg: '#FEF3C7', em: '🍽' },
  touristrest:  { bg: '#FEE2E2', em: '🥢' },
  parking:      { bg: '#EFF6FF', em: '🅿' },
  localcurrency:{ bg: '#F0FDF4', em: '<img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:18px;height:18px;object-fit:contain">'  },
  hotel:        { bg: '#EDE9FE', em: '🏨' },
  camping:      { bg: '#DCFCE7', em: '⛺' },
};

function homeSearchInput(val) {
  clearTimeout(_srTimer);
  var clearBtn = document.getElementById('home-search-clear');
  if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
  if (!val.trim()) { closeHomeSearch(); return; }
  _srTimer = setTimeout(function() { doHomeSearch(val); }, 220);
}

function doHomeSearch(q) {
  q = (q || '').trim();
  if (!q) { closeHomeSearch(); return; }
  var ql = q.toLowerCase();
  var results = [];

  /* 1) 지역명 */
  _REGIONS.forEach(function(r) {
    if (r.name.includes(q) || q.includes(r.name)) {
      results.push({ type: 'region', name: r.name + ' 지역', sub: '지도에서 보기', em: '📍', bg: '#F3F4F6', lat: r.lat, lng: r.lng, level: r.level });
    }
  });

  /* 2) PLACES (관광지·축제·맛집·주차장 등) */
  if (typeof PLACES !== 'undefined') {
    PLACES.forEach(function(p) {
      if ((p.name || '').toLowerCase().includes(ql) || (p.address || '').toLowerCase().includes(ql)) {
        var s = _CAT_STYLE[p.category] || { bg: '#F3F4F6', em: '📌' };
        var addr = (p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
        results.push({ type: 'place', name: p.name, sub: addr, em: s.em, bg: s.bg, lat: p.lat, lng: p.lng, id: p.id, cat: p.category });
      }
    });
  }

  /* 3) 공영주차장 (parkingData) */
  if (typeof parkingData !== 'undefined') {
    parkingData.forEach(function(p) {
      if ((p.name || '').toLowerCase().includes(ql)) {
        var isFree = p.free || (p.tags && p.tags.includes('무료'));
        var addr = (p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
        results.push({ type: 'parking', name: p.name, sub: (isFree ? '무료' : '유료') + ' · ' + addr, em: '🅿', bg: '#EFF6FF', lat: p.lat, lng: p.lng, id: p.id });
      }
    });
  }

  /* 4) 지역화폐 가맹점 (최대 5개)
   * 27,374건 전수 스캔이라 매치가 5건에 못 미치면 항상 최악 경로를 탄다.
   * 한글 IME 조합 중 자모 1글자는 절대 매치되지 않으므로 2글자부터 검색한다. */
  if (typeof lcData !== 'undefined' && ql.length >= 2) {
    var lcHits = 0;
    for (var i = 0; i < lcData.length && lcHits < 5; i++) {
      var p = lcData[i];
      if ((p.n || '').toLowerCase().includes(ql) || (p.c || '').toLowerCase().includes(ql)) {
        var addr = (p.a || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
        results.push({ type: 'lc', name: p.n, sub: (p.c || '') + (addr ? ' · ' + addr : ''), em: '₩', bg: '#F0FDF4', lat: p.lat, lng: p.lng, _raw: p });
        lcHits++;
      }
    }
  }

  /* 5) 편의시설 — 모범음식점 · 관광식당 (최대 5개) */
  if (typeof CONVENIENCE !== 'undefined') {
    var convHits = 0;
    var convSets = [
      { arr: CONVENIENCE.restaurants,        cat: 'restaurant',  label: '모범음식점' },
      { arr: CONVENIENCE.touristRestaurants, cat: 'touristrest', label: '관광식당'   },
    ];
    convSets.forEach(function(cs) {
      if (convHits >= 5 || !cs.arr) return;
      cs.arr.forEach(function(p) {
        if (convHits >= 5) return;
        if ((p.name || '').toLowerCase().includes(ql)) {
          results.push({ type: 'conv', name: p.name, sub: cs.label + (p.addr ? ' · ' + p.addr : ''), em: '🍽', bg: '#FFF7ED', convCat: cs.cat });
          convHits++;
        }
      });
    });
  }

  renderHomeSearchResults(results.slice(0, 9), q);
}

function renderHomeSearchResults(results, q) {
  var el = document.getElementById('home-search-results');
  var bar = document.getElementById('home-search-bar');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = '<div class="sr-empty">검색 결과가 없어요</div>';
    el.classList.add('open');
    if (bar) bar.style.borderRadius = 'var(--r-pill) var(--r-pill) 0 0';
    return;
  }

  el.innerHTML = results.map(function(r, idx) {
    return '<div class="sr-item" onclick="_srClick(' + idx + ')">'
      + '<div class="sr-icon" style="background:' + r.bg + '">' + r.em + '</div>'
      + '<div style="flex:1;min-width:0"><div class="sr-name">' + r.name + '</div><div class="sr-sub">' + r.sub + '</div></div>'
      + '</div>';
  }).join('');

  window._srResults = results;
  el.classList.add('open');
  if (bar) bar.style.borderRadius = 'var(--r-pill) var(--r-pill) 0 0';
}

function _srClick(idx) {
  var r = (window._srResults || [])[idx];
  if (!r) return;
  clearHomeSearch();
  if (r.type === 'place' && r.lat && r.lng) {
    goMapFocus(r.lat, r.lng, 4, r.id != null ? r.id : null);
  } else if (r.type === 'parking' && r.lat) {
    goMapPark(r.lat, r.lng, r.id);
  } else if (r.type === 'lc' && r.lat) {
    go('map');
    setTimeout(function() {
      if (!kakaoMap) return;
      kakaoMap.setCenter(new kakao.maps.LatLng(r.lat, r.lng));
      kakaoMap.setLevel(4);
      if (typeof setFilter === 'function') setFilter('localcurrency');
      if (r._raw && typeof showLcSlide === 'function') showLcSlide(r._raw);
    }, 400);
  } else if (r.type === 'conv') {
    go('living');
    setTimeout(function() {
      var el = document.getElementById('liv-cat-' + r.convCat);
      if (typeof switchLivingCat === 'function') switchLivingCat(el, r.convCat);
    }, 300);
  } else if (r.lat) {
    go('map');
    setTimeout(function() {
      if (!kakaoMap) return;
      kakaoMap.setCenter(new kakao.maps.LatLng(r.lat, r.lng));
      kakaoMap.setLevel(r.level || 6);
    }, 350);
  }
}

function closeHomeSearch() {
  var el  = document.getElementById('home-search-results');
  var bar = document.getElementById('home-search-bar');
  if (el)  { el.classList.remove('open'); el.innerHTML = ''; }
  if (bar) bar.style.borderRadius = '';
}

function clearHomeSearch() {
  var inp = document.getElementById('home-search-input');
  var clr = document.getElementById('home-search-clear');
  if (inp) inp.value = '';
  if (clr) clr.style.display = 'none';
  closeHomeSearch();
}

function renderHomeTourism() {
  const el = document.getElementById('home-tourism-content');
  if (!el || typeof PLACES === 'undefined') return;

  const festivals   = PLACES.filter(p => p.category === 'festival');
  const restaurants = (typeof CONVENIENCE !== 'undefined' && CONVENIENCE.restaurants) ? CONVENIENCE.restaurants.slice(0, 4) : [];
  const parkings    = (typeof parkingData  !== 'undefined' && parkingData.length)      ? parkingData.slice(0, 1) : [];

  const emptyCard = `<div style="padding:32px 0;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>`;

  const festivalBig = festivals.length
    ? `<div onclick="go('tourism');showFestivalDetail(${festivals[0].id})"
        style="background:var(--white);border-radius:var(--r-md);border:1px solid var(--border);
        border-left:3px solid var(--orange);padding:14px 16px;
        display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:8px;transition:box-shadow 0.15s;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
            <span class="badge badge-${festivals[0].status === 'ongoing' ? 'ongoing' : 'upcoming'}">${festivals[0].status === 'ongoing' ? '진행중' : '예정'}</span>
            <span style="font-size:11px;color:var(--text-muted);">${festivals[0].date ? festivals[0].date.replace(/^\d{4}-/,'').replace(/-/g,'.') : ''}</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${festivals[0].name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${(festivals[0].address || '').split(' ').slice(0,3).join(' ')}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
    : emptyCard;

  const restaurantGrid = restaurants.length
    ? `<div class="place-grid" style="margin-bottom:10px">${restaurants.map(r => `
        <div class="place-card-sm" onclick="goMapCat('mobeom')">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="pi pi-food">🍽</div>
            <div><div class="place-card-sm-name">${r.name}</div><div class="place-card-sm-addr">${(r.addr||'').split(' ').slice(0,3).join(' ')}</div></div>
          </div>
        </div>`).join('')}</div>` : '';

  const parkingCard = parkings.length
    ? `<div class="place-card-sm" style="flex-direction:row;display:flex;align-items:center;gap:12px;padding:14px" onclick="goMapCat('parking')">
        <div class="pi pi-parking">P</div>
        <div style="flex:1"><div class="place-card-sm-name">${parkings[0].name}</div><div class="place-card-sm-addr">${(parkings[0].address||'').replace('경기도 화성시 ','')}</div></div>
        <span class="park-badge ${(parkings[0].tags||[]).includes('무료') ? 'pb-free' : 'pb-paid'}">${(parkings[0].tags||[]).includes('무료') ? '무료' : '유료'}</span>
      </div>` : '';

  el.innerHTML = `
    <div class="section">
      <div class="section-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="section-title">행사</div>
            ${festivals.some(f => f.status === 'ongoing') ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : ''}
          </div>
          <div class="section-sub" style="margin-top:2px">이번 주 축제 · 맛집 · 주차</div>
        </div>
      </div>
      ${festivalBig}${restaurantGrid}${parkingCard}
    </div>
    <div class="section" style="padding-bottom:24px">
      <div class="section-header">
        <div class="section-title">편의정보</div>
        <div style="font-size:12px;color:var(--text-muted)">지도에서 바로 확인</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('mobeom')">
          <div style="width:34px;height:34px;border-radius:10px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🍽️</div>
          <div><div class="place-card-sm-name" style="font-size:13px">모범음식점</div><div class="place-card-sm-addr">94곳</div></div>
        </div>
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('touristrest')">
          <div style="width:34px;height:34px;border-radius:10px;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🥢</div>
          <div><div class="place-card-sm-name" style="font-size:13px">관광식당업</div><div class="place-card-sm-addr">35곳</div></div>
        </div>
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('hotel')">
          <div style="width:34px;height:34px;border-radius:10px;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🏨</div>
          <div><div class="place-card-sm-name" style="font-size:13px">관광호텔</div><div class="place-card-sm-addr">10곳</div></div>
        </div>
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('camping')">
          <div style="width:34px;height:34px;border-radius:10px;background:#DCFCE7;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⛺</div>
          <div><div class="place-card-sm-name" style="font-size:13px">캠핑장</div><div class="place-card-sm-addr">17곳</div></div>
        </div>
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('temple')">
          <div style="width:34px;height:34px;border-radius:10px;background:#FDE68A;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🏯</div>
          <div><div class="place-card-sm-name" style="font-size:13px">템플스테이</div><div class="place-card-sm-addr">용주사</div></div>
        </div>
        <div class="place-card-sm" style="flex-direction:row;align-items:center;gap:10px;padding:12px" onclick="goMapCat('jebu')">
          <div style="width:34px;height:34px;border-radius:10px;background:#E0F2FE;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⛱</div>
          <div><div class="place-card-sm-name" style="font-size:13px">제부도 숙박</div><div class="place-card-sm-addr">115곳</div></div>
        </div>
      </div>
    </div>`;
}

function renderHomeLiving() {
  const el = document.getElementById('home-living-content');
  if (!el) return;

  const currencies = (typeof lcData !== 'undefined') ? lcData : [];
  const parkings   = (typeof parkingData !== 'undefined') ? parkingData : [];

  const currencyItems = currencies.length
    ? currencies.slice(0, 5).map(p => {
        const name = (p.n || p.name || '').trim();
        const cat  = (p.c || '').trim();
        const addr = (p.a || p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
        return `<div class="place-item" onclick="goLivingCat('currency')" style="gap:10px">
          <div style="width:38px;height:38px;border-radius:12px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:24px;height:24px;object-fit:contain"></div>
          <div class="pi-content" style="min-width:0">
            <div class="pi-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div class="pi-meta">${cat}${addr ? ' · ' + addr : ''}</div>
          </div>
        </div>`;
      }).join('')
    : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>';

  const parkingItems = parkings.length
    ? parkings.slice(0, 3).map(p => {
        const isFree  = p.free || (p.tags && p.tags.includes('무료'));
        const availTxt = p.open === false ? '미운영'
          : (p.avail !== undefined ? p.avail + '대 여유' : '운영중');
        const addr = (p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
        return `<div class="place-item" onclick="goLivingCat('parking')" style="gap:10px">
          <div style="width:38px;height:38px;border-radius:12px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#2563EB;flex-shrink:0">P</div>
          <div class="pi-content" style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <div class="pi-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
              <span style="font-size:10px;padding:1px 6px;border-radius:20px;font-weight:600;flex-shrink:0;${isFree ? 'background:#DCFCE7;color:#16a34a' : 'background:#FEE2E2;color:#DC2626'}">${isFree ? '무료' : '유료'}</span>
            </div>
            <div class="pi-meta">${availTxt} · ${addr}</div>
          </div>
        </div>`;
      }).join('')
    : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 var(--px)">
      <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:14px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;min-width:0" onclick="goLivingCat('currency')">
        <div style="width:32px;height:32px;border-radius:10px;background:#DCFCE7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:20px;height:20px;object-fit:contain"></div>
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.1">${currencies.length.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">지역화폐 가맹점</div>
        </div>
      </div>
      <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:14px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;min-width:0" onclick="goLivingCat('parking')">
        <div style="width:32px;height:32px;border-radius:10px;background:#DBEAFE;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#2563EB;flex-shrink:0">P</div>
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.1">${parkings.length}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">공영주차장</div>
        </div>
      </div>
    </div>
    <div style="margin-top:14px">
      <div class="category-icons">
        <div class="cat-icon-item" onclick="goLivingCat('restaurant')"><div class="cat-icon-circle ci-food">🍴</div><span class="cat-icon-label">모범음식점</span></div>
        <div class="cat-icon-item" onclick="goLivingCat('touristrest')"><div class="cat-icon-circle ci-cafe">🥢</div><span class="cat-icon-label">관광식당</span></div>
        <div class="cat-icon-item" onclick="goLivingCat('currency')"><div class="cat-icon-circle ci-mart" style="background:#EFF6FF"><img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:55%;height:55%;object-fit:contain"></div><span class="cat-icon-label">지역화폐</span></div>
        <div class="cat-icon-item" onclick="goLivingCat('parking')"><div class="cat-icon-circle" style="background:#DBEAFE;color:#2563EB;font-size:16px;font-weight:800">P</div><span class="cat-icon-label">공영주차장</span></div>
      </div>
    </div>
    <div class="section" style="padding-bottom:8px">
      <div class="section-header" style="margin-top:16px">
        <div class="section-title">희망화성지역화폐 가맹점</div>
        <button class="section-link" onclick="goLivingCat('currency')">전체보기</button>
      </div>
      <div class="place-list">${currencyItems}</div>
    </div>
    <div class="section" style="padding-bottom:24px">
      <div class="section-header" style="margin-top:16px">
        <div class="section-title">공영주차장</div>
        <button class="section-link" onclick="goLivingCat('parking')">전체보기</button>
      </div>
      <div class="place-list">${parkingItems}</div>
    </div>`;
}

/* ── 축제 가로 스크롤 렌더 (관광 탭) ── */
const IMG_CLASSES = ['img-sunset','img-sea','img-night','img-peace','img-dino'];
/* ── 축제 스크롤 화살표 ── */
function updateFestArrows() {
  var el   = document.getElementById('festival-scroll-list');
  var lBtn = document.getElementById('fsc-arr-left');
  var rBtn = document.getElementById('fsc-arr-right');
  if (!el || !lBtn || !rBtn) return;
  var atStart = el.scrollLeft <= 2;
  var atEnd   = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
  lBtn.classList.toggle('visible', !atStart);
  rBtn.classList.toggle('visible', !atEnd);
}
function scrollFestArr(dir) {
  var el = document.getElementById('festival-scroll-list');
  if (!el) return;
  el.scrollBy({ left: dir * 190, behavior: 'smooth' });
  setTimeout(updateFestArrows, 250);
}

function renderFestivalScroll() {
  const el = document.getElementById('festival-scroll-list');
  if (!el || typeof PLACES === 'undefined') return;
  const festivals = PLACES.filter(p => p.category === 'festival');
  if (!festivals.length) { el.innerHTML = '<div style="padding:8px var(--px);color:var(--text-muted);font-size:13px">축제 데이터 준비 중</div>'; return; }
  el.innerHTML = festivals.map((p, i) => {
    const img = IMG_CLASSES[i % IMG_CLASSES.length];
    const badge = p.status === 'ongoing' ? '<span class="badge badge-ongoing fsc-badge">진행중</span>' : '<span class="badge badge-upcoming fsc-badge">예정</span>';
    const dateStr = p.date ? (p.date.includes('~')
      ? p.date.split('~')[0].trim().replace(/^\d{4}-/,'').replace(/-/g,'.') + ' ~'
      : p.date.trim().replace(/^\d{4}-/,'').replace(/-/g,'.')) : '';
    return `<div class="festival-scroll-card" onclick="showFestivalDetail(${p.id})">
      <div class="fsc-img ${img}">${badge}</div>
      <div class="fsc-body"><div class="fsc-date">${dateStr}</div><div class="fsc-title">${p.name}</div></div>
    </div>`;
  }).join('');
  el.removeEventListener('scroll', updateFestArrows);
  el.addEventListener('scroll', updateFestArrows, { passive: true });
  requestAnimationFrame(updateFestArrows);
}

/* ── 홈 토글 ── */
function switchHomeTab(el, tab) {
  document.querySelectorAll('.ttab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('home-tourism').style.display = tab === 'tourism' ? 'block' : 'none';
  document.getElementById('home-living').style.display  = tab === 'living'  ? 'block' : 'none';
  if (tab === 'living') {
    renderHomeLiving();
    _loadLcData(renderHomeLiving); /* 가맹점 미로드 시 fetch 후 재렌더 */
  }
}

