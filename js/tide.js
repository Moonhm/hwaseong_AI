/* ============================================================================
 * js/tide.js — 제부도 바닷길 통행 시간표 (2026-08-26, 개발 Claude)
 *
 * 왜 필요한가: 제부도는 하루 두 번 바닷길이 잠긴다. 모르고 갔다가 못 건너거나
 * 섬에 갇히는 일이 실제로 생긴다. 화성 관광에서 가장 실용적인 정보다.
 *
 * 사용자 지시(2026-08-26): 추천 탭이 아니라 햄버거 메뉴에 넣는다.
 *
 * 데이터: js/jebu_tide_2026.json (70KB, 365일).
 *   { meta:{...}, schedule: { 'YYYY-MM-DD': { cross1:{open,close}, cross2:{open,close} } } }
 *   open/close 는 'HH:MM' 이거나 '계속통행'(그 방향으로 끊김 없이 통행 가능).
 *   원래 data/processed/ 에 있었으나 tools/server.py 가 data/ 를 안 열어 준다.
 *   js/ 로 복사해 두고 쓴다 — js/datalab.js 상단 주석 참고.
 *
 * 지연 로드다. 메뉴에서 열 때 한 번만 받는다.
 * ========================================================================== */

var TIDE_FILE = 'jebu_tide_2026.json';
var _tideData = null;
var _tideDays = 7;       /* 오늘 포함 며칠을 보여주나 */

function _tideYmd(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function _tideLabel(d, i) {
  if (i === 0) return '오늘';
  if (i === 1) return '내일';
  return ['일','월','화','수','목','금','토'][d.getDay()] + '요일';
}
/* 'HH:MM' → 분. '계속통행' 같은 비시각 문자열은 null. */
function _tideMin(s) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

/* ── 한 구간이 지금 열려 있나 ──────────────────────────────────────────────
 * ⚠ 자정을 넘기는 구간(예: 18:58 ~ 04:07)은 o > c 다. 그리고 그 04:07 은
 *   **다음 날** 04:07 이다. 하루치 데이터 한 줄이 이틀에 걸쳐 있다.
 *
 * 2026-08-26 감사는 이걸 `nowMin >= o || nowMin <= c` 로 고쳤는데, 그러면
 * **오늘 새벽이 오늘 구간의 꼬리로 잘못 계산된다.** 실제 그 시간의 주인은
 * '어제' 구간이고 어제의 close 는 오늘과 다르다.
 *   예) 08-30 04:07~04:39 — 코드는 08-30 의 close(04:39)까지 열렸다고 했지만
 *       실제로는 08-29 의 창이 04:07 에 이미 닫혔다. 32분간 거짓 '통행 가능'.
 * 전수 실측(2026년 364일): 어긋나는 날 133일, 거짓 '건널 수 있어요' 6,394분.
 * **틀리는 방향이 위험한 쪽이다** — 못 건너는데 건널 수 있다고 말한다.
 *
 * 그래서 하루를 두 조각으로 나눠 본다.
 *   _tideOpenNow(seg, m)   오늘 시작하는 부분만  (o > c 면 m >= o)
 *   _tideTailNow(seg, m)   어제 시작해 오늘 새벽까지 이어진 꼬리 (m <= c)
 * 지금 열려 있는지는 '오늘 두 구간' + '어제 두 구간의 꼬리' 를 합쳐 본다. */
function _tideOpenNow(seg, nowMin) {
  if (!seg) return false;
  var o = _tideMin(seg.open), c = _tideMin(seg.close);
  if (o === null && c === null) return true;          /* 양쪽 다 계속통행 */
  if (o === null) return nowMin <= c;                 /* 새벽부터 c 까지 */
  if (c === null) return nowMin >= o;                 /* o 부터 자정까지 */
  if (c < o) return nowMin >= o;                      /* 자정 넘김 — 오늘 몫은 여기까지 */
  return nowMin >= o && nowMin <= c;
}

/* 어제 시작해 자정을 넘어 오늘 새벽까지 이어진 꼬리. 자정을 안 넘기면 없다. */
function _tideTailNow(seg, nowMin) {
  if (!seg) return false;
  var o = _tideMin(seg.open), c = _tideMin(seg.close);
  if (o === null || c === null) return false;
  return c < o && nowMin <= c;
}

/* 'YYYY-MM-DD' 하루 전. */
function _tidePrevKey(d) {
  var p = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return _tideYmd(p);
}

/* 지금 건널 수 있나 — 오늘 두 구간 + 어제 두 구간의 꼬리.
 * 어느 구간 덕에 열려 있는지도 함께 돌려준다(화면이 그 줄을 표시한다). */
function _tideStatusNow(sch, now, nowMin) {
  var today = sch[_tideYmd(now)];
  var yest  = sch[_tidePrevKey(now)];
  var r = { open: false, todayHit: null, tail: null };
  if (today) {
    if (_tideOpenNow(today.cross1, nowMin)) { r.open = true; r.todayHit = 'cross1'; }
    else if (_tideOpenNow(today.cross2, nowMin)) { r.open = true; r.todayHit = 'cross2'; }
  }
  if (!r.open && yest) {
    if (_tideTailNow(yest.cross2, nowMin)) { r.open = true; r.tail = { k: '어제 2차', s: yest.cross2 }; }
    else if (_tideTailNow(yest.cross1, nowMin)) { r.open = true; r.tail = { k: '어제 1차', s: yest.cross1 }; }
  }
  return r;
}
/* 두 구간을 그날 시각 순으로 돌려준다.
 * 데이터는 늘 cross1 → cross2 순인데, 그게 그날의 시간 순서와 어긋나는 날이 있다.
 * 예: 2026-08-26 은 cross1={04:46~계속}, cross2={계속~02:51} 이라
 * 실제로는 2차(00:00~02:51)가 1차(04:46~24:00)보다 앞이다.
 * (cross2 는 전날 저녁에 열린 구간이 자정을 넘어 이어진 꼬리다.)
 * 차수 라벨은 공식 표와 대조할 수 있게 그대로 두고, 나열 순서만 시각에 맞춘다. */
function _tideSegs(day) {
  if (!day) return [];
  var segs = [{ k: '1차', s: day.cross1 }, { k: '2차', s: day.cross2 }].filter(function (x) { return x.s; });
  return segs.sort(function (a, b) {
    /* open 이 '계속통행' 이면 그날 0시부터 열려 있다는 뜻이라 맨 앞이다 */
    var ao = _tideMin(a.s.open), bo = _tideMin(b.s.open);
    return (ao === null ? -1 : ao) - (bo === null ? -1 : bo);
  });
}

function _tideRange(seg) {
  if (!seg) return '—';
  var o = seg.open, c = seg.close;
  if (o === '계속통행' && c === '계속통행') return '하루 종일 통행';
  if (o === '계속통행') return '~ ' + c;
  if (c === '계속통행') return o + ' ~';
  return o + ' ~ ' + c;
}

var _tideLoading = false;

function openTide() {
  if (typeof closeMenu === 'function') closeMenu();
  var p = document.getElementById('tide-panel');
  if (!p) return;
  p.classList.add('open');
  var d = document.getElementById('tide-dim');
  if (d) d.classList.add('show');
  _renderTide();
  if (_tideData) return;
  /* 로딩이 끝나기 전에 닫았다 다시 열면 그때마다 요청이 새로 나갔다 —
   * n 번 열면 70KB × n 이고, 느린 회선에서는 그 요청들이 서로 밀려 첫 표시가
   * 오히려 더 늦어졌다. js/ui.js _loadLcData 와 같은 잠금을 둔다. */
  if (_tideLoading) return;
  _tideLoading = true;
  fetch('js/' + TIDE_FILE + '?v=' + (typeof DL_VER !== 'undefined' ? DL_VER : '20260826'))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) { _tideLoading = false; _tideData = j; _renderTide(); })
    .catch(function () { _tideLoading = false; _tideData = false; _renderTide(); });
}

function closeTide() {
  var p = document.getElementById('tide-panel');
  if (p) { p.classList.remove('open'); p.classList.remove('expanded'); }
  var d = document.getElementById('tide-dim');
  if (d) d.classList.remove('show');
}

function tideMoreDays() { _tideDays = (_tideDays >= 14) ? 7 : 14; _renderTide(); }

function _renderTide() {
  var el = document.getElementById('tide-body');
  if (!el) return;

  if (_tideData === null) {
    el.innerHTML = '<div class="tide-load">시간표를 불러오는 중이에요…</div>';
    return;
  }
  if (_tideData === false || !_tideData.schedule) {
    el.innerHTML = '<div class="tide-load">시간표를 불러오지 못했어요.<br>잠시 후 다시 열어 주세요.</div>';
    return;
  }

  var now    = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var sch    = _tideData.schedule;
  var todayK = _tideYmd(now);
  var today  = sch[todayK];

  /* ── 오늘 상태 ── */
  var head;
  if (!today) {
    /* 시간표는 2026년치뿐이다. 해가 바뀌면 여기로 온다 — 조용히 틀리지 않게 명시한다. */
    head = '<div class="tide-now tide-now--none">' +
             '<div class="tide-now-lbl">오늘 시간표가 없어요</div>' +
             '<div class="tide-now-sub">' + todayK + ' — 이 표는 2026년 기준이에요</div>' +
           '</div>';
  } else {
    var st   = _tideStatusNow(sch, now, nowMin);
    var open = st.open;

    /* 구간마다 지금 해당되는지를 글로도 적는다 (2026-08-29 사용자 지시 —
     * "여기부분 빨간색으로 표시하고 못건난다고해").
     * 예전에는 해당 구간에 테두리만 둘렀다. 테두리 하나로는 '지금 이 시간대가
     * 아니다' 라는 뜻이 안 읽혀서, 위 배지가 '건널 수 있어요' 면 두 줄 다
     * 건널 수 있는 것처럼 보였다. */
    var segRow = function (k, seg, isNow) {
      return '<div class="tide-now-seg' + (isNow ? ' hit' : ' miss') + '">' +
               '<span class="tide-seg-k">' + k + '</span>' +
               '<span class="tide-seg-t">' + _tideRange(seg) + '</span>' +
               '<span class="tide-seg-st">' + (isNow ? '지금 통행' : '못 건넘') + '</span>' +
             '</div>';
    };

    var rowsHtml = '';
    /* 어제 창이 자정을 넘어 이어지는 중이면 그 줄을 맨 위에 세운다 —
     * 그게 없으면 '건널 수 있어요' 인데 아래 두 줄이 모두 '못 건넘' 이 되어
     * 사용자가 무엇 덕에 열려 있는지 알 수 없다. */
    if (st.tail) rowsHtml += segRow(st.tail.k, st.tail.s, true);
    rowsHtml += _tideSegs(today).map(function (g) {
      var isNow = (g.s === today.cross1 && st.todayHit === 'cross1') ||
                  (g.s === today.cross2 && st.todayHit === 'cross2');
      return segRow(g.k, g.s, isNow);
    }).join('');

    head = '<div class="tide-now' + (open ? ' is-open' : ' is-closed') + '">' +
             '<div class="tide-now-badge">' + (open ? '지금 건널 수 있어요' : '지금은 물에 잠겨 있어요') + '</div>' +
             '<div class="tide-now-times">' + rowsHtml + '</div>' +
           '</div>';
  }

  /* ── 앞으로 며칠 ── */
  var rows = '';
  for (var i = 0; i < _tideDays; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var k = _tideYmd(d), s = sch[k];
    if (!s) continue;
    rows +=
      '<div class="tide-day' + (i === 0 ? ' is-today' : '') + '">' +
        '<div class="tide-day-when">' +
          '<div class="tide-day-lbl">' + _tideLabel(d, i) + '</div>' +
          '<div class="tide-day-date">' + (d.getMonth() + 1) + '.' + d.getDate() + '</div>' +
        '</div>' +
        '<div class="tide-day-segs">' +
          _tideSegs(s).map(function (g) {
            return '<div class="tide-seg"><span class="tide-seg-k">' + g.k + '</span>' + _tideRange(g.s) + '</div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  var _meta = _tideData.meta || {};
  var src   = _meta.source || '화성시 공공데이터';
  /* 제목에서 연도만 뽑는다 — '2026년 제부도 바닷길 …' 형태다.
   * 표가 갱신되면 여기 문구도 자동으로 따라간다(하드코딩하지 않는다). */
  var _ym   = /(\d{4})/.exec(_meta.title || '');
  var yr    = _ym ? _ym[1] + '년' : '';
  el.innerHTML =
    head +
    '<div class="tide-list">' + (rows || '<div class="tide-load">표시할 날짜가 없어요</div>') + '</div>' +
    '<button class="tide-more" onclick="tideMoreDays()">' +
      (_tideDays >= 14 ? '7일만 보기' : '2주 치 보기') +
    '</button>' +
    '<div class="tide-foot">' +
      '<button class="tide-map-btn" onclick="closeTide();dlGoPlace(\'제부도\')">🗺️ 지도에서 제부도 보기</button>' +
    '</div>' +
    /* 출처 고지 — '오늘의 화성 날씨' 와 같은 양식(.td-src)을 쓴다.
     * 2026-08-26 사용자 요청. 앱의 다른 문구는 해요체지만 고지문만 격식체다
     * (사용자 지시, WORKFLOW §3). meta.source 를 그대로 인용해 출처를 못 박는다. */
    '<div class="td-src">' +
      '<div class="td-src-head">데이터 출처 및 유의사항</div>' +
      '<p class="td-src-body">본 시간표는 <strong>' + src + '</strong>를 기반으로 합니다. ' +
      '통행 가능 시간은 <strong>' + (yr || '해당 연도') + ' 공표 기준 예정값</strong>이며, ' +
      '기상·해황에 따라 현장에서 달라질 수 있습니다.</p>' +
      '<p class="td-src-body">실제 통제 여부는 현장 안내판과 화성시 공식 안내를 ' +
      '반드시 함께 확인하시기 바랍니다.</p>' +
    '</div>';
    /* ⚠ meta.note 는 화면에 쓰지 않는다 — 'cross1/cross2: 각 차수 통행 가능 구간…'
     * 같은 데이터 스키마 설명이라 개발자용이다. 사용자에게는 뜻 없는 문장이 된다. */
}
