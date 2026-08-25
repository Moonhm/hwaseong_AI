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

  var sections = ['tourism-default','tourism-stay','tourism-camp','tourism-temple'];
  sections.forEach(function(id) {
    var el2 = document.getElementById(id);
    if (el2) el2.style.display = 'none';
  });

  if (tab === 'all' || tab === 'festival' || tab === 'spot') {
    _resetThemeChips();
    var def = document.getElementById('tourism-default');
    if (def) def.style.display = 'block';
    var fhdr   = document.getElementById('tourism-festival-header');
    var fwrap  = document.getElementById('festival-scroll-wrap');
    var thdr   = document.getElementById('tourism-theme-header');
    var tchips = document.getElementById('tourism-theme-chips');
    if (tab === 'festival') {
      if (fhdr)  fhdr.style.display  = 'block';
      if (fwrap) fwrap.style.display = 'block';
      if (thdr)  thdr.style.display  = 'none';
      if (tchips) tchips.style.display = 'none';
      renderTourismList('festival-only');
    } else if (tab === 'spot') {
      if (fhdr)  fhdr.style.display  = 'none';
      if (fwrap) fwrap.style.display = 'none';
      if (thdr)  thdr.style.display  = 'block';
      if (tchips) tchips.style.display = 'flex';
      renderTourismList('tourist-only');
    } else {
      if (fhdr)  fhdr.style.display  = 'block';
      if (fwrap) fwrap.style.display = 'block';
      if (thdr)  thdr.style.display  = 'block';
      if (tchips) tchips.style.display = 'flex';
      renderTourismList('all');
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
    + '<div class="jebu-hero-title">⛱ 제부도 숙박</div>'
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
            + '<div class="pi pi-tourist">⛱</div>'
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
  if (!CONVENIENCE.camping) { el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>'; return; }
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
  if (!t) { el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>'; return; }
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
  } else {
    const cats = ['tourist','restaurant','festival'];
    items = PLACES.filter(p => cats.includes(p.category));
    if (theme !== 'all' && THEME_TAGS[theme]) {
      const tags = THEME_TAGS[theme];
      items = items.filter(p => (p.tags || []).some(t => tags.includes(t)));
    }
  }
  if (!items.length) { list.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">데이터 준비 중입니다</div>'; return; }

  const PREVIEW = 5;
  const collapsible = theme === 'all' && items.length > PREVIEW;
  const visible = collapsible && !expanded ? items.slice(0, PREVIEW) : items;

  function itemHtml(p, i) {
    const cfg = CATEGORY_CONFIG[p.category];
    const isCurrency = (p.tags || []).includes('가맹점');
    const iconHtml = p.category === 'tourist'
      ? `<div style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;
                     background:#FFF7ED;position:relative;display:flex;align-items:center;
                     justify-content:center;font-size:22px">
           <span>🏛</span>
           <img src="${placePhotoSrc(p)}" alt="" loading="lazy" decoding="async"
                width="56" height="56"
                style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
                onerror="this.style.display='none'">
         </div>`
      : `<div class="pi ${iconClass(p.category)}">${iconContent(p.category)}</div>`;
    return `
      <div class="place-item" style="animation-delay:${Math.min(i, 12) * 0.045}s"
        onclick="${p.category === 'festival'
          ? 'showFestivalDetail(' + p.id + ')'
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
  const map = { tourist:'pi-tourist', restaurant:'pi-food', festival:'pi-festival', localcurrency:'pi-currency', parking:'pi-parking' };
  return map[cat] || 'pi-tourist';
}
function iconContent(cat) {
  if (cat === 'localcurrency') return '<img src="img/gyeonggi_currency_logo.png" alt="경기지역화폐" style="width:64%;height:64%;object-fit:contain;display:block">';
  const map = { tourist:'🏛', restaurant:'🍽', festival:'🎉', parking:'P' };
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
  document.getElementById('view-festival-detail').style.display = 'block';

  /* BUG-9: 인덱스 기반 이미지 클래스 */
  const IMG_CLASSES_FD = ['img-sunset','img-sea','img-night','img-peace','img-dino'];
  const festivals = PLACES.filter(p => p.category === 'festival');
  const festIdx = festivals.findIndex(f => f.id === id);
  const imgClass = IMG_CLASSES_FD[Math.max(0, festIdx) % IMG_CLASSES_FD.length];

  const { status, date } = getFestivalMeta(place);
  const isOngoing = status === 'ongoing';

  const descParts = place.desc ? place.desc.split('|').map(s => s.trim()) : [];
  const detailDate = descParts.length > 1 ? descParts[1] : (descParts[0] || '');
  const shortAddr  = (place.address || '').replace('경기도 화성시 ', '');
  const YEYAK_URL  = 'https://yeyak.hscity.go.kr/1012/3008/cultureAllList.do';

  document.getElementById('fd-content').innerHTML = `
    <div class="fd-hero ${imgClass}">
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
          <div class="fd-info-icon">🗓</div>
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
      <button class="fd-nearby-btn" onclick="goMapFocus(${place.lat},${place.lng},5,${place.id})">
        <span class="nb-icon"><svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg></span>지도 보기
      </button>
      <button class="fd-nearby-btn" onclick="goMapCat('mobeom')">
        <span class="nb-icon">🍽</span>주변 맛집
      </button>
      <button class="fd-nearby-btn" onclick="goMapCat('parking')">
        <span class="nb-icon">🅿</span>주차장
      </button>
      <button class="fd-nearby-btn" onclick="findNearby(${place.lat},${place.lng})">
        <span class="nb-icon"><img src="img/gyeonggi_currency_logo.png" style="width:20px;height:20px;object-fit:contain" alt=""></span>가맹점
      </button>
    </div>
    <div class="fd-cta">
      <div class="fd-cta-btn outline" onclick="goMapFocus(${place.lat},${place.lng},5,${place.id})"><svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg> 지도 보기</div>
      <a class="fd-cta-btn" href="${YEYAK_URL}" target="_blank" rel="noopener">🎪 예약하기</a>
    </div>`;

  document.getElementById('page-tourism').scrollTop = 0;
}

function hideFestivalDetail() {
  document.getElementById('view-festival-detail').style.display = 'none';
  document.getElementById('view-tourism-list').style.display = 'block';
}

function showCalendar() {
  document.getElementById('view-tourism-list').style.display = 'none';
  document.getElementById('view-calendar').style.display = 'block';
  document.getElementById('view-festival-detail').style.display = 'none';
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

  /* ④ 서브탭 → '전체' (index.html:164 가 첫 진입의 active). 이 한 줄이 리셋의 몸통이다. */
  var _allChip = document.querySelector('.tourism-subnav .chip[data-sub="all"]');
  if (_allChip) {
    switchTourismSub(_allChip, 'all');
  } else {                       /* 마크업이 바뀐 비상 경로 */
    _tourismSub = 'all';
    _resetThemeChips();
    renderTourismList('all');    /* expanded 미전달 = 5개 미리보기 + '더보기 +N' (js/tourism.js:225-227,266-272) */
  }

  /* ⑤ 가로 스크롤 3곳 — 첫 진입은 전부 왼쪽 끝.
   *    특히 #festival-scroll-list 는 renderFestivalScroll() 이 boot.js:117 에서 딱 한 번만
   *    불려 다시 그려지지 않으므로, scrollLeft 가 앱 수명 내내 남는다.
   *    renderFestivalScroll() 을 다시 부르지 말 것 — PLACES 는 불변이라 결과 HTML 이 동일한
   *    순수 낭비다(카드 DOM 전량 재생성 + 리스너 재등록, js/home.js:561-580). */
  var _sn = document.querySelector('.tourism-subnav');
  if (_sn) _sn.scrollLeft = 0;
  var _tc = document.getElementById('tourism-theme-chips');
  if (_tc) _tc.scrollLeft = 0;
  var _fs = document.getElementById('festival-scroll-list');
  if (_fs) _fs.scrollLeft = 0;
  /* 좌/우 화살표(.visible)는 scrollLeft 파생 상태. go() 가 js/nav.js:45 에서
   * setTimeout(updateFestArrows,60) 을 이미 걸어 두므로 그게 정리한다.
   * 즉시성도 확보하려면 한 번 더 부른다 — 멱등하다. */
  if (typeof updateFestArrows === 'function') updateFestArrows();

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
