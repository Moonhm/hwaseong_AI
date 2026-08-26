/* ============================================================================
 * js/tourism.js — 관광 탭 — 서브탭·목록·숙박/캠핑/템플스테이·축제 상세
 *
 * 왜 따로 있나: 관광 탭 안에서만 닫히는 렌더러 묶음이다. THEME_TAGS·_tourismSub 가 여기서만 쓰인다.
 * 함께 볼 것:   숙박·캠핑·템플스테이는 js/convenience.js 의 CONVENIENCE 구조에 의존한다(키 이름이 바뀌면 조용히 0건이 된다).
 *
 * index.html 인라인 <script> 2859~3245줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 관광 서브탭 전환 ── */
var _tourismSub = 'all';
function switchTourismSub(el, tab) {
  document.querySelectorAll('.tourism-subnav .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  _tourismSub = tab;

  var sections = ['tourism-default','tourism-stay','tourism-camp','tourism-temple','tourism-tour'];
  sections.forEach(function(id) {
    var el2 = document.getElementById(id);
    if (el2) el2.style.display = 'none';
  });

  /* 'festival' 은 2026-08-26 에 소식 탭으로 옮겨져 이 서브내비에 칩이 없다
   * (js/living.js renderFestivalAll). 옛 링크가 tab='festival' 을 넘길 수 있으니
   * 분기는 남겨 두되, 새로 여기에 연결하지 말 것 — 축제의 집은 이제 소식 탭이다. */
  if (tab === 'all' || tab === 'festival' || tab === 'spot' || tab === 'heritage') {
    _resetThemeChips();
    var def = document.getElementById('tourism-default');
    if (def) def.style.display = 'block';
    /* ⚠ 여기서 #tourism-festival-header / #festival-scroll-wrap 을 건드리지 말 것.
     * 2026-08-26 에 '이번 달 축제' 캐러셀을 소식 탭으로 옮겼다(index.html #page-living).
     * id 는 그대로라 예전 코드가 그대로 돌면 추천 탭에서 서브탭을 누를 때마다
     * '다른 탭'의 캐러셀이 숨겨진다. 실제로 옮기면서 이 네 줄 쌍을 전부 걷어냈다. */
    var thdr   = document.getElementById('tourism-theme-header');
    var tchips = document.getElementById('tourism-theme-chips');
    var plist  = document.getElementById('tourism-place-list');

    /* 큐레이션 3종(#dl-sections — 인기·세대별·요즘 뜨는 곳)은 '인기' 에서만
     * 보인다. 관광지·문화재는 목적이 뚜렷한 목록이라 그 위에 큐레이션이 끼면 방해가 된다.
     * 데이터는 보일 때 처음 한 번만 받는다(js/datalab.js 가 캐시한다).
     * ⚠ renderDlPopular() 를 이 블록 안에서 부른다 — 2026-08-26 에 '인기 있는 곳'이
     *   서브탭 바깥에서 #dl-sections 안으로 들어왔다. 밖에서 부르면 숨어 있는
     *   #dl-popular-body 를 매 서브탭 전환마다 헛되이 다시 그린다. */
    var dls = document.getElementById('dl-sections');
    if (dls) {
      var showDl = (tab === 'all');
      dls.style.display = showDl ? 'block' : 'none';
      if (showDl) {
        if (typeof renderDlPopular === 'function') renderDlPopular();
        if (typeof renderDatalabSections === 'function') renderDatalabSections();
      }
    }

    if (tab === 'festival') {
      if (thdr)  thdr.style.display  = 'none';
      if (tchips) tchips.style.display = 'none';
      if (plist) plist.style.display = 'block';
      renderTourismList('festival-only');
    } else if (tab === 'spot') {
      if (thdr)  thdr.style.display  = 'block';
      if (tchips) tchips.style.display = 'flex';
      if (plist) plist.style.display = 'block';
      renderTourismList('tourist-only');
    } else if (tab === 'heritage') {
      /* 문화재는 테마 태그(바다·자연·가족)와 맞지 않아 테마 칩을 숨긴다. */
      if (thdr)  thdr.style.display  = 'none';
      if (tchips) tchips.style.display = 'none';
      if (plist) plist.style.display = 'block';
      renderTourismList('heritage-only');
    } else {
      /* '인기'(all) 는 큐레이션만 보여 준다 (2026-08-26 사용자 지시).
       * 여기 있던 '테마별 추천' + 그 목록은 '관광지' 서브탭이 그대로 갖고 있어
       * 두 탭이 같은 것을 보여 주고 있었다. 칩만 숨기고 목록을 남기면
       * 필터 없는 전체 목록이 덩그러니 남아 '인기' 라는 이름과 어긋난다 —
       * 셋을 함께 숨긴다. renderTourismList 도 부르지 않는다(그릴 대상이 없다). */
      if (thdr)  thdr.style.display  = 'none';
      if (tchips) tchips.style.display = 'none';
      if (plist) plist.style.display = 'none';
    }
  } else if (tab === 'tour') {
    /* 2026-08-26 사용자 지시로 '인기' 큐레이션에서 떼어낸 전용 서브탭.
     * 숙박·캠핑과 같은 모양이다 — 전용 컨테이너를 켜고 자기 렌더러만 부른다.
     * renderDlCityTour 는 js/datalab.js 소속이고 데이터를 캐시하므로
     * 서브탭을 오갈 때마다 다시 받지 않는다. */
    var tr = document.getElementById('tourism-tour');
    if (tr) {
      tr.style.display = 'block';
      if (typeof renderDlCityTour === 'function') renderDlCityTour();
    }
  } else if (tab === 'stay') {
    var s = document.getElementById('tourism-stay');
    if (s) { s.style.display = 'block'; renderHotels(); }
  } else if (tab === 'camp') {
    var c = document.getElementById('tourism-camp');
    if (c) { c.style.display = 'block'; renderCamping(); }
  } else if (tab === 'temple') {
    var t = document.getElementById('tourism-temple');
    if (t) { t.style.display = 'block'; renderTempleStay(); }
  }
}

/* ── 숙박 렌더 ── */
function renderHotels() {
  var el = document.getElementById('tourism-stay');
  if (!el || typeof CONVENIENCE === 'undefined') return;
  var hotelHtml = '<div style="padding:16px var(--px) 8px;border-bottom:1px solid var(--border)">'
    + '<div class="section-title">관광호텔</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">화성시 공식 등록 ' + (CONVENIENCE.hotels ? CONVENIENCE.hotels.length : 0) + '곳</div>'
    + '</div>'
    + (CONVENIENCE.hotels || []).map(function(h) {
        var gradeClass = h.grade === '4성급' ? 'grade-4' : h.grade === '3성급' ? 'grade-3' : h.grade === '2성급' ? 'grade-2' : h.grade === '1성급' ? 'grade-1' : 'grade-0';
        return '<div class="hotel-item" onclick="goMapCat(\'hotel\')">'
          + '<div class="hotel-icon">🏨</div>'
          + '<div class="pi-content">'
          + '<div class="pi-name" style="flex-wrap:nowrap;gap:8px">' + h.name
          + (h.grade !== '-' ? ' <span class="hotel-grade ' + gradeClass + '">' + h.grade + '</span>' : '')
          + '</div>'
          + '<div class="pi-meta">' + h.addr + '</div>'
          + '</div>'
          + '<div class="pi-right" style="text-align:right"><div style="font-size:14px;font-weight:700;color:var(--text)">' + h.rooms + '</div><div style="font-size:10px;color:var(--text-muted)">객실</div></div>'
          + '</div>';
      }).join('');

  if (!CONVENIENCE.jebu || !CONVENIENCE.jebu.summary) {
    el.innerHTML = hotelHtml + '<div style="height:24px"></div>';
    return;
  }
  var s = CONVENIENCE.jebu.summary;
  var jebuHtml = '<div class="jebu-hero" onclick="toggleJebuList()">'
    + '<div class="jebu-hero-body">'
    + '<div class="jebu-hero-title">⛱️ 제부도 숙박</div>'
    + '<div class="jebu-hero-sub">서신면 해안길 일대 · 총 ' + s.total + '곳</div>'
    + '<div class="jebu-counts">'
    + '<div class="jebu-count-item"><div class="jebu-count-val">' + s.pension_outside + '</div><div class="jebu-count-lbl">관광펜션</div></div>'
    + '<div class="jebu-count-item"><div class="jebu-count-val">' + s.inside + '</div><div class="jebu-count-lbl">내부숙박</div></div>'
    + '<div class="jebu-count-item"><div class="jebu-count-val">' + s.minbak_inside + '</div><div class="jebu-count-lbl">민박(내)</div></div>'
    + '<div class="jebu-count-item"><div class="jebu-count-val">' + (s.minbak_nearby + s.nearby) + '</div><div class="jebu-count-lbl">인근</div></div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div id="jebu-list-section" style="display:none"></div>';

  el.innerHTML = hotelHtml + '<div style="height:20px"></div>'
    + '<div style="padding:16px var(--px) 8px;border-bottom:1px solid var(--border)">'
    + '<div class="section-title">제부도 숙박</div>'
    + '</div>'
    + jebuHtml
    + '<div style="height:24px"></div>';
}

var _jebuOpen = false;
function toggleJebuList() {
  _jebuOpen = !_jebuOpen;
  var sec = document.getElementById('jebu-list-section');
  if (!sec) return;
  if (!_jebuOpen) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  var c = CONVENIENCE.jebu;
  var buildList = function(items, label) {
    return '<div class="jebu-type-header">' + label + ' (' + items.length + '곳)</div>'
      + items.map(function(it) {
          return '<div class="place-item">'
            + '<div class="pi pi-tourist">⛱️</div>'
            + '<div class="pi-content"><div class="pi-name">' + it.name + '</div>'
            + '<div class="pi-meta">화성시 서신면 ' + it.addr + (it.tel ? ' · ' + it.tel : '') + '</div></div>'
            + '</div>';
        }).join('');
  };
  sec.innerHTML = buildList(c.pension_outside, '관광펜션')
    + buildList(c.inside, '내부 숙박')
    + buildList(c.nearby, '인근 숙박')
    + buildList(c.minbak_inside, '민박 (섬 내)')
    + buildList(c.minbak_nearby, '민박 (인근)');
}

/* ── 캠핑 렌더 ── */
function renderCamping() {
  var el = document.getElementById('tourism-camp');
  if (!el || typeof CONVENIENCE === 'undefined') return;
  if (!CONVENIENCE.camping) { el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>'; return; }
  el.innerHTML = '<div style="padding:16px var(--px) 8px;border-bottom:1px solid var(--border)">'
    + '<div class="section-title">캠핑장</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">화성시 등록 캠핑장 ' + CONVENIENCE.camping.length + '곳</div>'
    + '</div>'
    + CONVENIENCE.camping.map(function(c) {
        return '<div class="camp-item" onclick="goMapCat(\'camping\')">'
          + '<div class="camp-icon">⛺</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'
          + '<div style="font-size:15px;font-weight:600;color:var(--text)">' + c.name + '</div>'
          + (c.pub ? '<span class="camp-pub">공영</span>' : '')
          + '</div>'
          + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">'
          + '화성시 ' + c.addr + (c.tel ? ' · ' + c.tel : '') + '</div>'
          + '<span class="camp-fac">야영 ' + c.sites + '면</span> '
          + '<span class="camp-fac">' + c.fac + '</span>'
          + '</div>'
          + '</div>';
      }).join('')
    + '<div style="height:24px"></div>';
}

/* ── 템플스테이 렌더 ── */
function renderTempleStay() {
  var el = document.getElementById('tourism-temple');
  if (!el || typeof CONVENIENCE === 'undefined') return;
  var t = CONVENIENCE.templeStay;
  if (!t) { el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>'; return; }
  el.innerHTML = '<div style="padding:16px var(--px) 0">'
    + '<div class="section-title">템플스테이</div>'
    + '</div>'
    + '<div class="temple-card">'
    + '<div class="temple-hero">🏯</div>'
    + '<div class="temple-body">'
    + '<div class="temple-title">' + t.name + '</div>'
    + '<div class="temple-desc">' + t.desc + '</div>'
    + '<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">📍 화성시 ' + t.addr + '</div>'
    + '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">📞 ' + t.tel + ' · ⏰ ' + t.schedule + '</div>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px">운영 프로그램</div>'
    + '<div class="temple-prog">'
    + t.programs.map(function(p) {
        return '<div class="temple-prog-item"><span style="color:var(--primary);font-size:14px">•</span><span>' + p + '</span></div>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="height:24px"></div>';
}

/* ── 테마 필터 (관광) ── */
const THEME_TAGS = { sea:['바다'], nature:['자연'], history:['역사','세계문화유산'], family:['가족','체험','자연','꽃'] };
function pickTheme(el, theme) {
  document.querySelectorAll('#tourism-theme-chips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTourismList(theme);
}

/* 테마를 무시하고 목록을 다시 그리는 경로에서 칩 표시를 '전체'로 되돌린다.
 * 그렇지 않으면 '역사'가 선택된 것처럼 보이는데 목록은 전체가 나오는 불일치가 생긴다. */
function _resetThemeChips() {
  document.querySelectorAll('#tourism-theme-chips .chip').forEach(function (c, i) {
    c.classList.toggle('active', i === 0);
  });
}

function renderTourismList(theme, expanded) {
  const list = document.getElementById('tourism-place-list');
  if (!list || typeof PLACES === 'undefined' || typeof CATEGORY_CONFIG === 'undefined') return;
  let items;
  if (theme === 'festival-only') {
    items = PLACES.filter(p => p.category === 'festival');
  } else if (theme === 'tourist-only') {
    items = PLACES.filter(p => p.category === 'tourist');
  } else if (theme === 'heritage-only') {
    items = PLACES.filter(p => p.category === 'heritage');
  } else {
    /* 'restaurant' 는 PLACES 에 0건이다 — 맛집은 CONVENIENCE(생활 탭) 소속이라 여기 오지 않는다.
     * 대신 heritage 42건이 빠져 있어 '전체'에서 문화재가 통째로 안 보였다. (2026-08-26) */
    const cats = ['tourist','festival','heritage'];
    items = PLACES.filter(p => cats.includes(p.category));
    if (theme !== 'all' && THEME_TAGS[theme]) {
      const tags = THEME_TAGS[theme];
      items = items.filter(p => (p.tags || []).some(t => tags.includes(t)));
    }
  }
  if (!items.length) { list.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">준비 중이에요</div>'; return; }

  const PREVIEW = 5;
  const collapsible = theme === 'all' && items.length > PREVIEW;
  const visible = collapsible && !expanded ? items.slice(0, PREVIEW) : items;

  function itemHtml(p, i) {
    const cfg = CATEGORY_CONFIG[p.category];
    const isCurrency = (p.tags || []).includes('가맹점');
    /* 예전에는 `p.category === 'tourist'` 일 때만 사진을 걸었다. 그 탓에 축제 50장·
       문화재 43장을 받아 놓고도 이 목록에서 이모지만 보였다 (2026-08-26 감사).
       카테고리가 아니라 '사진이 실제로 있는가' 로 판단한다 — 없으면 기존 이모지 타일. */
    const iconHtml = photoThumb(p, 56, iconContent(p.category))
      || `<div class="pi ${iconClass(p.category)}">${iconContent(p.category)}</div>`;
    return `
      <div class="place-item" style="animation-delay:${Math.min(i, 12) * 0.045}s"
        onclick="${p.category === 'festival'
          ? 'openFestView(\'detail\',' + p.id + ')'
          : 'goMapFocus(' + p.lat + ',' + p.lng + ',4,' + p.id + ')'}">
        ${iconHtml}
        <div class="pi-content">
          <div class="pi-name">
            ${p.name}
            ${isCurrency ? '<span class="currency-tag">희망화성지역화폐</span>' : ''}
          </div>
          <div class="pi-meta">${(p.address || '').split(' ').slice(1,3).join(' ')} · ${(cfg || {label:''}).label}</div>
          ${p.rating ? `<div style="display:flex;align-items:center;gap:3px;margin-top:2px"><span class="pi-stars">${ratingStars(p.rating)}</span><span class="pi-rating">${p.rating}</span><span style="font-size:10px;color:var(--text-muted)">(${(p.reviewCount||0).toLocaleString()})</span></div>` : ''}
        </div>
        <div class="pi-right" style="display:flex;align-items:center;gap:4px">
          ${p.date ? '<span style="font-size:11px;color:var(--text-muted)">' + p.date.split('~')[0].trim().replace(/^\d{4}-/,'').replace(/-/g,'.') + '</span>' : ''}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>`;
  }

  list.innerHTML = visible.map(itemHtml).join('');

  if (collapsible && !expanded) {
    const btn = document.createElement('div');
    btn.className = 'tourism-more-btn';
    btn.innerHTML = `더보기 <span style="color:var(--primary);font-weight:700">+${items.length - PREVIEW}</span>`;
    btn.onclick = function() { renderTourismList(theme, true); };
    list.appendChild(btn);
  }
}

function ratingStars(r) {
  var full = Math.floor(r), half = (r - full) >= 0.3 ? 1 : 0, empty = 5 - full - half;
  var hs = '<span style="position:relative;display:inline-block"><span style="color:#D1D5DB">★</span><span style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;color:#F59E0B">★</span></span>';
  return '<span style="color:#F59E0B">' + '★'.repeat(full) + '</span>' + (half ? hs : '') + (empty ? '<span style="color:#D1D5DB">' + '★'.repeat(empty) + '</span>' : '');
}
function iconClass(cat) {
  const map = { tourist:'pi-tourist', heritage:'pi-heritage', restaurant:'pi-food', festival:'pi-festival', localcurrency:'pi-currency', parking:'pi-parking' };
  return map[cat] || 'pi-tourist';
}
function iconContent(cat) {
  if (cat === 'localcurrency') return '<img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:64%;height:64%;object-fit:contain;display:block">';
  const map = { tourist:'🎡', heritage:'🏛️', restaurant:'🍽️', festival:'🎉', parking:'P' };
  return map[cat] || '📍';
}

/* ── 축제 상세 ── */
/* festival의 status/date는 data.js에서 추가됐으나, 파싱 폴백도 유지 */
function getFestivalMeta(place) {
  var status = place.status || 'upcoming';
  var date   = place.date   || '';
  /* date가 없으면 desc에서 추출 시도 */
  if (!date && place.desc) {
    var parts = place.desc.split('|');
    if (parts.length > 1) date = parts[1].trim();
  }
  return { status: status, date: date };
}

function showFestivalDetail(id) {
  const place = PLACES.find(p => p.id === id);
  if (!place) return;

  document.getElementById('view-tourism-list').style.display = 'none';
  document.getElementById('view-calendar').style.display = 'none';
  /* ⚠ #view-datalab 도 반드시 함께 숨긴다. 이 줄이 없어서, 데이터랩 '전체 보기'
   * (세대별로 많이 찾는 곳 → 만세구 · 30대 27위 '화성뱃놀이축제')에서 축제를 누르면
   * 데이터랩 화면이 그대로 남고 상세는 그 아래에 그려져, 눌러도 아무 일이 없는 것처럼
   * 보였다. 추천 탭의 네 뷰는 서로 배타여야 한다 —
   * #view-tourism-list · #view-calendar · #view-festival-detail · #view-datalab. */
  var _dlv = document.getElementById('view-datalab');
  if (_dlv) _dlv.style.display = 'none';
  /* _dlView 는 '지금 데이터랩 어느 화면인가'를 들고 있다. display 만 내리고
   * 이 값을 남기면 dlLoad 의 늦은 콜백이 `if (_dlView !== 'popular') return;`
   * 검사를 통과해 숨긴 뷰를 다시 그린다(js/datalab.js). 같이 내린다. */
  if (typeof _dlView !== 'undefined') _dlView = null;
  document.getElementById('view-festival-detail').style.display = 'block';

  /* BUG-9: 인덱스 기반 이미지 클래스 */
  const IMG_CLASSES_FD = ['img-sunset','img-sea','img-night','img-peace','img-dino'];
  const festivals = PLACES.filter(p => p.category === 'festival');
  const festIdx = festivals.findIndex(f => f.id === id);
  const imgClass = IMG_CLASSES_FD[Math.max(0, festIdx) % IMG_CLASSES_FD.length];

  const { status, date } = getFestivalMeta(place);
  const isOngoing = (typeof festStatus === 'function') && festStatus(place) === 'ongoing';

  const descParts = place.desc ? place.desc.split('|').map(s => s.trim()) : [];
  const detailDate = descParts.length > 1 ? descParts[1] : (descParts[0] || '');
  const shortAddr  = (place.address || '').replace('경기도 화성시 ', '');
  const YEYAK_URL  = 'https://yeyak.hscity.go.kr/1012/3008/cultureAllList.do';

  document.getElementById('fd-content').innerHTML = `
    <div class="fd-hero ${imgClass}">
      ${hasPhoto(place) ? `<img class="fd-hero-img" src="${placePhotoSrc(place)}" alt=""
             decoding="async" onerror="this.style.display='none'">` : ''}
      <div class="fd-hero-body">
        <div class="fd-hero-badge">${isOngoing ? '🎪 진행중' : '📅 예정'}</div>
        <div class="fd-hero-title">${place.name}</div>
        ${detailDate ? `<div class="fd-hero-date">📅 ${detailDate}</div>` : ''}
      </div>
    </div>
    <div class="fd-body">
      <div class="fd-info-card">
        <div class="fd-info-row">
          <div class="fd-info-icon">📍</div>
          <div>
            <div class="fd-info-label">장소</div>
            <div class="fd-info-val">${shortAddr}</div>
          </div>
        </div>
        ${date ? `
        <div class="fd-info-row">
          <div class="fd-info-icon">🗓️</div>
          <div>
            <div class="fd-info-label">일정</div>
            <div class="fd-info-val">${date}</div>
          </div>
        </div>` : ''}
        <div class="fd-info-row">
          <div class="fd-info-icon">🔗</div>
          <div>
            <div class="fd-info-label">예약 · 상세 정보</div>
            <a class="fd-info-link" href="${YEYAK_URL}" target="_blank" rel="noopener">화성시 문화생활 예약 →</a>
          </div>
        </div>
      </div>
    </div>
    <div class="fd-nearby">
      <button class="fd-nearby-btn" onclick="goMapCat('mobeom')">
        <span class="nb-icon">🍽️</span>주변 맛집
      </button>
      <button class="fd-nearby-btn" onclick="goMapCat('parking')">
        <span class="nb-icon">🅿️</span>주차장
      </button>
      <button class="fd-nearby-btn" onclick="findNearby(${place.lat},${place.lng})">
        <span class="nb-icon"><img src="img/gyeonggi_currency_logo.png" style="width:20px;height:20px;object-fit:contain" alt=""></span>가맹점
      </button>
    </div>
    <div class="fd-cta">
      <a class="fd-cta-btn" href="${YEYAK_URL}" target="_blank" rel="noopener">🎪 예약하기</a>
    </div>`;

  document.getElementById('page-tourism').scrollTop = 0;
}

function hideFestivalDetail() {
  document.getElementById('view-festival-detail').style.display = 'none';
  document.getElementById('view-tourism-list').style.display = 'block';
}

/* ══════════════════════════════════════════════════════════════════════════
   축제 상세·캘린더를 '어느 탭에서 열었는지' 기억한다 (2026-08-26)

   이 두 화면은 #page-tourism '안의' 뷰다. 소식 탭에서 열면 화면은 뜨지만
   상단이 추천 탭 헤더라 '← 관광'이라고 적혀 있었고, 뒤로가기를 누르면
   소식이 아니라 추천 탭에 남았다 — 사용자 지적.

   뷰를 소식 탭으로 복제하지 않고 '온 곳'만 기억한다. 복제하면 축제 상세가
   두 벌이 되어 한쪽만 고치는 사고가 난다.

   ⚠ hideCalendar()/hideFestivalDetail() 자체는 건드리지 않는다. 그 둘은
     js/calendar.js:170 에서 '캘린더를 닫고 상세를 연다'는 뜻으로도 쓰인다.
     거기서 탭까지 옮겨 버리면 상세가 열리기 전에 소식으로 튕긴다.
     탭 복귀는 뒤로가기 버튼 전용 backFrom*() 에만 넣는다.
   ══════════════════════════════════════════════════════════════════════════ */
var _festViewFrom   = null;   /* 'page-living' | 'page-home' | 'page-map' | null(추천에서 열었다) */
var _festViewScroll = 0;      /* 돌아갈 탭의 스크롤 위치 — go() 가 0 으로 밀어 버린다 */

var _FEST_BACK = {
  'page-living': { label: '← 소식', page: 'living' },
  'page-home':   { label: '← 홈',   page: 'home'   },
  'page-map':    { label: '← 지도', page: 'map'    },
};

function _setFestBackLabel() {
  var info = _FEST_BACK[_festViewFrom];
  var text = info ? info.label : '← 추천';   /* 하단 내비 이름이 '추천'이다. '관광'은 옛 이름 */
  ['#view-calendar .back-btn', '#view-festival-detail .back-btn'].forEach(function (sel) {
    var b = document.querySelector(sel);
    if (b) b.textContent = text;
  });
}

/* 축제 상세·캘린더로 가는 공용 진입점. kind: 'detail' | 'calendar' */
function openFestView(kind, id) {
  var cur  = document.querySelector('.page.active');
  var from = cur ? cur.id : null;
  _festViewFrom   = (from && from !== 'page-tourism') ? from : null;
  _festViewScroll = (_festViewFrom && cur) ? cur.scrollTop : 0;

  var open = function () {
    _setFestBackLabel();
    if (kind === 'calendar') showCalendar();
    else if (typeof showFestivalDetail === 'function') showFestivalDetail(id);
  };

  if (!_festViewFrom) { open(); return; }   /* 이미 추천 탭이면 탭 전환이 필요 없다 */

  /* ⚠ go() 뒤에 setTimeout 을 두면 안 된다. 여기 있던 260ms 지연 때문에
   * 소식에서 행사를 누르면 추천 탭 '목록'이 한 번 번쩍 뜬 뒤 상세로 바뀌었다
   * (사용자 지적). go('tourism') 은 뷰 display 교체와 목록 렌더까지 전부
   * 동기로 끝내므로(js/nav.js), 바로 뒤에서 상세로 덮으면 그 사이에 브라우저가
   * 그릴 프레임 자체가 없다. 지연은 원래 필요하지 않았고, 옮겨 오기 전
   * 호출부들이 복사해 쓰던 값을 그대로 들고 온 것이었다.
   *
   * 슬라이드 전환(_playPageTransition)은 #page-tourism 에 클래스만 거는 방식이라
   * 안쪽 뷰를 먼저 바꿔 둬도 상관없다 — 상세가 실린 채로 미끄러져 들어온다. */
  go('tourism');
  open();
}

/* 뒤로가기 버튼 전용. 온 곳이 다른 탭이면 그 탭으로, 아니면 추천 탭 목록으로. */
function _returnFromFestView() {
  var info = _FEST_BACK[_festViewFrom];
  if (!info) { _setFestBackLabel(); return; }
  var scroll = _festViewScroll;
  _festViewFrom = null; _festViewScroll = 0;
  _setFestBackLabel();
  go(info.page);
  /* go() 는 scrollTop 을 0 으로 밀고 living 이면 renderLivingPage() 까지 동기로 끝낸다
   * (js/nav.js). 그러니 리턴 직후에 복원하면 된다 — 여기 있던 40ms 지연 때문에
   * 뒤로가기 직후 두 프레임 동안 맨 위가 보였다가 원래 자리로 툭 튀었다. */
  var pg = document.getElementById('page-' + info.page);
  if (pg) pg.scrollTop = scroll;
}

function backFromCalendar()       { hideCalendar();       _returnFromFestView(); }
function backFromFestivalDetail() { hideFestivalDetail(); _returnFromFestView(); }

function showCalendar() {
  document.getElementById('view-tourism-list').style.display = 'none';
  document.getElementById('view-calendar').style.display = 'block';
  document.getElementById('view-festival-detail').style.display = 'none';
  /* showFestivalDetail 과 같은 이유로 데이터랩도 닫는다 — 네 뷰는 서로 배타다. */
  var _dlv2 = document.getElementById('view-datalab');
  if (_dlv2) _dlv2.style.display = 'none';
  if (typeof _dlView !== 'undefined') _dlView = null;
  /* 초기 진입 시 동적 렌더 (하드코딩된 날짜 제거 후 첫 호출) */
  if (!_calInitDone) { _calInitDone = true; _renderCalendar(); }
}
function hideCalendar() {
  document.getElementById('view-calendar').style.display = 'none';
  document.getElementById('view-tourism-list').style.display = 'block';
}

/* ══════════════════════════════════════════════════
   관광 탭 재클릭 리셋 (2026-08-25)
   핵심은 switchTourismSub(allChip,'all') 재사용이다 — 칩·4개 섹션 display·헤더/스크롤/테마칩
   display·_resetThemeChips()·renderTourismList('all') 을 한 번에 일치시킨다(js/tourism.js:13-61).
   renderTourismList('all') 만 단독 호출하면 BUG-7 이 그대로 재발한다(칩은 '숙박'인데 목록은 전체).
   BUG-7 의 본질은 '서브탭을 유지해야 한다'가 아니라 '칩과 내용이 일치해야 한다' 였다.

   localStorage 는 한 줄도 만지지 않는다 — 관광 탭은 즐겨찾기를 읽지도 쓰지도 않는다.
   PLACES/CONVENIENCE 는 동기 상수라 네트워크를 타는 경로가 아예 없다.
══════════════════════════════════════════════════ */
function resetTourismPage() {
  /* ⓪ 내 위치 추천 → 원본 CTA (2026-08-26 홈에서 이 탭으로 옮겨 왔다).
   *    진행 중인 GPS/주차장 fallback fetch 는 세대 증가로 무효화한다.
   *    새 GPS 요청은 하지 않는다 — CTA 는 onclick 대기 상태일 뿐이다. */
  if (typeof _nearbyGen !== 'undefined') _nearbyGen++;
  var _nb = document.getElementById('nearby-section');
  if (_nb && typeof _homeNearbyInitHtml !== 'undefined' && _homeNearbyInitHtml != null) {
    _nb.innerHTML = _homeNearbyInitHtml;
  }

  /* ① 뷰 → 목록. go() 도 하지만(js/nav.js:32-34) 이 함수만 봐도 완결되도록 멱등하게 둔다. */
  var _fd = document.getElementById('view-festival-detail');
  var _cv = document.getElementById('view-calendar');
  var _vl = document.getElementById('view-tourism-list');
  if (_fd) _fd.style.display = 'none';
  if (_cv) _cv.style.display = 'none';
  if (_vl) _vl.style.display = 'block';

  /* ② 축제 상세 본문 비우기. showFestivalDetail 은 display:block(:309) 을 innerHTML 대입(:325)
   *    보다 먼저 해서, 안 비우면 다음에 열 때 옛 축제가 한 프레임 비친다.
   *    첫 진입 시엔 비어 있다(index.html:217). 항상 재생성되므로 비워도 부작용 없다. */
  var _fdc = document.getElementById('fd-content');
  if (_fdc) _fdc.innerHTML = '';

  /* ③ 제부도 목록 접기. renderHotels(js/tourism.js:102)는 DOM 을 display:none 으로 재생성하면서
   *    전역 _jebuOpen 은 true 로 남긴다 → toggleJebuList(:114)가 false 로 뒤집고 :117 이 이미
   *    숨겨진 것을 또 숨겨 '첫 클릭 먹통'이 된다. 전역을 반드시 함께 되돌린다. */
  _jebuOpen = false;
  var _jb = document.getElementById('jebu-list-section');
  if (_jb) { _jb.style.display = 'none'; _jb.innerHTML = ''; }

  /* ③-b 축제 뷰의 '온 곳' 기억도 지운다 (2026-08-26). 소식에서 상세를 열어 둔 채
   *     하단 내비로 추천 탭을 누르면 뷰는 목록으로 돌아가는데 _festViewFrom 만
   *     'page-living' 으로 남아, 다음 뒤로가기가 엉뚱하게 소식으로 튄다. */
  _festViewFrom = null; _festViewScroll = 0;
  if (typeof _setFestBackLabel === 'function') _setFestBackLabel();

  /* ④ 서브탭 → '전체' (index.html:164 가 첫 진입의 active). 이 한 줄이 리셋의 몸통이다. */
  var _allChip = document.querySelector('.tourism-subnav .chip[data-sub="all"]');
  if (_allChip) {
    switchTourismSub(_allChip, 'all');
  } else {                       /* 마크업이 바뀐 비상 경로 */
    _tourismSub = 'all';
    _resetThemeChips();
    renderTourismList('all');    /* expanded 미전달 = 5개 미리보기 + '더보기 +N' (js/tourism.js:225-227,266-272) */
  }

  /* ⑤ 가로 스크롤 — 첫 진입은 왼쪽 끝.
   *    #festival-scroll-list 는 2026-08-26 에 소식 탭으로 옮겨서 여기서 빠졌다.
   *    그 리셋은 js/living.js 의 resetLivingPage() 가 맡는다. */
  var _sn = document.querySelector('.tourism-subnav');
  if (_sn) _sn.scrollLeft = 0;
  var _tc = document.getElementById('tourism-theme-chips');
  if (_tc) _tc.scrollLeft = 0;

  /* ⑥ 캘린더 → 오늘 달.
   *    _calYear/_calMonth 만 되돌리면 안 된다. showCalendar(js/tourism.js:391)는
   *    if(!_calInitDone) 이라 이미 true 면 재렌더를 건너뛰고, 변수는 8월인데 화면은
   *    사용자가 넘겨둔 12월 그대로인 불일치가 생긴다(그 상태에서 › 를 누르면 9월로 점프).
   *    셋을 항상 세트로 되돌린다. 지금 _renderCalendar() 를 부를 필요는 없다 —
   *    #view-calendar 는 display:none 이라 낭비다. 다음 showCalendar() 가 그린다.
   *    앱을 오래 켜둔 사이 달이 바뀌었을 수 있어 new Date() 로 다시 읽는다. */
  if (typeof _calYear !== 'undefined') {
    var _t = new Date();
    _calYear     = _t.getFullYear();
    _calMonth    = _t.getMonth();
    _calInitDone = false;
  }
  /* #calendar-grid 는 절대 innerHTML='' 로 비우지 마라 — index.html:231 의 .cal-day-hd
   * 요일 7칸까지 날아가고 _renderCalendar(js/calendar.js:134-165)는 그걸 다시 만들지 않는다.
   * js/calendar.js:126 이 .cal-day 만 지우므로 위 _calInitDone=false 로 충분하다. */
}
