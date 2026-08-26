/* ============================================================================
 * js/quiz.js — AI 관광지 추천 퀴즈 (5문항)
 *
 * 왜 따로 있나: 오버레이 하나로 완결되고 다른 화면과 상태를 공유하지 않는다. _quizStep 등 상태 변수가 이 파일 밖에서 쓰이지 않는다.
 * 함께 볼 것:   추천 로직 _computeRec() 은 js/data.js 의 tags 필드에 의존한다.
 *
 * index.html 인라인 <script> 1853~2104줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ══════════════════════════════════════════
   관광지 추천 퀴즈
   ══════════════════════════════════════════ */
var QUIZ_QS = [
  {
    q: '어떤 여행 스타일을 좋아하세요?',
    opts: [
      { label: '🌿\n자연 속 힐링', tags: ['자연','힐링','조용한'] },
      { label: '🏛️\n역사·문화 탐방', tags: ['역사','문화','전통'] },
      { label: '🌊\n바다·해안 즐기기', tags: ['바다','해안','일몰'] },
      { label: '🎡\n체험·놀이 중심', tags: ['체험','이색','가족'] },
    ]
  },
  {
    q: '누구와 함께 가시나요?',
    opts: [
      { label: '👫\n연인과 둘이', tags: ['낭만','일몰','사진','힐링'] },
      { label: '👨‍👩‍👧\n가족 나들이', tags: ['가족','체험','자연'] },
      { label: '👭\n친구들과', tags: ['사진','이색','바다'] },
      { label: '🧘\n혼자서', tags: ['조용한','역사','자연','힐링'] },
    ]
  },
  {
    q: '어떤 풍경을 좋아하세요?',
    opts: [
      { label: '🌅\n일몰·바다 뷰', tags: ['일몰','바다','해안','사진'] },
      { label: '🌸\n꽃·정원', tags: ['꽃','자연','힐링','사진'] },
      { label: '⛩️\n고궁·유적지', tags: ['역사','문화','전통'] },
      { label: '🦕\n특이하고 신기한', tags: ['이색','체험','가족'] },
    ]
  },
  {
    q: '여행에서 꼭 하고 싶은 것은?',
    opts: [
      { label: '📸\n인생 사진 찍기', tags: ['사진','일몰','꽃','낭만'] },
      { label: '🚶\n천천히 산책하기', tags: ['힐링','조용한','자연'] },
      { label: '🍽️\n해산물 맛집 탐방', tags: ['바다','해산물','해안'] },
      { label: '🎭\n다양한 체험하기', tags: ['체험','가족','이색'] },
    ]
  },
  {
    q: '선호하는 여행 분위기는?',
    opts: [
      { label: '🌊\n탁 트인 바다', tags: ['바다','해안','일몰','사진'] },
      { label: '🌿\n고요한 자연', tags: ['자연','힐링','조용한','꽃'] },
      { label: '🏛️\n유서 깊은 장소', tags: ['역사','문화','전통'] },
      { label: '🎡\n즐거운 체험', tags: ['체험','이색','가족'] },
    ]
  },
];

/* 장소 태그 반환 — place.tags 우선, 없으면 텍스트 키워드 추출 */
function _getSpotTags(place) {
  if (place.tags && place.tags.length) return place.tags;
  var tags = [];
  var txt = ((place.name || '') + ' ' + (place.desc || '') + ' ' + (place.address || '')).toLowerCase();
  if (/해변|해안|해수욕|포구|항|제부도|섬|바다/.test(txt))      tags.push('바다', '해안');
  if (/일몰|석양|노을|해넘이/.test(txt))                          tags.push('일몰', '사진', '낭만');
  if (/꽃|식물원|정원|수목원|장미|튤립|코스모스|연꽃/.test(txt)) tags.push('꽃', '자연', '힐링', '사진');
  if (/공룡|화석|고생물/.test(txt))                               tags.push('이색', '가족', '체험');
  if (/궁|행궁|왕릉|릉\b|사찰|절|사원|성벽|성곽|유적|고분|당성|매향/.test(txt)) tags.push('역사', '문화', '전통');
  if (/박물관|미술관|전시관|역사관|기념관/.test(txt))             tags.push('역사', '문화');
  if (/농원|농장|체험|테마|파크|놀이|공원/.test(txt))             tags.push('체험', '가족', '이색');
  if (/호수|저수지|습지|철새|생태/.test(txt))                     tags.push('자연', '힐링', '조용한', '사진');
  if (/산|숲|계곡|자연휴양/.test(txt))                            tags.push('자연', '힐링');
  if (/해산물|수산|어시장|생선|횟집/.test(txt))                   tags.push('해산물', '바다');
  if (/궁평|전곡|백미리|우음도|국화/.test(txt))                   tags.push('사진', '낭만');
  if (!tags.length) tags.push('자연', '힐링', '관광');
  return tags.filter(function(t, i, arr) { return arr.indexOf(t) === i; });
}

function _recFbEmoji(tags) {
  if (tags.indexOf('바다')  >= 0) return '🌊';
  if (tags.indexOf('꽃')    >= 0) return '🌸';
  if (tags.indexOf('이색')  >= 0) return '🦕';
  if (tags.indexOf('역사')  >= 0) return '🏛️';
  if (tags.indexOf('자연')  >= 0) return '🌿';
  return '📍';
}

/* 태그 교집합으로 TOP3 추천 */
function _computeRec(userTags) {
  if (typeof PLACES === 'undefined') return [];
  var spots = PLACES.filter(function(p) { return p.category === 'tourist'; });
  var scored = spots.map(function(p) {
    var pTags = _getSpotTags(p);
    var score = userTags.reduce(function(acc, t) {
      return acc + (pTags.indexOf(t) >= 0 ? 1 : 0);
    }, 0);
    return { place: p, tags: pTags, score: score };
  });
  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, 3);
}

var _quizStep   = 0;
var _quizTags   = [];
var _quizScreen = 'intro';
var _quizResults = [];

function openQuiz() {
  closeMenu();
  _quizStep   = 0;
  _quizTags   = [];
  _quizScreen = 'intro';
  var ov = document.getElementById('quiz-overlay');
  ov.classList.add('open');
  ov.scrollTop = 0;
  document.getElementById('quiz-dim').classList.add('open');
  _renderQuizBody();
}

function closeQuiz() {
  document.getElementById('quiz-overlay').classList.remove('open');
  var dim = document.getElementById('quiz-dim');
  if (dim) dim.classList.remove('open');
  /* 방금 끝낸 퀴즈가 배너에 즉시 반영되게 한다. 오버레이를 닫는 경로는 셋인데
   * (뒤로가기 · 딤 클릭 · go()) 셋 다 이 함수를 지나므로 여기 한 줄이면 전부 덮인다. */
  if (typeof renderRecBannerTop === 'function') renderRecBannerTop();
}

function _renderQuizBody() {
  var body = document.getElementById('quiz-body');
  if (_quizScreen === 'intro') {
    var stored = null;
    try { stored = localStorage.getItem('hwaseong_rec'); } catch (e) {}
    body.innerHTML =
      '<div class="quiz-intro">'
      + '<div class="quiz-intro-icon">🗺️</div>'
      + '<div class="quiz-intro-title">화성 어디 가실래요?</div>'
      + '<div class="quiz-intro-desc">5가지 질문으로 나에게 꼭 맞는<br>화성 관광지를 추천해드려요!</div>'
      + '<button class="quiz-start-btn" onclick="_quizBegin()">시작하기 →</button>'
      + (stored ? '<button class="quiz-prev-btn" onclick="_quizShowStored()">이전 결과 보기</button>' : '')
      + '</div>';
  } else if (_quizScreen === 'quiz') {
    _renderQuizQuestion();
  } else {
    _renderQuizResult();
  }
}

function _quizBegin() {
  _quizStep = 0; _quizTags = []; _quizScreen = 'quiz';
  _renderQuizBody();
}

function _quizSelectOpt(idx) {
  var opt = QUIZ_QS[_quizStep].opts[idx];
  _quizTags = _quizTags.concat(opt.tags);
  _quizStep++;
  if (_quizStep >= QUIZ_QS.length) {
    _quizResults = _computeRec(_quizTags);
    /* 쿠키 차단·저장소 초과 시 setItem 이 예외를 던져 결과 화면 전환이 통째로 중단된다. */
    try { localStorage.setItem('hwaseong_rec', JSON.stringify({ tags: _quizTags })); } catch (e) {}
    _quizScreen = 'result';
  }
  _renderQuizBody();
  document.getElementById('quiz-overlay').scrollTop = 0;
}

function _renderQuizQuestion() {
  var q = QUIZ_QS[_quizStep];
  var pct = Math.round((_quizStep / QUIZ_QS.length) * 100);
  document.getElementById('quiz-body').innerHTML =
    '<div class="quiz-card">'
    + '<div class="quiz-step-label">' + (_quizStep + 1) + ' / ' + QUIZ_QS.length + '</div>'
    + '<div class="quiz-progress-track">'
    + '  <div class="quiz-progress-fill" style="transform:scaleX(' + (pct / 100).toFixed(3) + ')"></div>'
    + '</div>'
    + '<div class="quiz-question">' + q.q + '</div>'
    + '<div class="quiz-options-grid">'
    + q.opts.map(function(o, i) {
        return '<button class="quiz-option-btn" onclick="_quizSelectOpt(' + i + ')">'
          + o.label.replace('\n', '<br>') + '</button>';
      }).join('')
    + '</div>'
    + '</div>';
}

function _renderQuizResult() {
  var RANK_BADGES = ['✨ Best Match', '2nd Pick', '3rd Pick'];
  var RANK_EMOJIS = ['🥇', '🥈', '🥉'];

  var cardsHtml = _quizResults.map(function(r, i) {
    var p      = r.place;
    var tags   = r.tags.slice(0, 4);
    var fb     = _recFbEmoji(r.tags);
    var imgSrc = placePhotoSrc(p);
    var addr   = p.address ? p.address.split(' ').slice(1).join(' ') : '';

    /* desc: 관광지 설명 (첫 문장만) */
    var rawDesc = (p.desc || '').split('|')[0].trim();
    var desc    = rawDesc.length > 80 ? rawDesc.slice(0, 80) + '…' : rawDesc;

    var focusFn = 'closeQuiz();goMapFocus(' + p.lat + ',' + p.lng + ',4,' + p.id + ')';
    var routeFn = 'openRoute(' + p.lat + ',' + p.lng + ',\'' + p.name.replace(/'/g, '') + '\')';

    return '<div class="rec-card rank-' + (i + 1) + '" style="animation-delay:' + (i * 0.12) + 's">'
      /* 사진 영역 */
      + '<div class="rec-card-photo">'
      + '  <div class="rec-card-photo-fb">' + fb + '</div>'
      + '  <img src="' + imgSrc + '" alt="' + p.name + '"'
      + '       style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"'
      + '       onerror="this.style.display=\'none\'">'
      + '  <div class="rec-rank-badge">' + RANK_BADGES[i] + '</div>'
      + '</div>'
      /* 본문 */
      + '<div class="rec-card-body">'
      + '  <div class="rec-card-name">' + RANK_EMOJIS[i] + ' ' + p.name + '</div>'
      + '  <div class="rec-card-addr">📍 ' + addr + '</div>'
      + (desc ? '  <div class="rec-card-desc">' + desc + '</div>' : '')
      + '  <div class="rec-tags">'
      +    tags.map(function(t) { return '<span class="rec-tag">#' + t + '</span>'; }).join('')
      + '  </div>'
      + '  <div class="rec-card-actions">'
      + '    <button class="rec-action-btn primary" onclick="' + focusFn + '">🗺️ 지도에서 보기</button>'
      + '    <button class="rec-action-btn secondary" onclick="' + routeFn + '">길찾기</button>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('quiz-body').innerHTML =
    '<div class="rec-result-header">'
    + '<span class="rec-result-emoji">🎯</span>'
    + '<div class="rec-result-title">당신을 위한 추천 관광지</div>'
    + '<div class="rec-result-sub">화성에서 딱 맞는 여행지를 찾았어요!<br>베스트 매치부터 확인해보세요 ✨</div>'
    + '</div>'
    + cardsHtml
    + '<div class="rec-restart-wrap">'
    + '  <button class="rec-restart-btn" onclick="_quizBegin()">🔄 다시 테스트하기</button>'
    + '</div>';

  /* 스크롤 상단 + 카드 순차 등장 */
  document.getElementById('quiz-overlay').scrollTop = 0;
  requestAnimationFrame(function() {
    document.querySelectorAll('#quiz-body .rec-card').forEach(function(card, i) {
      setTimeout(function() { card.classList.add('visible'); }, 80 + i * 150);
    });
  });
}

function _quizShowStored() {
  var stored = null;
  try { stored = localStorage.getItem('hwaseong_rec'); } catch (e) {}
  _quizTags = [];
  if (stored) {
    try { var d = JSON.parse(stored); _quizTags = d.tags || []; } catch (e) {}
  }
  _quizResults = _computeRec(_quizTags);
  _quizScreen  = 'result';
  _renderQuizBody();
  document.getElementById('quiz-overlay').scrollTop = 0;
}


/* ── 배너 확장 구간 — 마지막 퀴즈의 1위 (2026-08-26, 사용자 요청) ──────────────
 * 추천 탭의 '🎯 나에게 맞는 관광지 찾기' 배너를 아래로 80px 늘려
 * (css/90-misc.css 의 .menu-rec-banner--top) 그 자리에 '최근 내 1위' 한 곳을 얹는다.
 * 그리는 주체는 이 함수 하나뿐이다.
 *
 * 왜 quiz.js 인가: 여기서 쓰는 것 셋(hwaseong_rec 키 · _computeRec · _recFbEmoji)이
 *   전부 이 파일 것이다. 다른 파일에 두면 그쪽이 밑줄로 시작하는 사설 함수 둘에
 *   의존하게 되고, 퀴즈 로직을 고칠 때 엉뚱한 파일이 조용히 깨진다.
 *
 * 결과는 저장돼 있지 않다 — 태그만 저장한다(_quizSelectOpt). 그래서 매번 재계산한다.
 *   그 편이 오히려 정확하다: 그 사이 data.js 에 관광지가 추가·수정되면 저장된
 *   1위는 낡은 값이지만, 재계산은 늘 '지금 데이터 기준의 1위' 를 낸다.
 *
 * 못 그릴 때 '결과 없음' 상자를 남기지 않고 통째로 지우는 이유:
 *   바로 위 두 줄이 이미 "5가지 질문이면…" + "시작하기 →" 라는 안내다.
 *   그 아래 "아직 결과가 없어요" 를 또 두면 같은 말을 두 번 하면서 배너만 길어진다.
 *   퀴즈를 안 해 본 사람에게는 예전과 똑같은 배너가 보이는 게 맞다. */
function renderRecBannerTop() {
  var banner = document.getElementById('rec-banner');
  var box    = document.getElementById('rec-banner-top');
  if (!banner || !box) return;

  /* 못 그리는 모든 경우의 공통 출구 — 확장 전 배너로 되돌린다. */
  function _off() {
    box.innerHTML = '';
    banner.classList.remove('menu-rec-banner--top');
  }

  /* 쿠키 차단·프라이빗 모드에서는 읽기(getItem)도 던진다. 저장 쪽과 같은 사정이다.
   * 여기서 안 잡으면 예외가 closeQuiz() 를 뚫고 나가 go() 가 중단되고 탭 전환이 죽는다. */
  var raw = null;
  try { raw = localStorage.getItem('hwaseong_rec'); } catch (e) { raw = null; }
  if (!raw) { _off(); return; }                      /* 퀴즈를 한 번도 안 돌린 사람 */

  var tags = null;
  try { var d = JSON.parse(raw); tags = d && d.tags; } catch (e) { tags = null; }
  /* ⚠ Array.isArray 로 확인한다. (!tags || !tags.length) 만 보면 문자열 "바다"가
   * length 2 로 통과하고, 그다음 _computeRec 안의 userTags.reduce 가 TypeError 를
   * 던진다. 이 함수는 closeQuiz() 안에서 불리고 closeQuiz() 는 go() 의 첫 줄이라,
   * 그 예외 하나가 go() 를 중단시켜 하단 내비 네 탭이 전부 먹통이 된다. */
  if (!Array.isArray(tags) || !tags.length) { _off(); return; }

  /* PLACES 미로드면 _computeRec 이 [] 를 준다 → top 은 undefined.
   * 위 가드를 통과해도 데이터가 반쯤 로드된 상태 등에서 던질 수 있어 함께 감싼다. */
  var list = [];
  try { list = _computeRec(tags) || []; } catch (e) { _off(); return; }
  var top = list[0];
  /* score 0 은 '태그가 하나도 안 맞았다' 는 뜻이라 1위가 아니다 —
   * 배열 첫 관광지를 '당신의 1위' 라고 부르는 거짓말을 여기서 막는다. */
  if (!top || !top.place || !top.score) { _off(); return; }

  var p     = top.place;
  var fb    = _recFbEmoji(top.tags);
  /* 읍·면·동으로 끝나는 첫 토큰을 고른다. parts[2] 로 집으면 화성시가 4개 구로
   * 개편된 뒤의 주소("경기도 화성시 동탄구 …")에서 '동탄구' 가 잡힌다 — 구는
   * 읍면동이 아니다. 못 찾으면 아예 안 쓴다(틀린 지명을 보여 주느니 낫다). */
  var _m   = /([가-힣]+(?:읍|면|동))(?:\s|$)/.exec(p.address || '');
  var dong = _m ? _m[1] : '';

  /* photoThumb 은 hasPhoto 로 먼저 걸러 사진이 없으면 '' 를 준다.
   * 그 '' 를 그대로 쓰면 빈칸이 되므로 이모지 상자로 갈아 끼운다.
   * 클래스를 넘기는 이유는 .ph-thumb 기본값(회색 바탕·9px 이모지)이 이 배너의
   * 살구색 위에서 어색하기 때문이다 — css/90-misc.css 에서 덮어쓴다. */
  var thumb = (typeof photoThumb === 'function') ? photoThumb(p, 44, fb, 'menu-rec-top-ph') : '';
  if (!thumb) thumb = '<div class="menu-rec-top-fb">' + fb + '</div>';

  /* 클릭은 퀴즈가 아니라 지도로 보낸다. 근거 셋:
   *   ① 바로 위 '시작하기 →' 가 이미 퀴즈 진입이다. 같은 상자에서 두 번 보낼 이유가 없다.
   *   ② 이 앱에서 [사진+이름+주소] 한 줄은 어디서나 '누르면 지도' 다(.recent-card 등).
   *   ③ 사용자가 원한 건 1등으로 나왔던 그곳으로 가는 지름길이다.
   * 배너 전체에 openQuiz() 가 걸려 있으므로 stopPropagation 이 반드시 필요하다.
   * 이름을 인자로 넘기지 않으므로 따옴표 이스케이프 문제도 없다. */
  box.innerHTML =
    '<div class="menu-rec-top" onclick="event.stopPropagation();goMapFocus('
      + p.lat + ',' + p.lng + ',4,' + p.id + ')">'
    + thumb
    + '<div class="menu-rec-top-info">'
    +   '<div class="menu-rec-top-label">최근 내 1위' + (dong ? ' · ' + dong : '') + '</div>'
    +   '<div class="menu-rec-top-name">' + p.name + '</div>'
    + '</div>'
    + '<div class="menu-rec-top-go">'
    +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</div>'
    + '</div>';
  banner.classList.add('menu-rec-banner--top');
}

