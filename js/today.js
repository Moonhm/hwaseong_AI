/* ============================================================================
 * js/today.js — 오늘의 화성 · 설정 (2026-08-26, 개발 Claude)
 *
 * 왜 필요한가: 앱에 흩어져 있는 '오늘 나가기 전에 볼 것'이 각각 다른 탭에 있었다.
 * 날씨·미세먼지는 홈 상단, 물때는 메뉴, 오늘 축제는 소식 탭. 아침에 한 번 열어
 * 확인하려면 세 곳을 돌아야 했다. 한 화면에 모은다.
 *
 * 새 데이터를 받지 않는다 — 전부 이미 앱 안에 있는 것을 다시 보여 줄 뿐이다.
 *   날씨·미세먼지  #home-weather-bar 가 이미 채워 둔 DOM 에서 읽는다
 *   물때           js/tide.js 의 _tideData (이미 받았으면 재사용, 아니면 받는다)
 *   오늘 축제      PLACES 의 festival
 *
 * 설정도 여기 둔다. 화면 하나 때문에 파일을 또 만들 이유가 없고,
 * 둘 다 '메뉴에서 열리는 패널' 이라 구조가 같다.
 * ========================================================================== */

function openToday() {
  if (typeof closeMenu === 'function') closeMenu();
  var p = document.getElementById('today-panel');
  if (!p) return;
  p.classList.add('open');
  var d = document.getElementById('today-dim');
  if (d) d.classList.add('show');
  _renderToday();
  /* 물때가 아직 없으면 받아서 다시 그린다. tide.js 와 같은 캐시를 쓴다. */
  if (typeof _tideData !== 'undefined' && _tideData === null &&
      typeof TIDE_FILE !== 'undefined') {
    fetch('js/' + TIDE_FILE + '?v=' + (typeof DL_VER !== 'undefined' ? DL_VER : '20260826'))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { _tideData = j; _renderToday(); })
      .catch(function () { _tideData = false; _renderToday(); });
  }
}
function closeToday() {
  var p = document.getElementById('today-panel');
  if (p) p.classList.remove('open');
  var d = document.getElementById('today-dim');
  if (d) d.classList.remove('show');
}

function _tdText(id, fallback) {
  var el = document.getElementById(id);
  var t = el ? (el.textContent || '').trim() : '';
  return (t && t !== '—' && t !== '-') ? t : (fallback || null);
}

/* 오늘 열리는 축제. 날짜 파싱은 js/living.js 가 쓰는 _parseFestDate 를 그대로 쓴다 —
 * 여기서 다시 구현하면 '2026년 8월 중' 같은 변형에서 두 곳이 어긋난다.
 *
 * ⚠ place.status 로 거르면 안 된다. 50건이 전부 'upcoming' 이라 항상 0건이 된다
 *   (데이터 수집 시점 값이 그대로 굳어 있다). 날짜로 판단해야 한다.
 *
 * 오늘 것이 없으면 빈 상자 대신 '다음 축제'를 보여 준다 — 오늘 열리는 축제가
 * 없는 날이 훨씬 많은데, 그때마다 빈 칸이면 이 섹션이 쓸모가 없다. */
function _todayFestivals() {
  if (typeof PLACES === 'undefined' || typeof _parseFestDate !== 'function') return { list: [], soon: false };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var items = [];
  PLACES.forEach(function (p) {
    if (p.category !== 'festival' || !p.date) return;
    /* ⚠ '2026년 10월 중' 은 1일로 채워지는 근사값이다. D-day 로 찍으면
     * 없는 확정 일정처럼 보인다 — 근사면 'N월 중' 으로 말한다. */
    var dm = (typeof _parseFestDateMeta === 'function')
      ? _parseFestDateMeta(String(p.date).split('~')[0].trim())
      : (function (y) { return y ? { ymd: y, approx: false } : null; })(_parseFestDate(String(p.date).split('~')[0].trim()));
    if (!dm) return;
    var d = dm.ymd;
    var when = new Date(d[0], d[1] - 1, d[2]); when.setHours(0, 0, 0, 0);
    var days = Math.round((when - today) / 86400000);
    if (days < 0) return;
    items.push({ p: p, days: days, approxLabel: dm.approx ? (parseInt(d[1], 10) + '월 중') : null });
  });
  items.sort(function (a, b) { return a.days - b.days; });
  var todayOnly = items.filter(function (x) { return x.days === 0; });
  if (todayOnly.length) return { list: todayOnly.slice(0, 5), soon: false };
  return { list: items.slice(0, 3), soon: true };
}

function _renderToday() {
  var el = document.getElementById('today-body');
  if (!el) return;

  var now  = new Date();
  var dow  = ['일','월','화','수','목','금','토'][now.getDay()];
  var date = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 (' + dow + ')';

  /* ── 날씨·미세먼지 — 홈 상단 바가 이미 채워 둔 값을 읽는다 ── */
  var temp  = _tdText('hwb-temp');
  var desc  = _tdText('hwb-desc');
  var range = _tdText('hwb-range');
  var grade = _tdText('hwb-grade');
  var pm25  = _tdText('hwb-pm25-val');
  var icon  = _tdText('hwb-icon', '🌡️');

  var weather = (temp || desc)
    ? '<div class="td-card">' +
        '<div class="td-w-main">' +
          '<span class="td-w-icon">' + icon + '</span>' +
          '<div>' +
            '<div class="td-w-temp">' + (temp || '') + '</div>' +
            '<div class="td-w-desc">' + (desc || '') + (range ? ' · ' + range : '') + '</div>' +
          '</div>' +
        '</div>' +
        (grade ? '<div class="td-w-air"><span class="td-w-air-lbl">미세먼지</span>' +
                 '<span class="td-w-air-val">' + grade + (pm25 ? ' ' + pm25 : '') + '</span></div>' : '') +
      '</div>'
    /* 홈 바는 fetch 가 끝나야 채워진다. 빈 카드 대신 왜 비었는지 말한다. */
    : '<div class="td-card td-empty">날씨 정보를 불러오는 중이에요. 홈 탭을 한 번 열면 바로 표시돼요.</div>';

  /* ── 제부도 물때 ── */
  var tide;
  if (typeof _tideData === 'undefined' || _tideData === null) {
    tide = '<div class="td-card td-empty">물때를 불러오는 중이에요…</div>';
  } else if (_tideData === false || !_tideData.schedule) {
    tide = '<div class="td-card td-empty">물때를 불러오지 못했어요</div>';
  } else {
    var key = (typeof _tideYmd === 'function') ? _tideYmd(now) : '';
    var day = _tideData.schedule[key];
    if (!day) {
      tide = '<div class="td-card td-empty">오늘 물때 자료가 없어요 (2026년 기준 표)</div>';
    } else {
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var open = (typeof _tideOpenNow === 'function') &&
                 (_tideOpenNow(day.cross1, nowMin) || _tideOpenNow(day.cross2, nowMin));
      var segs = (typeof _tideSegs === 'function') ? _tideSegs(day) : [];
      tide =
        '<div class="td-card td-tide' + (open ? ' is-open' : ' is-closed') + '" onclick="closeToday();openTide()">' +
          '<div class="td-tide-badge">' + (open ? '지금 건널 수 있어요' : '지금은 물에 잠겨 있어요') + '</div>' +
          '<div class="td-tide-times">' +
            segs.map(function (g) {
              return '<span class="td-tide-seg">' + g.k + ' ' +
                     (typeof _tideRange === 'function' ? _tideRange(g.s) : '') + '</span>';
            }).join('') +
          '</div>' +
          '<div class="td-more">자세히 보기 →</div>' +
        '</div>';
    }
  }

  /* ── 오늘 축제 ── */
  var fr = _todayFestivals();
  var fest = fr.list.length
    ? (fr.soon ? '<div class="td-note" style="margin-top:0">오늘 열리는 축제는 없어요. 다가오는 축제예요.</div>' : '') +
      fr.list.map(function (it) {
        var f = it.p;
        var badge = it.approxLabel ? it.approxLabel
                  : it.days === 0 ? '오늘' : it.days === 1 ? '내일' : 'D-' + it.days;
        return '<div class="td-row" onclick="closeToday();go(\'tourism\');setTimeout(function(){showFestivalDetail(' + f.id + ')},260)">' +
                 '<div class="td-row-icon td-row-badge">' + badge + '</div>' +
                 '<div class="td-row-main">' +
                   '<div class="td-row-name">' + (f.name || '') + '</div>' +
                   '<div class="td-row-sub">' + ((f.address || '').replace('경기도 화성시 ', '')) + '</div>' +
                 '</div>' +
               '</div>';
      }).join('')
    : '<div class="td-card td-empty">예정된 축제가 없어요</div>';

  el.innerHTML =
    '<div class="td-date">' + date + '</div>' +
    '<div class="td-sect">날씨</div>' + weather +
    '<div class="td-sect">🌊 제부도 바닷길</div>' + tide +
    '<div class="td-sect">🎉 오늘의 축제</div>' + fest +
    '<div class="td-foot">' +
      '<button class="td-btn" onclick="closeToday();go(\'tourism\');requestNearbyRec()">📍 내 주변 추천 받기</button>' +
    '</div>';
}


/* ══════════════════════════════════════════════════════════════════════════
   설정
   지금까지 사용자가 손댈 수 있는 저장값이 하나도 노출돼 있지 않았다.
   특히 지오코딩 캐시(hwaseong_conv_v5_*)는 한 번 어긋나면 되돌릴 방법이 없었다.
   ══════════════════════════════════════════════════════════════════════════ */
function openSettings() {
  if (typeof closeMenu === 'function') closeMenu();
  var p = document.getElementById('settings-panel');
  if (!p) return;
  p.classList.add('open');
  var d = document.getElementById('today-dim');   /* 딤은 같은 것을 쓴다 */
  if (d) { d.classList.add('show'); d.dataset.for = 'settings'; }
  _renderSettings();
}
function closeSettings() {
  var p = document.getElementById('settings-panel');
  if (p) p.classList.remove('open');
  var d = document.getElementById('today-dim');
  if (d) { d.classList.remove('show'); delete d.dataset.for; }
}
/* 딤 한 장을 두 패널이 쓰므로, 눌렸을 때 열려 있는 쪽을 닫는다. */
function closeTodayDim() {
  var d = document.getElementById('today-dim');
  if (d && d.dataset.for === 'settings') closeSettings();
  else closeToday();
}

function _lsSize(prefix) {
  var n = 0, bytes = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (prefix && k.indexOf(prefix) !== 0) continue;
      n++; bytes += (localStorage.getItem(k) || '').length;
    }
  } catch (e) {}
  return { n: n, kb: Math.round(bytes / 1024) };
}

function _renderSettings() {
  var el = document.getElementById('settings-body');
  if (!el) return;
  var geo  = _lsSize('hwaseong_conv_v5_');
  var favN = (typeof getFavs === 'function') ? getFavs().length : 0;
  var recN = (typeof getRecent === 'function') ? getRecent().length : 0;

  el.innerHTML =
    '<div class="td-sect">저장된 내 정보</div>' +
    '<div class="td-row" style="cursor:default">' +
      '<div class="td-row-icon">♥</div>' +
      '<div class="td-row-main"><div class="td-row-name">즐겨찾기</div>' +
        '<div class="td-row-sub">' + favN + '곳</div></div>' +
      (favN ? '<button class="td-mini" onclick="if(confirm(\'즐겨찾기를 모두 지울까요?\')){localStorage.removeItem(\'hsida_favs\');_renderSettings();if(typeof renderFavSection===\'function\')renderFavSection();if(typeof renderMenuFavs===\'function\')renderMenuFavs();}">지우기</button>' : '') +
    '</div>' +
    '<div class="td-row" style="cursor:default">' +
      '<div class="td-row-icon">🕘</div>' +
      '<div class="td-row-main"><div class="td-row-name">최근 본 곳</div>' +
        '<div class="td-row-sub">' + recN + '곳</div></div>' +
      (recN ? '<button class="td-mini" onclick="clearRecent();_renderSettings()">지우기</button>' : '') +
    '</div>' +

    '<div class="td-sect">저장 공간</div>' +
    '<div class="td-row" style="cursor:default">' +
      '<div class="td-row-icon">🗄️</div>' +
      '<div class="td-row-main"><div class="td-row-name">주소 변환 캐시</div>' +
        '<div class="td-row-sub">' + geo.n + '건 · 약 ' + geo.kb + 'KB</div></div>' +
      (geo.n ? '<button class="td-mini" onclick="clearGeoCache()">비우기</button>' : '') +
    '</div>' +
    '<div class="td-note">편의시설 주소를 좌표로 바꾼 결과예요. 비우면 다음에 지도를 열 때 ' +
      '다시 계산하느라 수십 초가 걸릴 수 있어요. 위치가 이상할 때만 비우세요.</div>' +

    '<div class="td-sect">위치</div>' +
    '<div class="td-note">‘내 주변 추천’과 ‘내 위치’ 버튼은 브라우저 위치 권한을 씁니다. ' +
      '거부했다면 주소창의 자물쇠 아이콘에서 다시 허용할 수 있어요. ' +
      '위치는 기기 안에서만 쓰고 서버로 보내지 않습니다.</div>' +

    '<div class="td-foot">' +
      '<button class="td-btn" onclick="closeSettings();shareApp()">🔗 앱 링크 공유</button>' +
    '</div>';
}

function clearGeoCache() {
  if (!confirm('주소 변환 캐시를 비울까요?\n다음에 지도를 열 때 다시 계산합니다.')) return;
  try {
    var del = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf('hwaseong_conv_v5_') === 0) del.push(k);
    }
    del.forEach(function (k) { localStorage.removeItem(k); });
    if (typeof showToast === 'function') showToast(del.length + '건을 비웠어요');
  } catch (e) {}
  _renderSettings();
}
