/* ============================================================================
 * js/living.js — 생활 탭 — 카테고리 전환과 목록
 *
 * 왜 따로 있나: 생활 탭 전용 렌더러. 관광 탭과 데이터 출처는 같지만 화면 구성이 달라 분리한다.
 * 함께 볼 것:   renderLivingPage() 의 가맹점 수는 지연 로드 전이면 0 이다 — js/ui.js 의 _loadLcData() 참고.
 *
 * index.html 인라인 <script> 3246~3380줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 생활 페이지 렌더 ── */
/* ── 생활편의 카테고리 전환 ── */
function switchLivingCat(el, cat) {
  document.querySelectorAll('.cat-icon-item').forEach(function(c) { c.classList.remove('cat-active'); });
  if (el) el.classList.add('cat-active');
  renderLivingCatList(cat);
}

function renderLivingCatList(cat) {
  var list = document.getElementById('living-main-list');
  var titleEl = document.getElementById('living-list-title');
  var countEl = document.getElementById('living-list-count');
  if (!list) return;
  var empty = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>';

  var items;
  if (cat === 'restaurant') {
    if (typeof CONVENIENCE === 'undefined') { list.innerHTML = empty; return; }
    items = CONVENIENCE.restaurants;
    if (!items) { list.innerHTML = empty; return; }
    if (titleEl) titleEl.textContent = '모범음식점';
    if (countEl) countEl.textContent = items.length + '곳';
    list.innerHTML = items.map(function(r, i) {
      return '<div class="place-item" style="animation-delay:' + (Math.min(i, 10) * 0.03) + 's" onclick="goConvItem(\'mobeom\',' + i + ')">'
        + '<div class="pi ci-food" style="border-radius:12px;background:#FEF3C7;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">🍽️</div>'
        + '<div class="pi-content"><div class="pi-name">' + r.name + '</div>'
        + '<div class="pi-meta">화성시 ' + r.addr + '</div></div>'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>';
    }).join('');

  } else if (cat === 'touristrest') {
    if (typeof CONVENIENCE === 'undefined') { list.innerHTML = empty; return; }
    items = CONVENIENCE.touristRestaurants;
    if (!items) { list.innerHTML = empty; return; }
    if (titleEl) titleEl.textContent = '관광식당업';
    if (countEl) countEl.textContent = items.length + '곳';
    list.innerHTML = items.map(function(r, i) {
      var tagClass = (r.cuisine || '').includes('네팔') ? 'cuisine-nepal' : (r.cuisine || '').includes('러시아') ? 'cuisine-russia' : '';
      return '<div class="place-item" style="animation-delay:' + (i * 0.03) + 's" onclick="goConvItem(\'touristrest\',' + i + ')">'
        + '<div class="pi" style="border-radius:12px;background:#FEE2E2;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">🥢</div>'
        + '<div class="pi-content">'
        + '<div class="pi-name" style="gap:6px">' + r.name
        + (r.cuisine ? '<span class="cuisine-tag ' + tagClass + '">' + r.cuisine + '</span>' : '')
        + '</div>'
        + '<div class="pi-meta">화성시 ' + r.addr + (r.area ? ' · ' + r.area : '') + '</div>'
        + '</div>'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>';
    }).join('');

  } else if (cat === 'currency') {
    var lcArr = (typeof lcData !== 'undefined') ? lcData : [];
    /* 미로드 시 fetch 후 자동 재렌더.
     * 성공 여부를 확인하지 않으면 실패 콜백이 다시 이 분기로 들어와 4.2MB 를 무한 재요청한다. */
    if (!lcArr.length) {
      _loadLcData(function () {
        /* 로딩이 수 초 걸려 그 사이 사용자가 다른 카테고리로 옮겼을 수 있다. */
        var act = document.querySelector('.cat-icon-item.cat-active');
        if (!act || act.id !== 'liv-cat-currency') return;
        if (typeof lcData !== 'undefined' && lcData.length) renderLivingCatList('currency');
        else if (countEl) countEl.textContent = '불러오기 실패';
      });
    }
    var LC_SHOW = 80;
    if (titleEl) titleEl.textContent = '희망화성지역화폐 가맹점';
    if (countEl) countEl.textContent = lcArr.length ? lcArr.length.toLocaleString() + '곳' : '로딩 중...';
    list.innerHTML = lcArr.length
      ? lcArr.slice(0, LC_SHOW).map(function(p, i) {
          /* lcData 필드: n=이름, c=업종, a=주소, lat, lng */
          var name = p.n || p.name || '';
          var addr = (p.a || p.address || '').replace('경기도 화성시 ','');
          var cat2 = p.c || '';
          var hasCoord = p.lat && p.lng;
          var clickFn = hasCoord
            ? 'goMapLc(' + p.lat + ',' + p.lng + ')'
            : 'goMapCat(\'localcurrency\')';
          return '<div class="place-item" style="animation-delay:' + (Math.min(i, 10) * 0.04) + 's;cursor:pointer" onclick="' + clickFn + '">'
            + '<div class="pi pi-currency"><img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:64%;height:64%;object-fit:contain;display:block"></div>'
            + '<div class="pi-content">'
            + '<div class="pi-name">' + name + '</div>'
            + '<div class="pi-meta">' + (cat2 ? cat2 + ' · ' : '') + addr + '</div>'
            + '</div>'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
            + '</div>';
        }).join('')
      + (lcArr.length > LC_SHOW
          ? '<div style="padding:16px;text-align:center;color:var(--primary);font-size:13px;font-weight:600;cursor:pointer" onclick="goMapCat(\'localcurrency\')">'
            + '지도에서 ' + lcArr.length.toLocaleString() + '개 전체 보기 →</div>'
          : '')
      : empty;

  } else if (cat === 'parking') {
    var pkArr = (typeof parkingData !== 'undefined') ? parkingData : [];
    if (titleEl) titleEl.textContent = '공영주차장';
    if (countEl) countEl.textContent = pkArr.length + '곳';
    list.innerHTML = pkArr.length
      ? pkArr.map(function(p, i) {
          var isFree = p.free === true;
          var avail = (p.avail != null) ? p.avail : p.total;
          var addr = (p.address || '').replace('경기도 화성시 ','');
          var hasCoord = p.lat && p.lng;
          var clickFn = hasCoord
            ? 'goMapPark(' + p.lat + ',' + p.lng + ',' + p.id + ')'
            : 'goMapCat(\'parking\')';
          return '<div class="place-item" style="animation-delay:' + (Math.min(i, 10) * 0.04) + 's;cursor:pointer" onclick="' + clickFn + '">'
            + '<div class="pi pi-parking">P</div>'
            + '<div class="pi-content">'
            + '<div class="pi-name">' + p.name + '</div>'
            + '<div class="pi-meta">' + addr + ' · ' + p.type + '</div>'
            + '</div>'
            + '<div class="pi-right" style="text-align:right;flex-shrink:0">'
            + '<span class="park-badge ' + (isFree ? 'pb-free' : 'pb-paid') + '">' + (isFree ? '무료' : '유료') + '</span>'
            + '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">' + avail + '대</div>'
            + '</div>'
            + '</div>';
        }).join('')
      : empty;
  }
}

function renderLivingPage() {
  var cCount = (typeof lcData      !== 'undefined') ? lcData.length      : 0;
  var pCount = (typeof parkingData !== 'undefined') ? parkingData.length : 0;
  var scEl = document.getElementById('stat-currency');
  var spEl = document.getElementById('stat-parking');
  /* 표기를 js/ui.js:86 · js/living.js:77 과 통일한다 (콤마 없는 27374 로 퇴화하던 버그).
   * 0 은 '진짜 0곳'이 아니라 '아직 지연 로드 전'이므로 HTML 기본값 '-'(index.html:257-258)로 둔다.
   * lcData 는 boot 에서 프리페치하지 않고(js/boot.js:114), parking 도 async 라 첫 진입엔 0 이 될 수 있다. */
  if (scEl) scEl.textContent = cCount ? cCount.toLocaleString() : '-';
  if (spEl) spEl.textContent = pCount ? pCount.toLocaleString() : '-';

  renderNewsSection();          /* 소식 섹션은 매 진입마다 다시 그린다 — 날짜가 바뀌면 D-N 도 바뀐다 */

  // 기본 탭: 모범음식점
  var firstCat = document.getElementById('liv-cat-restaurant');
  switchLivingCat(firstCat, 'restaurant');
}

/* ══════════════════════════════════════════════════
   생활 탭 재클릭 리셋 (2026-08-25)
   생활 탭은 이미 go('living') 이 renderLivingPage()(js/nav.js:24)를 무조건 불러
   통계·카테고리·제목·건수·목록 DOM 을 전부 기본값으로 되돌린다. 새 리셋 로직이 필요 없다.
   여기서 renderLivingPage() 를 또 부르면 94건 innerHTML 을 두 번 그리고
   .place-item 등장 애니메이션(css/20-map.css:274)이 두 번 재생돼 깜빡인다.
   이 함수는 4개 탭의 리셋 진입점을 같은 모양으로 유지하려고 남긴 자리표시자다.
══════════════════════════════════════════════════ */
function resetLivingPage() {
  /* 목록 재렌더로 높이가 바뀐 뒤 스크롤을 확정한다.
   * (go() 의 scrollTop=0 은 js/nav.js:21 로 renderLivingPage() 보다 '앞'이다 — 그 순서를 바꾸지 말 것) */
  var p = document.getElementById('page-living');
  if (p) p.scrollTop = 0;

  /* '이번 달 축제' 캐러셀 가로 스크롤 — 2026-08-26 추천 탭에서 넘어오면서 함께 옮겼다.
   * renderFestivalScroll() 은 boot 에서 딱 한 번만 불려 다시 그려지지 않으므로
   * scrollLeft 가 앱 수명 내내 남는다. 다시 그리지는 말 것 — PLACES 가 불변이라
   * 결과 HTML 이 같은 순수 낭비다(카드 DOM 전량 재생성 + 리스너 재등록).
   * 좌/우 화살표(.visible)는 scrollLeft 파생 상태라 함께 갱신한다. */
  var fs = document.getElementById('festival-scroll-list');
  if (fs) fs.scrollLeft = 0;
  if (typeof updateFestArrows === 'function') updateFestArrows();
}

/* ══════════════════════════════════════════════════
   이번 주 소식 (2026-08-26)
   탭 이름이 '생활' → '소식' 이 되면서 시간에 민감한 것을 맨 위로 올렸다.
   PLACES 의 축제만 읽는다 — 새 데이터도 fetch 도 없다.
   날짜 파싱은 js/calendar.js 의 _parseFestDate() 를 재사용한다.
   "2026년 8월 중" 같은 비ISO 형식이 11건 있어 직접 Date 로 넘기면 안 된다.
══════════════════════════════════════════════════ */
function renderNewsSection() {
  var el = document.getElementById('living-news');
  if (!el || typeof PLACES === 'undefined') return;

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var items = [];

  PLACES.forEach(function (p) {
    if (p.category !== 'festival' || !p.date) return;
    var d = (typeof _parseFestDate === 'function') ? _parseFestDate(String(p.date).split('~')[0].trim()) : null;
    if (!d) return;
    var when = new Date(d[0], d[1] - 1, d[2]); when.setHours(0, 0, 0, 0);
    var days = Math.round((when - today) / 86400000);
    if (days < 0 || days > 30) return;            /* 지난 것과 한 달 밖은 '소식'이 아니다 */
    items.push({ p: p, days: days, when: when });
  });

  items.sort(function (a, b) { return a.days - b.days; });

  if (!items.length) {
    el.innerHTML = '<div class="news-empty">다가오는 행사가 없습니다</div>';
    return;
  }

  el.innerHTML =
    '<div class="section-header" style="margin-bottom:10px">' +
      '<div class="section-title">이번 주 소식</div>' +
      '<button class="section-link" onclick="go(\'tourism\');setTimeout(function(){' +
        'var c=document.querySelector(\'.tourism-subnav .chip[data-sub=&quot;festival&quot;]\');' +
        'if(c)switchTourismSub(c,\'festival\');},260)">전체 보기</button>' +
    '</div>' +
    items.slice(0, 3).map(function (it, i) {
      var d = it.days;
      var badge = d === 0 ? '오늘' : d === 1 ? '내일' : 'D-' + d;
      var hot   = d <= 3 ? ' news-badge-hot' : '';
      return '<div class="news-item" style="animation-delay:' + (i * 0.045) + 's"' +
             ' onclick="showFestivalDetail(' + it.p.id + ')">' +
               '<div class="news-badge' + hot + '">' + badge + '</div>' +
               '<div class="news-body">' +
                 '<div class="news-title">' + (it.p.name || '') + '</div>' +
                 '<div class="news-sub">' + (it.p.address || '') + '</div>' +
               '</div>' +
               '<div class="news-arrow">›</div>' +
             '</div>';
    }).join('');
}
