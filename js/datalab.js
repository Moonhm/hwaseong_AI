/* ============================================================================
 * js/datalab.js — 추천 탭 큐레이션 3종 (2026-08-26, 개발 Claude)
 *
 * 왜 따로 있나: '이번 달 축제' 캐러셀을 소식 탭으로 옮기며 비게 된 자리를 채운다.
 *   ① 화성에서 인기 있는 곳   datalab_naviranking_hwaseong_2026.json  (36KB)
 *   ② 세대별로 많이 찾는 곳   datalab_tourism_stats.json              (491KB)
 *   ③ 화성 시티투어           citytour_courses_hwaseong.json          (3KB)
 *
 * 세 데이터 모두 원래 data/processed/ 에 있었는데, tools/server.py 의
 * _PUBLIC_DIRS 에 data/ 가 없어 앱이 못 읽는다. 그래서 js/ 로 복사해 두고 쓴다
 * (배포 Claude 가 restaurants-static.json 에 한 것과 같은 처리, 커밋 2efdb93).
 * 파일명은 원본 그대로다 — data/processed/ 와 1:1로 대응돼야 갱신할 때 헷갈리지 않는다.
 *
 * 전부 지연 로드다. 첫 화면에는 한 바이트도 받지 않고, 해당 섹션을 실제로
 * 그릴 때 한 번만 받아 캐시한다. 특히 ②는 491KB라 미리 받으면 안 된다.
 *
 * 표시 방식: 미리보기 + '전체 보기' (사용자 지시, 2026-08-26).
 *   앱에 이미 있는 「이번 주 소식 … 전체 보기」와 같은 패턴이다.
 *   전체 보기는 #view-datalab 으로 화면을 갈아끼운다 — 축제 상세·캘린더가
 *   쓰는 방식(showCalendar/hideCalendar)과 동일하다.
 * ========================================================================== */

var DL_VER   = '2026082634';
var _dlCache = {};      /* 파일명 → 파싱된 JSON. 한 번 받으면 다시 안 받는다 */
var _dlLoading = {};    /* 같은 파일을 동시에 두 번 요청하지 않게 하는 잠금 */

/* 지연 로드. 성공하면 cb(data), 실패하면 cb(null) — 호출부가 빈 상태를 그린다. */
function dlLoad(file, cb) {
  if (_dlCache[file]) { cb(_dlCache[file]); return; }
  if (_dlLoading[file]) { _dlLoading[file].push(cb); return; }
  _dlLoading[file] = [cb];
  fetch('js/' + file + '?v=' + DL_VER)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      _dlCache[file] = d;
      var q = _dlLoading[file]; delete _dlLoading[file];
      q.forEach(function (f) { try { f(d); } catch (e) {} });
    })
    .catch(function () {
      var q = _dlLoading[file]; delete _dlLoading[file];
      q.forEach(function (f) { try { f(null); } catch (e) {} });
    });
}

function _dlSkeleton(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += '<div class="dl-skel"></div>';
  return '<div class="dl-skel-row">' + s + '</div>';
}
function _dlEmpty(msg) {
  return '<div class="dl-empty">' + msg + '</div>';
}
/* 이름이 곧 관광지일 때 지도로 보낸다. PLACES 에 있으면 그 핀으로, 없으면 검색만. */
function dlGoPlace(name) {
  if (typeof PLACES === 'undefined') return;
  var hit = PLACES.find(function (p) { return p.name === name; });
  if (hit && typeof goMapFocus === 'function') {
    goMapFocus(hit.lat, hit.lng, 4, hit.id);
  } else if (typeof showToast === 'function') {
    showToast('지도에 등록되지 않은 곳이에요 — ' + name);
  }
}
function _dlAttr(s) { return String(s == null ? '' : s).replace(/'/g, ''); }

/* 같은 곳이 분류 체계만 달리해 두 번 들어 있다 — 데이터랩이 서로 다른 분류
 * (예: 제부도가 '자연관광지' 1위이자 '자연경관(하천‧해양)' 2위)를 한 목록에
 * 합쳐 놓았기 때문이다. 그대로 그리면 '제부도, 제부도, 동탄호수공원,
 * 동탄호수공원…' 이 되어 고장으로 보인다. 이름 기준으로 앞선 순위만 남긴다.
 * 원본 파일은 건드리지 않는다 — 표시 단계에서만 접는다. */
function _dlDedupe(rows) {
  var seen = {};
  return (rows || []).filter(function (r) {
    var k = r && r.name;
    if (!k || seen[k]) return false;
    seen[k] = 1;
    return true;
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   ① 화성에서 인기 있는 곳 — 내비게이션 목적지 기준
   ══════════════════════════════════════════════════════════════════════════ */
var DL_NAVI = 'datalab_naviranking_hwaseong_2026.json';

function renderDlPopular() {
  var el = document.getElementById('dl-popular-body');
  if (!el) return;
  el.innerHTML = _dlSkeleton(4);
  dlLoad(DL_NAVI, function (d) {
    var el2 = document.getElementById('dl-popular-body');
    if (!el2) return;
    var list = _dlDedupe(d && d.interest_spots_domestic);
    if (!list.length) { el2.innerHTML = _dlEmpty('순위 정보를 불러오지 못했어요'); return; }
    el2.innerHTML =
      '<div class="dl-rank-row">' +
      list.slice(0, 8).map(function (r, i) {
        /* 접고 난 뒤 자리로 다시 매긴다. 원본 rank 를 그대로 쓰면 중복이 빠진 만큼
         * '1, 3, 5…' 로 건너뛰어 고장으로 보인다. 접힌 항목은 같은 장소를 다른
         * 분류로 한 번 더 센 것이라, 합친 뒤 순번을 다시 매기는 쪽이 사실에 가깝다. */
        return '<div class="dl-rank-card" onclick="dlGoPlace(\'' + _dlAttr(r.name) + '\')">' +
                 '<div class="dl-rank-no' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
                 '<div class="dl-rank-name">' + r.name + '</div>' +
                 '<div class="dl-rank-cat">' + (r.category || '') + '</div>' +
               '</div>';
      }).join('') +
      '</div>';
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   ② 세대별로 많이 찾는 곳 — 4개 구 × 연령대
   데이터가 { '만세구_202602-202607': { '20대': [...], ... }, ... } 모양이라
   키에서 구 이름만 떼어 쓴다. 기간 문자열은 화면에 안 쓴다.
   ══════════════════════════════════════════════════════════════════════════ */
var DL_STATS = 'datalab_tourism_stats.json';
var _dlGu    = '동탄구';
var _dlAge   = '20대';

function _dlStatsPick(d, gu) {
  var src = d && d['인기관광지'];
  if (!src) return null;
  var key = Object.keys(src).filter(function (k) { return k.indexOf(gu) === 0; })[0];
  return key ? src[key] : null;
}
function _dlAges(byAge) {
  /* '20대','30대'… 를 숫자 순으로 — Object.keys 순서에 기대지 않는다 */
  return Object.keys(byAge || {}).sort(function (a, b) {
    return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
  });
}

function dlSetGu(gu)  { _dlGu  = gu;  renderDlAge(); }
function dlSetAge(ag) { _dlAge = ag;  renderDlAge(); }

function renderDlAge() {
  var el = document.getElementById('dl-age-body');
  if (!el) return;
  el.innerHTML = _dlSkeleton(3);
  dlLoad(DL_STATS, function (d) {
    var el2 = document.getElementById('dl-age-body');
    if (!el2) return;
    var byAge = _dlStatsPick(d, _dlGu);
    if (!byAge) { el2.innerHTML = _dlEmpty('통계를 불러오지 못했어요'); return; }
    var ages = _dlAges(byAge);
    if (ages.indexOf(_dlAge) < 0) _dlAge = ages[0];
    var rows = (byAge[_dlAge] || []).slice(0, 5);

    el2.innerHTML =
      '<div class="dl-chip-row">' +
        ['동탄구','병점구','만세구','효행구'].map(function (g) {
          return '<button class="dl-chip' + (g === _dlGu ? ' active' : '') +
                 '" onclick="dlSetGu(\'' + g + '\')">' + g + '</button>';
        }).join('') +
      '</div>' +
      '<div class="dl-chip-row dl-chip-row--age">' +
        ages.map(function (a) {
          return '<button class="dl-chip sm' + (a === _dlAge ? ' active' : '') +
                 '" onclick="dlSetAge(\'' + a + '\')">' + a + '</button>';
        }).join('') +
      '</div>' +
      (rows.length ? rows.map(function (r, i) {
        return '<div class="dl-bar-item" onclick="dlGoPlace(\'' + _dlAttr(r['관심지점명']) + '\')">' +
                 '<div class="dl-bar-no">' + (i + 1) + '</div>' +
                 '<div class="dl-bar-main">' +
                   '<div class="dl-bar-top">' +
                     '<span class="dl-bar-name">' + r['관심지점명'] + '</span>' +
                     '<span class="dl-bar-pct">' + r['비율'] + '%</span>' +
                   '</div>' +
                   '<div class="dl-bar-track"><div class="dl-bar-fill" style="width:' +
                     Math.max(4, Math.min(100, parseFloat(r['비율']) * 4)) + '%"></div></div>' +
                   '<div class="dl-bar-cat">' + (r['구분'] || '') + '</div>' +
                 '</div>' +
               '</div>';
      }).join('') : _dlEmpty('이 조건에는 자료가 없어요'));
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   ③ 화성 시티투어 — 11개 코스
   ══════════════════════════════════════════════════════════════════════════ */
var DL_TOUR = 'citytour_courses_hwaseong.json';
var DL_TOUR_COLORS = ['#0EA5E9','#F97316','#8B5CF6','#10B981','#EC4899','#F59E0B'];

function renderDlCityTour() {
  var el = document.getElementById('dl-tour-body');
  if (!el) return;
  el.innerHTML = _dlSkeleton(3);
  dlLoad(DL_TOUR, function (d) {
    var el2 = document.getElementById('dl-tour-body');
    if (!el2) return;
    var cs = d && d.courses;
    if (!cs || !cs.length) { el2.innerHTML = _dlEmpty('코스 정보를 불러오지 못했어요'); return; }
    el2.innerHTML =
      '<div class="dl-tour-row">' +
      cs.slice(0, 6).map(function (c, i) {
        var col = DL_TOUR_COLORS[i % DL_TOUR_COLORS.length];
        return '<div class="dl-tour-card" onclick="showDatalab(\'tour\')">' +
                 '<div class="dl-tour-hero" style="background:linear-gradient(135deg,' + col + ',' + col + 'CC)">' +
                   '<span class="dl-tour-no">코스 ' + c.no + '</span>' +
                 '</div>' +
                 '<div class="dl-tour-body">' +
                   '<div class="dl-tour-name">' + c.name + '</div>' +
                   '<div class="dl-tour-theme">' + (c.theme || '') + '</div>' +
                 '</div>' +
               '</div>';
      }).join('') +
      '</div>';
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   전체 보기 — #view-datalab 으로 화면 교체
   축제 상세·캘린더와 같은 방식이다(js/tourism.js showCalendar 참고).
   go('tourism') 이 재진입 때 목록 뷰로 되돌리므로(js/nav.js) 탭을 벗어났다
   돌아와도 이 화면이 남지 않는다 — 아래 hideDatalab 과 짝을 맞춰 뒀다.
   ══════════════════════════════════════════════════════════════════════════ */
var _dlView = null;   /* 'popular' | 'age' | 'tour' */

function showDatalab(kind) {
  _dlView = kind;
  var list = document.getElementById('view-tourism-list');
  var view = document.getElementById('view-datalab');
  var fd   = document.getElementById('view-festival-detail');
  var cal  = document.getElementById('view-calendar');
  if (list) list.style.display = 'none';
  if (fd)   fd.style.display   = 'none';
  if (cal)  cal.style.display  = 'none';
  if (!view) return;
  view.style.display = 'block';
  var page = document.getElementById('page-tourism');
  if (page) page.scrollTop = 0;
  _renderDatalabView(kind);
}

function hideDatalab() {
  var view = document.getElementById('view-datalab');
  var list = document.getElementById('view-tourism-list');
  if (view) view.style.display = 'none';
  if (list) list.style.display = 'block';
  _dlView = null;
}

function _dlHead(title, sub) {
  return '<div class="page-header">' +
           '<div class="back-btn" onclick="hideDatalab()">‹ 추천</div>' +
           '<div class="page-header-title" style="font-size:15px">' + title + '</div>' +
           '<span style="width:44px"></span>' +
         '</div>' +
         (sub ? '<div class="dl-view-sub">' + sub + '</div>' : '');
}

function _renderDatalabView(kind) {
  var el = document.getElementById('view-datalab');
  if (!el) return;
  if (kind === 'popular') return _dlViewPopular(el);
  if (kind === 'age')     return _dlViewAge(el);
  if (kind === 'tour')    return _dlViewTour(el);
}

/* ── 전체: 인기 순위 ── */
var _dlPopTab = 'interest_spots_domestic';
var DL_POP_TABS = [
  { key: 'interest_spots_domestic', label: '관심 관광지' },
  { key: 'popular_spots_all',       label: '인기 목적지' },
  { key: 'popular_food_all',        label: '인기 맛집' },
  { key: 'hub_spots',               label: '거점 장소' },
];
function dlPopTab(k) { _dlPopTab = k; _dlViewPopular(document.getElementById('view-datalab')); }

function _dlViewPopular(el) {
  el.innerHTML = _dlHead('화성에서 인기 있는 곳') + _dlSkeleton(6);
  dlLoad(DL_NAVI, function (d) {
    if (_dlView !== 'popular') return;   /* 사이에 다른 화면으로 갔다 */
    /* 미리보기와 같은 이유로 접고, 같은 이유로 순번도 다시 매긴다 — 위 주석 참고.
     * 접고 나면 100개가 아니라 그보다 적다(관심 관광지 기준 68개). */
    var rows = _dlDedupe((d && d[_dlPopTab]) || []);
    el.innerHTML =
      _dlHead('화성에서 인기 있는 곳',
              (d && d.note ? d.note : '') + (d && d.period ? ' · 기준 ' + d.period : '')) +
      '<div class="dl-chip-row dl-chip-row--pad">' +
        DL_POP_TABS.map(function (t) {
          return '<button class="dl-chip' + (t.key === _dlPopTab ? ' active' : '') +
                 '" onclick="dlPopTab(\'' + t.key + '\')">' + t.label + '</button>';
        }).join('') +
      '</div>' +
      (rows.length
        ? '<div class="dl-list">' + rows.map(function (r, i) {
            return '<div class="dl-list-item" onclick="dlGoPlace(\'' + _dlAttr(r.name) + '\')">' +
                     '<div class="dl-list-no' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
                     '<div class="dl-list-main">' +
                       '<div class="dl-list-name">' + r.name + '</div>' +
                       '<div class="dl-list-sub">' + (r.category || r.region || '') + '</div>' +
                     '</div>' +
                     (r.total ? '<div class="dl-list-right">' + Number(r.total).toLocaleString() + '명</div>' : '') +
                   '</div>';
          }).join('') + '</div>'
        : _dlEmpty('자료가 없어요')) +
      '<div style="height:28px"></div>';
  });
}

/* ── 전체: 세대별 ── */
function _dlViewAge(el) {
  el.innerHTML = _dlHead('세대별로 많이 찾는 곳') + _dlSkeleton(6);
  dlLoad(DL_STATS, function (d) {
    if (_dlView !== 'age') return;
    var byAge = _dlStatsPick(d, _dlGu);
    var ages  = _dlAges(byAge);
    if (ages.indexOf(_dlAge) < 0) _dlAge = ages[0];
    el.innerHTML =
      _dlHead('세대별로 많이 찾는 곳', '한국관광 데이터랩 · 화성시 4개 구 연령대별 관심 지점') +
      '<div class="dl-chip-row dl-chip-row--pad">' +
        ['동탄구','병점구','만세구','효행구'].map(function (g) {
          return '<button class="dl-chip' + (g === _dlGu ? ' active' : '') +
                 '" onclick="dlSetGu2(\'' + g + '\')">' + g + '</button>';
        }).join('') +
      '</div>' +
      '<div class="dl-chip-row dl-chip-row--pad dl-chip-row--age">' +
        ages.map(function (a) {
          return '<button class="dl-chip sm' + (a === _dlAge ? ' active' : '') +
                 '" onclick="dlSetAge2(\'' + a + '\')">' + a + '</button>';
        }).join('') +
      '</div>' +
      (byAge && byAge[_dlAge] && byAge[_dlAge].length
        ? '<div class="dl-list">' + byAge[_dlAge].map(function (r, i) {
            return '<div class="dl-list-item" onclick="dlGoPlace(\'' + _dlAttr(r['관심지점명']) + '\')">' +
                     '<div class="dl-list-no' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
                     '<div class="dl-list-main">' +
                       '<div class="dl-list-name">' + r['관심지점명'] + '</div>' +
                       '<div class="dl-list-sub">' + (r['구분'] || '') + '</div>' +
                     '</div>' +
                     '<div class="dl-list-right">' + r['비율'] + '%</div>' +
                   '</div>';
          }).join('') + '</div>'
        : _dlEmpty('이 조건에는 자료가 없어요')) +
      '<div style="height:28px"></div>';
  });
}
/* 전체 화면 안에서 칩을 누르면 미리보기가 아니라 이 화면을 다시 그려야 한다 */
function dlSetGu2(g)  { _dlGu = g;  _dlViewAge(document.getElementById('view-datalab')); }
function dlSetAge2(a) { _dlAge = a; _dlViewAge(document.getElementById('view-datalab')); }

/* ── 전체: 시티투어 ── */
function _dlViewTour(el) {
  el.innerHTML = _dlHead('화성 시티투어') + _dlSkeleton(4);
  dlLoad(DL_TOUR, function (d) {
    if (_dlView !== 'tour') return;
    var cs = (d && d.courses) || [];
    var ct = (d && d.contacts) || {};
    el.innerHTML =
      _dlHead('화성 시티투어', d && d.operator ? d.operator + ' 운영' : '') +
      (d && d.depart_address
        ? '<div class="dl-info-card">' +
            '<div class="dl-info-row"><span class="dl-info-k">출발</span><span class="dl-info-v">' + d.depart_address + '</span></div>' +
            (ct.saturday ? '<div class="dl-info-row"><span class="dl-info-k">토요일</span><a class="dl-info-tel" href="tel:' + ct.saturday + '">' + ct.saturday + '</a></div>' : '') +
            (ct.sunday   ? '<div class="dl-info-row"><span class="dl-info-k">일요일</span><a class="dl-info-tel" href="tel:' + ct.sunday   + '">' + ct.sunday   + '</a></div>' : '') +
            (ct.group    ? '<div class="dl-info-row"><span class="dl-info-k">단체</span><a class="dl-info-tel" href="tel:' + ct.group    + '">' + ct.group    + '</a></div>' : '') +
          '</div>'
        : '') +
      (cs.length
        ? cs.map(function (c, i) {
            var col = DL_TOUR_COLORS[i % DL_TOUR_COLORS.length];
            return '<div class="dl-course">' +
                     '<div class="dl-course-no" style="background:' + col + '">' + c.no + '</div>' +
                     '<div class="dl-course-main">' +
                       '<div class="dl-course-name">' + c.name + '</div>' +
                       '<div class="dl-course-theme" style="color:' + col + '">' + (c.theme || '') + '</div>' +
                       '<div class="dl-course-desc">' + (c.desc || '') + '</div>' +
                     '</div>' +
                   '</div>';
          }).join('')
        : _dlEmpty('코스 정보를 불러오지 못했어요')) +
      (d && d.source
        ? '<div class="dl-src">자세한 일정·예약은 <a href="' + d.source + '" target="_blank" rel="noopener">화성시 시티투어</a>에서 확인하세요</div>'
        : '') +
      '<div style="height:28px"></div>';
  });
}


/* ── 추천 탭 진입 시 세 미리보기를 한 번에 ──────────────────────────────────
   '전체' 서브탭에서만 보인다(js/tourism.js switchTourismSub). 다른 서브탭은
   목적이 뚜렷한 목록이라 큐레이션이 끼면 오히려 방해가 된다. */
function renderDatalabSections() {
  renderDlPopular();
  renderDlAge();
  renderDlCityTour();
}
