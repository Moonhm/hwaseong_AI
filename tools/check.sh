#!/usr/bin/env bash
# =============================================================================
# tools/check.sh — 화성잇다 무결성 검사
#
# 이 저장소의 사정:
#   - 빌드 도구·번들러·패키지 매니저가 없다. push 하면 Cloudflare 터널이
#     로컬 파일을 그대로 서빙하므로 push = 즉시 실서비스다.
#   - 개발 Claude와 배포 Claude 둘이 같은 저장소를 동시에 쓴다.
#   - 실패가 전부 조용하다. index.html:1935/2316/2636 등의 방어 가드와
#     index.html:3882 / index.html:2336 / js/parking.js:73 의 빈 catch 가
#     "데이터가 통째로 깨짐" 을 "목록이 비어 있음" 으로 번역한다.
#     그래서 207개가 0개가 되든 10개가 사라지든 화면 상태가 구분되지 않는다.
#
# 이 스크립트의 1순위 목적:
#   데이터가 조용히 사라지는 것을 막는 것. 그다음이 작동 원활.
#   실증: js/data.js 에서 관광지 10개를 지워도 `node --check` 는 exit 0 이다.
#   레코드 삭제는 문법 오류가 아니므로 어떤 린트 게이트로도 못 잡는다.
#   오직 건수 기준선 대조만 잡는다 → 그 검사(check_data.py)는 node 없이도 돈다.
#
# 설계 원칙:
#   1) `&&` 로 잇지 않는다. 관광지 3건 + 주차장 1건 + 제부도 47건이 같이 사라진 커밋에서
#      첫 실패에 멈추면 사람은 눈에 보인 3건만 되돌리고 48건을 그대로 배포한다.
#      전부 돌리고 끝에 모아 보고한다.
#   2) 실패 출력은 반드시 파일:줄 과 "왜 틀렸는지" 를 찍는다.
#   3) 알려진 결함은 0 을 요구하지 않고 "현재 값" 을 상한으로 박는다.
#      상시 빨간불인 검사는 곧 무시되거나 지워지고, 그러면 검사가 없는 것과 같다.
#   4) 건너뛸 때는 반드시 SKIP 을 찍는다. 조용히 통과시키지 않는다.
#
# 사용법:
#   bash tools/check.sh                  # 기본 (약 1.5초, 네트워크 불필요)
#   bash tools/check.sh --precommit      # + 커밋 직전에만 의미 있는 검사
#   bash tools/check.sh --live           # + 실서비스 URL 과 바이트 대조 (네트워크 필요)
#   HW_BASE=origin/main bash tools/check.sh   # 캐시 검사 비교 기준 변경 (기본 HEAD)
#
# 저장소에 아무것도 쓰지 않는다. 전부 읽기 전용이다.
# =============================================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export HW_ROOT="$ROOT"
cd "$ROOT" || exit 2

PRECOMMIT=0; LIVE=0
for a in "$@"; do
  case "$a" in
    --precommit) PRECOMMIT=1 ;;
    --live)      LIVE=1 ;;
    -h|--help)   sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $a"; exit 2 ;;
  esac
done

# 실서비스 URL — Quick Tunnel 은 재시작할 때마다 호스트명이 랜덤으로 바뀐다.
# 바뀌면 여기를 갱신하라. (--live 에서만 쓴다)
LIVE_URL="${HW_LIVE_URL:-https://culture-reed-dee-rug.trycloudflare.com}"

FAILED=(); SKIPPED=()
run() {                       # run <이름> <명령...>
  local name="$1"; shift
  echo ""
  echo "▶ $name"
  if "$@"; then :; else FAILED+=("$name"); fi
}
skip() { echo ""; echo "▶ $1"; echo "  SKIP  $2"; SKIPPED+=("$1"); }

HAVE_NODE=0; command -v node >/dev/null 2>&1 && HAVE_NODE=1
HAVE_GIT=0;  command -v git  >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1 && HAVE_GIT=1

echo "═══ 화성잇다 무결성 검사 ═══  ($ROOT)"
echo "    python3 $(python3 -V 2>&1 | cut -d' ' -f2)   node $( [ $HAVE_NODE = 1 ] && node -v || echo '없음')   git $( [ $HAVE_GIT = 1 ] && echo 있음 || echo 없음)"

# ── 1. 데이터 (최우선, node 불필요) ─────────────────────────────────────────
#   레코드 수 하한 / JSON 파싱 / 필수 필드·좌표 / 화면에 손으로 적힌 숫자 대조 /
#   tools 정규식 사정거리 / 사진-이름 연결 / 캐시 버스팅
run "데이터 손실 (data-floor)" python3 tools/check_data.py

# ── 2. 마크업 (node 불필요) ─────────────────────────────────────────────────
run "index.html 구조 (markup)" python3 tools/check_markup.py

# ── 3. 코드 (node 필요) ─────────────────────────────────────────────────────
#   node 가 없으면 조용히 통과시키지 않고 무엇을 못 보는지 명시한다.
if [ $HAVE_NODE = 1 ]; then
  run "JS 문법·전역충돌·죽은버튼 (code)" node tools/check_code.js
else
  skip "JS 문법·전역충돌·죽은버튼 (code)" \
    "node 가 없다 — index.html 인라인 2,085줄의 문법 오류, 전역 이름 충돌, 죽은 onclick 을 못 본다. \
파일 하나가 통째로 죽어도(예: const 재선언) 이 실행에서는 초록으로 보인다."
fi

# ── 4. 편의정보 좌표 캐시 무효화 (node + git 필요) ──────────────────────────
if [ $HAVE_NODE = 1 ] && [ $HAVE_GIT = 1 ]; then
  run "편의정보 캐시 버전 (conv-cache)" node tools/check_cache.js
else
  skip "편의정보 캐시 버전 (conv-cache)" \
    "node 또는 git 이 없다 — js/convenience.js 를 고치고 CONV_CACHE_VER(js/conv_map.js:74)를 \
안 올린 경우를 못 본다. 재방문 사용자에게 옛 데이터가 계속 나가도 아무 흔적이 안 남는다."
fi

# ── 5. 자산 추적 상태 (git 필요) ────────────────────────────────────────────
# 6004a43(assets/ git 추적 제거) 같은 사고의 재발과, 데이터 파일이 실수로
# .gitignore 에 걸리는 경우를 잡는다. `git clean -xdf` 의 폭발 반경도 미리 보여준다.
asset_guard() {
  local bad=0 n t f
  for f in js/data.js js/convenience.js js/parking-static.json js/localcurrency-static.json \
           js/ratings.json js/map.js js/conv_map.js js/parking.js js/localcurrency.js index.html; do
    if git check-ignore -q "$f" 2>/dev/null; then
      echo "  FAIL $f 가 .gitignore 에 걸려 있다 — clone·clean 하면 사라진다"; bad=1
    fi
  done
  # 코드가 이름을 통째로 적어 참조하는 자산 파일 (img/logo-icon.png 등)
  # 404 는 브라우저가 조용히 넘어간다. 로고가 안 뜨는 것을 아무도 에러로 보지 않는다.
  for f in $(grep -rhoE "(assets|img)/[A-Za-z0-9_./-]+\.(png|jpg|jpeg|svg|webp|ico)" \
             --include=*.js --include=*.html --include=*.json . 2>/dev/null | sort -u); do
    if [ ! -f "$f" ]; then
      echo "  FAIL $f 를 코드가 참조하는데 디스크에 없다"; bad=1
    elif ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
      echo "  WARN $f 가 git 에 없다 — clone 이나 'git clean -xdf' 한 번이면 사라진다"
    fi
  done
  # 동적으로 조립되는 사진 경로(js/map.js:401 'assets/images/places/' + place.name + '.jpg')는
  # 위 grep 으로 안 잡힌다. tools/check_data.py 의 사진-이름 대조가 그쪽을 본다.
  if [ -d assets ]; then
    n=$(find assets -type f | wc -l); t=$(git ls-files assets 2>/dev/null | wc -l)
    if git check-ignore -q assets 2>/dev/null; then
      echo "  WARN assets/  디스크 ${n}개 / git 0개 (.gitignore:7) — 이 사본이 유일하다. 'git clean -xdf' 한 번이면 전멸한다"
    elif [ "$t" -lt "$n" ]; then
      echo "  WARN assets/  디스크 ${n}개 / git 추적 ${t}개 — ${t}개만 복구 가능"
    else
      echo "  i     assets/ ${n}개 (git 추적)"
    fi
  else
    echo "  SKIP  assets/ 없음 — 개발 워킹트리에서는 정상(.gitignore:7). 사진 163장은 배포 서버에만 있다"
  fi
  # -n 은 드라이런이다. 절대 -n 을 빼고 실행하지 마라 — assets/ 가 지워진다.
  echo "  i     git clean -xdf 를 지금 돌리면 $(git clean -xdn 2>/dev/null | wc -l)개가 삭제된다 (드라이런)"
  return $bad
}
if [ $HAVE_GIT = 1 ]; then
  run "자산·추적 상태 (asset-guard)" asset_guard
else
  skip "자산·추적 상태 (asset-guard)" "git 이 없다 — .gitignore 가 데이터 파일을 삼켰는지 못 본다"
fi

# ── 6. 커밋 직전에만 의미 있는 검사 (--precommit) ───────────────────────────
# 편집 중에 돌리면 정상 상태에서도 걸리므로 기본에서 뺐다.
precommit_guard() {
  local bad=0 last v f
  # (a) js/ 를 고쳤는데 index.html 의 ?v= 를 안 올렸나
  if [ -n "$(git status --porcelain -- js/ 2>/dev/null | grep -E '\.js$')" ] \
     && [ -z "$(git status --porcelain -- index.html 2>/dev/null)" ]; then
    echo "  FAIL js/*.js 를 고쳤는데 index.html 은 안 고쳤다 — index.html:3891-3897 의 ?v= 를 올렸는가?"
    git status --porcelain -- js/ | sed 's/^/         /'
    bad=1
  fi
  # (b) ?v= 날짜가 그 파일의 마지막 커밋 날짜보다 뒤처졌나
  #     ※ 같은 날 두 번째 수정은 이 비교로 못 잡는다(미탐). 날짜 단위의 한계다.
  while read -r f v; do
    [ -z "${v:-}" ] && continue
    last=$(git log -1 --format=%cd --date=format:%Y%m%d -- "$f" 2>/dev/null) || continue
    [ -z "$last" ] && continue
    if [ "$last" -gt "$v" ]; then
      echo "  FAIL $f 는 $last 에 바뀌었는데 index.html 의 ?v=$v 는 그대로다 — 옛 파일이 캐시에서 나간다"
      bad=1
    fi
  done < <(grep -o 'src="js/[a-zA-Z_]*\.js?v=[0-9]*"' index.html | sed 's/src="//;s/"$//;s/?v=/ /')
  [ $bad = 0 ] && echo "  i     ?v= 캐시 버스팅 일관"
  return $bad
}
if [ $PRECOMMIT = 1 ]; then
  if [ $HAVE_GIT = 1 ]; then run "커밋 직전 (precommit)" precommit_guard
  else skip "커밋 직전 (precommit)" "git 이 없다"; fi
fi

# ── 7. 실서비스 대조 (--live, 네트워크 필요) ────────────────────────────────
# 저장소만 읽는 위 검사들의 사각지대를 덮는다.
# 실측 확인된 사실: Cloudflare 가 HTML 응답을 중간에서 재작성한다(메일 난독화 주입, +243B).
# 즉 "터널이 로컬 파일을 그대로 서빙" 은 js/*.js 에만 참이고 index.html 에는 거짓이다.
live_drift() {
  local bad=0 code lh rh lb rb gc f
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$LIVE_URL/") || code=000
  if [ "$code" != "200" ]; then
    echo "  FAIL 배포 URL 응답 $code — 터널이 끊겼거나 호스트명이 바뀌었다 ($LIVE_URL)"
    echo "       Quick Tunnel 은 재시작마다 URL 이 랜덤으로 바뀐다. tools/check.sh 의 LIVE_URL 을 갱신하라"
    return 1
  fi
  for f in js/convenience.js js/data.js js/map.js js/conv_map.js js/parking.js js/localcurrency.js \
           js/parking-static.json js/localcurrency-static.json js/ratings.json; do
    lh=$(curl -s --max-time 90 "$LIVE_URL/$f" | sha256sum | cut -c1-16)
    rh=$(sha256sum "$f" | cut -c1-16)
    if [ "$lh" = "$rh" ]; then echo "  i     $f 일치"
    else echo "  FAIL $f  배포=$lh 저장소=$rh — 사용자가 받는 바이트가 다르다"; bad=1; fi
  done
  lb=$(curl -s --max-time 30 "$LIVE_URL/" | wc -c); rb=$(wc -c < index.html)
  # 알려진 차이: Cloudflare 이메일 난독화 +243B (index.html:1443 의 mailto:).
  # 0 을 요구하면 상시 빨간불이 되므로 상한으로 박는다. 늘어나면 다른 것이 주입된 것이다.
  if [ "$((lb - rb))" -gt 300 ]; then
    echo "  FAIL index.html 배포=${lb}B 저장소=${rb}B (차 $((lb-rb))B, 알려진 상한 300B 초과)"
    curl -s --max-time 30 "$LIVE_URL/" | grep -o "cdn-cgi/[a-z/.-]*" | sort -u | sed 's/^/         주입: /'
    bad=1
  else
    echo "  WARN  index.html 배포=${lb}B 저장소=${rb}B (차 $((lb-rb))B) — Cloudflare 가 mailto 를 난독화한다(알려진 차이, 상한 300B)"
  fi
  gc=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$LIVE_URL/.git/config")
  if [ "$gc" = "200" ]; then
    echo "  FAIL /.git/config 이 HTTP 200 으로 공개돼 있다 — 저장소 전체 이력을 누구나 내려받을 수 있다"
    echo "       tools/server.py:150 이 static_folder=ROOT 로 저장소 루트 전체를 서빙한다"
    bad=1
  else
    echo "  i     /.git 비공개 ($gc)"
  fi
  return $bad
}
if [ $LIVE = 1 ]; then
  if command -v curl >/dev/null 2>&1; then run "실서비스 대조 (live-drift)" live_drift
  else skip "실서비스 대조 (live-drift)" "curl 이 없다"; fi
fi

# ── 결과 ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "건너뜀 ${#SKIPPED[@]}건:"; for s in "${SKIPPED[@]}"; do echo "  - $s"; done
fi
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "통과. (건너뛴 검사가 있으면 위를 읽어라 — 통과가 아니라 안 본 것이다)"
  exit 0
fi
echo "실패 ${#FAILED[@]}건:"; for f in "${FAILED[@]}"; do echo "  ✗ $f"; done
echo ""
echo "데이터가 줄었다면 push 하지 마라. 되돌리는 법:"
echo "  git diff --stat            # 무엇이 바뀌었나"
echo "  git checkout -- js/<파일>  # 그 파일만 되돌린다"
echo "의도한 증감이면 tools/check_data.py 의 FLOOR / CEILING 을 갱신하고, 커밋 메시지에 이유를 남겨라."
exit 1
