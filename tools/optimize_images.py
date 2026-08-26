#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/optimize_images.py — assets/ 사진 전처리 (배포 Claude 담당)

왜 필요한가 (2026-08-26):
  전처리 도구가 아예 없었다. 그래서 사진을 받은 그대로 assets/ 에 넣었고,
  시티투어 코스 이미지 11장이 **15.5MB**(최대 3.9MB/장)로 들어가 있었다.
  196x116px 카드에 1808x974 PNG 원본을 내리고 있었다는 뜻이다.
  폭 1200 상한 + JPEG q82 로 1.1MB 가 됐다 — 93% 가 그냥 낭비였다.

  사진을 PNG 로 두는 것이 가장 큰 원인이다. 같은 이미지가
  PNG 1706KB / JPEG 240KB 로 7배 차이가 났다(실측).
  PNG 는 스크린샷·로고·투명도가 필요한 것에만 쓴다.

두 가지를 함께 처리한다. 둘 다 안 하면 사진이 조용히 안 뜬다:
  1) 크기·형식  폭 상한을 넘으면 줄이고, 사진이면 JPEG 로 바꾼다
  2) 파일명 NFC  macOS 에서 온 파일은 한글이 자모 분리(NFD)로 저장된다.
     브라우저는 NFC 로 요청하므로 파일이 있어도 404 가 난다.
     실제로 courses/ 11장이 전부 이 이유로 404 였다(2026-08-26).

사용법:
    python3 tools/optimize_images.py --check                  # 무엇이 바뀔지만 본다
    python3 tools/optimize_images.py assets/images/courses    # 특정 폴더
    python3 tools/optimize_images.py                          # assets/images/* 전부

⚠ 원본을 덮어쓴다. assets/ 는 .gitignore 대상이라 이 서버에만 있는 유일본이다.
   --check 로 먼저 확인하고, 되돌릴 수 없는 작업임을 알고 실행할 것.
   확장자가 바뀌면(.png → .jpg) 그 경로를 만드는 코드도 함께 고쳐야 한다.
   예: js/datalab.js 의 _dlCourseHeroSrc()
"""
import argparse, io, os, sys, unicodedata
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow 가 필요합니다:  pip install Pillow")
    sys.exit(2)

ROOT = Path(os.environ.get("HW_ROOT") or Path(__file__).resolve().parent.parent)
MAX_W = 1200          # places 사진의 실측 상한과 맞췄다
QUALITY = 82
MIN_SAVING = 0.15     # 재인코딩이 이만큼 이상 줄일 때만 교체한다(측정 기반 판정)
EXTS = (".jpg", ".jpeg", ".png", ".webp")
# 사진이 아니라 그래픽이라 PNG 로 둬야 하는 것들 (투명도·선명한 경계)
# 파일명 토큰만으로는 한글 이름 로고를 못 지킨다(assets 의 PNG 4장이 전부 한글 이름
# 투명 로고였다). 이름 토큰과 **실제 투명도** 둘 다로 판정한다 — 투명 PNG 를 JPEG 로
# 바꾸면 배경이 검게 칠해져 로고가 망가지고 되돌릴 수 없다.
KEEP_PNG = ("logo", "favicon", "icon")


def targets(argv):
    if argv:
        return [Path(a) if Path(a).is_absolute() else ROOT / a for a in argv]
    base = ROOT / "assets" / "images"
    return [d for d in base.iterdir() if d.is_dir()] if base.is_dir() else []


def process(d: Path, check: bool):
    if not d.is_dir():
        print("  건너뜀 (폴더 없음): %s" % d)
        return 0, 0, 0
    before = after = 0
    changed = 0
    for f in sorted(d.iterdir()):
        if not f.is_file() or f.suffix.lower() not in EXTS:
            continue
        s0 = f.stat().st_size
        before += s0
        nfc = unicodedata.normalize("NFC", f.stem)
        keep_png = f.suffix.lower() == ".png" and any(k in nfc.lower() for k in KEEP_PNG)

        try:
            im = Image.open(f)
        except Exception as e:
            print("  ! 열 수 없음 %s (%s)" % (f.name, e))
            after += s0
            continue

        # 투명도가 있으면 이름과 무관하게 PNG 로 남긴다(JPEG 는 알파를 못 담는다).
        if f.suffix.lower() == ".png" and (im.mode in ("RGBA", "LA")
                                           or (im.mode == "P" and "transparency" in im.info)):
            keep_png = True

        need_resize = im.width > MAX_W
        need_jpeg = (f.suffix.lower() == ".png") and not keep_png
        need_rename = (nfc != f.stem)

        # 이미 JPEG 이고 폭도 작지만 **품질만 과한** 경우 (2026-08-26 추가).
        #   이 도구의 첫 판(같은 날)은 '폭 1200 초과' 와 'PNG' 만 봤다. 그래서
        #   places/ 346장을 처리했다고 보고해 놓고 **한 장도 재인코딩하지 않았다** —
        #   대부분이 이미 JPEG 이고 폭이 1200 이하였기 때문이다. 실측 bpp(비트/픽셀)
        #   중앙값이 2.01 인데 최대가 14.84 였다(q99 + 4:4:4 서브샘플링 추정).
        #
        # 임계 bpp 를 정해 거르지 않는 이유: 어떤 값을 잡아도 경계에서 틀린다.
        #   대신 **실제로 다시 구워 보고, 뚜렷하게 작아질 때만 교체**한다.
        #   이미 잘 압축된 파일은 다시 구워도 안 줄어들어 자동으로 건너뛰어진다.
        #   되돌릴 수 없는 작업이므로 판정을 추측이 아니라 측정에 맡기는 쪽이 맞다.
        requality = None
        if not (need_resize or need_jpeg or need_rename) and f.suffix.lower() in (".jpg", ".jpeg"):
            try:
                buf = io.BytesIO()
                im.convert("RGB").save(buf, "JPEG", quality=QUALITY,
                                       optimize=True, progressive=True)
                if buf.tell() < s0 * (1 - MIN_SAVING):
                    requality = buf.tell()
            except Exception:
                requality = None

        if not (need_resize or need_jpeg or need_rename or requality):
            after += s0
            continue

        ext = ".jpg" if need_jpeg else f.suffix.lower()
        out = d / (nfc + ext)

        # ⚠ 서로 다른 사진이 영구 소실되는 것을 막는다.
        #   같은 stem 의 .png 와 .jpg 가 한 폴더에 있으면(예: 'X.png' 와 'X.jpg'),
        #   .png 를 JPEG 로 저장하는 순간 기존 'X.jpg' 를 덮어쓰고 원본 .png 도 지운다.
        #   두 파일이 다른 사진이면 한 장이 통째로 사라지고 되돌릴 수 없다.
        #   assets/ 는 이 서버에만 있는 유일본이라 더 위험하다. 건드리지 않고 알린다.
        if out.exists() and out.resolve() != f.resolve():
            print("  ! 건너뜀 — 대상이 이미 있음: %s → %s (둘 다 남긴다)" % (f.name, out.name))
            after += s0
            continue

        if check:
            why = ",".join(w for w, c in
                           (("크기", need_resize), ("JPEG", need_jpeg),
                            ("NFC", need_rename), ("품질", requality)) if c)
            est = requality or s0
            print("  %6dKB → %5dKB  %s  [%s]" % (s0 // 1024, est // 1024, f.name, why))
            after += s0
            changed += 1
            continue

        im = im.convert("RGB") if ext == ".jpg" else im
        if need_resize:
            im.thumbnail((MAX_W, MAX_W * 10), Image.LANCZOS)
        if ext == ".jpg":
            # EXIF 를 넘긴다. Orientation 태그가 사라지면 스마트폰 세로 사진이 눕는다.
            kw = {}
            ex = im.info.get("exif")
            if ex:
                kw["exif"] = ex
            im.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True, **kw)
        else:
            im.save(out, optimize=True)
        if f.name != out.name:
            f.unlink()
        after += out.stat().st_size
        changed += 1
    return before, after, changed


def main():
    ap = argparse.ArgumentParser(description="assets 사진 전처리 (원본 덮어씀)")
    ap.add_argument("dirs", nargs="*", help="대상 폴더 (없으면 assets/images/* 전부)")
    ap.add_argument("--check", action="store_true", help="바꾸지 않고 대상만 출력")
    a = ap.parse_args()

    tb = ta = tc = 0
    for d in targets(a.dirs):
        print("▶ %s" % d.relative_to(ROOT))
        b, af, c = process(d, a.check)
        if c:
            print("   %d장 %s — %.1fMB → %.1fMB" %
                  (c, "대상" if a.check else "처리", b / 1048576, af / 1048576))
        else:
            print("   손댈 것 없음")
        tb += b; ta += af; tc += c

    if tc and not a.check:
        print("\n합계 %.1fMB → %.1fMB (%.0f%% 절감)" %
              (tb / 1048576, ta / 1048576, (1 - ta / tb) * 100 if tb else 0))
        print("⚠ 확장자가 바뀐 파일이 있으면 그 경로를 만드는 코드도 고칠 것.")
        print("⚠ js/photos.js 를 다시 만드십시오:  python3 tools/build_photo_index.py")
    elif a.check:
        print("\n%d장이 대상입니다. --check 를 빼면 실제로 처리합니다." % tc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
