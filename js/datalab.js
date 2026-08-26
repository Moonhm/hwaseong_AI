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

var DL_VER   = '20260826146';
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
/* 데이터랩 이름과 우리 데이터의 공백 표기가 다르다
 * (예: "율암온천숯가마 테마파크" vs "율암온천숯가마테마파크"). 공백을 지우고 비교한다. */
/* 공백뿐 아니라 슬래시·가운뎃점도 지운다. 내비랭킹의 'hub_spots' 는
 * "롯데시네마/향남" 처럼 슬래시로 브랜드와 지점을 나눠 적는데, 공백만 지우면
 * 그 10건이 전부 '지도에 등록되지 않은 곳이에요' 로 떨어진다(2026-08-26 감사). */
function _dlNorm(s) { return (s || '').replace(/[\s\/·]/g, ''); }

/* 영화관은 2026-08-26 에 PLACES → CONVENIENCE.cinemas 로 옮겼다(사용자 지시).
 * 내비랭킹 상위에 영화관이 10곳이나 있어서, 그대로 두면 누를 때마다
 * '지도에 등록되지 않은 곳이에요' 토스트만 뜬다.
 *
 * ⚠ 이름이 세 갈래로 어긋난다. 접두 일치를 아무렇게나 쓰면 안 된다:
 *     "메가박스동탄역" 은 "메가박스동탄" 으로 **시작**하므로
 *     단순 접두 매칭이면 엉뚱하게 '메가박스 동탄' 으로 간다.
 *   그래서 우선순위를 둔다 —
 *     ① 완전 일치
 *     ② 우리 이름이 검색어로 시작 ("메가박스동탄역점" ⊃ "메가박스동탄역") : 가장 짧은 것
 *     ③ 검색어가 우리 이름으로 시작 ("롯데시네마병점" ⊃ "롯데시네마병점"…) : 가장 긴 것
 *   ②를 ③보다 앞에 둬야 위 사고가 안 난다. */
function _dlFindCinema(nq) {
  var cs = (typeof CONVENIENCE !== 'undefined' && CONVENIENCE.cinemas) || [];
  var exact = null, fwd = null, bwd = null;
  cs.forEach(function (c) {
    var cn = _dlNorm(c.name);
    if (!cn) return;
    if (cn === nq) { exact = c; return; }
    if (cn.indexOf(nq) === 0) {            /* ② 우리 이름이 더 길다 */
      if (!fwd || cn.length < _dlNorm(fwd.name).length) fwd = c;
    } else if (nq.indexOf(cn) === 0) {     /* ③ 검색어가 더 길다 */
      if (!bwd || cn.length > _dlNorm(bwd.name).length) bwd = c;
    }
  });
  return exact || fwd || bwd;
}

/* 이름이 곧 장소일 때 지도로 보낸다. PLACES 에 있으면 그 핀으로,
 * 없으면 영화관(편의정보)을 찾아보고, 그래도 없으면 토스트로 알린다. */
function dlGoPlace(name) {
  var nq = _dlNorm(name);

  if (typeof PLACES !== 'undefined') {
    var hit = PLACES.find(function (p) { return p.name === name || _dlNorm(p.name) === nq; });
    if (hit && typeof goMapFocus === 'function') {
      goMapFocus(hit.lat, hit.lng, 4, hit.id);
      return;
    }
  }

  var cin = _dlFindCinema(nq);
  if (cin && typeof goMapConv === 'function') {
    goMapConv('cinema', cin.lat, cin.lng);
    return;
  }

  if (typeof showToast === 'function') {
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
var DL_MEDALS = ['🥇', '🥈', '🥉'];   /* 금 · 은 · 동 */

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
      /* 3위까지만 (2026-08-26 사용자 지시). 전체 68개는 '전체 보기' 가 맡는다 —
       * 미리보기에서 10개를 옆으로 밀게 하느니 시상대만 보여 주는 편이 읽기 쉽다. */
      '<div class="dl-photo-row">' +
      list.slice(0, 3).map(function (r, i) {
        /* 접고 난 뒤 자리로 다시 매긴다. 원본 rank 를 그대로 쓰면 중복이 빠진 만큼
         * '1, 3, 5…' 로 건너뛰어 고장으로 보인다. 접힌 항목은 같은 장소를 다른
         * 분류로 한 번 더 센 것이라, 합친 뒤 순번을 다시 매기는 쪽이 사실에 가깝다. */
        /* 사진은 이름으로 찾는다(2026-08-26 사용자 요청). placePhotoSrc 는 PLACES 항목이
         * 아니어도 이름만으로 경로를 만든다. 없으면 onerror 로 img 를 숨겨
         * 아래 그라데이션 배경과 🏞️ 가 그대로 보인다 — 빈 사각형이 남지 않는다. */
        var src = (typeof placePhotoSrc === 'function')
          ? placePhotoSrc({ name: r.name })
          : 'assets/images/places/' + encodeURIComponent(r.name + '.jpg');
        return '<div class="dl-photo-card" onclick="dlGoPlace(\'' + _dlAttr(r.name) + '\')">' +
                 '<div class="dl-photo-thumb">' +
                   '<img src="' + src + '" alt="" loading="lazy" decoding="async" ' +
                        'onerror="this.style.display=\'none\'">' +
                   /* 금·은·동 (2026-08-26 사용자 지시).
                    * 트로피 이모지는 🏆 한 종류뿐이라 은/동을 구분할 수 없다.
                    * 메달 3종(🥇🥈🥉)이 금·은·동을 그대로 나타내므로 이쪽을 쓴다.
                    * aria-label 은 스크린리더가 '1등 메달' 로 읽게 하려는 것 —
                    * 이모지만 두면 읽는 방식이 리더마다 제각각이다. */
                   '<div class="dl-photo-no" aria-label="' + (i + 1) + '위">' +
                     DL_MEDALS[i] + '</div>' +
                 '</div>' +
                 '<div class="dl-photo-name">' + r.name + '</div>' +
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

/* 추천 탭 재클릭 리셋용. 서브탭·테마칩·제부도·캘린더는 전부 첫 화면으로
 * 돌아가는데 데이터랩 필터만 '만세구 · 60대' 로 남아, 미리보기 문구까지
 * 옛 구 기준으로 어긋나 있었다(js/tourism.js resetTourismPage 에서 부른다). */
function resetDatalabFilters() {
  _dlGu = '동탄구'; _dlAge = '20대';
  if (typeof _dlPopTab  !== 'undefined') _dlPopTab  = 'interest_spots_domestic';
  if (typeof _dlRepTab  !== 'undefined') _dlRepTab  = 'hot';
  if (typeof _dlFoodWho !== 'undefined') _dlFoodWho = '외지인';
  _dlFrom = null; _dlFromScroll = 0;
}

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

/* ⚠ '요즘 뜨는 곳'(renderDlReport)도 _dlGu 를 읽는다. 예전에는 renderDlAge 만
 * 다시 그려서, 구 선택기는 '만세구' 인데 바로 아래 문구는 '동탄구 기준…' 이고
 * 카드도 동탄구 데이터였다 — 한 화면에 두 구가 섞여 있었다. */
function dlSetGu(gu)  { _dlGu  = gu;  renderDlAge(); renderDlReport(); }
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
      /* 2026-08-26 사용자 지시로 6개 제한을 뺐다. '투어' 가 전용 서브탭이 되면서
       * 이 캐러셀이 그 탭의 본문이 됐는데, 10개 중 6개만 보이고 나머지 4개는
       * '전체 보기' 를 한 번 더 눌러야 나오는 게 말이 안 됐다. */
      cs.map(function (c, i) {
        var col = DL_TOUR_COLORS[i % DL_TOUR_COLORS.length];
        var _hero = _dlCourseHeroSrc(c);
        return '<div class="dl-tour-card" onclick="dlShowCourse(' + c.no + ')">' +
                 '<div class="dl-tour-hero" style="background:linear-gradient(135deg,' + col + ',' + col + 'CC)">' +
                   (_hero ? '<img class="dl-tour-hero-img" src="' + _hero + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '') +
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

/* ── 어느 탭에서 열었는지 (2026-08-27) ────────────────────────────────────
 * 뒤로가기가 '‹ 추천' 으로 고정이라, 홈의 '전체 순위 보기 ›' 로 들어오면
 * 홈이 아니라 추천 탭 목록에 떨어졌다. 축제 상세·캘린더는 같은 문제를
 * '온 곳을 기억한다' 로 이미 고쳤는데(js/tourism.js openFestView) 여기만 빠졌다.
 * ⚠ showDatalab() 이 아니라 goDatalab() 에서만 기록한다 — 코스 상세의
 *   '‹ 코스 전체 보기' 처럼 이미 데이터랩 안에서 부르는 곳이 있어서,
 *   showDatalab 이 매번 덮으면 홈에서 왔다는 사실이 지워진다. */
var _dlFrom = null;        /* 'page-home' | 'page-living' | 'page-map' | null(추천) */
var _dlFromScroll = 0;
var _DL_BACK = {
  'page-home':   { label: '‹ 홈',   page: 'home'   },
  'page-living': { label: '‹ 소식', page: 'living' },
  'page-map':    { label: '‹ 지도', page: 'map'    }
};
function _dlBackLabel() {
  var i = _DL_BACK[_dlFrom];
  return i ? i.label : '‹ 추천';
}

/* 데이터랩으로 가는 공용 진입점. openFestView 와 같은 구조다. */
function goDatalab(kind) {
  var cur  = document.querySelector('.page.active');
  var from = cur ? cur.id : null;
  _dlFrom       = (from && from !== 'page-tourism') ? from : null;
  _dlFromScroll = (_dlFrom && cur) ? cur.scrollTop : 0;
  /* ⚠ go() 뒤에 setTimeout 금지 — 추천 탭 목록이 한 프레임 번쩍인다.
   * go() 는 뷰 교체와 목록 렌더까지 동기로 끝낸다(js/nav.js). */
  if (_dlFrom) go('tourism');
  showDatalab(kind);
}

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

  /* 전체 보기 안에서 바꾼 구·연령대를 미리보기에도 반영한다. 안 그러면
   * '리포트 전체' 에서 효행구를 고르고 나왔을 때 미리보기만 동탄구로 남는다.
   * 자료는 _dlCache 에 이미 있어 다시 받지 않는다. */
  if (typeof renderDlAge    === 'function') renderDlAge();
  if (typeof renderDlReport === 'function') renderDlReport();

  var info = _DL_BACK[_dlFrom];
  if (!info) return;                      /* 추천 탭에서 열었다 — 목록이 곧 제자리다 */
  var scroll = _dlFromScroll;
  _dlFrom = null; _dlFromScroll = 0;
  go(info.page);
  /* go() 가 scrollTop 을 0 으로 민 뒤이므로 여기서 되돌린다(js/tourism.js 와 같다). */
  var pg = document.getElementById('page-' + info.page);
  if (pg) pg.scrollTop = scroll;
}

function _dlHead(title, sub) {
  return '<div class="page-header">' +
           '<div class="back-btn" onclick="hideDatalab()">' + _dlBackLabel() + '</div>' +
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
  if (kind === 'report')  return _dlViewReport(el);
  /* 'course:3' 처럼 코스 번호를 붙여 부른다. 축제 상세와 같은 방식으로
     목록 위에 화면 하나를 더 얹는다 (2026-08-26). */
  if (kind && kind.indexOf('course:') === 0) return _dlViewCourse(el, +kind.slice(7));
}

/* ── 시티투어 코스 상세 ─────────────────────────────────────────────────
   축제 상세(js/tourism.js showFestivalDetail)와 같은 얼개다:
   사진 히어로 + 한 줄 소개 + 본문 + 들르는 곳 목록.
   장소 사진은 새로 받지 않고 PLACES 사진을 그대로 쓴다 — spots[].id 로 잇는다. */
function dlShowCourse(no) { showDatalab('course:' + no); }

function _dlCourseHeroSrc(c) {
  /* 코스 전용 이미지가 있으면 우선 사용 (assets/images/courses/<코스명>.jpg).
   * 2026-08-26: .png → .jpg. 원본이 전부 PNG 라 11장에 15.5MB 였다(최대 3.9MB/장).
   * 폭 1200 상한 + JPEG q82 로 1.1MB(93% 절감). 사진에 PNG 를 쓰면 이렇게 된다.
   * ⚠ 확장자를 다시 바꾸면 이 줄도 함께 고칠 것 — 경로를 만드는 곳은 여기 하나뿐이다. */
  if (c.name) {
    return 'assets/images/courses/' + encodeURIComponent(c.name) + '.jpg';
  }
  /* 없으면 첫 장소 사진으로 대체 */
  var s = (c.spots || []).filter(function (x) { return x.id != null; });
  for (var i = 0; i < s.length; i++) {
    if (typeof hasPhoto === 'function' && hasPhoto({ id: s[i].id, name: s[i].name })) {
      return placePhotoSrc({ id: s[i].id, name: s[i].name });
    }
  }
  return '';
}

function _dlSpotRow(sp, col) {
  var has = (sp.id != null) && (typeof hasPhoto === 'function') &&
            hasPhoto({ id: sp.id, name: sp.name });
  var thumb = has
    ? photoThumb({ id: sp.id, name: sp.name }, 46, '📍', 'ph-sm')
    : '<div class="dl-spot-dot" style="background:' + col + '"></div>';
  /* PLACES 에 있는 곳만 지도로 보낸다. 입파도·옥란재처럼 데이터가 없는 곳은
     눌러도 갈 데가 없으므로 주소만 보여 준다. */
  var go = (sp.id != null)
    ? ' onclick="hideDatalab();goMapFocus(0,0,4,' + sp.id + ')"' : '';
  return '<div class="dl-spot' + (go ? ' is-link' : '') + '"' + go + '>' +
           thumb +
           '<div class="dl-spot-main">' +
             '<div class="dl-spot-name">' + sp.name + '</div>' +
             (sp.addr ? '<div class="dl-spot-sub">' + sp.addr + '</div>' : '') +
           '</div>' +
           (go ? '<span class="dl-spot-arr">›</span>' : '') +
         '</div>';
}

function _dlViewCourse(el, no) {
  el.innerHTML = _dlHead('시티투어') + _dlSkeleton(3);
  dlLoad(DL_TOUR, function (d) {
    if (String(_dlView) !== 'course:' + no) return;
    var c = ((d && d.courses) || []).filter(function (x) { return x.no === no; })[0];
    if (!c) { el.innerHTML = _dlHead('시티투어') + _dlEmpty('코스를 찾지 못했어요'); return; }
    var col = c.color || '#2563EB';
    var hero = _dlCourseHeroSrc(c);

    var body =
      '<div class="dl-c-hero" style="background:linear-gradient(135deg,' + col + ',' + col + 'CC)">' +
        (hero ? '<img class="dl-c-hero-img" src="' + hero + '" alt="" decoding="async" onerror="this.style.display=\'none\'">' : '') +
        '<div class="dl-c-hero-body">' +
          '<div class="dl-c-hero-badge">코스 ' + c.no + ' · ' + (c.theme || '') + '</div>' +
          '<div class="dl-c-hero-title">' + c.name + '</div>' +
        '</div>' +
      '</div>' +
      (c.tagline ? '<div class="dl-c-tag" style="border-left-color:' + col + '">' + c.tagline + '</div>' : '') +
      (c.desc ? '<div class="dl-c-desc">' + c.desc + '</div>' : '') +
      (c.notice ? '<div class="dl-c-notice">※ ' + c.notice + '</div>' : '');

    if (c.promises && c.promises.length) {
      body += '<div class="dl-c-sect">착한여행 \'하루\'의 약속</div>' +
              '<ul class="dl-c-ul">' + c.promises.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>';
    }
    if (c.schedule && c.schedule.length) {
      body += '<div class="dl-c-sect">날짜별 투어 일정</div>' +
              c.schedule.map(function (s) {
                return '<div class="dl-c-sch">' +
                         '<span class="dl-c-sch-d" style="color:' + col + '">' + s.date + '</span>' +
                         '<div class="dl-c-sch-m"><b>' + s.name + '</b><span>' + s.course + '</span></div>' +
                       '</div>';
              }).join('');
    }
    if (c.info && c.info.length) {
      body += '<div class="dl-c-sect">투어 상세 정보</div>' +
              '<ul class="dl-c-ul">' + c.info.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>';
    }
    if (c.regions && c.regions.length) {
      body += c.regions.map(function (r) {
        return '<div class="dl-c-sect">' + r.name + ' — ' + r.desc + '</div>' +
               r.spots.map(function (sp) { return _dlSpotRow(sp, col); }).join('');
      }).join('');
    } else if (c.spots && c.spots.length) {
      body += '<div class="dl-c-sect">들르는 곳 ' + c.spots.length + '곳</div>' +
              c.spots.map(function (sp) { return _dlSpotRow(sp, col); }).join('');
    }

    body += '<div class="dl-c-back" onclick="showDatalab(\'tour\')">‹ 코스 전체 보기</div>' +
            (d.source ? '<div class="dl-src">예약·문의는 <a href="' + d.source + '" target="_blank" rel="noopener">화성시 시티투어</a>에서 확인하세요</div>' : '') +
            '<div style="height:28px"></div>';

    el.innerHTML = _dlHead(c.name) + body;
  });
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
            /* 전체 보기에도 코스 사진을 넣는다 (2026-08-26 사용자 지적 — "전체보기하면
             * 또 사진이 안뜨네?"). 미리보기 캐러셀과 코스 상세는 사진을 쓰는데
             * 이 목록만 번호 배지뿐이라, 같은 코스가 화면마다 다르게 보였다.
             * 사진이 없으면 _dlCourseHeroSrc 가 '' 를 주고, 404 면 onerror 로 img 가
             * 숨어 배지 색 배경이 그대로 보인다 — 어느 쪽이든 빈 사각형이 남지 않는다. */
            var _hero = _dlCourseHeroSrc(c);
            return '<div class="dl-course is-link" onclick="dlShowCourse(' + c.no + ')">' +
                     '<div class="dl-course-thumb" style="background:' + col + '">' +
                       (_hero ? '<img src="' + _hero + '" alt="" loading="lazy" decoding="async" ' +
                                'onerror="this.style.display=\'none\'">' : '') +
                       '<span class="dl-course-no-badge">' + c.no + '</span>' +
                     '</div>' +
                     '<div class="dl-course-main">' +
                       '<div class="dl-course-name">' + c.name + '</div>' +
                       '<div class="dl-course-theme" style="color:' + col + '">' + (c.theme || '') + '</div>' +
                       '<div class="dl-course-desc">' + (c.tagline || c.desc || '') + '</div>' +
                       ((c.spots && c.spots.length)
                          ? '<div class="dl-course-cnt">들르는 곳 ' + c.spots.length + '곳</div>' : '') +
                     '</div>' +
                     '<span class="dl-spot-arr">›</span>' +
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
   '인기' 서브탭에서만 보인다(js/tourism.js switchTourismSub). 다른 서브탭은
   목적이 뚜렷한 목록이라 큐레이션이 끼면 오히려 방해가 된다. */
function renderDatalabSections() {
  /* renderDlPopular() 는 여기 없다. 인기 섹션은 2026-08-26 에 #dl-sections 안
   * 첫 자리로 돌아왔지만, 호출은 switchTourismSub 이 이 함수와 나란히 한다
   * (js/tourism.js:50-51). 여기로 옮겨도 되나 그러면 '인기 있는 곳'만 따로
   * 다시 그리고 싶을 때 방법이 없어진다 — 부르는 쪽에서 고르게 둔다. */
  renderDlAge();
  /* renderDlCityTour() 는 2026-08-26 에 여기서 빠졌다. 시티투어가 '인기' 큐레이션에서
   * 전용 서브탭(#tourism-tour)으로 옮겨갔고, 그 분기(js/tourism.js switchTourismSub)가
   * 직접 부른다. 여기 남겨 두면 '인기' 를 열 때마다 숨어 있는 #dl-tour-body 를
   * 헛되이 다시 그린다. */
  renderDlReport();
}


/* ══════════════════════════════════════════════════════════════════════════
   ④ 화성 관광 리포트 (2026-08-26 추가)
   datalab_tourism_stats.json 은 이미 ②에서 받아 캐시돼 있다. 같은 파일에
   '인기관광지' 말고도 세 덩어리가 더 들어 있는데 화면이 없어 놀고 있었다 —
   추가 다운로드 0바이트로 세 화면이 더 나온다.
     · 핫플레이스  구·연령대별 '성장률'. 인기 순위와 성격이 다르다(요즘 뜨는 곳)
     · 맛집        외지인 / 현지인 / 전체 세 갈래. 여행앱에서 잘 먹히는 대비다
     · AI분석      방문자·숙박·체류시간 증감률과 연관 지역 유입/유출
   추천 탭이 더 길어지지 않게 미리보기는 한 덩이만 두고, 셋은 전체 보기 안의 탭으로 나눈다.
   ══════════════════════════════════════════════════════════════════════════ */

function _dlStatsGroup(d, group, prefix) {
  var src = d && d[group];
  if (!src) return null;
  var key = Object.keys(src).filter(function (k) { return k.indexOf(prefix) === 0; })[0];
  return key ? src[key] : null;
}
/* 성장률·증감률은 문자열이고 음수가 섞여 있다. 색과 부호를 함께 정한다. */
function _dlPct(v) {
  var n = parseFloat(v);
  if (!isFinite(n)) return { n: 0, s: '—', up: null };
  return { n: n, s: (n > 0 ? '+' : '') + n.toFixed(1) + '%', up: n > 0 ? true : (n < 0 ? false : null) };
}
function _dlPctCls(up) { return up === true ? ' up' : (up === false ? ' down' : ''); }

/* ── 미리보기: 요즘 뜨는 곳 (핫플레이스) ── */
function renderDlReport() {
  var el = document.getElementById('dl-report-body');
  if (!el) return;
  el.innerHTML = _dlSkeleton(3);
  dlLoad(DL_STATS, function (d) {
    var el2 = document.getElementById('dl-report-body');
    if (!el2) return;
    var byAge = _dlStatsGroup(d, '핫플레이스', _dlGu);
    if (!byAge) { el2.innerHTML = _dlEmpty('리포트를 불러오지 못했어요'); return; }
    var ages = _dlAges(byAge);
    /* ⚠ 연령대를 ②와 같은 _dlAge(기본 20대)로 잡으면 안 된다. 전체 209건 중 144건이
     * 음수라, 동탄구 20대는 10건이 '전부 하락' 이다. 그대로 그리면 '요즘 뜨는 곳'
     * 이라는 제목 밑에 ▼ 만 늘어선다.
     * 미리보기는 '전체' 연령을 기본으로 쓰고 오른 것만 보여 준다 —
     * 전체 순위는 아래 '리포트 전체' 에서 ▲▼ 그대로 볼 수 있다. */
    var age = ages.indexOf('전체') >= 0 ? '전체' : ages[ages.length - 1];
    /* 성장률이 높은 순으로 — 원본 '순위' 는 방문량 기준이라 '뜨는 곳' 과 다르다 */
    var rows = (byAge[age] || []).slice().sort(function (a, b) {
      return parseFloat(b['성장율']) - parseFloat(a['성장율']);
    }).filter(function (r) { return parseFloat(r['성장율']) > 0; }).slice(0, 6);
    if (!rows.length) {
      el2.innerHTML = _dlEmpty(_dlGu + '에서 지난달보다 늘어난 곳이 없어요 — 리포트 전체에서 자세히 볼 수 있어요');
      return;
    }

    el2.innerHTML =
      '<div class="dl-report-note">' + _dlGu + ' 기준, 지난달 대비 방문이 늘어난 곳</div>' +
      '<div class="dl-rank-row">' +
      rows.map(function (r) {
        var p = _dlPct(r['성장율']);
        return '<div class="dl-rank-card" onclick="dlGoPlace(\'' + _dlAttr(r['관심지점명']) + '\')">' +
                 '<div class="dl-trend' + _dlPctCls(p.up) + '">' + (p.up === false ? '▼' : '▲') + ' ' + p.s.replace('-', '') + '</div>' +
                 '<div class="dl-rank-name">' + r['관심지점명'] + '</div>' +
                 '<div class="dl-rank-cat">' + (r['구분'] || '') + '</div>' +
               '</div>';
      }).join('') +
      '</div>';
  });
}

/* ── 전체 보기: 탭 3개 ── */
var _dlRepTab = 'hot';
var _dlFoodWho = '외지인';
function dlRepTab(k)  { _dlRepTab = k;   _dlViewReport(document.getElementById('view-datalab')); }
function dlFoodWho(w) { _dlFoodWho = w;  _dlViewReport(document.getElementById('view-datalab')); }
function dlRepGu(g)   { _dlGu = g;       _dlViewReport(document.getElementById('view-datalab')); }
function dlRepAge(a)  { _dlAge = a;      _dlViewReport(document.getElementById('view-datalab')); }

function _dlGuChips(fn) {
  return '<div class="dl-chip-row dl-chip-row--pad">' +
    ['동탄구','병점구','만세구','효행구'].map(function (g) {
      return '<button class="dl-chip' + (g === _dlGu ? ' active' : '') +
             '" onclick="' + fn + '(\'' + g + '\')">' + g + '</button>';
    }).join('') + '</div>';
}

function _dlViewReport(el) {
  if (!el) return;
  el.innerHTML = _dlHead('화성 관광 리포트') + _dlSkeleton(5);
  dlLoad(DL_STATS, function (d) {
    if (_dlView !== 'report') return;
    var tabs = [
      { k: 'hot',  label: '요즘 뜨는 곳' },
      { k: 'food', label: '맛집 순위' },
      { k: 'ai',   label: '방문 분석' },
    ];
    var body = '';

    if (_dlRepTab === 'hot') {
      var byAge = _dlStatsGroup(d, '핫플레이스', _dlGu);
      var ages  = _dlAges(byAge);
      if (ages.indexOf(_dlAge) < 0) _dlAge = ages[0];
      var rows = ((byAge && byAge[_dlAge]) || []).slice().sort(function (a, b) {
        return parseFloat(b['성장율']) - parseFloat(a['성장율']);
      });
      body = _dlGuChips('dlRepGu') +
        '<div class="dl-chip-row dl-chip-row--pad dl-chip-row--age">' +
          ages.map(function (a) {
            return '<button class="dl-chip sm' + (a === _dlAge ? ' active' : '') +
                   '" onclick="dlRepAge(\'' + a + '\')">' + a + '</button>';
          }).join('') +
        '</div>' +
        (rows.length
          ? '<div class="dl-list">' + rows.map(function (r, i) {
              var p = _dlPct(r['성장율']);
              return '<div class="dl-list-item" onclick="dlGoPlace(\'' + _dlAttr(r['관심지점명']) + '\')">' +
                       '<div class="dl-list-no' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
                       '<div class="dl-list-main">' +
                         '<div class="dl-list-name">' + r['관심지점명'] + '</div>' +
                         '<div class="dl-list-sub">' + (r['구분'] || '') + '</div>' +
                       '</div>' +
                       '<div class="dl-trend' + _dlPctCls(p.up) + '">' + (p.up === false ? '▼' : '▲') + ' ' + p.s.replace('-', '') + '</div>' +
                     '</div>';
            }).join('') + '</div>'
          : _dlEmpty('이 조건에는 자료가 없어요'));

    } else if (_dlRepTab === 'food') {
      var byWho = _dlStatsGroup(d, '맛집', '화성시전체');
      var rows2 = (byWho && byWho[_dlFoodWho]) || [];
      body =
        '<div class="dl-chip-row dl-chip-row--pad">' +
          ['외지인','현지인','전체'].map(function (w) {
            return '<button class="dl-chip' + (w === _dlFoodWho ? ' active' : '') +
                   '" onclick="dlFoodWho(\'' + w + '\')">' + w + '</button>';
          }).join('') +
        '</div>' +
        '<div class="dl-view-sub" style="padding-top:0">' +
          (_dlFoodWho === '외지인' ? '화성 밖에서 찾아온 사람들이 많이 간 곳이에요'
           : _dlFoodWho === '현지인' ? '화성에 사는 사람들이 많이 가는 곳이에요'
           : '외지인·현지인을 합친 순위예요') +
        '</div>' +
        (rows2.length
          ? '<div class="dl-list">' + rows2.map(function (r, i) {
              return '<div class="dl-list-item" onclick="dlGoPlace(\'' + _dlAttr(r['업소명']) + '\')">' +
                       '<div class="dl-list-no' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
                       '<div class="dl-list-main">' +
                         '<div class="dl-list-name">' + r['업소명'] + '</div>' +
                         '<div class="dl-list-sub">' + (r['분류'] || '') + '</div>' +
                       '</div>' +
                     '</div>';
            }).join('') + '</div>'
          : _dlEmpty('자료가 없어요'));

    } else {
      var ai = _dlStatsGroup(d, 'AI분석', '화성시전체') || {};
      var v  = (ai['방문자'] || [])[0] || {};
      var st = (ai['숙박_체류시간'] || [])[0] || {};
      var rel = (ai['연관지역'] || []);
      var inn = rel.filter(function (r) { return String(r['유입/유출 구분 코드 (1:유입 / 2:유출)']) === '1'; }).slice(0, 8);
      var out = rel.filter(function (r) { return String(r['유입/유출 구분 코드 (1:유입 / 2:유출)']) === '2'; }).slice(0, 8);

      function card(label, val, sub) {
        var p = _dlPct(val);
        return '<div class="dl-kpi">' +
                 '<div class="dl-kpi-lbl">' + label + '</div>' +
                 '<div class="dl-kpi-val' + _dlPctCls(p.up) + '">' + p.s + '</div>' +
                 (sub ? '<div class="dl-kpi-sub">' + sub + '</div>' : '') +
               '</div>';
      }
      function relList(title, arr, dir) {
        if (!arr.length) return '';
        return '<div class="dl-rel-title">' + title + '</div>' +
               '<div class="dl-list">' + arr.map(function (r) {
                 var name = dir === 'in' ? r['유입지역명'] : r['유출지역명'];
                 return '<div class="dl-list-item" style="cursor:default">' +
                          '<div class="dl-list-main"><div class="dl-list-name">' + name + '</div></div>' +
                          '<div class="dl-list-right">' + r['유입유출 비율'] + '%</div>' +
                        '</div>';
               }).join('') + '</div>';
      }

      body =
        '<div class="dl-view-sub">한국관광 데이터랩 · ' +
          (d && d['AI분석'] ? Object.keys(d['AI분석'])[0].split('_')[1] || '' : '') + ' 기준</div>' +
        '<div class="dl-kpi-row">' +
          card('화성시 방문자', v['기초지자체 증감률'], '경기도 ' + _dlPct(v['광역지자체 증감률']).s) +
          card('숙박 방문자', st['숙박방문자 증감률']) +
          card('체류시간', st['체류시간 증감률']) +
        '</div>' +
        relList('화성으로 들어오는 지역', inn, 'in') +
        relList('화성에서 나가는 지역', out, 'out');
    }

    el.innerHTML =
      _dlHead('화성 관광 리포트', '한국관광 데이터랩 공개 데이터 기반') +
      '<div class="dl-chip-row dl-chip-row--pad">' +
        tabs.map(function (t) {
          return '<button class="dl-chip' + (t.k === _dlRepTab ? ' active' : '') +
                 '" onclick="dlRepTab(\'' + t.k + '\')">' + t.label + '</button>';
        }).join('') +
      '</div>' + body + '<div style="height:28px"></div>';
  });
}
