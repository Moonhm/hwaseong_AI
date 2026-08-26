#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/import_photos.py — 받은 사진을 assets/images/places/ 로 반입 (배포 Claude 담당)

왜 필요한가 (2026-08-27):
  사용자가 폴더에 사진을 올려 주면 그동안 손으로 골라 복사했다. 두 번 사고가 났다.

  ① 확장자를 빠뜨렸다. `find -iname "*.jpg" -o "*.png" …` 로 훑었는데 목록에
     `.jfif` 를 안 넣어서, 올라온 33장 중 **28장을 통째로 못 봤다.**
     `.jfif` 는 JPEG File Interchange Format 이다 — 내용은 그냥 JPEG 이고
     윈도우 크롬에서 이미지를 저장하면 흔히 붙는다.
  ② 이름이 한 글자 다른 것을 손으로 고쳤다. '금당 엄나무 마을'(공백 있음) vs
     data.js 의 '금당 엄나무마을'. WORKFLOW.md 가 "파일명이 name 과 정확히
     일치해야 뜬다" 고 못 박은 지점이라 그대로 넣으면 조용히 안 뜬다.
     사람이 매번 눈으로 잡을 수는 없다.

  둘 다 '사람이 목록을 관리하는' 방식이라 반드시 또 틀린다. 도구로 옮긴다.

무엇을 하나:
  1. 소스 폴더의 **모든 이미지**를 읽는다(확장자 목록을 넓게 잡는다)
  2. 파일명을 js/data.js 의 PLACES name 과 대조한다
       정확 일치 → 그대로
       공백·대소문자만 다름 → **정확명으로 교정**해서 반입(오타 수준은 자동 처리)
       그 외 → 반입하지 않고 목록으로 보고한다(임의 추측은 하지 않는다)
  3. NFC 로 정규화하고 확장자를 소문자로 통일해 복사한다
     (.jfif 는 여기서 .jpg 로 바꾼다 — 내용이 이미 JPEG 이라 무손실이다)
  4. 원본은 건드리지 않는다

사용법:
    python3 tools/import_photos.py "/home/jovyan/work/관광지 사진"           # 반입
    python3 tools/import_photos.py "…" --check                              # 대조만

반입 뒤에는 반드시 이 순서로 이어서 돌린다:
    python3 tools/optimize_images.py assets/images/places   # 크기·품질·형식
    python3 tools/optimize_images.py --thumbs               # 240px 썸네일
    python3 tools/build_photo_index.py                      # js/photos.js 재생성
    python3 tools/bump_version.py                           # ?v= 갱신
    bash tools/check.sh                                     # 종료 코드로 판정

⚠ assets/ 는 .gitignore 대상이다. 사진 자체는 커밋되지 않고 js/photos.js 만 올라간다.
"""
import argparse, os, shutil, sys, unicodedata
from pathlib import Path

ROOT = Path(os.environ.get("HW_ROOT") or Path(__file__).resolve().parent.parent)
DST = ROOT / "assets" / "images" / "places"
DATA_JS = ROOT / "js" / "data.js"
CONV_JS = ROOT / "js" / "convenience.js"

# 넓게 잡는다. 여기 없는 확장자 때문에 사진을 놓치는 것이 가장 흔한 사고다.
IMG_EXTS = (".jpg", ".jpeg", ".jfif", ".jpe", ".png", ".webp", ".gif", ".bmp", ".avif")
# 내용이 JPEG 인데 확장자만 다른 것들 → .jpg 로 통일해 반입한다
TO_JPG = (".jfif", ".jpe", ".jpeg")


def nfc(s):
    return unicodedata.normalize("NFC", s)


def key(s):
    """오타 수준의 차이를 흡수하는 비교 키 — 공백 제거 + 소문자."""
    return nfc(s).replace(" ", "").replace(" ", "").lower()


def load_names():
    """js/data.js + js/convenience.js 의 name 을 전부 모은다."""
    import re
    names = []
    for p in (DATA_JS, CONV_JS):
        if not p.exists():
            continue
        src = p.read_text(encoding="utf-8")
        names += re.findall(r'name:\s*"([^"]+)"', src)
    # 긴 이름을 앞에 둔다 — 짧은 이름이 긴 것을 가로채지 않게
    return sorted({nfc(n) for n in names}, key=len, reverse=True)


def main():
    ap = argparse.ArgumentParser(description="사진 반입 (원본은 건드리지 않음)")
    ap.add_argument("src", help="사진이 있는 폴더")
    ap.add_argument("--check", action="store_true", help="복사하지 않고 대조만")
    a = ap.parse_args()

    src = Path(a.src)
    if not src.is_dir():
        print("폴더를 찾을 수 없습니다: %s" % src)
        return 2

    names = load_names()
    exact = {nfc(n): n for n in names}
    loose = {}
    for n in names:
        loose.setdefault(key(n), n)          # 먼저 등록된 긴 이름이 이긴다

    files = [f for f in sorted(src.iterdir())
             if f.is_file() and f.suffix.lower() in IMG_EXTS]
    others = [f for f in sorted(src.iterdir())
              if f.is_file() and f.suffix.lower() not in IMG_EXTS and not f.name.startswith(".")]

    hit_exact, hit_near, miss, skipped = [], [], [], []
    for f in files:
        stem = nfc(f.stem)
        ext = f.suffix.lower()
        out_ext = ".jpg" if ext in TO_JPG else ext
        target = exact.get(stem) or loose.get(key(stem))
        if not target:
            miss.append(f.name)
            continue
        out = DST / (target + out_ext)
        (hit_exact if target == stem else hit_near).append((f.name, out.name))
        if a.check:
            continue
        if out.exists():
            skipped.append(out.name)
            continue
        shutil.copy2(f, out)

    print("소스 %s" % src)
    print("  이미지 %d장 (정확 %d · 이름교정 %d · 미매칭 %d)"
          % (len(files), len(hit_exact), len(hit_near), len(miss)))
    if hit_near:
        print("\n  이름을 교정해 반입한 것 — data.js 의 name 이 정답이다:")
        for a_, b_ in hit_near:
            print("    %s  →  %s" % (a_, b_))
    if miss:
        print("\n  ⚠ 매칭 실패 — 반입하지 않았다. 이름을 확인하십시오:")
        for m in miss:
            print("    %s" % m)
    if skipped:
        print("\n  이미 있어 건너뜀 %d장" % len(skipped))
    if others:
        print("\n  이미지가 아닌 파일 %d개(무시): %s"
              % (len(others), ", ".join(f.name for f in others[:5])))

    if a.check:
        print("\n--check 였습니다. 실제로 복사하려면 이 옵션을 빼십시오.")
    else:
        print("\n다음을 이어서 돌리십시오:")
        print("  python3 tools/optimize_images.py assets/images/places")
        print("  python3 tools/optimize_images.py --thumbs")
        print("  python3 tools/build_photo_index.py")
        print("  python3 tools/bump_version.py && bash tools/check.sh; echo $?")
    return 1 if miss else 0


if __name__ == "__main__":
    sys.exit(main())
