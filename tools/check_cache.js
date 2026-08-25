#!/usr/bin/env node
/*
 * tools/check_cache.js — 편의정보 좌표 캐시 무효화 검사 (node + git 필요)
 *
 * 왜 이게 필요한가:
 *   js/conv_map.js:107,230 이 지오코딩 결과를 localStorage
 *   'hwaseong_conv_' + CONV_CACHE_VER + '_' + cat 에 영구 저장한다.
 *   js/conv_map.js:88-104 의 _loadConvCache 는 `!places.length` 만 보고 건수는 안 본다.
 *   즉 js/convenience.js 의 데이터를 고쳐도 CONV_CACHE_VER(js/conv_map.js:74)를 안 올리면
 *   재방문자에게는 옛 좌표·옛 목록이 계속 나간다. 서버·콘솔·네트워크 어디에도 흔적이 없다.
 *
 *   파일 소유가 갈려 있어서(WORKFLOW.md §17 convenience.js=배포 / :655 conv_map.js=개발)
 *   이 규칙은 이미 두 번 깨졌다 — 이 검사로 재현 확인함:
 *     d7d67b9 → [restaurants] 변경, v5→v5 = FAIL
 *     5404403 → [touristRestaurants] 변경, v4→v4 = FAIL
 *     a637fcc → jebu 만 변경(캐시 비대상) = 통과
 *
 * diff 가 아니라 "평가된 객체 값" 을 비교한다 → 주석·들여쓰기만 바꾼 커밋은 걸리지 않는다.
 *
 * 사용: HW_BASE=<git ref> node tools/check_cache.js   (기본 HEAD)
 *   - 커밋 전 훅이면 HEAD, PR 이면 머지베이스를 넣어라.
 */
const { execSync } = require('child_process');
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = process.env.HW_ROOT || path.resolve(__dirname, '..');
const BASE = process.env.HW_BASE || 'HEAD';

/* jebu 는 js/conv_map.js:115 에서 캐시를 안 타므로 대상에서 뺀다 */
const CACHED = ['restaurants', 'touristRestaurants', 'hotels', 'camping', 'templeStay'];

function evalConv(code) {
  const c = vm.createContext({});
  vm.runInContext(code, c);
  return vm.runInContext('CONVENIENCE', c);
}
function ver(code) {
  const m = /CONV_CACHE_VER\s*=\s*'([^']*)'/.exec(code);
  return m ? m[1] : null;
}

let oldConv, oldVer;
try {
  oldConv = evalConv(execSync(`git -C "${R}" show ${BASE}:js/convenience.js`, { maxBuffer: 1e8 }).toString());
  oldVer  = ver(execSync(`git -C "${R}" show ${BASE}:js/conv_map.js`, { maxBuffer: 1e8 }).toString());
} catch (e) {
  console.log(`  SKIP  git ref '${BASE}' 에서 이전 판을 못 읽었다 — 비교할 기준이 없다 (${e.message.split('\n')[0]})`);
  process.exit(0);
}
const newConv = evalConv(fs.readFileSync(path.join(R, 'js/convenience.js'), 'utf8'));
const newVer  = ver(fs.readFileSync(path.join(R, 'js/conv_map.js'), 'utf8'));

const changed = CACHED.filter(k => JSON.stringify(oldConv[k]) !== JSON.stringify(newConv[k]));
if (!changed.length) {
  console.log(`  i   캐시 대상 카테고리 변경 없음 (CONV_CACHE_VER='${newVer}', base=${BASE})`);
  process.exit(0);
}
if (newVer === oldVer) {
  console.log(`  FAIL js/convenience.js  [${changed.join(', ')}] 가 바뀌었는데 `
            + `js/conv_map.js:74 의 CONV_CACHE_VER 이 '${newVer}' 그대로다`);
  console.log(`       → 재방문 사용자는 localStorage 'hwaseong_conv_${newVer}_*' 의 옛 데이터를 계속 본다`);
  console.log(`       → js/conv_map.js:74 의 버전을 올려라`);
  console.log('  ── FAIL 1');
  process.exit(1);
}
console.log(`  i   [${changed.join(', ')}] 변경 + CONV_CACHE_VER '${oldVer}' → '${newVer}'`);
process.exit(0);
