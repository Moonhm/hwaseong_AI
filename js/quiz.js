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
      { label: '🏛\n역사·문화 탐방', tags: ['역사','문화','전통'] },
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
      { label: '⛩\n고궁·유적지', tags: ['역사','문화','전통'] },
      { label: '🦕\n특이하고 신기한', tags: ['이색','체험','가족'] },
    ]
  },
  {
    q: '여행에서 꼭 하고 싶은 것은?',
    opts: [
      { label: '📸\n인생 사진 찍기', tags: ['사진','일몰','꽃','낭만'] },
      { label: '🚶\n천천히 산책하기', tags: ['힐링','조용한','자연'] },
      { label: '🍽\n해산물 맛집 탐방', tags: ['바다','해산물','해안'] },
      { label: '🎭\n다양한 체험하기', tags: ['체험','가족','이색'] },
    ]
  },
  {
    q: '선호하는 여행 분위기는?',
    opts: [
      { label: '🌊\n탁 트인 바다', tags: ['바다','해안','일몰','사진'] },
      { label: '🌿\n고요한 자연', tags: ['자연','힐링','조용한','꽃'] },
      { label: '🏛\n유서 깊은 장소', tags: ['역사','문화','전통'] },
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
  if (tags.indexOf('역사')  >= 0) return '🏛';
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
    var imgSrc = 'assets/images/places/' + p.name + '.jpg';
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
      + '    <button class="rec-action-btn primary" onclick="' + focusFn + '">🗺 지도에서 보기</button>'
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

