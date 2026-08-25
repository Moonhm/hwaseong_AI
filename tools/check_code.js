#!/usr/bin/env node
/*
 * tools/check_code.js — 코드 축 검사 (node 필요, 없으면 check.sh 가 "건너뜀"을 찍는다)
 *
 * 이 저장소에는 번들러가 없다. index.html 의 onclick 122곳과 js/ 6개는
 * "전역 함수 이름" 이라는 규약 하나로만 묶여 있다. 그 규약이 깨져도
 *   - 페이지는 정상 렌더되고
 *   - index.html:3879 의 `typeof mergeParkingData === 'function' &&` 같은 단축 평가가 크래시를 막고
 *   - 콘솔에 한 줄 뜰 뿐 화면에는 "버튼을 눌렀는데 아무 일도 안 일어남" 으로만 보인다.
 * 그래서 정규식이 아니라 브라우저와 같은 로드 순서로 실제 파싱·실행해서 확인한다.
 *
 * 저장소 파일을 읽기만 하고 아무것도 쓰지 않는다(임시파일도 안 만든다).
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = process.env.HW_ROOT || path.resolve(__dirname, '..');
let FAILS = [];
const fail = m => FAILS.push(m);

/* js/ 파일 목록을 여기에 손으로 적지 않는다 — index.html 의 <script src> 나열에서 읽는다.
   손으로 적으면 파일이 늘었을 때 검사가 그 파일을 안 본 채 초록으로 통과한다.
   실제로 2026-08-25 인라인 JS 를 10개 파일로 분리했을 때, 하드코딩된 6개 목록이
   새 파일 10개를 통째로 놓쳐 "전역이 119개뿐" "go() 가 선언돼 있지 않다" 오탐을 냈다.
   순서도 index.html 을 따른다 = 브라우저의 실제 로드 순서와 항상 일치한다. */
const JS = (() => {
  const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');                       // 주석 속 태그는 무시
  const listed = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']js\/([^"'?]+)/gi)].map(m => m[1]);
  const onDisk = fs.readdirSync(path.join(R, 'js')).filter(f => f.endsWith('.js'));
  for (const f of onDisk) {
    if (!listed.includes(f)) fail(`js/${f} 가 디스크에 있는데 index.html 이 안 부른다 — 죽은 파일이거나 <script src> 를 빠뜨렸다`);
  }
  for (const f of listed) {
    if (!onDisk.includes(f)) fail(`index.html 이 js/${f} 를 부르는데 파일이 없다 — 404 가 나고 그 파일의 함수가 전부 죽는다`);
  }
  return listed.filter(f => onDisk.includes(f));
})();


/* index.html 의 인라인 <script> 만 뽑되, 원본 줄 번호를 보존하려고 앞을 개행으로 채운다.
   줄 번호가 어긋나면 사람이 에디터에서 못 찾아가고, 못 찾아가는 검사는 곧 무시된다. */
function inlineJs() {
  /* HTML 주석을 먼저 공백으로 지운다(개행 보존). 주석 안에 <script> 라는 '글자'가 있으면
     아래 정규식이 그것을 진짜 태그로 읽어 HTML 을 JS 로 검사하다 문법 오류를 낸다.
     실제로 2026-08-25 인라인 JS 분리 때 남긴 안내 주석이 이 사고를 냈다. */
  const s = fs.readFileSync(path.join(R, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ' '));
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let out = '', m;
  while ((m = re.exec(s))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;                    // 외부 스크립트는 아래에서 따로 본다
    if (/\btype\s*=\s*["']?(?!text\/javascript|module)/i.test(m[1])) continue; // JSON-LD 등 비-JS 블록 제외
    const ln = s.slice(0, m.index).split('\n').length;
    const cur = out.split('\n').length - 1;
    out += '\n'.repeat(Math.max(0, ln - 1 - cur)) + m[2];
  }
  return out;
}

/* 브라우저 로드 순서: index.html 인라인이 먼저, 그다음 <script src> 순서 (index.html:3891-3897) */
const ORDER = [['index.html', inlineJs()]]
  .concat(JS.map(f => ['js/' + f, fs.readFileSync(path.join(R, 'js', f), 'utf8')]));

/* ── A. 문법 ────────────────────────────────────────────────────────────────
   node --check 는 .js 파일만 본다. 정작 로직의 절반(index.html 인라인 2,085줄)이
   그 사각지대에 있어서, vm.Script 로 직접 파싱한다. 실행은 하지 않는다. */
function checkSyntax() {
  let bad = 0;
  for (const [label, code] of ORDER) {
    try { new vm.Script(code, { filename: label }); }
    catch (e) {
      bad++;
      const at = (e.stack || '').split('\n')[0].replace(/^.*?([^/\\]+:\d+)$/, '$1');
      fail(`문법 오류  ${label}: ${e.message.split('\n')[0]}  @${at}`);
    }
  }
  if (!bad) console.log(`  i   문법 OK (index.html 인라인 + js ${JS.length}개)`);
  return bad === 0;
}

/* stub 전역 — 최상위 코드가 document/kakao/localStorage 를 만져도 죽지 않게. */
function mkCtx() {
  const noop = new Proxy(function () {}, {
    get: () => noop, set: () => true, apply: () => noop, construct: () => noop,
  });
  const c = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    fetch: () => new Promise(() => {}), Promise, JSON, Math, Date, RegExp, Object, Array,
    String, Number, Boolean, Error, Map, Set, parseInt, parseFloat, isNaN, encodeURIComponent,
    decodeURIComponent, document: noop, navigator: noop, location: noop, localStorage: noop,
    sessionStorage: noop, kakao: noop, alert() {}, confirm: () => false,
    requestAnimationFrame: () => 0, addEventListener() {}, removeEventListener() {},
    matchMedia: () => noop, screen: noop, history: noop, performance: { now: () => 0 },
  };
  c.window = c; c.self = c; c.globalThis = c;
  return vm.createContext(c);
}

/* ── B. 전역 이름 충돌 ──────────────────────────────────────────────────────
   225개 전역에 네임스페이스가 0이고, 개발/배포 Claude 둘이 같은 저장소를 쓴다.
   (a) 파일마다 fresh 컨텍스트로 돌려 var/function 이름이 겹치는지 = 조용한 덮어쓰기
   (b) 공유 컨텍스트에 순차 실행해 let/const/class 재선언 = 그 파일 전체가 한 줄도 안 도는 SyntaxError
   실증: js/localcurrency.js 끝에 `const PLACES=[]` 하나면 그 파일이 통째로 죽어
   지역화폐 버튼 3개가 함께 사라지는데 화면은 멀쩡해 보인다. */
function checkGlobals() {
  const owner = {}, dups = [], lex = [];
  for (const [label, code] of ORDER) {
    const ctx = mkCtx(), before = new Set(Object.getOwnPropertyNames(ctx));
    try { vm.runInContext(code, ctx, { filename: label, timeout: 8000 }); }
    catch (e) { console.log(`  WARN ${label} 이 stub 환경에서 예외로 중단: ${e.message.split('\n')[0]}`);
                console.log('       → 그 이후 선언은 이 검사가 못 본다(미탐). stub 을 보강하라'); }
    for (const k of Object.getOwnPropertyNames(ctx)) {
      if (before.has(k)) continue;
      if (owner[k]) dups.push(`${k}: ${owner[k]} 의 것을 ${label} 가 덮어쓴다`);
      else owner[k] = label;
    }
  }
  const shared = mkCtx();
  for (const [label, code] of ORDER) {
    try { new vm.Script(code, { filename: label }).runInContext(shared, { timeout: 8000 }); }
    catch (e) { if (/already been declared/.test(e.message)) lex.push(`${label}: ${e.message.split('\n')[0]}  → 이 파일이 통째로 실행되지 않는다`); }
  }
  const n = Object.keys(owner).length;
  if (n < 200) fail(`전역이 ${n}개뿐이다 (기준선 225) — 스크립트 하나가 통째로 죽었을 수 있다`);
  dups.forEach(d => fail('전역 덮어쓰기  ' + d));
  lex.forEach(d => fail('재선언  ' + d));
  if (!dups.length && !lex.length) console.log(`  i   전역 ${n}개 / 덮어쓰기 0 / let·const 재선언 0 (기준선 225)`);
  return shared;
}

/* ── C. 죽은 인라인 핸들러 ──────────────────────────────────────────────────
   판정을 정규식이 아니라 `typeof X === 'function'` 으로 한다.
   그래야 var / function / const / class / window.X = ... 를 전부 정확히 커버한다.
   js/*.js 가 템플릿 문자열로 만들어내는 onclick 도 원문 텍스트에서 함께 긁는다
   (index.html 만 세면 39개, js/*.js 생성분까지 합치면 55개). */
function checkHandlers(ctx) {
  const KW = new Set(['if','for','while','switch','catch','return','typeof','function','new',
                      'else','do','try','delete','void','in','of','this','event','e','await']);
  const H = /\bon(?:click|change|input|submit|load|error|keyup|keydown|keypress|focus|blur|touchstart|touchend|mouseover|mouseout)\s*=\s*(\\?["'`])([\s\S]*?)\1/gi;
  const FN = /(?<![\w.$'"])([A-Za-z_$][\w$]*)\s*\(/g;   // 룩비하인드가 없으면 event.stopPropagation() 이 오탐된다
  const found = {};
  for (const f of ['index.html'].concat(JS.map(x => 'js/' + x))) {
    const s = fs.readFileSync(path.join(R, f), 'utf8');
    let m; H.lastIndex = 0;
    while ((m = H.exec(s))) {
      const ln = s.slice(0, m.index).split('\n').length;
      let fm; FN.lastIndex = 0;
      while ((fm = FN.exec(m[2]))) {
        if (KW.has(fm[1])) continue;
        (found[fm[1]] = found[fm[1]] || []).push(`${f}:${ln}`);
      }
    }
  }
  let dead = 0;
  for (const name of Object.keys(found).sort()) {
    let t; try { t = vm.runInContext('typeof ' + name, ctx); } catch (_) { t = '<err>'; }
    if (t !== 'function') {
      dead++;
      fail(`죽은 버튼  ${name}() 가 선언돼 있지 않다 (typeof=${t})  ← ${found[name].slice(0, 3).join(', ')}`);
    }
  }
  if (!dead) console.log(`  i   인라인 핸들러 고유 함수 ${Object.keys(found).length}개 전부 선언됨 (기준선 55)`);
}

/* ── D. 전역 배열의 빈칸·null 원소 ────────────────────────────────────────
   왜 필요한가: 2026-08-26 js/data.js:140 이 `},,` 로 끝나 PLACES 에 빈칸이
   하나 생겼다. 이건 문법 오류가 '아니라서' A 검사를 그냥 통과했고,
   filter()·forEach() 는 빈칸을 건너뛰므로 목록 화면도 멀쩡해 보였다.
   그런데 find() 는 빈칸을 undefined 로 '방문'한다 — 그래서
   goMapFocus(js/tourism.js) 의 PLACES.find(x => x.id === placeId) 가
   빈칸 뒤쪽 항목을 누를 때마다 TypeError 로 죽었다(전체 251곳 중 114곳).
   길이만 세는 검사로는 절대 못 잡는다. 원소를 하나씩 봐야 한다. */
function checkArrayHoles(ctx) {
  /* 이름을 Object.getOwnPropertyNames(ctx) 로 모으면 안 된다 —
   * `const PLACES = [...]` 는 렉시컬 바인딩이라 컨텍스트 객체의 속성이 되지 않는다.
   * 실제로 그렇게 짰다가 무관한 var 배열 4개만 훑고 '0건'이라 답하는 미탐을 냈다.
   * 그래서 원문에서 선언 이름을 긁어 컨텍스트 '안에서' 평가한다. */
  const DECL = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/gm;
  const names = new Set();
  for (const [, code] of ORDER) {
    let m; DECL.lastIndex = 0;
    while ((m = DECL.exec(code))) names.add(m[1]);
  }
  let bad = 0, scanned = 0, total = 0;
  for (const k of names) {
    let v;
    try { v = vm.runInContext(`typeof ${k} !== 'undefined' ? ${k} : null`, ctx, { timeout: 4000 }); }
    catch (_) { continue; }
    if (!Array.isArray(v) || !v.length) continue;
    scanned++; total += v.length;
    for (let i = 0; i < v.length; i++) {
      if (i in v && v[i] != null) continue;
      const near = (v[i - 1] && v[i - 1].name) || (v[i + 1] && v[i + 1].name) || '?';
      fail(`${k}[${i}] 가 ${i in v ? 'null' : '빈칸'} ('${near}' 부근) ` +
           `— 쉼표가 두 번 찍혔는지 보라. find() 가 이 지점에서 TypeError 로 죽는다`);
      if (++bad >= 5) return;
    }
  }
  /* 볼 게 없으면 통과가 아니라 실패다. 조용한 0건이 이 검사를 무력화했던 전례가 있다. */
  if (!scanned) fail('전역 배열을 하나도 못 찾았다 — 이 검사가 무력화됐다(미탐). DECL 정규식을 확인하라');
  else if (!bad) console.log(`  i   전역 배열 ${scanned}개 원소 ${total}개 빈칸·null 0`);
}

console.log('── 코드 축 검사 (tools/check_code.js) ─────────────────────────────');
const ok = checkSyntax();
if (!ok) {
  console.log('  !   문법이 깨진 상태라 전역·핸들러 검사는 건너뛴다 (결과가 무의미하므로)');
} else {
  const ctx = checkGlobals();
  checkHandlers(ctx);
  checkArrayHoles(ctx);
}
FAILS.forEach(m => console.log('  FAIL ' + m));
console.log(`  ── FAIL ${FAILS.length}`);
process.exit(FAILS.length ? 1 : 0);
