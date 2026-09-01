/* ============================================================================
 * js/today.js — 오늘의 화성 날씨 · 설정 (2026-08-26, 개발 Claude)
 *
 * 왜 필요한가: 앱에 흩어져 있는 '오늘 나가기 전에 볼 것'이 각각 다른 탭에 있었다.
 * 날씨·미세먼지는 홈 상단, 물때는 메뉴, 오늘 축제는 소식 탭. 아침에 한 번 열어
 * 확인하려면 세 곳을 돌아야 했다. 한 화면에 모은다.
 *
 * 새 데이터를 받지 않는다 — 전부 이미 앱 안에 있는 것을 다시 보여 줄 뿐이다.
 *   날씨·미세먼지  #home-weather-bar 가 이미 채워 둔 DOM 에서 읽는다
 *   주간 예보      js/weather.js 가 별도 fetch 로 채운다
 *
 * 2026-08-26 사용자 지시로 물때·오늘 축제 칸을 뺐다 — 날씨 전용 패널이다.
 * 둘 다 원래 자리(메뉴의 제부도 시간표 · 소식 탭)에 그대로 있다.
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
  /* 물때 선로드를 뺐다 (2026-08-26) — 날씨 전용이 되면서 70KB 를 받을 이유가
   * 없어졌다. 물때는 메뉴의 '제부도 바닷길 시간표' 를 열 때 받는다. */
}
function closeToday() {
  var p = document.getElementById('today-panel');
  if (p) { p.classList.remove('open'); p.classList.remove('expanded'); }
  var d = document.getElementById('today-dim');
  if (d) d.classList.remove('show');
}

function _tdText(id, fallback) {
  var el = document.getElementById(id);
  var t = el ? (el.textContent || '').trim() : '';
  return (t && t !== '—' && t !== '-') ? t : (fallback || null);
}


function _renderToday() {
  var el = document.getElementById('today-body');
  if (!el) return;

  var now  = new Date();
  var dow  = ['일','월','화','수','목','금','토'][now.getDay()];
  var date = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 (' + dow + ')';

  /* ── 날씨·미세먼지 — 홈 상단 바가 이미 채워 둔 값을 읽는다 ── */
  /* ⚠ '값이 있는지' 로 판정하면 안 된다 — index.html 의 #hwb-temp 초기값이 '—°C' 라
   *   _tdText 의 '—'·'-' 필터를 그대로 통과한다. 그러면 아래 (temp || desc) 가 늘 참이 돼
   *   폴백 안내가 영영 안 뜨고 '—°C' 와 빈 설명줄만 남는다(로딩 중인지 고장인지 알 수 없다).
   *   js/home.js 의 _renderWeather() 는 성공했을 때만 마지막 줄에서 display:flex 를 주고
   *   초기값은 index.html 의 display:none 이므로, 그것을 '채워짐' 신호로 쓴다. */
  var _wbar    = document.getElementById('home-weather-bar');
  var _wFilled = !!(_wbar && _wbar.style.display === 'flex');

  var temp  = _tdText('hwb-temp');
  var desc  = _tdText('hwb-desc');
  var range = _tdText('hwb-range');
  var grade = _tdText('hwb-grade');
  var pm25  = _tdText('hwb-pm25-val');
  var icon  = _tdText('hwb-icon', '🌡️');

  var weather = (_wFilled && (temp || desc))
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


  el.innerHTML =
    '<div class="td-date">' + date + '</div>' +
    '<div class="td-sect">날씨</div>' + weather +
    /* 주간 상세는 js/weather.js 가 채운다 (7일 · 하루 펼치면 3시간 간격).
       여기서 그리지 않는 이유는 그쪽이 별도 fetch 를 하기 때문이다 —
       홈 바 DOM 을 읽는 위 칸과 달리 자기 데이터를 받는다. */
    /* 2026-08-26 사용자 지시로 '제부도 바닷길' 과 '오늘의 축제' 를 뺐다 —
     * 이 패널은 날씨 전용이 됐다('오늘의 화성 날씨').
     * 물때는 메뉴의 '제부도 바닷길 시간표'(js/tide.js)에 그대로 있고,
     * 축제는 소식 탭의 '이번 주 소식'·'이번 달 축제'에 있다. 기능이 사라진 게 아니다. */
    '<div class="td-sect">📅 주간 예보</div>' +
    '<div id="today-weekly"></div>' +
    /* 2026-08-26 사용자 지시로 '내 주변 추천 받기' 버튼을 빼고 출처 고지를 넣었다.
     * 홈 탭의 '데이터 출처 및 유의사항' 과 같은 성격이라 문체도 그쪽을 따른다 —
     * 앱의 다른 문구는 해요체지만 고지문만 격식체다(사용자 지시, WORKFLOW §15).
     * 실제 호출하는 엔드포인트만 적는다:
     *   api.open-meteo.com/v1/forecast          기온·강수·주간 예보
     *   air-quality-api.open-meteo.com/v1/...   PM2.5
     *   nominatim.openstreetmap.org/reverse     '내 위치' 를 눌렀을 때 지명 변환 */
    '<div class="td-src">' +
      '<div class="td-src-head">데이터 출처 및 유의사항</div>' +
      '<p class="td-src-body">기상 예보와 미세먼지는 <strong>Open-Meteo</strong> 공개 API 기반이며, ' +
      '수치는 예보 모델값이라 실제 관측과 차이가 있을 수 있습니다. ' +
      '기상특보 등 공식 정보는 기상청(weather.go.kr)에서 확인하시기 바랍니다.</p>' +
      '<p class="td-src-body">‘내 위치’ 지명 표기는 <strong>OpenStreetMap Nominatim</strong>을 이용합니다. ' +
      '위치 정보는 기기 안에서만 사용하며 서버로 전송하지 않습니다.</p>' +
    '</div>';

  /* innerHTML 로 컨테이너를 갈아 끼운 뒤라야 채울 수 있다. 순서를 바꾸면 지워진다. */
  if (typeof renderWeeklyWeather === 'function') renderWeeklyWeather();
}


/* ══════════════════════════════════════════════════════════════════════════
   설정
   지금까지 사용자가 손댈 수 있는 저장값이 하나도 노출돼 있지 않았다.
   특히 지오코딩 캐시(hwaseong_conv_*)는 한 번 어긋나면 되돌릴 방법이 없었다.
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
  if (p) { p.classList.remove('open'); p.classList.remove('expanded'); }
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
  /* ⚠ 접두사를 여기서 하드코딩하면 안 된다. CONV_CACHE_VER 이 v5→v6 로 올라간 뒤
   *   이 줄만 v5 로 남아 캐시가 늘 '0건' 으로 나오고 아래 '비우기' 버튼이 영영
   *   렌더되지 않았다(삼항이 항상 빈 문자열) — clearGeoCache() 는 호출처가 0이 됐다.
   *   키를 만드는 쪽(js/conv_map.js convCachePrefix)에서 받아 쓴다.
   *   conv_map.js 가 아직 안 떴을 때를 대비한 폴백은 버전 없는 접두사다 —
   *   그러면 옛 버전 잔여 키까지 함께 세어 사용자에게 이득이다. */
  var _cvP = (typeof convCachePrefix === 'function') ? convCachePrefix() : 'hwaseong_conv_';
  var geo  = _lsSize(_cvP);
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
    '<div class="td-note">‘내 주변 추천’과 ‘내 위치’ 버튼은 브라우저 위치 권한을 써요. ' +
      '거부했다면 주소창의 자물쇠 아이콘에서 다시 허용할 수 있어요. ' +
      '위치는 기기 안에서만 쓰고 서버로 보내지 않아요.</div>' +

    '<div class="td-foot">' +
      '<button class="td-btn" onclick="closeSettings();shareApp()">🔗 앱 링크 공유</button>' +
    '</div>';
}

function clearGeoCache() {
  if (!confirm('주소 변환 캐시를 비울까요?\n다음에 지도를 열 때 다시 계산해요.')) return;
  try {
    var del = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      /* 지울 때는 버전을 가리지 않는다 — 옛 버전 잔여 키가 남으면 용량만 먹는다. */
      if (k.indexOf('hwaseong_conv_') === 0) del.push(k);
    }
    del.forEach(function (k) { localStorage.removeItem(k); });
    if (typeof showToast === 'function') showToast(del.length + '건을 비웠어요');
  } catch (e) {}
  _renderSettings();
}

/* ── 패널 드래그 핸들 (today / tide / settings) ──────────────────────────
 * 위로 스와이프(40px↑) → 92vh 확장
 * 아래로 스와이프(50px↓) → 확장 상태면 축소, 아니면 닫기
 * 손가락 이동 중에는 패널을 따라 내려가 손 놓으면 복귀 or 닫기 */
function _panelClose(panel) {
  var id = panel.id;
  if      (id === 'tide-panel'     && typeof closeTide     === 'function') closeTide();
  else if (id === 'today-panel'    && typeof closeToday    === 'function') closeToday();
  else if (id === 'settings-panel' && typeof closeSettings === 'function') closeSettings();
}

function setupPanelDrags() {
  document.querySelectorAll('.panel-drag-zone').forEach(function (zone) {
    var panel = zone.parentElement;
    var startY = 0, live = false;

    function onStart(y) {
      startY = y; live = true;
      /* ⚠ 패널에 transform 0.26s 트랜지션이 걸려 있다(css/50-datalab.css).
       * 끄는 동안 매 프레임 인라인 transform 을 갈아 끼우면 값 하나하나가
       * 260ms 이징으로 재생돼 판이 손가락을 한 박자 늦게 쫓아온다.
       * 잡고 있는 동안만 트랜지션을 끄고, 손을 떼면 되돌려 복귀는 부드럽게 둔다. */
      panel.style.transition = 'none';
    }
    function onMove(y) {
      if (!live) return;
      var dy = y - startY;
      if (dy > 0) panel.style.transform = 'translate(-50%, ' + dy + 'px)';
    }
    function onEnd(y) {
      if (!live) return;
      live = false;
      panel.style.transition = '';   /* CSS 트랜지션 복원 — 복귀·닫기는 부드럽게 */
      panel.style.transform = '';
      var dy = y - startY;
      if (dy < -40) {
        panel.classList.add('expanded');
      } else if (dy > 50) {
        if (panel.classList.contains('expanded')) panel.classList.remove('expanded');
        else _panelClose(panel);
      }
    }

    zone.addEventListener('touchstart', function (e) { onStart(e.touches[0].clientY); },      { passive: true });
    zone.addEventListener('touchmove',  function (e) { onMove(e.touches[0].clientY); },       { passive: true });
    zone.addEventListener('touchend',   function (e) { onEnd(e.changedTouches[0].clientY); });

    /* 데스크탑 테스트용 */
    zone.addEventListener('mousedown', function (e) { onStart(e.clientY); e.preventDefault(); });
    document.addEventListener('mousemove', function (e) { if (live) onMove(e.clientY); });
    document.addEventListener('mouseup',   function (e) { if (live) onEnd(e.clientY); });
  });
}

/* DOM 파싱 완료 후 한 번만 설정한다. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPanelDrags);
} else {
  setupPanelDrags();
}
