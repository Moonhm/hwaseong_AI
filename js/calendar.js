/* ============================================================================
 * js/calendar.js — 축제 달력 — 날짜 파싱·월별 렌더
 *
 * 왜 따로 있나: 날짜 계산이 까다로워(비ISO '2026년 N월 중' 형식 11건) 한 곳에 모은다. _festDaysCache 로 월별 결과를 캐시한다.
 * 함께 볼 것:   _parseFestDate() 는 js/data.js 의 date 필드 형식에 의존한다. 형식이 늘면 여기만 고치면 된다.
 *
 * index.html 인라인 <script> 3613~3779줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 달력 월 탐색 (BUG-8) ── */
var _td0 = new Date();
var _calYear = _td0.getFullYear(), _calMonth = _td0.getMonth();
var _calInitDone = false;

/* "YYYY-MM-DD" 또는 "YYYY년 MM월 중" 형식을 [yyyy, mm, dd] 배열로 파싱 */
function _parseFestDate(str) {
  str = (str || '').trim();
  var iso = str.split('-');
  if (iso.length === 3 && /^\d{4}$/.test(iso[0])) return iso;
  var m = str.match(/(\d{4})년\s*(\d{1,2})월/);
  if (m) return [m[1], ('0' + m[2]).slice(-2), '01'];
  return null;
}

/* 축제 날짜 Set 반환 — 날짜 범위("YYYY-MM-DD ~ YYYY-MM-DD") 전체 처리 */
var _festDaysCache = {};
function _getFestDays(year, month) {
  var key = year + '-' + month;
  if (_festDaysCache[key]) return _festDaysCache[key];
  var days = {};
  if (typeof PLACES === 'undefined') return days;
  PLACES.filter(function(p) { return p.category === 'festival' && p.date; })
    .forEach(function(p) {
      var ranges  = p.date.split('~');
      var sp      = _parseFestDate(ranges[0]);
      var ep      = _parseFestDate(ranges[1] || ranges[0]);
      if (!sp || !ep) return;
      var sy = parseInt(sp[0]), sm = parseInt(sp[1]) - 1, sd = parseInt(sp[2]);
      var ey = parseInt(ep[0]), em = parseInt(ep[1]) - 1, ed = parseInt(ep[2]);
      /* 해당 월에 겹치지 않으면 스킵 */
      if (ey < year || (ey === year && em < month)) return;
      if (sy > year || (sy === year && sm > month)) return;
      var start = new Date(sy, sm, sd);
      var end   = new Date(ey, em, ed);
      var cur   = new Date(start);
      while (cur <= end) {
        if (cur.getFullYear() === year && cur.getMonth() === month) {
          var d = cur.getDate();
          if (!days[d]) days[d] = [];
          /* 같은 축제 중복 방지 */
          if (!days[d].some(function(x) { return x.id === p.id; }))
            days[d].push({ name: p.name, id: p.id, status: p.status, date: p.date });
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
  _festDaysCache[key] = days;
  return days;
}

/* 해당 월에 하루라도 걸치는 축제 목록 (unique) */
function _getFestsInMonth(year, month) {
  var seen = {}, result = [];
  if (typeof PLACES === 'undefined') return result;
  PLACES.filter(function(p) { return p.category === 'festival' && p.date; })
    .forEach(function(p) {
      if (seen[p.id]) return;
      var ranges = p.date.split('~');
      var sp = _parseFestDate(ranges[0]);
      var ep = _parseFestDate(ranges[1] || ranges[0]);
      if (!sp || !ep) return;
      var start = new Date(parseInt(sp[0]), parseInt(sp[1]) - 1, parseInt(sp[2]));
      var end   = new Date(parseInt(ep[0]), parseInt(ep[1]) - 1, parseInt(ep[2]));
      var mStart = new Date(year, month, 1);
      var mEnd   = new Date(year, month + 1, 0);
      if (start <= mEnd && end >= mStart) {
        seen[p.id] = true;
        result.push(p);
      }
    });
  result.sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '');
  });
  return result;
}

/* 캘린더 이벤트 목록 렌더 */
function renderCalEventList(festivals, labelText) {
  var lbl = document.getElementById('cal-event-label');
  var el  = document.getElementById('calendar-event-list');
  if (lbl) lbl.textContent = labelText || '이번 달 축제';
  if (!el) return;
  if (!festivals.length) {
    el.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:13px">축제가 없습니다</div>';
    return;
  }
  el.innerHTML = festivals.map(function(p) {
    var isOngoing = p.status === 'ongoing';
    var badgeStyle = isOngoing
      ? 'background:#DCFCE7;color:#16A34A'
      : 'background:#FFF7ED;color:#F59E0B';
    var badgeText  = isOngoing ? '진행중' : '예정';
    var dateStr = (p.date || '').replace(/^\d{4}-/,'').replace(/-/g,'.').replace(' ~ ',' ~ ');
    return '<div class="cal-event-item" onclick="hideCalendar();showFestivalDetail(' + p.id + ')">'
      + '<div class="cal-ev-dot"></div>'
      + '<div class="cal-ev-body">'
      + '<div class="cal-ev-name">' + p.name + '</div>'
      + '<div class="cal-ev-date">📅 ' + dateStr + '</div>'
      + '</div>'
      + '<div class="cal-ev-badge" style="' + badgeStyle + '">' + badgeText + '</div>'
      + '</div>';
  }).join('');
}

/* 실제 달력 렌더링 — calNav + showCalendar 에서 공유 */
function _renderCalendar() {
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  /* MONTHS는 이 함수 내 공유 — MONTHS2/MONTHS3 대신 동일 배열 재사용 */
  var lbl = document.getElementById('cal-month-label');
  if (lbl) lbl.textContent = _calYear + '년 ' + MONTHS[_calMonth];

  var grid = document.getElementById('calendar-grid');
  if (!grid) return;

  grid.querySelectorAll('.cal-day').forEach(function(c) { grid.removeChild(c); });

  var firstDay    = new Date(_calYear, _calMonth, 1).getDay();
  var daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  var _td = new Date(); var nowY = _td.getFullYear(), nowM = _td.getMonth(), nowD = _td.getDate();
  var festDays = _getFestDays(_calYear, _calMonth);
  var frag = document.createDocumentFragment();

  for (var b = 0; b < firstDay; b++) {
    var blank = document.createElement('div');
    blank.className = 'cal-day'; blank.style.color = 'transparent';
    frag.appendChild(blank);
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var cell = document.createElement('div');
    var dow     = (firstDay + d - 1) % 7;  /* 0=일, 6=토 */
    var isToday = (_calYear === nowY && _calMonth === nowM && d === nowD);
    var hasFest = !!festDays[d];
    cell.className = 'cal-day'
      + (dow === 0 ? ' sun' : '')
      + (dow === 6 ? ' sat' : '')
      + (isToday ? ' today' : '')
      + (hasFest && !isToday ? ' has-event' : '');
    cell.textContent = d;
    (function(day, fests) {
      cell.addEventListener('click', function() {
        /* 선택 날 하이라이트 */
        grid.querySelectorAll('.cal-day.cal-selected').forEach(function(c) {
          c.classList.remove('cal-selected');
        });
        if (fests && fests.length) {
          this.classList.add('cal-selected');
          renderCalEventList(fests, _calYear + '년 ' + MONTHS[_calMonth] + ' ' + day + '일 축제');
          document.getElementById('calendar-event-list').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    })(d, festDays[d]);
    frag.appendChild(cell);
  }
  grid.appendChild(frag);

  /* 이번 달 전체 축제 목록 */
  renderCalEventList(_getFestsInMonth(_calYear, _calMonth), _calYear + '년 ' + MONTHS[_calMonth] + ' 축제');
}

function calNav(dir) {
  _calMonth += dir;
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  if (_calMonth > 11) { _calMonth = 0;  _calYear++; }
  _renderCalendar();
}

