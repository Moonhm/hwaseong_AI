/* ============================================================================
 * js/weather.js — 주간 상세 예보 (2026-08-26, 배포 Claude)
 *
 * '오늘의 화성' 패널의 날씨 칸은 홈 상단 바가 채워 둔 DOM 을 읽어서
 * 지금 기온 한 줄만 보여 준다. 그것만으로는 "모레 몇 시에 몇 도인지" 를 알 수 없다.
 * 7일치를 받아 하루를 누르면 3시간 간격 기온이 펼쳐지도록 한다.
 *
 * 왜 별도 파일인가:
 *   날씨 fetch·렌더는 js/home.js 에 있고 js/today.js 는 개발 Claude 파일이다.
 *   둘 중 어느 쪽에 넣어도 두 Claude 가 같은 파일을 만지게 된다.
 *   today.js 에는 컨테이너 한 줄과 호출 한 줄만 남기고 나머지는 여기에 둔다.
 *
 * js/home.js 에 의존한다 (index.html 로드 순서상 home.js 가 먼저다):
 *   _WMO           날씨 코드 → '이모지,한글' 매핑
 *   _hwLat/_hwLon  현재 보고 있는 좌표. GPS 버튼으로 바뀌면 여기도 따라간다
 * 없으면 조용히 아무것도 안 그린다 — 이 패널의 다른 칸까지 죽이지 않는다.
 *
 * API: Open-Meteo. 무료·키 불필요·CORS 허용. 홈 바가 쓰는 것과 같은 엔드포인트다.
 * ========================================================================== */

var _wkData = null;      /* 받아 둔 7일치 응답 */
var _wkKey  = null;      /* 그 응답을 받은 좌표. 좌표가 바뀌면 다시 받는다 */
var _wkOpen = 0;         /* 펼쳐 둔 날짜 인덱스. 기본은 오늘(0) */
var _wkBusy = false;

var _WK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];   /* 3시간 간격 */

function _wkUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&timezone=Asia%2FSeoul&forecast_days=7';
}

function _wkIcon(code) {
  var w = (typeof _WMO !== 'undefined' && _WMO[code]) || '🌡️,—';
  return w.split(',')[0];
}
function _wkDesc(code) {
  var w = (typeof _WMO !== 'undefined' && _WMO[code]) || '🌡️,—';
  return w.split(',')[1] || '';
}

/* '2026-08-26' → { label:'오늘'|'내일'|'수', md:'8.26' } */
function _wkDayLabel(ymd, i) {
  var p = ymd.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  var dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return {
    label: i === 0 ? '오늘' : i === 1 ? '내일' : dow,
    md: (+p[1]) + '.' + (+p[2]),
    weekend: d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''
  };
}

function toggleWeekDay(i) {
  _wkOpen = (_wkOpen === i) ? -1 : i;
  _renderWeekly();
}

/* today.js 가 부른다. 패널을 열 때마다 호출되며, 좌표가 그대로면 재요청하지 않는다. */
function renderWeeklyWeather() {
  var el = document.getElementById('today-weekly');
  if (!el) return;
  if (typeof _hwLat === 'undefined') { el.innerHTML = ''; return; }

  var key = _hwLat + ',' + _hwLon;
  if (_wkData && _wkKey === key) { _renderWeekly(); return; }

  el.innerHTML = '<div class="td-card td-empty">주간 예보를 불러오는 중이에요…</div>';
  if (_wkBusy) return;
  _wkBusy = true;
  fetch(_wkUrl(_hwLat, _hwLon))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      if (!j || !j.daily || !j.daily.time) throw new Error('형식 오류');
      _wkData = j; _wkKey = key; _wkOpen = 0;
      _renderWeekly();
    })
    .catch(function () {
      _wkData = null;
      var e = document.getElementById('today-weekly');
      if (e) e.innerHTML = '<div class="td-card td-empty">주간 예보를 불러오지 못했어요</div>';
    })
    .finally(function () { _wkBusy = false; });
}

function _renderWeekly() {
  var el = document.getElementById('today-weekly');
  if (!el || !_wkData) return;

  var d = _wkData.daily;
  var n = Math.min(d.time.length, 7);

  /* 온도 막대를 주 전체 최저~최고로 정규화한다. 날마다 따로 재면
     3도 차이나 15도 차이나 같은 길이로 보여 비교가 안 된다.

     ⚠ lo/hi 도 반올림한 뒤에 재야 한다. 아래 tmin/tmax 는 Math.round 를 거치는데
     여기서 원본 소수를 쓰면 기준과 표시값이 어긋나, 반올림이 lo 아래나 hi 위로
     넘어가는 날은 left 가 음수가 되고 width 가 100% 를 넘는다 (2026-08-26 실측:
     lo=21.1·hi=29.9 인 주의 i=6 이 left -1.1% / width 102.3%).
     .wk-bar 의 overflow:hidden 이 잘라 줘서 화면으로는 안 보이던 버그다.
     Math.round 는 단조라 여기서 맞춰 두면 left>=0, left+width<=100 이 보장된다. */
  var lo = Math.round(Math.min.apply(null, d.temperature_2m_min.slice(0, n)));
  var hi = Math.round(Math.max.apply(null, d.temperature_2m_max.slice(0, n)));
  var span = Math.max(1, hi - lo);

  var nowH = new Date().getHours();
  var rows = '';

  for (var i = 0; i < n; i++) {
    var dl   = _wkDayLabel(d.time[i], i);
    var tmin = Math.round(d.temperature_2m_min[i]);
    var tmax = Math.round(d.temperature_2m_max[i]);
    var pop  = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
    var left = ((tmin - lo) / span) * 100;
    var wide = ((tmax - tmin) / span) * 100;
    var open = (_wkOpen === i);

    rows +=
      '<div class="wk-day' + (open ? ' is-open' : '') + '">' +
        '<button class="wk-head" onclick="toggleWeekDay(' + i + ')" aria-expanded="' + open + '">' +
          '<span class="wk-lbl ' + dl.weekend + '">' + dl.label + '</span>' +
          '<span class="wk-md">' + dl.md + '</span>' +
          '<span class="wk-ico">' + _wkIcon(d.weather_code[i]) + '</span>' +
          '<span class="wk-pop">' + (pop != null && pop > 0 ? pop + '%' : '') + '</span>' +
          '<span class="wk-min">' + tmin + '°</span>' +
          '<span class="wk-bar"><i style="left:' + left.toFixed(1) + '%;width:' + Math.max(6, wide).toFixed(1) + '%"></i></span>' +
          '<span class="wk-max">' + tmax + '°</span>' +
          /* ⚠ 여기 있던 ▾/▴ 화살표를 뺐다 (2026-08-26 사용자 지시).
           * 오른쪽 끝에서 온도 숫자와 세로 정렬이 어긋나 보였고, 줄 전체가 버튼이라
           * 화살표가 없어도 눌러서 펼쳐진다 — 없는 편이 깔끔하다.
           * 펼침 상태는 aria-expanded 와 .is-open 이 계속 알린다. */
        '</button>' +
        (open ? _wkHourly(i, nowH) : '') +
      '</div>';
  }

  el.innerHTML =
    '<div class="td-card wk-card">' + rows + '</div>' +
    '<div class="td-note wk-note">하루를 누르면 3시간 간격 기온이 펼쳐져요 · 자료 Open-Meteo</div>';
}

/* i번째 날의 3시간 간격 기온. hourly 는 7일치가 한 배열로 오므로 i*24 로 건너뛴다. */
function _wkHourly(i, nowH) {
  var h = _wkData.hourly;
  if (!h || !h.temperature_2m) return '';
  var base = i * 24;
  var cells = '';

  for (var k = 0; k < _WK_HOURS.length; k++) {
    var hr  = _WK_HOURS[k];
    var idx = base + hr;
    if (idx >= h.temperature_2m.length) break;

    /* 오늘은 이미 지난 시간대를 흐리게 — 지나간 예보를 같은 무게로 보여줄 이유가 없다.
       '지금' 에 가장 가까운 칸은 따로 표시한다. */
    var past = (i === 0 && hr + 3 <= nowH);
    var cur  = (i === 0 && !past && hr <= nowH && nowH < hr + 3);
    var pop  = h.precipitation_probability ? h.precipitation_probability[idx] : null;

    /* 현재 칸도 시각을 그대로 둔다. '지금' 으로 덮으면 몇 시 예보인지 안 보이는데,
       이 화면을 여는 이유가 바로 '몇 시에 몇 도' 를 보려는 것이다. 강조는 테두리로 한다. */
    cells +=
      '<div class="wk-h' + (past ? ' is-past' : '') + (cur ? ' is-now' : '') + '">' +
        '<span class="wk-h-t">' + hr + '시</span>' +
        '<span class="wk-h-i">' + _wkIcon(h.weather_code[idx]) + '</span>' +
        '<span class="wk-h-c">' + Math.round(h.temperature_2m[idx]) + '°</span>' +
        '<span class="wk-h-p">' + (pop != null && pop > 0 ? pop + '%' : '') + '</span>' +
      '</div>';
  }
  return '<div class="wk-hours">' + cells + '</div>';
}
