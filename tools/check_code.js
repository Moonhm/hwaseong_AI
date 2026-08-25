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
const JS = ['convenience.js', 'data.js', 'map.js', 'conv_map.js', 'parking.js', 'localcurrency.js'];

let FAILS = [];
const fail = m => FAILS.push(m);

/* index.html 의 인라인 <script> 만 뽑되, 원본 줄 번호를 보존하려고 앞을 개행으로 채운다.
   줄 번호가 어긋나면 사람이 에디터에서 못 찾아가고, 못 찾아가는 검사는 곧 무시된다. */
function inlineJs() {
  const s = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
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

console.log('── 코드 축 검사 (tools/check_code.js) ─────────────────────────────');
const ok = checkSyntax();
if (!ok) {
  console.log('  !   문법이 깨진 상태라 전역·핸들러 검사는 건너뛴다 (결과가 무의미하므로)');
} else {
  const ctx = checkGlobals();
  checkHandlers(ctx);
}
FAILS.forEach(m => console.log('  FAIL ' + m));
console.log(`  ── FAIL ${FAILS.length}`);
process.exit(FAILS.length ? 1 : 0);
