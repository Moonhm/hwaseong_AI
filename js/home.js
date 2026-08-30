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
  var sec = document.getElementById('nearby-section');
  if (!sec) return;

  if (!navigator.geolocation) {
    sec.innerHTML = '<div class="nearby-loading">이 브라우저는 위치 정보를 지원하지 않아요.</div>';
    return;
  }

  /* 이 요청의 세대. 홈 탭을 재클릭하면 resetHomePage() 가 _nearbyGen 을 올려
   * 아래 두 콜백이 조용히 무시된다. geolocation 에는 취소 API 가 없어 이 방법뿐이다. */
  var myGen = ++_nearbyGen;

  sec.innerHTML = '<div class="nearby-loading">📡 위치 확인 중...</div>';

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      if (myGen !== _nearbyGen) return;
      renderNearbyResult(pos.coords.latitude, pos.coords.longitude, myGen);
    },
    function ()    {
      if (myGen !== _nearbyGen) return;
      sec.innerHTML =
        '<div class="nearby-cta" onclick="requestNearbyRec()" style="border-color:#FCA5A5;background:linear-gradient(135deg,#FEF2F2,#FEE2E2)">' +
        '<div class="nearby-cta-icon">⚠️</div>' +
        '<div><div class="nearby-cta-text" style="color:#DC2626">위치 접근 권한이 필요해요</div>' +
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

function renderNearbyResult(myLat, myLng, gen) {
  /* gen 미전달 = 세대 검사 없음(기존 호출 호환).
   * 홈 탭을 재클릭한 뒤 뒤늦게 도착한 GPS 콜백은 여기서 걸러진다. */
  if (gen != null && gen !== _nearbyGen) return;
  if (typeof PLACES === 'undefined') return;
  var sec = document.getElementById('nearby-section');
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
    fetch('js/parking-static.json?v=2026082502').then(function (r) { return r.json(); }).then(function (d) {
      if (gen != null && gen !== _nearbyGen) return;
      if (typeof mergeParkingData === 'function' && !parkingData.length) mergeParkingData(d, []);
      if (parkingData.length) renderNearbyResult(myLat, myLng, gen);
    }).catch(function () {});
    return;
  }

  var nearestPark = null, minPDist = Infinity;
  parks.forEach(function (p) {
    var d = _distKm(myLat, myLng, p.lat, p.lng);
    if (d < minPDist) { minPDist = d; nearestPark = p; }
  });

  if (!nearestTourist) {
    sec.innerHTML = '<div class="nearby-loading">관광지 정보를 불러오는 중이에요.</div>';
    return;
  }

  var tName  = nearestTourist.name;
  /* 템플릿이 '화성시' 를 앞에 붙이므로 주소에서 시·도 접두어를 제거한다.
   * slice(1) 은 '경기도'만 떼어내 '화성시 화성시 …' 가 된다. */
  var tAddr  = (nearestTourist.address || '').replace(/^\s*(경기도\s*)?(화성시\s*)?/, '');
  var imgSrc = placePhotoSrc(nearestTourist);
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
    /* ⚠ ★ 는 지도 핀 전용 기호다. 여기는 목록이라 🎡 다(WORKFLOW.md §3). */
    + '<div class="nearby-photo-cat">🎡 가장 가까운 관광지</div>'
    + '<div class="nearby-photo-name">' + tName + '</div>'
    + '</div>'
    + '</div>'

    /* 하단 정보 */
    + '<div class="nearby-body">'
    + '<div class="nearby-addr"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>화성시 ' + tAddr + '</div>'
    + (nearestTourist.rating ? '<div style="display:flex;align-items:center;gap:4px;margin:3px 0 6px"><span style="color:#F59E0B;font-size:12px">' + ratingStars(nearestTourist.rating) + '</span><span style="font-size:12px;font-weight:700;color:#D97706">' + nearestTourist.rating + '</span><span style="font-size:11px;color:var(--text-muted)">(' + (nearestTourist.reviewCount||0).toLocaleString() + ')</span></div>' : '')
    + '<div class="nearby-actions">'
    + '<button class="nearby-btn primary" onclick="goMapFocus(' + nearestTourist.lat + ',' + nearestTourist.lng + ',4,' + nearestTourist.id + ')">🗺️ 지도에서 보기</button>'
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

/* ══════════════════════════════════════════════════
   홈 날씨·미세먼지 바
   날씨: Open-Meteo API (무료, API 키 불필요)
   미세먼지: 에어코리아 getMsrstnAcctoRltmMesureDnsty
             data.go.kr 에서 '한국환경공단_에어코리아_대기오염정보' 활용신청(무료)
             발급받은 키를 AIRKOREA_KEY에 입력하면 동탄 측정소 PM2.5 표시
══════════════════════════════════════════════════ */
var AIRKOREA_KEY = 'zH1Ajghx0euybdD9BbPBYpBTNTpGscQcGPFtoHSWV9ZmP3KnpVhJxfVO01seBplRXgMefHYZvm/VxSeNfoRtNQ==';

var _hwLat = 37.199, _hwLon = 126.831, _hwLocName = '화성시';

var _WMO = {
  0:'☀️,맑음', 1:'🌤️,대체로 맑음', 2:'⛅,구름 조금', 3:'☁️,흐림',
  45:'🌫️,안개', 48:'🌫️,안개',
  51:'🌦️,이슬비', 53:'🌦️,이슬비', 55:'🌦️,이슬비',
  61:'🌧️,비', 63:'🌧️,비', 65:'🌧️,강한 비',
  71:'🌨️,눈', 73:'🌨️,눈', 75:'🌨️,폭설',
  77:'🌨️,눈', 80:'🌦️,소나기', 81:'🌦️,소나기', 82:'⛈️,강한 소나기',
  85:'🌨️,소나기눈', 86:'🌨️,폭설 소나기',
  95:'⛈️,뇌우', 96:'⛈️,뇌우', 99:'⛈️,강한 뇌우'
};

function _pm25Grade(v) {
  if (v <= 15) return ['좋음', 'hwb-grade-good'];
  if (v <= 35) return ['보통', 'hwb-grade-normal'];
  if (v <= 75) return ['나쁨', 'hwb-grade-bad'];
  return ['매우나쁨', 'hwb-grade-vbad'];
}

function _weatherUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,weather_code' +
    '&hourly=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&timezone=Asia%2FSeoul&forecast_days=2';
}

function _renderWeather(d) {
  var bar = document.getElementById('home-weather-bar');
  if (!bar) return;

  /* 현재 날씨 */
  var wmo = _WMO[d.current.weather_code] || '🌡️,—';
  var p   = wmo.split(',');
  document.getElementById('hwb-icon').textContent     = p[0];
  document.getElementById('hwb-temp').textContent     = Math.round(d.current.temperature_2m) + '°C';
  document.getElementById('hwb-desc').textContent     = p[1] || '';
  document.getElementById('hwb-range').textContent    =
    '최고 ' + Math.round(d.daily.temperature_2m_max[0]) +
    '° · 최저 ' + Math.round(d.daily.temperature_2m_min[0]) + '°';
  document.getElementById('hwb-loc-name').textContent = _hwLocName;
  var _nd = new Date();
  var _days = ['일','월','화','수','목','금','토'];
  document.getElementById('hwb-date').textContent =
    (_nd.getMonth()+1) + '월 ' + _nd.getDate() + '일 (' + _days[_nd.getDay()] + ')';

  /* 시간별 예보: 지금 + 1h/2h/3h 후 */
  var curH   = new Date().getHours();
  var today  = d.daily.time[0];
  var times  = d.hourly.time;
  var hTemps = d.hourly.temperature_2m;
  var hWmos  = d.hourly.weather_code;
  var idx    = 0;
  for (var i = 0; i < times.length; i++) {
    if (times[i].slice(0, 10) === today &&
        parseInt(times[i].slice(11, 13), 10) === curH) { idx = i; break; }
  }
  var offsets = [1, 2, 3, 6];
  var html = '';
  for (var s = 0; s < 4; s++) {
    var si    = idx + offsets[s];
    var label = offsets[s] + '시간 후';
    var icon  = (_WMO[hWmos[si]] || '🌡️,—').split(',')[0];
    var temp  = Math.round(hTemps[si]) + '°';
    html += '<div class="hwb-hour-slot">' +
      '<span class="hwb-hour-label">' + label + '</span>' +
      '<span class="hwb-hour-icon">'  + icon  + '</span>' +
      '<span class="hwb-hour-temp">'  + temp  + '</span>' +
      '</div>';
  }
  document.getElementById('hwb-hourly').innerHTML = html;
  bar.style.display = 'flex';
}

function _fetchAirKorea() {
  /* Open-Meteo 대기질 API — 무료, CORS OK, API 키 불필요 */
  fetch('https://air-quality-api.open-meteo.com/v1/air-quality' +
        '?latitude=' + _hwLat + '&longitude=' + _hwLon +
        '&current=pm2_5&timezone=Asia%2FSeoul')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var v = Math.round(d.current.pm2_5 * 10) / 10;
      if (isNaN(v)) return;
      var g  = _pm25Grade(v);
      var el = document.getElementById('hwb-grade');
      el.textContent = g[0];
      el.className   = 'hwb-grade ' + g[1];
      document.getElementById('hwb-pm25-val').textContent = v + ' ㎍/㎥';
      document.getElementById('hwb-air-box').style.display = 'flex';
    })
    .catch(function() {});
}

/* 같은 좌표를 10분 안에 다시 받지 않는다 (2026-08-26 감사).
 * renderHomePage() 가 initWeatherBar() 를 부르고, 하단 내비의 '홈' 을 다시 누르면
 * resetHomePage() → renderHomePage() 로 이어져 누를 때마다 Open-Meteo 에
 * 날씨·대기질 2건이 새로 나갔다. 10번 누르면 20건이고, 값은 그대로라 화면 변화도 없다.
 * GPS 로 좌표가 바뀌면 key 가 달라져 자동으로 다시 받는다. */
var _wbKey = null, _wbAt = 0;
var WB_TTL = 10 * 60 * 1000;

function initWeatherBar(force) {
  var key = _hwLat + ',' + _hwLon;
  if (!force && key === _wbKey && (Date.now() - _wbAt) < WB_TTL) return;
  _wbKey = key; _wbAt = Date.now();
  fetch(_weatherUrl(_hwLat, _hwLon))
    .then(function(r) { return r.json(); })
    .then(_renderWeather)
    .catch(function() { _wbKey = null; });   /* 실패는 캐시하지 않는다 */
  _fetchAirKorea();
}

function weatherBarGPS() {
  if (!navigator.geolocation) return;
  var btn = document.getElementById('hwb-gps-btn');
  if (btn) btn.classList.add('active');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      _hwLat = pos.coords.latitude;
      _hwLon = pos.coords.longitude;
      /* Nominatim 역지오코딩으로 한국어 주소명 조회 */
      fetch('https://nominatim.openstreetmap.org/reverse' +
            '?lat=' + _hwLat + '&lon=' + _hwLon +
            '&format=json&accept-language=ko',
            { headers: { 'Accept-Language': 'ko' } })
        .then(function(r) { return r.json(); })
        .then(function(geo) {
          var a = geo.address || {};
          _hwLocName = a.city_district || a.suburb || a.quarter ||
                       a.county || a.city || '내 위치';
        })
        .catch(function() { _hwLocName = '내 위치'; })
        .finally(function() {
          fetch(_weatherUrl(_hwLat, _hwLon))
            .then(function(r) { return r.json(); })
            .then(_renderWeather)
            .catch(function() { if (btn) btn.classList.remove('active'); });
          _fetchAirKorea();
        });
    },
    function() { if (btn) btn.classList.remove('active'); }
  );
}

/* ── 홈 페이지 렌더 ── */
function renderHomePage() {
  initWeatherBar();
  renderHomeTourism();
  renderHomeLiving();
  if (typeof renderFavSection === 'function') renderFavSection();
  renderRecentSection();   /* 최근 둘러본 관광지 (없으면 스스로 숨는다) */
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

/* 경기지역화폐 로고 마크업 — 한 곳에서만 만든다 (2026-08-26 감사).
 * 같은 가맹점이 홈 검색결과 '₩' · 목록/지도 로고 · 즐겨찾기 '💳' 로 세 가지였다.
 *
 * ⚠ 이 파일에 둔다. 처음에 js/ui.js 에 뒀다가 home.js 가 통째로 죽었다 —
 *   index.html 의 <script> 순서가 home(4번째) → ui(8번째) 라, 아래 _CAT_STYLE
 *   초기화(로드 시점 평가)에서 ReferenceError 가 났다.
 *   js/favorites.js 는 _favCfg() 안(런타임)에서 읽으므로 순서와 무관하다. */
var LC_ICON_HTML = '<img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:18px;height:18px;object-fit:contain;vertical-align:middle">';

var _CAT_STYLE = {
  tourist:      { bg: '#EEF2FF', em: '🎡' },
  heritage:     { bg: '#F5F3FF', em: '🏛️' },   /* data.js CATEGORY_CONFIG.heritage 와 색·이모지 동일 */
  festival:     { bg: '#FFF7ED', em: '🎉' },
  restaurant:   { bg: '#FEF3C7', em: '🍽️' },
  mobeom:       { bg: '#FEF3C7', em: '🍽️' },
  touristrest:  { bg: '#FEE2E2', em: '🥢' },
  parking:      { bg: '#EFF6FF', em: '🅿️' },
  localcurrency:{ bg: '#F0FDF4', em: LC_ICON_HTML },
  hotel:        { bg: '#EDE9FE', em: '🏨' },
  camping:      { bg: '#DCFCE7', em: '⛺' },
};

/* 검색창이 둘이다 — 홈(#home-search-*)과 지도(#map-search-*).
 * 로직은 하나를 쓰고 '어느 창에서 쳤는가'만 where 로 받는다.
 * where 를 안 넘기면 홈이다(기존 호출부 호환). (2026-08-26) */
var _SR_DOM = {
  home: { input: 'home-search-input', clear: 'home-search-clear',
          results: 'home-search-results', bar: 'home-search-bar' },
  map:  { input: 'map-search-input',  clear: 'map-search-clear',
          results: 'map-search-results',  bar: 'map-search-bar' },
};
var _srWhere = 'home';
function _srEl(where, key) {
  var d = _SR_DOM[where] || _SR_DOM.home;
  return document.getElementById(d[key]);
}

function homeSearchInput(val, where) {
  where = where || 'home';
  _srWhere = where;
  clearTimeout(_srTimer);
  var clearBtn = _srEl(where, 'clear');
  if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
  if (!val.trim()) { closeHomeSearch(where); return; }
  /* 시티투어 코스 10건(12KB)을 한 번 받아 둔다 — dlLoad 가 캐시·중복요청을 막는다.
   * 도착 전에는 ⑥ 섹션이 안 나오고, 도착하면 다음 타이핑부터 걸린다. */
  if (typeof _uniLoadCourses === 'function') _uniLoadCourses();
  _srTimer = setTimeout(function() { doHomeSearch(val, where); }, 220);
}

/* ══════════════════════════════════════════════════════════════════════════
   통합검색 보조표 (2026-08-29)

   ⚠ 이 표들은 반드시 **js/home.js 안**에 둔다. home.js 는 로드 4번째라
     뒤 파일(ui.js 8번째 등)에 두면 load 시점에 못 읽는다 — LC_ICON_HTML 을
     ui.js 에 뒀다가 home.js 가 통째로 죽은 전례가 이 파일 위쪽 주석에 있다.
   ══════════════════════════════════════════════════════════════════════════ */

/* 장소 별칭 — 사람들이 부르는 이름과 데이터의 이름이 다른 것만. */
var _PLACE_ALIAS = {
  24: '융건릉 융릉과건릉 융릉 건릉',
  8:  '공룡알 공룡알화석지 공룡',
  7:  '케이블카 제부도케이블카 해상케이블카',
  1:  '제부도해변 제부도',
  2:  '궁평리해변 궁평항'
};

/* 종류 동의어 — 화면에는 안 보이고 검색에만 쓴다.
 * ⚠ 지역화폐에는 절대 심지 않는다. '가맹점' 을 심으면 27,374건이 전부 걸린다. */
var _CAT_SYN = {
  tourist:  '관광지 명소 볼거리 여행지',
  heritage: '문화재 유적 역사 향교 사찰',
  festival: '축제 행사 이벤트 공연',
  parking:  '주차장 주차 공영주차장',
  mobeom:      '맛집 음식점 식당 밥집 모범음식점',
  touristrest: '관광식당 관광식당업 식당',
  hotel:       '숙박 호텔 관광호텔 잘곳',
  camping:     '캠핑 캠핑장 야영장 글램핑',
  temple:      '템플스테이 절 사찰',
  touristfacility: '관광편의시설 편의시설',
  cinema:      '영화 영화관 상영관 시네마',
  jebu:        '제부도숙박 펜션 민박 제부도'
};

/* ⑤ 먹고 자고 놀기 — CONVENIENCE 8종.
 * go 는 결과를 눌렀을 때 어느 경로로 보낼지다.
 *   'conv'  → goConvItem(cat, idx)  (목록 인덱스로 가는 것)
 *   'conv2' → goMapConv(cat, lat, lng)  (좌표를 가진 것) */
function _CONV_SETS() {
  if (typeof CONVENIENCE === 'undefined') return [];
  var C = CONVENIENCE;
  var temple = C.templeStay ? [C.templeStay] : [];
  var jebu = [];
  if (C.jebu) {
    ['pension_outside', 'inside', 'nearby', 'minbak_inside', 'minbak_nearby'].forEach(function (k) {
      if (Array.isArray(C.jebu[k])) jebu = jebu.concat(C.jebu[k]);
    });
  }
  return [
    { arr: C.restaurants,        cat: 'mobeom',      go: 'conv',  label: '모범음식점',   em: '🍽️', bg: '#FFF7ED' },
    { arr: C.touristRestaurants, cat: 'touristrest', go: 'conv',  label: '관광식당',     em: '🥢', bg: '#FEE2E2' },
    { arr: C.hotels,             cat: 'hotel',       go: 'conv',  label: '관광호텔',     em: '🏨', bg: '#EEF2FF' },
    { arr: C.camping,            cat: 'camping',     go: 'conv',  label: '캠핑장',       em: '🏕️', bg: '#ECFDF5' },
    { arr: temple,               cat: 'temple',      go: 'conv',  label: '템플스테이',   em: '🛕', bg: '#FEF3C7' },
    { arr: C.touristFacilities,  cat: 'touristfacility', go: 'conv2', label: '관광편의시설', em: '🎫', bg: '#F1F5F9' },
    { arr: C.cinemas,            cat: 'cinema',      go: 'conv2', label: '영화상영관',   em: '🎬', bg: '#FCE7F3' },
    { arr: jebu,                 cat: 'jebu',        go: 'conv2', label: '제부도 숙박',  em: '⛱️', bg: '#E0F2FE' }
  ];
}

/* ① 바로가기 — 화면·기능 자체를 검색 결과로 낸다.
 * 사용자가 콕 집어 말한 것이 '제부도 물길' 과 '오늘의 화성 날씨' 다.
 * ⚠ 행을 만들기 전에 진입 함수가 실제로 있는지 본다. 없으면 그 행을 안 만든다 —
 *   눌러도 아무 일 없는 결과가 제일 나쁘다. */
function _uniActions() {
  var fn = function (n) { return typeof window[n] === 'function'; };
  var chip = function (sub) { return document.querySelector('.tourism-subnav .chip[data-sub="' + sub + '"]'); };
  /* 테마 칩에는 data-* 가 없다. onclick 에 값이 들어 있으므로 그걸로 잡는다 —
   * 인덱스로 잡으면 칩 순서가 바뀌는 날 조용히 엉뚱한 테마로 간다. */
  var theme = function (v) {
    return document.querySelector('#tourism-theme-chips .chip[onclick*="\u0027' + v + '\u0027"]');
  };
  var L = [];
  var add = function (key, name, alias, sub, em, bg) { L.push({ key: key, name: name, alias: alias, sub: sub, em: em, bg: bg }); };

  if (fn('openTide'))  add('tide',    '제부도 바닷길 통행 시간', '물때 물길 바닷길 간조 밀물 썰물 통행 시간표 모세의기적 바다갈라짐 제부도', '지금 건널 수 있는지 확인', '🌊', '#CFFAFE');
  if (fn('openToday')) add('today',   '오늘의 화성 날씨', '날씨 오늘날씨 기온 온도 미세먼지 초미세먼지 대기질 예보 주간예보 비 우산 습도', '오늘 기온·미세먼지·주간예보', '☀️', '#FEF9C3');
  if (fn('goLivingCat')) {
    add('lc-all',   '지역화폐 가맹점 전체', '지역화폐 경기지역화폐 화성사랑카드 가맹점 카드', '27,374곳 목록', typeof LC_ICON_HTML !== 'undefined' ? LC_ICON_HTML : '💳', '#F0FDF4');
    add('park-all', '공영주차장 전체', '주차 주차장 공영주차장 무료주차', '131곳 · 실시간 여유', '🅿️', '#DBEAFE');
    add('rest-all', '모범음식점 전체', '모범음식점 맛집 음식점 식당 밥집', '94곳', '🍽️', '#FFF7ED');
    add('trest-all','관광식당 전체', '관광식당 관광식당업', '35곳', '🥢', '#FEE2E2');
  }
  if (fn('goFestivalAll')) add('fest-all', '행사·축제 전체', '행사 축제 이벤트 공연', '진행 중인 것부터', '🎉', '#FEF2F2');
  if (fn('openFestView'))  add('cal',      '행사 캘린더', '캘린더 달력 일정 축제일정', '날짜로 골라 보기', '🗓️', '#EDE9FE');
  if (fn('openQuiz'))      add('quiz',     '여행 취향 퀴즈', '퀴즈 취향 추천받기 여행성향', '5문항으로 추천받기', '🎯', '#FEF3C7');
  if (fn('requestNearbyRec')) add('near',  '내 주변 추천', '내주변 근처 가까운 주변', '위치 권한이 필요해요', '📍', '#EFF6FF');
  if (fn('goDatalab')) {
    add('dl-popular', '인기 순위',   '인기 순위 랭킹 많이찾는곳', '한국관광 데이터랩', '🔥', '#FEF2F2');
    add('dl-age',     '세대별 인기', '세대 연령 20대 30대 40대 나이', '연령대로 보기', '👥', '#EEF2FF');
    add('dl-report',  '뜨는 곳 리포트', '트렌드 데이터랩 리포트 요즘', '지난달 대비', '📈', '#ECFDF5');
    add('dl-tour',    '화성 시티투어', '시티투어 투어 버스투어 코스', '코스 10개', '🚌', '#EDE9FE');
  }
  if (fn('switchTourismSub')) {
    /* ⚠ switchTourismSub 은 첫 인자 null 가드가 없다. 칩이 없으면 행을 안 만든다. */
    if (chip('spot'))     add('sub-spot',     '관광지 전체', '관광지 명소 볼거리', '151곳', '🎡', '#FEF3C7');
    if (chip('heritage')) add('sub-heritage', '문화재 전체', '문화재 유적 향교 역사', '지정문화재 42곳', '🏛️', '#EDE9FE');
    if (chip('stay'))     add('sub-stay',     '숙박 전체', '숙박 호텔 잘곳 펜션', '관광호텔·제부도 숙박', '🏨', '#EEF2FF');
    if (chip('camp'))     add('sub-camp',     '캠핑장 전체', '캠핑 야영장 글램핑', '17곳', '🏕️', '#ECFDF5');
    if (chip('temple'))   add('sub-temple',   '템플스테이', '템플스테이 절 사찰 용주사', '용주사', '🛕', '#FEF3C7');
    if (chip('spot') && fn('pickTheme')) {
      if (theme('sea'))     add('th-sea',     '바다 여행', '바다 해변 해수욕장 섬', '테마로 보기', '🌊', '#CFFAFE');
      if (theme('nature'))  add('th-nature',  '자연 여행', '자연 숲 공원 산', '테마로 보기', '🌳', '#ECFDF5');
      if (theme('history')) add('th-history', '역사 여행', '역사 유적지 문화재', '테마로 보기', '🏛️', '#EDE9FE');
      if (theme('family'))  add('th-family',  '아이와 함께', '아이 가족 체험 어린이', '테마로 보기', '👨‍👩‍👧', '#FEF3C7');
    }
  }
  if (fn('goMapCat')) {
    add('cat-cinema', '영화상영관 전체', '영화 영화관 cgv 메가박스 롯데시네마 상영관', '13곳', '🎬', '#FCE7F3');
    add('cat-jebu',   '제부도 숙박 전체', '제부도숙박 제부도펜션 민박 펜션', '115곳', '⛱️', '#E0F2FE');
  }
  /* 즐겨찾기는 저장한 게 있을 때만 — 0건이면 홈의 그 자리가 display:none 이다 */
  if (typeof getFavs === 'function' && getFavs().length) {
    add('favs', '즐겨찾기', '찜 하트 저장한곳 즐겨찾기 북마크', getFavs().length + '곳 저장됨', '❤️', '#FEE2E2');
  }
  add('recent', '최근 본 곳', '최근 방문기록 봤던곳', '홈에서 보기', '🕘', '#F1F5F9');
  if (fn('shareApp'))    add('share',    '앱 공유', '공유 링크 친구', '화성잇다 링크 보내기', '🔗', '#FFF7ED');
  if (fn('openSettings'))add('settings', '설정', '설정 캐시 권한 저장된정보', '저장된 정보·캐시·위치', '⚙️', '#F1F5F9');
  add('map',  '지도 보기', '지도 맵', '지도 탭으로', '🗺️', '#EEF2FF');
  if (fn('openMenu')) add('menu', '전체 메뉴', '메뉴 더보기 전체', '햄버거 메뉴 열기', '☰', '#F1F5F9');
  return L;
}

/* 라틴 문자가 든 질의(cgv·CGV동탄 등)에만 쓰는 소문자 사본.
 * 한글 질의에는 toLowerCase 가 필요 없어서 아예 만들지 않는다 —
 * 매 검색 27,374번 toLowerCase 를 돌리는 것이 현행이 느리던 원인이다.
 * 1회 빌드 비용을 그 사용자에게만 물린다. */
var _lcLowerCache = null, _lcLowerN = -1;
function _lcLowerIndex() {
  if (typeof lcData === 'undefined' || !lcData.length) return null;
  if (_lcLowerCache && _lcLowerN === lcData.length) return _lcLowerCache;
  var out = new Array(lcData.length);
  for (var i = 0; i < lcData.length; i++) {
    var p = lcData[i];
    out[i] = [(p.n || '').toLowerCase(), (p.c || '').toLowerCase(), (p.a || '').toLowerCase()];
  }
  _lcLowerCache = out; _lcLowerN = lcData.length;
  return out;
}

/* 시티투어 코스 — 12KB 지연 로드. 도착하면 다음 검색부터 걸린다. */
var _uniCourses = null;
function _uniLoadCourses() {
  if (_uniCourses || typeof dlLoad !== 'function' || typeof DL_TOUR === 'undefined') return;
  dlLoad(DL_TOUR, function (d) {
    var arr = (d && d.courses) || [];
    _uniCourses = arr.map(function (c, i) { return Object.assign({ no: (c.no != null ? c.no : i) }, c); });
  });
}

function doHomeSearch(q, where) {
  where = where || 'home';
  _srWhere = where;
  q = (q || '').trim();
  if (!q) { closeHomeSearch(where); return; }

  /* 검색어 앞뒤의 구 이름을 떼어낸다 — '동탄구 카페' → 구=동탄구, 검색어=카페.
   * '동탄' 처럼 '구' 를 빼고 쳐도 잡는다 (js/district.js splitGuQuery).
   * 구만 치면(검색어가 비면) 그 동네 목록을 그대로 보여 준다. (2026-08-26) */
  var _gq = (typeof splitGuQuery === 'function') ? splitGuQuery(q) : { gu: null, rest: q };
  var _gu = _gq.gu;
  var _qt = _gq.rest;
  var ql  = _qt.toLowerCase();
  var _guOnly = !!(_gu && !_qt);
  /* 구 안에서 이름 일치를 볼 때 쓰는 판정. 구만 쳤으면 전부 통과시킨다. */
  function _hit(txt) { return _guOnly || String(txt || '').toLowerCase().includes(ql); }
  function _inGu(item, kind) {
    if (!_gu) return true;
    return (typeof guOf === 'function') ? guOf(item, kind) === _gu : true;
  }
  var results = [];

  /* ══════════════════════════════════════════════════════════════════════
     통합검색 — 섹션별로 모아 담는다 (2026-08-29 사용자 요청)
     "모든 데이터를 다 검색할 수 있게. 지역화폐 가맹점·관광지·주차장 모든 곳들을,
      그리고 제부도 물길이나 오늘의 화성 날씨도"

     ⚠ 가맹점 27,374건이 다른 종류를 삼키지 못하게 **섹션마다 상한**을 둔다.
       한 목록에 점수만으로 세우면 '카페' 한 번에 가맹점이 자리를 다 먹는다.
     ⚠ 가맹점 섹션은 **항상 맨 끝**이다. 817KB(gzip)가 늦게 도착해 채워져도
       위쪽 행이 1px 도 안 밀린다 — 누르려던 항목이 손가락 밑에서 움직이면 안 된다.
     ⚠ window._srResults 는 **평면 배열**로 유지한다. 섹션은 그리는 구조일 뿐이고
       onclick="_srClick(idx)" 의 idx 가 평면 인덱스여야 resetHomePage 의
       GC 방지 null 대입까지 그대로 산다.
     ══════════════════════════════════════════════════════════════════════ */
  /* 코스 12KB 는 여기서도 한 번 청한다 — homeSearchInput 을 거치지 않고
   * doHomeSearch 를 직접 부르는 경로(검사·다시그리기)에서도 ⑥ 이 나오게. */
  if (typeof _uniLoadCourses === 'function') _uniLoadCourses();

  var _rawToks = _qt.split(/\s+/).filter(function (t) { return t.length > 0; });
  var toks     = _rawToks.map(function (t) { return t.toLowerCase(); });
  /* 한글 질의에는 toLowerCase 가 필요 없다. 27,374건에 매번 소문자화를 돌리는
   * 것이 현행이 드문 검색어에서 20ms 를 먹던 원인이라 원본 토큰을 따로 둔다. */
  var _qtToks  = _rawToks;
  var hasLatin = /[a-z]/i.test(_qt);

  function push(sec, o) { o._sec = sec; results.push(o); }

  /* 토큰 하나가 이름/별칭/보조필드에 얼마나 잘 맞나. 못 맞으면 -1. */
  function _tokScore(tok, name, alias, aux, nospace) {
    var n = String(name || '').toLowerCase();
    if (n === tok) return 100;
    if (n.indexOf(tok) === 0) return 60;
    if (alias) {
      var a = String(alias).toLowerCase();
      if ((' ' + a + ' ').indexOf(' ' + tok + ' ') >= 0) return 55;
    }
    if (n.indexOf(tok) >= 0) return 40;
    if (nospace && nospace.indexOf(tok.replace(/\s+/g, '')) >= 0) return 30;
    if (alias && String(alias).toLowerCase().indexOf(tok) >= 0) return 25;
    if (aux && String(aux).toLowerCase().indexOf(tok) >= 0) return 15;
    return -1;
  }
  /* 모든 토큰이 맞아야 통과(AND). 통짜 includes 라서 '제부도 주차장'·'오늘 날씨'가
   * 전부 0건이던 것이 이 한 가지 때문이다. */
  function score(name, alias, aux, nospace) {
    if (!toks.length) return 0;
    var sum = 0;
    for (var i = 0; i < toks.length; i++) {
      var v = _tokScore(toks[i], name, alias, aux, nospace);
      if (v < 0) return -1;
      sum += v;
    }
    /* 이름이 한글·숫자로 시작하지 않으면 살짝 뒤로 — '#헤어'가 '미용실진'을 앞서지 않게 */
    if (!/^[가-힣0-9]/.test(String(name || ''))) sum -= 5;
    return sum;
  }

  /* ── ① 바로가기 — 화면·기능 자체를 검색한다 ─────────────────────────── */
  if (!_guOnly) {
    _uniActions().forEach(function (a) {
      var sc = score(a.name, a.alias, '', a.name.replace(/\s+/g, '').toLowerCase());
      if (sc < 0) return;
      push(1, { type: 'action', name: a.name, sub: a.sub, em: a.em, bg: a.bg,
                act: a.key, _sc: sc + 40 });   /* 기능은 같은 점수면 앞에 온다 */
    });
  }

  /* ── ② 지역 ─────────────────────────────────────────────────────────── */
  if (_gu) {
    push(2, { type: 'gu', name: _gu + ' 전체 보기', sub: '지도에서 이 동네만 봐요',
              em: '🗺️', bg: '#EEF2FF', gu: _gu, _sc: 90 });
  } else if (typeof GU_NAMES !== 'undefined') {
    GU_NAMES.forEach(function (g) {
      if (g.indexOf(q) === 0 || g.slice(0, g.length - 1).indexOf(q) === 0) {
        push(2, { type: 'gu', name: g + ' 전체 보기', sub: '지도에서 이 동네만 봐요',
                  em: '🗺️', bg: '#EEF2FF', gu: g, _sc: 80 });
      }
    });
  }
  if (!_guOnly) {
    _REGIONS.forEach(function (r) {
      var sc = score(r.name, '', '', r.name.replace(/\s+/g, ''));
      if (sc < 0) return;
      push(2, { type: 'region', name: r.name + ' 지역', sub: '지도에서 보기',
                em: '📍', bg: '#F3F4F6', lat: r.lat, lng: r.lng, level: r.level, _sc: sc });
    });
  }

  /* ── ③ 관광지·문화재·행사 ───────────────────────────────────────────── */
  if (typeof PLACES !== 'undefined') {
    PLACES.forEach(function (p) {
      /* 구를 지정했으면 축제는 뺀다 — 장소 미정 21건이 시청 좌표에 몰려 있어
       * 어느 구로 넣어도 거짓이 된다 (2026-08-26 사용자 지시). */
      if (_gu && p.category === 'festival') return;
      var alias = (_PLACE_ALIAS[p.id] || '') + ' ' + (_CAT_SYN[p.category] || '');
      var aux   = (p.address || '') + ' ' + ((p.tags || []).join(' '));
      var sc    = _guOnly ? 0 : score(p.name, alias, aux, p.name.replace(/\s+/g, '').toLowerCase());
      if (sc < 0) return;
      if (!_inGu(p, 't')) return;
      var st   = _CAT_STYLE[p.category] || { bg: '#F3F4F6', em: '📌' };
      var addr = (p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
      var _g   = (typeof guOf === 'function') ? guOf(p, 't') : null;
      var _pre = (_g && addr.indexOf(_g) < 0) ? _g + ' · ' : '';
      push(3, { type: 'place', name: p.name, sub: _pre + addr, em: st.em, bg: st.bg,
                lat: p.lat, lng: p.lng, id: p.id, cat: p.category, _sc: sc });
    });
  }

  /* ── ④ 공영주차장 ───────────────────────────────────────────────────── */
  if (typeof parkingData !== 'undefined') {
    parkingData.forEach(function (p) {
      var aux = (p.address || '') + ' ' + ((p.tags || []).join(' ')) + ' ' + (p.free ? '무료' : '유료');
      var sc  = _guOnly ? 0 : score(p.name, _CAT_SYN.parking, aux, p.name.replace(/\s+/g, '').toLowerCase());
      if (sc < 0) return;
      if (!_inGu(p, 'p')) return;
      var isFree = p.free || (p.tags && p.tags.includes('무료'));
      var addr = (p.address || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
      var _g2  = (typeof guOf === 'function') ? guOf(p, 'p') : null;
      var _pre2 = (_g2 && addr.indexOf(_g2) < 0) ? _g2 + ' · ' : '';
      push(4, { type: 'parking', name: p.name, sub: (isFree ? '무료' : '유료') + ' · ' + _pre2 + addr,
                em: '🅿️', bg: '#EFF6FF', lat: p.lat, lng: p.lng, id: p.id, _sc: sc });
    });
  }

  /* ── ⑤ 먹고 자고 놀기 (CONVENIENCE 8종 295건) ──────────────────────────
   * 예전에는 모범음식점·관광식당·영화관 셋뿐이었다. 숙박·캠핑·템플스테이·
   * 관광편의시설·제부도숙박이 통째로 빠져 있었다.
   * ⚠ _guOnly 일 때 여기를 그냥 통과시키면 안 된다 — 예전에는 ql 이 '' 이라
   *   ''.includes('') 가 참이 되어 검색어와 무관한 앞 5건을 집어 왔다. */
  if (typeof CONVENIENCE !== 'undefined' && !_guOnly) {
    _CONV_SETS().forEach(function (cs) {
      (cs.arr || []).forEach(function (p, i) {
        var nm  = p.name || '';
        var aux = (p.addr || '') + ' ' + (p.cuisine || '') + ' ' + (p.area || '');
        var sc  = score(nm, _CAT_SYN[cs.cat] || '', aux, nm.replace(/\s+/g, '').toLowerCase());
        if (sc < 0) return;
        var o = { type: cs.go, name: nm, sub: cs.label + (p.addr ? ' · ' + p.addr : ''),
                  em: cs.em, bg: cs.bg, convCat: cs.cat, idx: i, _sc: sc };
        if (p.lat && p.lng) { o.lat = p.lat; o.lng = p.lng; }
        push(5, o);
      });
    });
  }

  /* ── ⑥ 시티투어 코스 ────────────────────────────────────────────────── */
  if (!_guOnly && _uniCourses) {
    _uniCourses.forEach(function (c) {
      var aux = (c.theme || '') + ' ' + (c.tagline || '') + ' ' + (c.desc || '') + ' ' +
                ((c.spots || []).map(function (x) { return x.name; }).join(' '));
      var sc = score(c.name, '시티투어 투어 코스', aux, String(c.name).replace(/\s+/g, ''));
      if (sc < 0) return;
      push(6, { type: 'course', name: c.name, sub: '시티투어 코스' + (c.theme ? ' · ' + c.theme : ''),
                em: '🚌', bg: '#EDE9FE', no: c.no, _sc: sc });
    });
  }

  /* ── ⑦ 지역화폐 가맹점 — 항상 맨 끝 ──────────────────────────────────
   * ⚠ toLowerCase()·replace 를 27,374건에 돌리지 않는다. 한글 질의는 원본
   *   indexOf 로 충분하고, 그게 현행이 드문 검색어에서 20ms 를 먹던 원인이다.
   *   라틴 문자가 든 질의에만 소문자 사본을 한 번 만들어 쓴다.
   * ⚠ '지역화폐'·'가맹점' 동의어를 심지 않는다 — 27,374건 전부가 걸린다.
   *   그 요구는 ① 바로가기의 '지역화폐 가맹점 전체' 한 행이 맡는다. */
  if (!_guOnly && _qt.length >= 2) {
    if (typeof lcData !== 'undefined' && lcData.length) {
      /* ⚠ 27,374건마다 문자열을 이어 붙이면(n + ' ' + c + ' ' + a) 그 자체로
       * 2만 7천 번의 할당이다. 실측 cgv 36.2ms — 명세가 예상한 6~8ms 의 5배였다.
       * 필드를 따로따로 indexOf 하고 하나만 맞으면 즉시 통과시킨다. */
      var _lcLower = null;
      if (hasLatin) _lcLower = _lcLowerIndex();   /* 라틴 질의일 때만, 1회 캐시 */
      var lcBucket = [[], [], []];   /* 0 완전일치 · 1 앞일치 · 2 그 외 */
      var CAP = 20, lcTotal = 0;
      for (var li = 0; li < lcData.length; li++) {
        var lp = lcData[li];
        var fn0, fc0, fa0;
        if (_lcLower) { var L = _lcLower[li]; fn0 = L[0]; fc0 = L[1]; fa0 = L[2]; }
        else          { fn0 = lp.n || ''; fc0 = lp.c || ''; fa0 = lp.a || ''; }
        var okAll = true;
        for (var ti = 0; ti < toks.length; ti++) {
          var tk = hasLatin ? toks[ti] : _qtToks[ti];
          if (fn0.indexOf(tk) < 0 && fc0.indexOf(tk) < 0 && fa0.indexOf(tk) < 0) { okAll = false; break; }
        }
        if (!okAll) continue;
        lcTotal++;
        var t0  = hasLatin ? toks[0] : _qtToks[0];
        var key = (fn0 === t0) ? 0 : (fn0.indexOf(t0) === 0 ? 1 : 2);
        if (lcBucket[key].length < CAP) lcBucket[key].push(lp);
        if (lcBucket[0].length >= CAP) break;   /* 완전일치가 가득 차면 더 볼 것 없다 */
      }
      var lcSeen = 0;
      [0, 1, 2].forEach(function (k) {
        lcBucket[k].forEach(function (lp) {
          var addr = (lp.a || '').replace('경기도 화성시 ', '').split(' ').slice(0, 3).join(' ');
          push(7, { type: 'lc', name: lp.n, sub: (lp.c || '') + (addr ? ' · ' + addr : ''),
                    em: LC_ICON_HTML, bg: '#F0FDF4', lat: lp.lat, lng: lp.lng, _raw: lp,
                    _sc: 100 - k * 20 - (lcSeen++), _lcTotal: lcTotal });
        });
      });
    } else {
      /* 미로드 — 조용히 0건으로 두지 않는다. 그게 지금 가장 큰 거짓말이다. */
      push(7, { type: 'lcload', name: '가맹점 27,374곳에서 \u0027' + _qt + '\u0027 찾기',
                sub: '눌러서 불러오기 · 약 0.8MB', em: LC_ICON_HTML, bg: '#F0FDF4', _sc: 0 });
    }
  }

  renderHomeSearchResults(_uniBudget(results), q);
  _uniPrefetchLc(_qt);
}

/* 첫 검색이 끝난 뒤 한가할 때 가맹점 데이터를 한 번 미리 받는다.
 * ⚠ focus 에 걸면 안 된다 — '날씨' 한 단어 치러 온 사용자에게 817KB(gzip) 와
 *   모바일 200~400ms 파싱 프리즈를 물리게 된다. 검색을 실제로 한 뒤에만.
 * ⚠ silent 로 부른다. 안 그러면 타이핑 도중에 '불러오는 중이에요' 토스트가 뜬다.
 * ⚠ 데이터 절약 모드면 하지 않는다 — 사용자가 명시적으로 끈 것이다. */
var _uniPrefetched = false;
function _uniPrefetchLc(qt) {
  if (_uniPrefetched) return;
  if (!qt || qt.length < 2) return;
  if (typeof lcData !== 'undefined' && lcData.length) { _uniPrefetched = true; return; }
  if (typeof _loadLcData !== 'function') return;
  var c = navigator.connection;
  if (c && c.saveData) return;
  _uniPrefetched = true;
  var run = function () { _loadLcData(function () {}, true); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 1200);
}

/* ── 섹션별 상한 → 전체 예산 12행 (아래 섹션부터 깎는다) ────────────────── */
var _UNI_CAP  = { 1: 3, 2: 2, 3: 4, 4: 3, 5: 3, 6: 2, 7: 3 };
var _UNI_TOTAL = 12;
function _uniBudget(rows) {
  var by = {};
  rows.forEach(function (r) { (by[r._sec] = by[r._sec] || []).push(r); });
  Object.keys(by).forEach(function (k) {
    by[k].sort(function (a, b) {
      if (b._sc !== a._sc) return b._sc - a._sc;
      return String(a.name).length - String(b.name).length;
    });
    by[k]._total = by[k].length;
    by[k] = by[k].slice(0, _UNI_CAP[k] || 3);
  });
  var secs = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
  var count = function () { return secs.reduce(function (n, k) { return n + by[k].length; }, 0); };
  /* 넘치면 아래(가맹점) 쪽부터 한 행씩 깎는다. 비어 있지 않은 섹션은 최소 1행 보장 */
  var guard = 0;
  while (count() > _UNI_TOTAL && guard++ < 60) {
    var cut = false;
    for (var i = secs.length - 1; i >= 0; i--) {
      if (by[secs[i]].length > 1) { by[secs[i]].pop(); cut = true; break; }
    }
    if (!cut) break;
  }
  var out = [];
  secs.forEach(function (k) {
    by[k].forEach(function (r, i) { r._first = (i === 0); r._secTotal = by[k]._total; out.push(r); });
  });
  return out;
}

var _UNI_SEC_NAME = {
  1: '바로가기', 2: '지역', 3: '관광·문화재·행사', 4: '공영주차장',
  5: '먹고 자고 놀기', 6: '시티투어 코스', 7: '지역화폐 가맹점'
};
/* 섹션 머리글을 누르면 그 종류의 '전체 화면' 으로 간다. 새 화면은 만들지 않는다 —
 * 전부 이미 있는 목록·지도로 보낸다. */
function _srSecClick(sec) {
  clearTimeout(_srTimer); _srTimer = null;
  clearHomeSearch(_srWhere);
  if (sec === 3 && typeof goMapCat === 'function') goMapCat('tourist');
  else if (sec === 4 && typeof goLivingCat === 'function') goLivingCat('parking');
  else if (sec === 5 && typeof goLivingCat === 'function') goLivingCat('restaurant');
  else if (sec === 6 && typeof goDatalab === 'function') goDatalab('tour');
  else if (sec === 7 && typeof goLivingCat === 'function') goLivingCat('currency');
}

function renderHomeSearchResults(results, q) {
  /* _srWhere 가 홈/지도 중 어디에 그릴지 정한다 — 위 _SR_DOM 주석 참고. */
  var el  = _srEl(_srWhere, 'results');
  var bar = _srEl(_srWhere, 'bar');
  if (!el) return;

  if (!results.length) {
    /* ⚠ 여기서도 반드시 비운다. 예전에는 그냥 return 해서 **직전 검색 결과 배열이
     * 그대로 남았다** — 화면은 '검색 결과가 없어요' 인데 window._srResults 에는
     * 옛 항목이 살아 있었다.
     * 지금은 .sr-empty 에 onclick 이 없어 잘못 눌릴 일은 없지만, 이 배열은
     * 지역화폐 27,374건의 원소를 참조하고 있어 GC 를 막는다 — resetHomePage 가
     * 굳이 null 을 넣는 이유가 그것이다(js/home.js resetHomePage ①).
     * 결과가 없을 때만 그 정리가 건너뛰어지고 있었다. */
    window._srResults = null;
    el.innerHTML = '<div class="sr-empty">검색 결과가 없어요</div>';
    el.classList.add('open');
    if (bar) bar.style.borderRadius = 'var(--r-pill) var(--r-pill) 0 0';
    return;
  }

  /* 섹션 머리글을 끼워 그린다. 종류가 섞여 나와도 무엇을 보고 있는지 알 수 있고,
   * 깎여 남은 것이 있으면 머리글 오른쪽에서 그 종류 전체 화면으로 갈 수 있다.
   * ⚠ idx 는 계속 **평면 인덱스**다 — _srClick·resetHomePage 가 그걸 전제한다. */
  el.innerHTML = results.map(function (r, idx) {
    var head = '';
    if (r._first) {
      var more = (r._secTotal > _UNI_CAP[r._sec])
        ? '<span class="sr-sec-more">' + r._secTotal + '건 모두 보기 ›</span>' : '';
      head = '<div class="sr-sec" onclick="_srSecClick(' + r._sec + ')">'
           + '<span>' + (_UNI_SEC_NAME[r._sec] || '') + '</span>' + more + '</div>';
    }
    return head
      + '<div class="sr-item" onclick="_srClick(' + idx + ')">'
      + '<div class="sr-icon" style="background:' + r.bg + '">' + r.em + '</div>'
      + '<div style="flex:1;min-width:0"><div class="sr-name">' + r.name + '</div><div class="sr-sub">' + r.sub + '</div></div>'
      + '</div>';
  }).join('');

  window._srResults = results;
  el.classList.add('open');
  if (bar) bar.style.borderRadius = 'var(--r-pill) var(--r-pill) 0 0';
}

/* 바로가기 실행. 표(_uniActions)의 key 하나당 한 줄이다.
 * ⚠ closeToday() 를 먼저 부르는 이유: openToday 와 openSettings 가 #today-dim
 *   한 장을 dataset.for 로 나눠 쓴다. 검색 결과에서 둘을 잇달아 누를 수 있다. */
function _srDoAction(key) {
  var subGo = function (sub, theme) {
    go('tourism');
    var c = document.querySelector('.tourism-subnav .chip[data-sub="' + sub + '"]');
    if (!c) return;                       /* switchTourismSub 은 null 가드가 없다 */
    switchTourismSub(c, sub);
    if (theme) {
      var t = document.querySelector('#tourism-theme-chips .chip[onclick*="\u0027' + theme + '\u0027"]');
      if (t && typeof pickTheme === 'function') pickTheme(t, theme);
    }
  };
  var homeTo = function (id) {
    go('home');
    setTimeout(function () {
      var el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };
  switch (key) {
    case 'tide':      openTide(); return;
    case 'today':     if (typeof closeToday === 'function') closeToday(); openToday(); return;
    case 'lc-all':    goLivingCat('currency');   return;
    case 'park-all':  goLivingCat('parking');    return;
    case 'rest-all':  goLivingCat('restaurant'); return;
    case 'trest-all': goLivingCat('touristrest');return;
    case 'fest-all':  goFestivalAll(); return;
    case 'cal':       openFestView('calendar');  return;
    case 'quiz':      openQuiz(); return;
    case 'near':      go('tourism'); if (typeof requestNearbyRec === 'function') requestNearbyRec(); return;
    case 'dl-popular':goDatalab('popular'); return;
    case 'dl-age':    goDatalab('age');     return;
    case 'dl-report': goDatalab('report');  return;
    case 'dl-tour':   goDatalab('tour');    return;
    case 'sub-spot':     subGo('spot');     return;
    case 'sub-heritage': subGo('heritage'); return;
    case 'sub-stay':     subGo('stay');     return;
    case 'sub-camp':     subGo('camp');     return;
    case 'sub-temple':   subGo('temple');   return;
    case 'th-sea':     subGo('spot', 'sea');     return;
    case 'th-nature':  subGo('spot', 'nature');  return;
    case 'th-history': subGo('spot', 'history'); return;
    case 'th-family':  subGo('spot', 'family');  return;
    case 'cat-cinema': goMapCat('cinema'); return;
    case 'cat-jebu':   goMapCat('jebu');   return;
    case 'favs':       homeTo('home-favs-section');   return;
    case 'recent':     homeTo('home-recent-section'); return;
    case 'share':      shareApp(); return;
    case 'settings':   if (typeof closeToday === 'function') closeToday(); openSettings(); return;
    case 'map':        go('map');  return;
    case 'menu':       openMenu(); return;
  }
}

function _srClick(idx) {
  var r = (window._srResults || [])[idx];
  if (!r) return;

  /* 가맹점 미로드 안내행 — 여기서만 4.2MB 를 받는다(사용자가 눌렀을 때만).
   * ⚠ clearHomeSearch 를 부르면 안 된다. 받은 뒤 같은 검색어로 다시 그려야 한다. */
  if (r.type === 'lcload') {
    var _q = _srEl(_srWhere, 'input');
    var _qv = _q ? _q.value : '';
    if (typeof _loadLcData === 'function') {
      _loadLcData(function () { if (_qv) doHomeSearch(_qv, _srWhere); });
    }
    return;
  }

  clearHomeSearch(_srWhere);

  /* 바로가기 — 화면·기능으로 간다 */
  if (r.type === 'action') { _srDoAction(r.act); return; }

  /* 시티투어 코스 — ⚠ dlShowCourse 를 직접 부르면 안 된다. 그건 showDatalab 만
   * 불러 탭을 안 옮긴다(홈에서 누르면 아무 일도 안 일어난 것처럼 보인다). */
  if (r.type === 'course') {
    if (typeof goDatalab === 'function') goDatalab('course:' + r.no);
    return;
  }

  /* 좌표를 가진 편의정보 — 지도 칩을 켜고 그 자리로 */
  if (r.type === 'conv2') {
    if (typeof goMapConv === 'function') goMapConv(r.convCat, r.lat, r.lng);
    return;
  }
  /* 지역(구) 결과 — 지도 탭으로 가서 그 동네 화면으로 옮긴다.
   * go('map') 직후엔 카카오 SDK 가 아직 초기화 전일 수 있어(autoload=false) 한 박자 늦춘다. */
  if (r.type === 'gu') {
    go('map');
    setTimeout(function () {
      /* 토글이 아니라 '항상 그 구로' — 두 번째 클릭이 해제로 먹히면 안 된다 */
      if (typeof setGuView === 'function') setGuView(r.gu, true);
    }, 420);
    return;
  }
  if (r.type === 'place' && r.lat && r.lng) {
    goMapFocus(r.lat, r.lng, 4, r.id != null ? r.id : null);
  } else if (r.type === 'parking' && r.lat) {
    goMapPark(r.lat, r.lng, r.id);
  } else if (r.type === 'cinema' && r.lat) {
    /* 영화관은 편의정보라 지도의 🎬 칩을 켜야 핀이 그려진다(js/mapnav.js goMapConv). */
    goMapConv('cinema', r.lat, r.lng);
  } else if (r.type === 'lc' && r.lat) {
    go('map');
    setTimeout(function() {
      if (!kakaoMap) {
        if (typeof showToast === 'function') showToast('지도를 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
        return;
      }
      kakaoMap.setCenter(new kakao.maps.LatLng(r.lat, r.lng));
      kakaoMap.setLevel(4);
      /* ⚠ setFilter 는 토글이다. 2026-08-26 에 activateLc() 로 바꾼 것이
       * 즐겨찾기·goMapLc·findNearby 셋뿐이라 **검색 경로만 남아 있었다**
       * (2026-08-27 배포 Claude 지적). 지역화폐 칩을 켜 둔 채 가맹점을 검색해
       * 고르면 요청과 정반대로 레이어가 꺼져 핀이 전부 사라졌다. */
      if (typeof activateLc === 'function') activateLc();
      if (r._raw && typeof showLcSlide === 'function') showLcSlide(r._raw);
    }, 400);
  } else if (r.type === 'conv') {
    /* ⚠ 예전에는 소식 탭 카테고리 목록으로만 보냈다(모범음식점·관광식당 둘뿐이라
     * 가능했다). 이제 숙박·캠핑·템플스테이까지 들어오는데 그것들은 소식 탭에
     * 목록이 없다. goConvItem 이 CONV_CAT_CFG 로 8종을 모두 다루므로 그리로 보낸다
     * (js/mapnav.js, 2026-08-29 에 getItems() 로 바꿔 뒀다). */
    if (typeof goConvItem === 'function' && r.idx != null) { goConvItem(r.convCat, r.idx); return; }
    /* go('living') 은 renderLivingPage() 를 동기로 돌려 목록을 '모범음식점'으로 채워 놓는다
     * (js/living.js). 여기서 늦추면 검색해 고른 것과 다른 카테고리가 그동안 떠 있다가
     * 통째로 갈린다. 같은 태스크 안에서 덮어 페인트를 한 번만 낸다.
     * liv-cat-* 는 정적 요소고 CONVENIENCE 도 동기 로드라 지금 불러도 안전하다
     * (js/boot.js 의 goLivingCat 이 이미 같은 모양이다). */
    go('living');
    var _cvEl = document.getElementById('liv-cat-' + r.convCat);
    if (_cvEl && typeof switchLivingCat === 'function') switchLivingCat(_cvEl, r.convCat);
  } else if (r.lat) {
    go('map');
    setTimeout(function() {
      if (!kakaoMap) {
        if (typeof showToast === 'function') showToast('지도를 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
        return;
      }
      kakaoMap.setCenter(new kakao.maps.LatLng(r.lat, r.lng));
      kakaoMap.setLevel(r.level || 6);
    }, 350);
  }
}

function closeHomeSearch(where) {
  /* ⚠ 예약된 디바운스부터 죽인다. 이게 없어서 ✕ 를 누르거나 바깥을 눌러 닫아도
   * 220ms 뒤 doHomeSearch(옛 검색어) 가 터져 결과 목록이 혼자 되살아났다.
   * 그때 입력창은 비어 있고 ✕ 는 숨어 있어 다시 지울 방법도 없었다.
   * resetHomePage 는 이미 같은 처리를 하고 있었다 — 나머지 경로에도 맞춘다. */
  clearTimeout(_srTimer);
  _srTimer = null;
  where = where || _srWhere || 'home';
  var el  = _srEl(where, 'results');
  var bar = _srEl(where, 'bar');
  if (el)  { el.classList.remove('open'); el.innerHTML = ''; }
  if (bar) bar.style.borderRadius = '';
}

function clearHomeSearch(where) {
  where = where || 'home';
  var inp = _srEl(where, 'input');
  var clr = _srEl(where, 'clear');
  if (inp) inp.value = '';
  if (clr) clr.style.display = 'none';
  closeHomeSearch(where);
}

function renderHomeTourism() {
  const el = document.getElementById('home-tourism-content');
  if (!el || typeof PLACES === 'undefined') return;

  /* ⚠ PLACES 순서의 첫 축제를 쓰면 안 된다 (2026-08-26 감사).
   * 배열 순서는 수집 순서라 이미 끝난 축제가 맨 앞에 올 수 있고, 실제로
   * 홈 대표 카드에 '종료' 배지가 뜬다. 진행 중 → 예정(가까운 순) 으로 골라
   * 소식 탭 '행사 전체' 의 정렬 기준과 맞춘다(js/living.js _festAllSorted). */
  /* 끝난 축제는 뺀다 (2026-08-30 사용자 지시 — js/calendar.js festBrowsable).
   * 아래 정렬만으로도 ended 는 맨 뒤라 [0] 에 잘 안 오지만, 전부 끝난 상황에서는
   * 대표 카드가 '종료' 로 뜬다. 그때는 카드를 비우는(emptyCard) 편이 맞다. */
  const _festAll = PLACES.filter(p => p.category === 'festival'
    && ((typeof festBrowsable === 'function') ? festBrowsable(p) : true));
  const _festRank = { ongoing: 0, upcoming: 1, unknown: 2, ended: 3 };
  const festivals = _festAll.slice().sort((a, b) => {
    const sa = (typeof festStatus === 'function') ? festStatus(a) : 'unknown';
    const sb = (typeof festStatus === 'function') ? festStatus(b) : 'unknown';
    const ra = _festRank[sa] !== undefined ? _festRank[sa] : 2;
    const rb = _festRank[sb] !== undefined ? _festRank[sb] : 2;
    if (ra !== rb) return ra - rb;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

  const emptyCard = `<div style="padding:32px 0;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>`;

  const festivalBig = festivals.length
    ? `<div onclick="openFestView('detail',${festivals[0].id})"
        style="background:var(--white);border-radius:var(--r-md);border:1px solid var(--border);
        border-left:3px solid var(--orange);padding:14px 16px;
        display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:12px;transition:box-shadow 0.15s;">
        ${photoThumb(festivals[0], 48, '🎉', 'ph-sm')}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
            <span class="badge ${festBadge(festivals[0]).cls}">${festBadge(festivals[0]).text}</span>
            <span style="font-size:11px;color:var(--text-muted);">${festDateLabel(festivals[0].date)}</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${festivals[0].name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${(festivals[0].address || '').split(' ').slice(0,3).join(' ')}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
    : emptyCard;

  el.innerHTML = `
    <div class="section" style="padding-top:10px">
      <div class="section-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="section-title">행사</div>
            ${festivals.some(f => festStatus(f) === 'ongoing') ? '<span class="badge badge-ongoing" style="font-size:10px">진행중</span>' : ''}
          </div>
          <div class="section-sub" style="margin-top:2px">이번 축제 · 화성 인기 장소</div>
        </div>
        <!-- 2026-08-26 — 행사는 소식 탭 '행사 전체'로 모였다(사용자 지시).
             예전 go('tourism') 은 추천 탭 목록으로 갔는데, 그 탭의 '축제' 서브탭이
             없어져 이제 행사만 따로 보는 화면이 아니다. -->
        <button class="section-link" onclick="goFestivalAll()">전체보기</button>
      </div>
      ${festivalBig}
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">🔥 화성에서 인기있는 곳</div>
      <div id="home-pop-body"></div>
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
          <div style="width:34px;height:34px;border-radius:10px;background:#E0F2FE;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⛱️</div>
          <div><div class="place-card-sm-name" style="font-size:13px">제부도 숙박</div><div class="place-card-sm-addr">115곳</div></div>
        </div>
      </div>
    </div>`;
  _renderHomePopular();
}

function _renderHomePopular() {
  var el = document.getElementById('home-pop-body');
  if (!el || typeof dlLoad === 'undefined') return;
  el.innerHTML = '<div style="padding:10px 0;text-align:center;color:var(--text-muted);font-size:12px">불러오는 중...</div>';
  dlLoad('datalab_naviranking_hwaseong_2026.json', function(d) {
    var el2 = document.getElementById('home-pop-body');
    if (!el2) return;
    var list = (typeof _dlDedupe === 'function') ? _dlDedupe(d && d.interest_spots_domestic) : ((d && d.interest_spots_domestic) || []);
    if (!list.length) { el2.innerHTML = ''; return; }
    /* 5위까지 보여 주되 시상대(1~3위)만 금·은·동 메달, 4·5위는 숫자
     * (2026-08-26 사용자 지시). 홈은 세로 목록이라 5줄이 자연스럽고,
     * 메달과 숫자가 섞여도 '위에 셋이 시상대'라는 게 오히려 또렷해진다.
     * 추천 탭의 renderDlPopular() 는 3열 사진 격자라 3위까지만 둔다 — 5장이면
     * 둘째 줄에 2장만 남아 빈칸이 생긴다. 두 화면의 개수가 다른 건 의도다. */
    el2.innerHTML = list.slice(0, 5).map(function(r, i) {
      /* 38px 슬롯이다 — 240px 썸네일로 충분하다(2026-08-26).
       * 원본은 1160x550 이라 5장이면 약 991KB 인데 썸네일은 약 50KB 다. */
      var src = '', _full = '';
      if (typeof placePhotoSrc === 'function') {
        var _norm = function(s) { return (s || '').replace(/\s+/g, ''); };
        var _nq = _norm(r.name);
        var _hit = (typeof PLACES !== 'undefined') && PLACES.find(function(p) { return p.name === r.name || _norm(p.name) === _nq; });
        var _tgt = _hit || { name: r.name };
        _full = placePhotoSrc(_tgt);
        src = (typeof placeThumbSrc === 'function' && placeThumbSrc(_tgt)) || _full;
      }
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="dlGoPlace(\'' + r.name.replace(/'/g, '') + '\')">' +
        /* DL_MEDALS 는 js/datalab.js 에 있다. index.html 의 <script> 순서상
         * home.js 가 먼저 오지만, 이 함수는 사용자가 홈을 열어야 도는 런타임
         * 코드라 그때는 이미 정의돼 있다. 그래도 순서가 바뀌면 조용히 깨지므로
         * 폴백으로 숫자를 남긴다.
         * 메달은 16px, 숫자는 13px 로 크기를 달리한다 — 같은 크기로 두면
         * 이모지가 글자보다 커 보여 4·5위가 눌린 것처럼 보인다. */
        '<div style="width:22px;text-align:center;' +
          (i < 3 ? 'font-size:16px;line-height:1'
                 : 'font-size:13px;font-weight:700;color:var(--text-muted)') +
        '" aria-label="' + (i + 1) + '위">' +
          (i < 3 && typeof DL_MEDALS !== 'undefined' ? DL_MEDALS[i] : (i + 1)) + '</div>' +
        '<div style="width:38px;height:38px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#F3F4F6">' +
          '<img src="' + src + '" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover" ' +
            'onerror="_thumbFallback(this,\'' + _full.replace(/'/g, '%27') + '\')">' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.name + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted)">' + (r.category || '') + '</div>' +
        '</div>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>';
    }).join('') +
    '<div style="text-align:right;margin-top:6px">' +
      /* ⚠ go() 뒤에 setTimeout 을 두지 말 것. 300ms 동안 추천 탭 '목록'이 완성된 채
       * 보였다가 데이터랩으로 갈아끼워졌다 — js/tourism.js openFestView 와 같은 증상이다.
       * go() 가 뷰 교체와 목록 렌더까지 동기로 끝내므로 바로 뒤에서 덮으면 프레임이 안 샌다. */
      '<button class="section-link" onclick="goDatalab(\'popular\')">전체 순위 보기 ›</button>' +
    '</div>';
  });
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
    : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>';

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
    : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>';

  /* 통계 칸 — 2026-08-26 사용자 요청으로 2개 → 6개.
   * 기존 지역화폐·주차장 칸의 양식(흰 배경·1.5px 테두리·14px 라운드·아이콘+숫자+라벨)을
   * 그대로 쓴다. 새 양식을 만들면 같은 화면에 두 종류가 섞인다.
   *
   * 칸마다 가는 곳이 다르다 — 생활 탭 안에 있는 것은 goLivingCat 으로,
   * 지도에만 있는 것(문화재·제부도 숙소·캠핑장)은 goMapCat 으로 보낸다.
   * goLivingCat 은 #liv-cat-<cat> 을 찾으므로 생활 탭에 없는 값을 주면
   * 조용히 아무 일도 안 난다 — 그래서 갈라 쓴다. */
  var _S = (typeof CONVENIENCE !== 'undefined') ? CONVENIENCE : {};
  var _P = (typeof PLACES !== 'undefined') ? PLACES : [];
  function _cnt(a) { return (a && a.length) || 0; }
  var statCards = [
    { n: currencies.length, label: '지역화폐 가맹점', bg: '#DCFCE7',
      icon: '<img src="img/gyeonggi_currency_logo.png" alt="" style="width:20px;height:20px;object-fit:contain">',
      go: "goLivingCat('currency')" },
    { n: parkings.length, label: '공영주차장', bg: '#DBEAFE',
      icon: '<span style="font-size:15px;font-weight:800;color:#2563EB">P</span>',
      go: "goLivingCat('parking')" },
    { n: _cnt(_S.restaurants), label: '모범음식점', bg: '#FEF3C7',
      icon: '<span style="font-size:15px">🍴</span>', go: "goLivingCat('restaurant')" },
    { n: _P.filter(function (p) { return p.category === 'heritage'; }).length,
      label: '지정문화재', bg: '#F5F3FF',
      icon: '<span style="font-size:15px">🏛️</span>', go: "goMapCat('heritage')" },
    { n: (_S.jebu && _S.jebu.summary && _S.jebu.summary.total) || 0,
      label: '제부도 숙소', bg: '#E0F2FE',
      icon: '<span style="font-size:15px">⛱️</span>', go: "goMapCat('jebu')" },
    { n: _cnt(_S.camping), label: '캠핑장', bg: '#DCFCE7',
      icon: '<span style="font-size:15px">⛺</span>', go: "goMapCat('camping')" },
  ];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 var(--px)">
      ${statCards.map(c => `
      <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:14px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;min-width:0" onclick="${c.go}">
        <div style="width:32px;height:32px;border-radius:10px;background:${c.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${c.icon}</div>
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.1">${c.n.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.label}</div>
        </div>
      </div>`).join('')}
    </div>
    <div style="margin-top:14px">
      <div class="category-icons">
        <div class="cat-icon-item" onclick="goLivingCat('restaurant')"><div class="cat-icon-circle ci-food">🍽️</div><span class="cat-icon-label">모범음식점</span></div>
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
  /* ⚠ 제목이 '이번 달 축제' 다 — 전부를 그리면 안 된다 (2026-08-26 감사).
   * 예전에는 PLACES 의 축제 50건을 통째로 실어, 5월에 끝난 것과 12월 것까지
   * '이번 달' 이라는 제목 아래 나왔다. 바로 아래 '행사 전체' 가 이미 50건을
   * 세로로 보여 주므로 두 섹션이 같은 말을 두 번 하기도 했다.
   * _getFestsInMonth(js/calendar.js)는 '그 달에 하루라도 걸치는 축제' 를 주고
   * '2026년 8월 중' 같은 근사 일정도 그 달로 쳐 준다 — 캘린더와 같은 기준이다. */
  const _now = new Date();
  let festivals = (typeof _getFestsInMonth === 'function')
    ? _getFestsInMonth(_now.getFullYear(), _now.getMonth())
    : PLACES.filter(p => p.category === 'festival');
  /* 이번 달이라도 이미 지난 것이 앞에 오면 첫 카드가 '종료' 다 (2026-08-26 사용자 지시).
   * 소식 탭 '행사 전체'(js/living.js _festAllSorted)·홈 대표 카드와 같은 순서로 맞춘다. */
  const _fsRank = { ongoing: 0, upcoming: 1, unknown: 2, ended: 3 };
  festivals = festivals.slice().sort((a, b) => {
    const sa = (typeof festStatus === 'function') ? festStatus(a) : 'unknown';
    const sb = (typeof festStatus === 'function') ? festStatus(b) : 'unknown';
    const ra = _fsRank[sa] !== undefined ? _fsRank[sa] : 2;
    const rb = _fsRank[sb] !== undefined ? _fsRank[sb] : 2;
    if (ra !== rb) return ra - rb;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
  if (!festivals.length) {
    /* 이번 달에 아무것도 없을 수 있다. 그때 '준비 중' 은 거짓말이라 사실대로 적는다. */
    el.innerHTML = '<div style="padding:8px var(--px);color:var(--text-muted);font-size:13px">이번 달에는 예정된 행사가 없어요</div>';
    return;
  }
  el.innerHTML = festivals.map((p, i) => {
    const img = IMG_CLASSES[i % IMG_CLASSES.length];
    /* status 필드는 죽었다(50건 전부 upcoming) — 날짜로 계산한다. js/calendar.js festBadge 참고 */
    const _fb = festBadge(p);
    const badge = '<span class="badge ' + _fb.cls + ' fsc-badge">' + _fb.text + '</span>';
    /* 예전에는 범위면 "09.05 ~" 로 끝을 잘라 놨다 — 끝나는 날을 알 수 없었다. */
    const dateStr = festDateLabel(p.date, true);
    /* 이 캐러셀은 2026-08-26 에 소식 탭으로 옮겨졌다 — go('tourism') 이 없으면 먹통이다.
     * 위 js/living.js 의 news-item 과 같은 이유다. */
    return `<div class="festival-scroll-card" onclick="openFestView('detail',${p.id})">
      <div class="fsc-img ${img}">${hasPhoto(p) ? `<img class="fsc-photo" src="${placePhotoSrc(p)}" alt=""
             loading="lazy" decoding="async" onerror="this.style.display='none'">` : ''}${badge}</div>
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

/* ══════════════════════════════════════════════════
   홈 탭 재클릭 리셋 (2026-08-25)
   되돌리는 것 = 화면 상태뿐. 절대 건드리지 않는 것:
     · localStorage 'hsida_favs' (사용자 데이터) — clearFavs() 를 부르면 안 된다
     · lcData / _lcLoading / _lcCallbacks (4.2MB 캐시, js/ui.js:73-95)
     · parkingData / parkingTimer (js/parking.js:3-5)
   GPS 도 다시 요청하지 않는다 — 내 위치 섹션은 원본 CTA 마크업으로 되돌리기만 한다.
══════════════════════════════════════════════════ */

/* index.html:66-74 의 원본 CTA 스냅샷. boot.js 가 첫 페인트 전에 채운다.
 * JS 문자열로 하드코딩하지 않는 이유: 그 CTA 는 100자짜리 인라인 SVG path 를 포함한 8줄
 * 마크업이고, js/home.js:26-30 에 이미 비슷하지만 다른(오류용 빨간) 복제본이 있어 드리프트 전례가 있다. */
var _homeNearbyInitHtml = null;

/* 진행 중인 위치 요청 무효화용 세대 토큰.
 * geolocation 은 취소 API 가 없어서, '위치 확인 중' 상태로 리셋해도 최대 8초 뒤
 * 성공 콜백이 결과 카드를 다시 그린다(js/home.js:23-33). 세대가 다르면 무시한다. */
var _nearbyGen = 0;

function resetHomePage() {
  /* ① 검색 — 예약된 디바운스부터 죽인다.
   *    타이핑 직후 220ms 안에 홈을 재클릭하면, 리셋이 끝난 뒤 js/home.js:222 의 타이머가 터져
   *    doHomeSearch(옛 검색어) 가 실행되고 결과 패널이 되살아난다.
   *    clearHomeSearch()/closeHomeSearch() 어디에도 clearTimeout 이 없다. */
  clearTimeout(_srTimer);
  _srTimer = null;
  clearHomeSearch();          /* value='' + ✕ 숨김 + 결과 innerHTML='' + .open 제거 + 검색바 borderRadius 복원 */
  var _si = document.getElementById('home-search-input');
  if (_si) _si.blur();        /* 첫 진입은 포커스 없음 = 모바일 키보드 닫힘. clearHomeSearch 는 blur 를 안 한다. */
  window._srResults = null;   /* 27,374건 배열 원소 참조를 붙들고 있어 GC 를 막는다(js/home.js:316) */

  /* ② 최근 둘러본 관광지 다시 그리기 (내 위치 추천은 2026-08-26 추천 탭으로 갔다 —
   *    복원 책임도 resetTourismPage() 로 함께 옮겼다). */
  if (typeof renderRecentSection === 'function') renderRecentSection();

  /* ③ 관광/생활 토글 → 항상 '관광'(index.html:58 에 active 하드코딩).
   *    반드시 'tourism' 으로만 부를 것 — js/home.js:588-591 의 'living' 분기는
   *    _loadLcData() 를 태워 4.2MB 재요청 + 로딩 토스트를 띄운다. */
  var _tt = document.querySelector('#page-home .ttab[data-tab="tourism"]');
  if (_tt) switchHomeTab(_tt, 'tourism');   /* 클래스 + 두 블록 display 를 한 번에 맞춘다 */

  /* ④ 콘텐츠 재렌더. 세 함수 모두 이미 로드된 PLACES/CONVENIENCE/parkingData/lcData 를
   *    '읽기만' 한다 — fetch 하는 것은 switchHomeTab 안의 _loadLcData 뿐이고 위에서 피했다.
   *    renderFavSection() 은 getFavs() 로 localStorage 를 읽기만 한다(js/favorites.js:109). */
  renderHomePage();           /* = renderHomeTourism + renderHomeLiving + renderFavSection (js/home.js:171-175) */
}

/* ══════════════════════════════════════════════════
   최근 본 관광지·주차장 (2026-08-26)
   즐겨찾기(js/favorites.js)와 같은 localStorage 방식이되 성격이 다르다 —
   즐겨찾기는 '사용자가 고른 것', 이쪽은 '사용자가 지나간 것'이라 자동으로 쌓인다.

   '봤다'의 기준 = 슬라이드 카드가 열린 시점.
     관광지 → js/map.js showPlaceSlide()      (지도 핀·관광 목록·홈 검색·즐겨찾기가 전부 여기를 거친다)
     주차장 → js/parking.js showParkingSlide()
   호출부마다 걸면 새 경로가 생길 때 빠뜨리므로 이 두 곳만 건다.

   ⚠ 종류(k)를 반드시 함께 저장한다. 주차장 id 와 관광지 id 는 둘 다 작은 정수라
     실측 60개가 겹친다 — id 만 저장하면 서로를 덮어쓴다.
       k:'t' = 관광지(PLACES) · k:'p' = 주차장(parkingData)
     k 가 없는 옛 기록은 관광지로 본다(2026-08-26 이전 저장분 호환).

   localStorage 가 막힌 환경(사파리 프라이빗)에서도 죽지 않게 전부 try 로 감쌌다.
══════════════════════════════════════════════════ */
var _RECENT_KEY = 'hsida_recent';
var _RECENT_MAX = 12;    /* 저장 개수 */
var _RECENT_SHOW = 6;    /* 화면에 띄울 개수 */

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]')
      .map(function (r) { return { k: r.k || 't', id: r.id, at: r.at }; });   /* 옛 기록 호환 */
  } catch (e) { return []; }
}

/* kind: 'tourist' | 'parking' */
function pushRecent(item, kind) {
  if (!item || item.id == null) return;
  var k = (kind === 'parking') ? 'p' : 't';
  /* 관광지·문화재만 쌓는다. 축제는 기간이 지나면 의미가 없어 제외한다.
   * PLACES 의 id 는 카테고리를 넘어 전역 유일이라 k:'t' 하나로 둘 다 담아도 충돌하지 않는다. */
  if (k === 't' && item.category !== 'tourist' && item.category !== 'heritage') return;
  try {
    var list = getRecent().filter(function (r) { return !(r.k === k && r.id === item.id); });
    list.unshift({ k: k, id: item.id, at: Date.now() });
    localStorage.setItem(_RECENT_KEY, JSON.stringify(list.slice(0, _RECENT_MAX)));
  } catch (e) { /* 저장 불가 환경 — 기능만 조용히 꺼진다 */ }
  renderRecentSection();
}

function clearRecent() {
  try { localStorage.removeItem(_RECENT_KEY); } catch (e) {}
  renderRecentSection();
  /* 메뉴가 열린 채로 눌렀을 수 있다 — 그쪽 목록도 같이 비운다 */
  if (typeof renderMenuRecent === 'function') renderMenuRecent();
}

/* 저장된 id 로 원본을 다시 찾는다 — 이름·좌표가 바뀌어도 최신값을 쓰고,
 * 삭제된 항목은 자동으로 빠진다.
 * 홈 섹션과 사이드 메뉴가 같은 목록을 쓰므로 여기 한 곳에 뒀다. */
function _recentItems(limit) {
  return getRecent().map(function (r) {
    if (r.k === 'p') {
      if (typeof parkingData === 'undefined') return null;
      var pk = parkingData.find(function (x) { return x.id === r.id; });
      return pk ? { k: 'p', d: pk } : null;
    }
    if (typeof PLACES === 'undefined') return null;
    var pl = PLACES.find(function (x) {
      return x.id === r.id && (x.category === 'tourist' || x.category === 'heritage');
    });
    return pl ? { k: 't', d: pl } : null;
  }).filter(Boolean).slice(0, limit);
}

/* 사이드 메뉴용 (2026-08-26, 사용자 지시). 즐겨찾기(renderMenuFavs)와 같은 모양이다.
 * 홈과 달리 비어 있으면 통째로 감춘다 — 홈 쪽 빈 안내는 '이런 기능이 있다'를
 * 알리는 자리지만, 메뉴는 이미 항목이 많아 빈 칸을 더하면 잡음만 는다. */
function renderMenuRecent() {
  var wrap = document.getElementById('menu-recent-wrap');
  if (!wrap) return;
  /* 메뉴는 3개까지만 (2026-08-26 사용자 지시). 홈 섹션은 6개를 그대로 쓴다 —
   * 메뉴는 항목이 이미 많아 길어지면 아래 바로가기가 밀린다. */
  var items = _recentItems(3);
  if (!items.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML =
    '<div class="menu-section-title" style="padding-top:16px">🕘 최근 본 곳</div>' +
    items.map(function (it) {
      var d = it.d, isPark = it.k === 'p';
      var st = _CAT_STYLE[isPark ? 'parking' : (d.category || 'tourist')] ||
               { bg: '#F3F4F6', em: '📌' };
      var act = isPark
        ? 'goMapPark(' + d.lat + ',' + d.lng + ',' + d.id + ')'
        : 'goMapFocus(' + d.lat + ',' + d.lng + ',4,' + d.id + ')';
      var sub = isPark ? '공영주차장'
              : (d.category === 'heritage' ? '문화재' : '관광지');
      return '<div class="menu-fav-item" onclick="closeMenu();' + act + '">' +
               '<div class="menu-fav-icon" style="background:' + st.bg + '">' + st.em + '</div>' +
               '<div style="flex:1;min-width:0">' +
                 '<div class="menu-fav-name">' + (d.name || '') + '</div>' +
                 '<div class="menu-fav-type">' + sub + '</div>' +
               '</div>' +
             '</div>';
    }).join('') +
    '<div style="text-align:center;padding:2px 0 8px">' +
      '<button class="section-link" onclick="clearRecent()">기록 지우기</button>' +
    '</div>';
}

function renderRecentSection() {
  var el = document.getElementById('home-recent-section');
  if (!el) return;
  el.style.display = 'block';        /* 비어 있어도 자리를 지킨다 — 아래 주석 참고 */

  /* 저장된 id 로 원본을 다시 찾는다 — 이름·좌표가 바뀌어도 최신값을 쓰고,
   * 삭제된 항목은 자동으로 빠진다. */
  var items = _recentItems(_RECENT_SHOW);

  var head =
    '<div class="section-header" style="padding:0 var(--px);margin-bottom:10px">' +
      '<div class="section-title">최근 본 관광지·주차장</div>' +
      (items.length ? '<button class="section-link" onclick="clearRecent()">지우기</button>' : '') +
    '</div>';

  /* 한 번도 본 적 없어도 이 칸을 없애지 않는다 —
   * 숨겨 두면 이런 기능이 있다는 것 자체를 아무도 모른다.
   * 대신 빈 상자가 아니라 '여기에 무엇이 쌓이는지'를 말해 준다. */
  if (!items.length) {
    el.innerHTML = head +
      '<div class="recent-empty">' +
        '<div class="recent-empty-icon">🕘</div>' +
        '<div class="recent-empty-text">지도에서 관광지나 주차장을 눌러 보세요</div>' +
        '<div class="recent-empty-sub">최근 본 곳이 여기에 모여요</div>' +
      '</div>';
    return;
  }

  el.innerHTML = head +
    '<div class="recent-row">' +
      items.map(function (it, i) {
        var d = it.d, isPark = it.k === 'p';
        var thumb = isPark
          ? '<div class="recent-thumb recent-thumb-park">🅿️</div>'
          : (function () {
              /* 76px 슬롯 — 240px 썸네일이 DPR3(228px)까지 덮는다 (2026-08-26). */
              var _f = (typeof placePhotoSrc === 'function')
                ? placePhotoSrc(d)
                : 'assets/images/places/' + encodeURIComponent((d.name || '') + '.jpg');
              var _t = (typeof placeThumbSrc === 'function') ? placeThumbSrc(d) : '';
              return '<div class="recent-thumb">' +
                '<img src="' + (_t || _f) + '" alt="" loading="lazy" decoding="async" onerror="' +
                (_t ? '_thumbFallback(this,\'' + _f.replace(/'/g, '%27') + '\')'
                    : 'this.style.display=\'none\'') + '"></div>';
            })();
        var act = isPark
          ? 'goMapPark(' + d.lat + ',' + d.lng + ',' + d.id + ')'
          : 'goMapFocus(' + d.lat + ',' + d.lng + ',4,' + d.id + ')';
        return '<div class="recent-card" style="animation-delay:' + (i * 0.04) + 's" onclick="' + act + '">' +
                 thumb +
                 '<div class="recent-name">' + (d.name || '') + '</div>' +
               '</div>';
      }).join('') +
    '</div>';
}
