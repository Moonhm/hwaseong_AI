#!/usr/bin/env bash
# =============================================================================
# tools/check.sh — 화성잇다 무결성 검사
#
# 이 저장소의 사정:
#   - 빌드 도구·번들러·패키지 매니저가 없다. push 하면 Cloudflare 터널이
#     로컬 파일을 그대로 서빙하므로 push = 즉시 실서비스다.
#   - 개발 Claude와 배포 Claude 둘이 같은 저장소를 동시에 쓴다.
#   - 실패가 전부 조용하다. index.html 곳곳의 방어 가드와
#     js/parking.js 의 빈 catch( .catch(function () {}) )가
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
LIVE_URL="${HW_LIVE_URL:-https://checks-sciences-palestinian-cottages.trycloudflare.com}"

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
    "node 또는 git 이 없다 — js/convenience.js 를 고치고 js/conv_map.js 의 CONV_CACHE_VER 를 \
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
  # 사진·대용량 파일은 push 금지다. 예외 없다.
  # .gitignore 만으로는 부족하다 — 'git add -f' 한 번이면 뚫리고, 아래 assets/ 검사는
  # gitignore 규칙이 있으면 WARN 가지로 빠져 '추적 중인 파일'을 영영 못 본다.
  # 한 번 커밋되면 히스토리에 blob 으로 남아 지우려면 filter-repo + force push 뿐이다.
  # 실제로 0274753 에서 사진 159장(~59MB)이 올라갔고 6004a43 에서 추적만 껐다 —
  # 그 104개 35.4MB 는 지금도 origin/main 에서 받아진다(2026-08-26 확인, 그대로 두기로 결정).
  # 같은 일이 다시 나지 않도록 여기서 막는다.
  for d in assets data/raw-large; do
    n=$(git ls-files "$d" 2>/dev/null | wc -l)
    if [ "$n" -gt 0 ]; then
      echo "  FAIL $d/ 아래 파일 ${n}개가 git 에 추적되고 있다 — 사진·대용량은 push 금지다"
      git ls-files "$d" 2>/dev/null | head -5 | sed 's/^/          /'
      echo "          해제: git rm -r --cached $d"
      bad=1
    fi
  done

  # 동적으로 조립되는 사진 경로( js/ui.js 의 placePhotoSrc() 가
  # 'assets/images/places/' + place.name + '.jpg' 로 잇는다 )는
  # 위 grep 으로 안 잡힌다. tools/check_data.py 의 사진-이름 대조가 그쪽을 본다.
  if [ -d assets ]; then
    n=$(find assets -type f | wc -l); t=$(git ls-files assets 2>/dev/null | wc -l)
    if git check-ignore -q assets 2>/dev/null; then
      echo "  WARN assets/  디스크 ${n}개 / git 0개 (.gitignore 의 assets/) — 이 사본이 유일하다. 'git clean -xdf' 한 번이면 전멸한다"
    elif [ "$t" -lt "$n" ]; then
      echo "  WARN assets/  디스크 ${n}개 / git 추적 ${t}개 — ${t}개만 복구 가능"
    else
      echo "  i     assets/ ${n}개 (git 추적)"
    fi
  else
    echo "  SKIP  assets/ 없음 — 개발 워킹트리에서는 정상(.gitignore 의 assets/). 사진 163장은 배포 서버에만 있다"
  fi
  # -n 은 드라이런이다. 절대 -n 을 빼고 실행하지 마라 — assets/ 가 지워진다.
  echo "  i     git clean -xdf 를 지금 돌리면 $(git clean -xdn 2>/dev/null | wc -l)개가 삭제된다 (드라이런)"
  return $bad
}
# ── 5-b. ?v= 캐시 버스팅 이력 검사 (2026-08-26) ────────────────────────────
# 왜 기본 검사인가: 2026-08-26 에 서버가 ?v= 를 단 js/css 를
#   Cache-Control: max-age=31536000, immutable 로 내보내기 시작했다(tools/server.py).
#   그때부터 '같은 ?v= 로 다른 내용' 은 되돌릴 수 없는 사고가 된다 —
#   그 URL 을 이미 받은 브라우저는 1년간 새 파일을 보지 않고, 강제 새로고침도
#   Firefox·Safari 에서는 immutable 을 무시하지 못한다.
#
# 기존 precommit_guard 는 `git status`(작업트리)만 봐서, 커밋을 나눠 하면
#   그대로 빠져나갔다. 실제로 f7d7e84 가 js/ui.js·js/home.js 를 고치면서
#   index.html 을 건드리지 않았는데 아무 검사도 잡지 못했다.
#   그래서 '작업트리'가 아니라 '커밋 이력'을 본다.
version_guard() {
  local c files
  c=$(git log -1 --format=%H -- js/ css/ 2>/dev/null)
  [ -z "$c" ] && { echo "  i     js/·css/ 커밋 이력이 없다"; return 0; }
  files=$(git show --name-only --format="" "$c" 2>/dev/null)
  if echo "$files" | grep -qx "index.html"; then
    echo "  i     최신 js/css 커밋($(git log -1 --format=%h "$c"))이 index.html 도 함께 고쳤다"
    return 0
  fi
  echo "  FAIL  js/ 또는 css/ 를 고친 최신 커밋이 index.html 을 안 고쳤다 — ?v= 가 안 올랐다"
  echo "        커밋: $(git log -1 --format='%h %s' "$c")"
  echo "$files" | sed 's/^/          /'
  echo "        서버가 ?v= 를 immutable 로 내보내므로(tools/server.py) 같은 ?v= 에"
  echo "        다른 내용이 실리면 되돌릴 수 없다. index.html 의 ?v= 를 올려 커밋하라."
  return 1
}

# ── 5-c. 로그 머리의 커밋 해시 (2026-08-30) ────────────────────────────────
# WORKFLOW.md §0 이 로그 머리에 '- 커밋: `<해시>`' 를 요구하는 이유는 단 하나,
#   "이 커밋에 로그가 있나" 를 기계로 확인하기 위해서다(20366e7).
#   그런데 그 해시가 틀리면 확인이 조용히 거짓말을 한다. 규칙을 지켰는데도
#   지키기 전과 똑같이 틀린 답이 나온다 — 규칙만 있고 검사가 없었기 때문이다.
#
# 실제로 2026-08-29 에 두 건이 그랬다. 절차가
#   ① git commit  ② 나온 해시를 로그에 적음  ③ git commit --amend
# 였는데 ③ 이 해시를 바꾼다. 로그에는 ① 의 해시가 남는다.
#   103dcdc → 62d9fe9 (통합검색)   c1ec97a → fe4ec70 (제부도 바닷길)
# 버려진 해시는 로컬 reflog 에만 있다. push 도 clone 도 그 객체를 안 나른다.
# 즉 저장소를 받은 사람에게는 존재하지 않는 해시다. `git gc` 한 번이면 여기서도 사라진다.
# 7자리 16진수는 사람 눈에 다 똑같이 생겨서 검토로는 안 걸린다. 그래서 기계가 본다.
log_hash_guard() {
  local bad=0 head=0 seen=0 f ln body h all
  all=$(ls docs/log/*.md 2>/dev/null | wc -l)
  while IFS=: read -r f ln body; do
    head=$((head + 1))
    for h in $(printf '%s' "$body" | grep -oE '`[0-9a-f]{7,40}`' | tr -d '`'); do
      seen=$((seen + 1))
      if ! git cat-file -e "${h}^{commit}" 2>/dev/null; then
        echo "  FAIL $f:$ln  \`$h\` 은 이 저장소에 없는 커밋이다 — 오타이거나 다른 저장소의 해시다"
        bad=1
      elif ! git merge-base --is-ancestor "$h" HEAD 2>/dev/null; then
        echo "  FAIL $f:$ln  \`$h\` 은 HEAD 에서 도달할 수 없다 — amend·rebase 가 버린 해시다"
        echo "         그 커밋 제목: $(git log -1 --format=%s "$h" 2>/dev/null | cut -c1-46)"
        echo "         살아 있는 쪽 찾기:  git log --oneline --all --grep=<제목 일부>"
        echo "         지금은 reflog 덕에 보이지만 clone 한 사람에게는 없는 해시다."
        bad=1
      fi
    done
  done < <(grep -Hn '^- 커밋:' docs/log/*.md 2>/dev/null)
  if [ $bad = 0 ]; then
    echo "  i     로그 ${head}개가 적은 커밋 해시 ${seen}개 전부 살아 있다"
  fi
  # 머리줄이 없는 로그는 FAIL 이 아니다. 20366e7 이 '기존 60여 개에 소급 적용하지
  # 않는다' 고 못박았다. 상시 빨간불은 곧 무시되는 검사가 된다(설계 원칙 3).
  echo "  i     '- 커밋:' 머리줄 ${head}/${all}개 — 나머지는 규칙 이전 파일이라 소급 안 함(§0)"
  return $bad
}

# ── 5-b. 문서의 `파일:줄` 참조 (git 불필요) ─────────────────────────────────
# log-hash 와 같은 종류의 함정인데 이쪽이 더 자주 터진다. 해시는 amend·rebase 를
# 해야 바뀌지만, 줄번호는 남이 그 파일 위쪽에 한 줄만 넣어도 밀린다. 그리고 밀려도
# 여전히 '존재하는 줄' 을 가리키므로 없는 참조로는 안 걸린다 — 엉뚱한 코드를
# 자신 있게 가리키는 상태가 된다. 사람 눈으로는 절대 안 걸린다.
#   2026-08-30 실측: 오전에 전수 감사로 맞춘 참조가 같은 날 오후 배포 커밋
#   (calendar.js +24줄 등) 하나로 5건 밀렸다. 반나절이다.
# 그래서 값이 맞는지를 보지 않고 '줄번호로 가리키는 것' 자체를 막는다.
# 인용해야 하면 백틱 밖에 평문으로 적으면 된다 — 백틱은 '지금 거기 있다' 는 표기다.
line_ref_guard() {
  local bad=0 seen=0 f ln body ref path num total
  for f in WORKFLOW.md README.md tools/check.sh; do
    [ -f "$f" ] || continue
    # ``` 로 감싼 블록은 건너뛴다. 예시·프로그램 출력을 그대로 붙이는 자리라
    # '이렇게 쓰지 마라' 는 반례까지 걸려서 규칙을 적는 것이 불가능해진다.
    while IFS=: read -r ln body; do
      for ref in $(printf '%s' "$body" \
            | grep -oE '`[^`]*([A-Za-z0-9_/-]\.[a-z]{1,6}|\.gitignore):[0-9]+[^`]*`' | tr -d '`'); do
        path=${ref%%:*}; num=${ref##*:}; num=${num%%[!0-9]*}
        [ -n "$num" ] || continue
        case "$path" in *[!A-Za-z0-9_./-]*) continue ;; esac
        seen=$((seen + 1))
        echo "  FAIL $f:$ln  \`$path:$num\` — 줄번호로 가리켰다"
        if [ -f "$path" ]; then
          total=$(wc -l < "$path")
          echo "         지금 $path:$num 에 있는 것: $(sed -n "${num}p" "$path" | sed 's/^[[:space:]]*//' | cut -c1-60)"
          echo "         (총 ${total}줄. 맞아 보여도 남이 위에 한 줄만 넣으면 밀린다)"
        else
          echo "         그런 파일이 없다 — 이동했거나 이름이 바뀌었다"
        fi
        echo "         식별자로 바꿔라:  \`$path\` 의 \`함수명\`   (§0 「줄번호로 가리키지 마십시오」)"
        bad=1
      done
    done < <(awk '/^ *```/ {fence = !fence; next} !fence && /`/ {print NR": "$0}' "$f" | sed 's/: /:/')
  done

  # ── 코드 주석도 본다 (2026-08-31 확대) ────────────────────────────────
  # 문서만 막아 놓고 코드 주석은 74건이 밀린 채 방치돼 있었다. 그쪽이 오히려
  # 더 자주 읽히는데도. 코드에는 백틱 관습이 없으므로 '주석 줄'로 범위를 좁혀
  # 맨몸 파일:줄 을 잡는다. 문자열·URL 오탐을 피하려고 주석 밖은 안 본다.
  local code
  for code in js/*.js css/*.css index.html; do
    [ -f "$code" ] || continue
    while IFS=: read -r ln body; do
      for ref in $(printf '%s' "$body" \
            | grep -oE '[A-Za-z0-9_/-]+\.(js|css|html|py|sh|json|md):[0-9]+'); do
        path=${ref%%:*}; num=${ref##*:}
        seen=$((seen + 1))
        echo "  FAIL $code:$ln  $path:$num — 코드 주석이 줄번호로 가리켰다"
        if [ -f "$path" ]; then
          echo "         지금 $path:$num 에 있는 것: $(sed -n "${num}p" "$path" | sed 's/^[[:space:]]*//' | cut -c1-56)"
        else
          echo "         그런 파일이 없다 — 이동했거나 이름이 바뀌었다"
        fi
        echo "         함수명·변수명·셀렉터로 바꿔라 (§0 「줄번호로 가리키지 마십시오」)"
        bad=1
      done
      # 파일명 없는 맨 콜론 참조(:114 · :309-325)도 같은 함정이다. 같은 파일을
      # 가리키는 것이라 오히려 더 조용히 밀린다.
      case "$body" in
        *'/*'*|*' * '*|*'//'*|*'<!--'*)
          for ref in $(printf '%s' "$body" | grep -oE '\(:[0-9]+(-[0-9]+)?\)|[ (]:[0-9]{2,}\b'); do
            echo "  FAIL $code:$ln  '$ref' — 같은 파일을 줄번호로 가리켰다"
            echo "         '위 함수명' 처럼 이름으로 쓰거나 위치 표현을 지워라"
            bad=1
          done ;;
      esac
    done < <(grep -nE '/\*|^\s*\*|//|<!--' "$code" | sed 's/^\([0-9]*\):/\1:/')
  done

  [ $bad = 0 ] && echo '  i     문서·코드 주석이 줄번호로 가리키는 곳 0건 — 전부 식별자 참조다 (``` 코드블록·docs/log 제외)'
  return $bad
}
run "문서·주석의 줄번호 참조 (line-ref)" line_ref_guard

# ── 5-c. 배포 URL 이 네 곳에서 같은가 (git·네트워크 불필요) ────────────────
# Quick Tunnel 은 재시작마다 호스트명이 랜덤으로 바뀐다. 그때 고쳐야 할 자리가
# 네 곳인데(README 배지·README 본문·WORKFLOW §1·이 파일의 LIVE_URL), 손으로
# 고치면 반드시 하나가 빠진다. 실제로 08-30 에 셋 다 죽은 주소를 가리킨 채였다.
#   --live 의 live_drift() 는 LIVE_URL 만 보므로 이 어긋남을 못 잡는다.
#   README 가 죽은 주소를 가리켜도 --live 는 초록불이다. 그래서 따로 본다.
# docs/log/ 는 제외한다 — 로그의 주소는 '그때의 기록' 이라 갱신 대상이 아니다(§0).
url_consistency() {
  local bad=0 f n found
  local live="${LIVE_URL#https://}"; live="${live%%/*}"
  found=$(grep -rhoE '[a-z0-9-]+\.trycloudflare\.com' \
            README.md WORKFLOW.md tools/check.sh 2>/dev/null | sort -u)
  for n in $found; do
    [ "$n" = "$live" ] && continue
    echo "  FAIL 배포 주소가 어긋난다 — $n (LIVE_URL 은 $live)"
    for f in README.md WORKFLOW.md tools/check.sh; do
      grep -n "$n" "$f" 2>/dev/null | sed "s|^|         $f:|" | cut -c1-110
    done
    bad=1
  done
  if [ $bad = 0 ]; then
    n=$(grep -rhoE '[a-z0-9-]+\.trycloudflare\.com' README.md WORKFLOW.md tools/check.sh 2>/dev/null | wc -l)
    echo "  i     배포 주소 ${n}곳 전부 $live 로 일치 (docs/log 는 '그때의 기록' 이라 제외)"
  fi
  return $bad
}
run "배포 주소 일관성 (url-sync)" url_consistency

if [ $HAVE_GIT = 1 ]; then
  run "캐시 버스팅 이력 (version-guard)" version_guard
  run "자산·추적 상태 (asset-guard)" asset_guard
  run "로그 커밋 해시 (log-hash)" log_hash_guard
else
  skip "자산·추적 상태 (asset-guard)" "git 이 없다 — .gitignore 가 데이터 파일을 삼켰는지 못 본다"
  skip "로그 커밋 해시 (log-hash)" \
    "git 이 없다 — docs/log 머리의 '- 커밋:' 해시가 amend 로 버려진 것인지 못 본다. \
로그는 있는데 가리키는 커밋이 없는 상태가 조용히 통과한다."
fi

# ── 6. 커밋 직전에만 의미 있는 검사 (--precommit) ───────────────────────────
# 편집 중에 돌리면 정상 상태에서도 걸리므로 기본에서 뺐다.
precommit_guard() {
  local bad=0 cur base kinds
  # (a) js/ 를 고쳤는데 index.html 의 ?v= 를 안 올렸나
  if [ -n "$(git status --porcelain -- js/ 2>/dev/null | grep -E '\.js$')" ] \
     && [ -z "$(git status --porcelain -- index.html 2>/dev/null)" ]; then
    echo "  FAIL js/*.js 를 고쳤는데 index.html 은 안 고쳤다 — <script src> 의 ?v= 를 올렸는가?"
    git status --porcelain -- js/ | sed 's/^/         /'
    bad=1
  fi
  # (b) js/·css/ 를 고쳤는데 index.html 의 ?v= 값이 HEAD 와 같나
  #     날짜가 아니라 '값' 을 본다. 예전에는 파일의 마지막 커밋 날짜(%Y%m%d, 8자리)와
  #     ?v= 값을 숫자로 비교했는데, tools/bump_version.py 가 ?v= 를 날짜가 아니라
  #     '현재 최대값 + 1' 일련번호(지금 11자리)로 올린다. 8자리가 11자리보다 클 수 없어
  #     이 분기는 산술적으로 영원히 거짓이었고 30개 태그 전부에서 한 건도 못 잡으면서
  #     '일관' 을 찍고 있었다. 값 비교로 바꾸면 '같은 날 두 번째 수정' 미탐도 없어진다.
  kinds=$(grep -oE '\?v=[0-9]+' index.html | sed 's/.*=//' | sort -u | wc -l)
  if [ "$kinds" -gt 1 ]; then
    echo "  FAIL index.html 의 ?v= 가 $kinds 종류다 — sed 로 일부만 치환한 상태다(f7d7e84 사고와 같은 모양)"
    grep -oE '\?v=[0-9]+' index.html | sort | uniq -c | sed 's/^/         /'
    echo "        python3 tools/bump_version.py 로 전부 통일하라."
    bad=1
  fi
  cur=$(grep -oE '\?v=[0-9]+' index.html | sed 's/.*=//' | sort -rn | head -1)
  base=$(git show HEAD:index.html 2>/dev/null | grep -oE '\?v=[0-9]+' | sed 's/.*=//' | sort -rn | head -1)
  if [ -n "$cur" ] && [ -n "$base" ] \
     && [ -n "$(git status --porcelain -- js/ css/ 2>/dev/null)" ] \
     && [ "$cur" -le "$base" ]; then
    echo "  FAIL js/·css/ 를 고쳤는데 index.html 의 ?v=$cur 가 HEAD($base)보다 올라가지 않았다 — 옛 파일이 캐시에서 나간다"
    git status --porcelain -- js/ css/ | sed 's/^/         /'
    echo "        서버가 ?v= 를 1년 immutable 로 내보낸다. python3 tools/bump_version.py 를 돌려라"
    echo "        (손으로 sed 하지 마라 — 0건 치환하고 조용히 성공한다)"
    bad=1
  fi
  [ $bad = 0 ] && echo "  i     ?v= 1종류($cur) — js/·css/ 변경이 있으면 HEAD($base)보다 올라 있다"
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
  # 알려진 차이: Cloudflare 이메일 난독화 +243B (index.html 의 mailto: 링크).
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
    echo "       tools/server.py 의 Flask(static_folder=ROOT) 가 저장소 루트 전체를 서빙한다"
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
