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
  if (p) p.classList.remove('open');
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
    '<div class="td-foot">' +
      '<button class="td-btn" onclick="closeToday();go(\'tourism\');requestNearbyRec()">📍 내 주변 추천 받기</button>' +
    '</div>';

  /* innerHTML 로 컨테이너를 갈아 끼운 뒤라야 채울 수 있다. 순서를 바꾸면 지워진다. */
  if (typeof renderWeeklyWeather === 'function') renderWeeklyWeather();
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
      if (k.indexOf('hwaseong_conv_v5_') === 0) del.push(k);
    }
    del.forEach(function (k) { localStorage.removeItem(k); });
    if (typeof showToast === 'function') showToast(del.length + '건을 비웠어요');
  } catch (e) {}
  _renderSettings();
}
