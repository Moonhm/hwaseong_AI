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
/* 목록은 5개만 보여 주고 나머지는 더보기로 펼친다 (2026-08-26 사용자 지시).
   94·131·80건을 통째로 쏟으면 아래 목록이 화면을 다 먹는다. */
var LIVING_PREVIEW = 5;

function renderLivingCatList(cat, expanded) {
  var list = document.getElementById('living-main-list');
  var titleEl = document.getElementById('living-list-title');
  var countEl = document.getElementById('living-list-count');
  if (!list) return;
  var empty = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>';
  /* 분기마다 innerHTML 을 직접 넣던 것을 '항목 배열(rows) 만들기' 로 바꿨다 (2026-08-26).
   * 4개 분기에 각각 '5개만 + 더보기' 를 붙이면 반드시 한쪽이 어긋난다.
   * 자르기와 버튼은 함수 끝에서 한 번만 한다. footer 는 목록 뒤에 붙는 부가 줄이다. */
  var rows = null, footer = '';

  var items;
  if (cat === 'restaurant') {
    if (typeof CONVENIENCE === 'undefined') { list.innerHTML = empty; return; }
    items = CONVENIENCE.restaurants;
    if (!items) { list.innerHTML = empty; return; }
    if (titleEl) titleEl.textContent = '모범음식점';
    if (countEl) countEl.textContent = items.length + '곳';
    rows = items.map(function(r, i) {
      return '<div class="place-item" style="animation-delay:' + (Math.min(i, 10) * 0.03) + 's" onclick="goConvItem(\'mobeom\',' + i + ')">'
        + '<div class="pi ci-food" style="border-radius:12px;background:#FEF3C7;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">🍽️</div>'
        + '<div class="pi-content"><div class="pi-name">' + r.name + '</div>'
        + '<div class="pi-meta">화성시 ' + r.addr + '</div></div>'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>';
    });

  } else if (cat === 'touristrest') {
    if (typeof CONVENIENCE === 'undefined') { list.innerHTML = empty; return; }
    items = CONVENIENCE.touristRestaurants;
    if (!items) { list.innerHTML = empty; return; }
    if (titleEl) titleEl.textContent = '관광식당업';
    if (countEl) countEl.textContent = items.length + '곳';
    rows = items.map(function(r, i) {
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
    });

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
    rows = lcArr.length
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
        })
      : [];
    /* 지역화폐는 80건까지만 DOM 에 올린다 — 27,374건을 그릴 수는 없다.
     * 나머지는 지도에서 본다. 이 줄은 '더보기' 로 다 펼친 뒤에만 붙는다. */
    footer = (lcArr.length > LC_SHOW)
      ? '<div style="padding:16px;text-align:center;color:var(--primary);font-size:13px;font-weight:600;cursor:pointer" onclick="goMapCat(\'localcurrency\')">'
        + '지도에서 ' + lcArr.length.toLocaleString() + '개 전체 보기 →</div>'
      : '';

  } else if (cat === 'parking') {
    var pkArr = (typeof parkingData !== 'undefined') ? parkingData : [];
    if (titleEl) titleEl.textContent = '공영주차장';
    if (countEl) countEl.textContent = pkArr.length + '곳';
    rows = pkArr.length
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
        })
      : [];
  }

  /* 여기서부터가 4개 분기의 공통 마무리다.
   * rows 가 null 이면 위에서 이미 innerHTML 을 넣고 return 한 경우다(데이터 미로드 등). */
  if (!rows) return;
  if (!rows.length) {
    /* 지역화폐는 4.2MB 를 지연 로드하는 중일 수 있다. 그때 '준비 중이에요' 는 거짓말이다. */
    list.innerHTML = (cat === 'currency')
      ? '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">불러오는 중이에요...</div>'
      : empty;
    return;
  }

  var more = rows.length > LIVING_PREVIEW && !expanded;
  list.innerHTML = (more ? rows.slice(0, LIVING_PREVIEW) : rows).join('') + (more ? '' : footer);

  if (more) {
    /* 추천 탭 목록·축제 전체와 같은 .tourism-more-btn (css/00-base.css:294).
     * onclick 속성이 아니라 프로퍼티로 단다 — 재렌더 한 줄이면 되고,
     * 문자열 onclick 은 cat/expanded 를 문자열로 엮어야 해서 따옴표 사고가 난다. */
    var btn = document.createElement('div');
    btn.className = 'tourism-more-btn';
    btn.innerHTML = '더보기 <span style="color:var(--primary);font-weight:700">+' +
                    (rows.length - LIVING_PREVIEW) + '</span>';
    btn.onclick = function () { renderLivingCatList(cat, true); };
    list.appendChild(btn);
  }
}

function renderLivingPage() {
  /* 통계 4칸(#stat-currency·#stat-parking)은 2026-08-26 에 index.html 에서 걷어냈다.
   * 카테고리 아이콘과 목록 머리가 같은 정보를 이미 보여 준다. 여기서 채우던 코드도 함께 뺀다. */

  renderNewsSection();          /* 소식 섹션은 매 진입마다 다시 그린다 — 날짜가 바뀌면 D-N 도 바뀐다 */
  /* 축제 전체도 같은 이유로 매 진입마다 다시 그린다(진행 중/예정/종료가 날짜에 걸려 있다).
   * expanded 를 넘기지 않으므로 탭에 다시 들어오면 항상 5개로 접힌 상태다. */
  renderFestivalAll();

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

  /* '진짜 이번 주'(2026-08-26 사용자 지시). 예전에는 앞으로 30일을 담아
   * 다음 달 것까지 '이번 주 소식'에 올라왔다.
   * 월요일 시작 주로 자른다 — getDay() 는 일요일이 0 이라 (getDay()+6)%7 로
   * 월요일을 0 으로 돌려야 한다. 이 한 줄을 빼먹으면 일요일에 다음 주가 잡힌다. */
  var dow = (today.getDay() + 6) % 7;
  var weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
  var weekEnd   = new Date(today); weekEnd.setDate(today.getDate() - dow + 6);

  var items = [];

  PLACES.forEach(function (p) {
    if (p.category !== 'festival' || !p.date) return;
    /* ⚠ '2026년 10월 중' 같은 미확정 일정은 1일로 채워지는 근사값이다.
     * 그대로 D-day 를 찍으면 없는 확정 일정처럼 보인다(감사에서 'D-36' 실측).
     * 근사 여부를 함께 받아 배지 문구를 바꾼다. */
    var _dm = (typeof _parseFestDateMeta === 'function') ? _parseFestDateMeta(String(p.date).split('~')[0].trim()) : null;
    var d = _dm ? _dm.ymd : null;
    if (!d) return;
    /* ⚠ '2026년 8월 중' 같은 근사 일정은 1일로 채워진 값이다. 주 단위로 특정할 수
     * 없으므로 '이번 주'에서는 뺀다 — 아래 '행사 전체'에는 그대로 들어 있다.
     * 이걸 남기면 8월 1일로 계산돼 엉뚱한 주에 걸린다. */
    if (_dm && _dm.approx) return;
    var when = new Date(d[0], d[1] - 1, d[2]); when.setHours(0, 0, 0, 0);
    if (when < weekStart || when > weekEnd) return;
    var days = Math.round((when - today) / 86400000);
    items.push({ p: p, days: days, when: when });
  });

  items.sort(function (a, b) { return a.days - b.days; });

  if (!items.length) {
    el.innerHTML = '<div class="section-header" style="margin-bottom:10px">' +
                     '<div class="section-title">이번 주 소식</div>' +
                   '</div>' +
                   '<div class="news-empty">이번 주에 예정된 행사가 없어요</div>';
    return;
  }

  el.innerHTML =
    /* '전체 보기' 버튼은 2026-08-26 에 뺐다(사용자 지시). 이 섹션은 이제 이번 주
     * 것만 담고, 전체는 바로 아래 '행사 전체'가 맡는다 — 같은 화면에 둘 다 있는데
     * 위쪽에서 아래쪽으로 보내는 버튼은 군더더기다. */
    '<div class="section-header" style="margin-bottom:10px">' +
      '<div class="section-title">이번 주 소식</div>' +
    '</div>' +
    /* 이번 주 것만 남으므로 자르지 않는다 — 많아야 며칠 치다. */
    items.map(function (it, i) {
      var d = it.days;
      /* 지난 요일(음수)도 이번 주면 보여 준다 — '이번 주 소식'이니 이미 지난 것도
       * 이번 주의 소식이다. D+N 으로 지났음을 밝힌다. */
      var badge = d === 0 ? '오늘' : d === 1 ? '내일'
                : d  <  0 ? 'D+' + (-d) : 'D-' + d;
      var hot   = d <= 3 ? ' news-badge-hot' : '';
      return '<div class="news-item" style="animation-delay:' + (i * 0.045) + 's"' +
             /* openFestView 가 탭 전환·지연·'← 소식' 라벨·뒤로가기 복귀를 한꺼번에 맡는다
              * (js/tourism.js). 직접 showFestivalDetail 을 부르면 아무 일도 안 일어나고,
              * go('tourism') 만 붙이면 뒤로가기가 추천 탭에 남는다. */
             ' onclick="openFestView(\'detail\',' + it.p.id + ')">' +
               '<div class="news-badge' + hot + '">' + badge + '</div>' +
               /* 사진이 있으면 배지 옆에 썸네일. 없으면 예전처럼 배지+텍스트만이다. */
               ((typeof photoThumb === 'function') ? photoThumb(it.p, 40, '🎉', 'ph-sm news-thumb') : '') +
               '<div class="news-body">' +
                 '<div class="news-title">' + (it.p.name || '') + '</div>' +
                 '<div class="news-sub">' + (it.p.address || '') + '</div>' +
               '</div>' +
               '<div class="news-arrow">›</div>' +
             '</div>';
    }).join('');
}

/* ══════════════════════════════════════════════════
   행사 전체 (2026-08-26)
   추천 탭 서브탭('축제' → renderTourismList('festival-only'))에서 소식 탭으로 옮겼다.
   사용자 지시: "추천 탭에서 축제 부분 선택하는거 거기서 빼고 소식으로 가져와 …
   이번달 축제 밑에 놓고 한 4 5개만 띄워놓고 밑에 더보기 버튼 만들어도 되고."

   ⚠ 정렬을 PLACES 원래 순서로 두면 안 된다. 5개만 접어 보여 주므로 맨 위 5개가
     곧 이 섹션의 전부처럼 읽힌다. 이미 끝난 축제가 먼저 오면 쓸모가 없다.
     진행 중 → 예정(가까운 순) → 날짜 미상 → 종료(최근 순) 로 세운다.

   ⚠ p.status 를 읽지 마라 — 50건이 전부 'upcoming' 으로 굳어 있다.
     js/calendar.js 의 festStatus() 가 date 를 파싱해 실제 상태를 낸다.

   ⚠ 항목 클릭은 반드시 openFestView('detail', id) 로 간다(js/tourism.js).
     showFestivalDetail() 을 직접 부르면 아무 일도 안 일어나고(그 뷰는 추천 탭 소속),
     go('tourism') 만 덧붙이면 헤더가 '← 추천'이 되고 뒤로가기가 추천 탭에 남는다.
══════════════════════════════════════════════════ */
var FEST_ALL_PREVIEW = 5;

function _festAllSorted() {
  if (typeof PLACES === 'undefined') return [];
  var now = new Date(); now.setHours(0, 0, 0, 0);
  /* 상태별 정렬 가중치. 같은 상태 안에서는 날짜로 다시 세운다. */
  var RANK = { ongoing: 0, upcoming: 1, unknown: 2, ended: 3 };

  return PLACES.filter(function (p) { return p.category === 'festival'; })
    .map(function (p) {
      var st = (typeof festStatus === 'function') ? festStatus(p, now) : 'unknown';
      var dm = (typeof _parseFestDateMeta === 'function')
        ? _parseFestDateMeta(String(p.date || '').split('~')[0].trim()) : null;
      var t = dm ? new Date(dm.ymd[0], dm.ymd[1] - 1, dm.ymd[2]).getTime() : null;
      return { p: p, st: st, t: t };
    })
    .sort(function (a, b) {
      var ra = RANK[a.st] !== undefined ? RANK[a.st] : 2;
      var rb = RANK[b.st] !== undefined ? RANK[b.st] : 2;
      if (ra !== rb) return ra - rb;
      if (a.t === null) return b.t === null ? 0 : 1;   /* 날짜 미상은 뒤로 */
      if (b.t === null) return -1;
      /* 종료된 것은 '최근에 끝난 것' 이 위로, 나머지는 '곧 오는 것' 이 위로 */
      return a.st === 'ended' ? b.t - a.t : a.t - b.t;
    });
}

function renderFestivalAll(expanded) {
  var list = document.getElementById('festival-all-list');
  if (!list) return;
  var rows = _festAllSorted();

  var cnt = document.getElementById('festival-all-count');
  if (cnt) cnt.textContent = rows.length ? rows.length + '건' : '';

  if (!rows.length) {
    list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:13px">등록된 행사가 없어요</div>';
    return;
  }

  var more    = rows.length > FEST_ALL_PREVIEW && !expanded;
  var visible = more ? rows.slice(0, FEST_ALL_PREVIEW) : rows;

  list.innerHTML = visible.map(function (r, i) {
    var p = r.p;
    var badge = (typeof festBadge === 'function') ? festBadge(p) : null;
    var thumb = (typeof photoThumb === 'function') ? photoThumb(p, 56, '🎉') : '';
    if (!thumb) thumb = '<div class="pi pi-festival">🎉</div>';
    /* 날짜 표기: ISO(2026-09-02)는 '09.02', 미확정('2026년 8월 중')은 연도만 떼어
     * '8월 중'. 연도를 남기면 오른쪽 칸이 두 줄로 접힌다 —
     * 「이번 주 소식」의 approxLabel 과 같은 규칙이다(js/living.js renderNewsSection). */
    var raw  = String(p.date || '').split('~')[0].trim();
    var when = /^\d{4}-\d{1,2}-\d{1,2}/.test(raw)
      ? raw.replace(/^\d{4}-/, '').replace(/-/g, '.')
      : raw.replace(/^\d{4}\s*년?\s*/, '');
    return '<div class="place-item" style="animation-delay:' + (Math.min(i, 12) * 0.045) + 's"' +
           ' onclick="openFestView(\'detail\',' + p.id + ')">' +
             thumb +
             '<div class="pi-content">' +
               '<div class="pi-name">' + (p.name || '') + '</div>' +
               '<div class="pi-meta">' +
                 (badge ? '<span class="badge ' + badge.cls + '" style="font-size:10px;margin-right:5px">' + badge.text + '</span>' : '') +
                 (p.address || '').split(' ').slice(1, 3).join(' ') +
               '</div>' +
             '</div>' +
             '<div class="pi-right" style="display:flex;align-items:center;gap:4px">' +
               (when ? '<span style="font-size:11px;color:var(--text-muted)">' + when + '</span>' : '') +
               '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' +
             '</div>' +
           '</div>';
  }).join('');

  if (more) {
    /* 추천 탭 목록과 같은 .tourism-more-btn 을 쓴다(css/00-base.css:294).
     * onclick 속성이 아니라 프로퍼티로 다는 이유는 renderTourismList 와 같다 —
     * 문자열 onclick 은 전역 함수만 부를 수 있고, 여기서는 재렌더 한 줄이면 된다. */
    var btn = document.createElement('div');
    btn.className = 'tourism-more-btn';
    btn.innerHTML = '더보기 <span style="color:var(--primary);font-weight:700">+' +
                    (rows.length - FEST_ALL_PREVIEW) + '</span>';
    btn.onclick = function () { renderFestivalAll(true); };
    list.appendChild(btn);
  }
}

/* '행사 전체' 로 데려다 주는 유일한 진입점이다.
 * 홈 탭 '행사 → 전체보기'(js/home.js) 와 햄버거 메뉴가 함께 쓴다.
 *
 * 펼치지 않고 스크롤만 한다. 이 섹션의 기본은 5개 + 더보기이고(사용자 지시),
 * 어디서 들어오든 같은 모습이어야 한다 — 입구에 따라 5개였다 전체였다 하면
 * '더보기' 가 있다 없다 한다.
 *
 * 이미 소식 탭에 있으면 go() 를 부르지 않는다. go('living') 은 renderLivingPage() 로
 * 목록 전체를 다시 그리고 scrollTop 을 0 으로 되돌리므로, 같은 탭에서 부르면
 * 화면이 한 번 튀었다가 다시 내려온다. */
function goFestivalAll() {
  if (typeof closeMenu === 'function') closeMenu();
  var pg = document.getElementById('page-living');
  var here = pg && pg.classList.contains('active');
  if (here) { _scrollToFestivalAll(); return; }
  go('living');
  /* go() → renderLivingPage() 가 목록을 다시 그린 뒤라야 높이가 확정된다.
   * menuGoLiving() 과 같은 지연 폭을 쓴다. */
  setTimeout(_scrollToFestivalAll, 280);
}

function _scrollToFestivalAll() {
  var sec = document.getElementById('festival-all-section');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
