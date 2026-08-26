#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/bump_version.py — index.html 의 ?v= 캐시 버스팅 값을 올린다

왜 필요한가 (2026-08-26, 배포 Claude):
  손으로 sed 를 쓰다가 실제로 사고를 냈다. 커밋 f7d7e84 는 js/ui.js·js/home.js 를
  고치면서 index.html 의 ?v= 를 못 올렸다 —

      sed -i 's/?v=20260826117/?v=20260826118/g' index.html

  그 시점 실제 값은 20260826124 였다(개발 Claude 가 그 사이 올려 뒀다).
  찾는 문자열이 없으니 sed 는 조용히 0건 치환하고 성공으로 끝난다.
  바로 앞줄에서 현재 값을 출력해 놓고도 눈으로 확인하지 않았다.

  그 상태에서 다음 커밋이 서버에 immutable 캐시를 켰다. 같은 ?v= 에 다른 내용이
  나가면 그 URL 을 이미 받은 브라우저는 1년간 새 파일을 못 본다 —
  Firefox·Safari 는 강제 새로고침으로도 immutable 을 무시하지 못한다.
  되돌릴 수 없는 사고가 될 뻔했다(개발 Claude 가 발견해 ?v=125 로 끊었다).

  근본 원인은 '다음 값을 사람이 적는 것' 이다. 현재 값을 읽어서 올리면 틀릴 수 없다.

사용법:
    python3 tools/bump_version.py            # 최대값 + 1 로 전부 통일
    python3 tools/bump_version.py --check    # 바꾸지 않고 현재/다음 값만 본다

함께 볼 것:
  tools/check.sh 의 version-guard — js/·css/ 를 고친 최신 커밋이 index.html 도
  고쳤는지 커밋 이력으로 검사한다(개발 Claude 신설, 2026-08-26).
  이 스크립트는 '올리는 쪽', version-guard 는 '안 올린 것을 잡는 쪽'이다.
"""
import argparse, os, re, sys
from pathlib import Path

ROOT = Path(os.environ.get("HW_ROOT") or Path(__file__).resolve().parent.parent)
TARGET = ROOT / "index.html"
PAT = re.compile(r"\?v=(\d+)")

# js/datalab.js 의 DL_VER 도 같이 올린다 (2026-08-26 개발 Claude 추가).
#   그 값은 데이터랩 JSON 을 받을 때 쓰는 캐시 버스팅이다
#   (js/datalab.js: fetch('js/' + file + '?v=' + DL_VER)).
#   index.html 의 ?v= 와 별개 값인데 지금까지 손으로 맞춰 왔다 —
#   한쪽만 올리면 JSON 이 낡은 채로 남는다. 서버가 .json 에는 immutable 대신
#   1시간 캐시를 주므로(tools/server.py) js/css 만큼 위험하진 않지만,
#   '손으로 맞추는 값' 을 남겨 두면 언젠가 또 어긋난다.
DL_TARGET = ROOT / "js" / "datalab.js"
DL_PAT = re.compile(r"(DL_VER\s*=\s*')(\d+)(')")


def main():
    ap = argparse.ArgumentParser(description="index.html 의 ?v= 를 올린다")
    ap.add_argument("--check", action="store_true", help="바꾸지 않고 현재 값만 출력")
    a = ap.parse_args()

    if not TARGET.exists():
        print("index.html 을 찾을 수 없습니다: %s" % TARGET)
        return 2

    src = TARGET.read_text(encoding="utf-8")
    vals = sorted({int(m) for m in PAT.findall(src)})
    if not vals:
        print("?v= 를 하나도 못 찾았습니다 — 마크업이 바뀌었는지 확인하십시오.")
        return 1

    cur = vals[-1]
    nxt = cur + 1
    n = len(PAT.findall(src))

    if len(vals) > 1:
        # 값이 갈려 있으면 그 자체가 이상 신호다. 통일하면서 알려 준다.
        print("⚠ 서로 다른 ?v= 가 %d 종류 있습니다: %s" % (len(vals), vals))

    if a.check:
        print("현재 최대 ?v=%d — %d곳. 올리면 ?v=%d" % (cur, n, nxt))
        return 0

    out = PAT.sub("?v=%d" % nxt, src)
    TARGET.write_text(out, encoding="utf-8")

    # DL_VER 동기화 — 없거나 못 찾으면 조용히 넘어가지 말고 알린다.
    if DL_TARGET.exists():
        dsrc = DL_TARGET.read_text(encoding="utf-8")
        dnew, cnt = DL_PAT.subn(lambda m: m.group(1) + str(nxt) + m.group(3), dsrc)
        if cnt == 1:
            DL_TARGET.write_text(dnew, encoding="utf-8")
            print("   js/datalab.js DL_VER → %d" % nxt)
        else:
            print("⚠ js/datalab.js 의 DL_VER 를 %d곳 찾았습니다(1곳이어야 함) — 손으로 확인하십시오." % cnt)

    # 쓴 뒤 다시 읽어 확인한다 — sed 사고의 재발을 막는 핵심이다.
    back = TARGET.read_text(encoding="utf-8")
    after = sorted({int(m) for m in PAT.findall(back)})
    if after != [nxt]:
        print("✗ 갱신 실패 — 기대 [%d], 실제 %s" % (nxt, after))
        return 1
    print("✅ ?v=%d → ?v=%d  (%d곳 전부 갱신 확인)" % (cur, nxt, n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
