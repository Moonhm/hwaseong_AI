#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/intake.py — 데이터 반입 현관 (배포 Claude 담당 · WORKFLOW.md §18·§24)

사용자가 /home/jovyan/work/ 에 무엇을 넣든 이 도구가 받아서 정리한다.
  압축 해제 → 인벤토리 → txt 메모 분해 → URL 수집 → 경량화 → 카탈로그 기록 → work/ 비우기

받는 것
  · 표 형식      csv / tsv / json / xlsx / xls
  · 압축         zip / tar / tar.gz / tgz / tar.bz2 / tar.xz / gz / bz2 / xz / zst
  · 메모장       txt / md  — '---' 로 구분된 URL+설명 블록
  · 그 밖의 파일  분류만 하고 data/raw/ 에 보관 (버리지 않는다)

사용법
    python3 tools/intake.py                 # 스캔 후 계획만 출력 (기본, 아무것도 안 옮김)
    python3 tools/intake.py --apply         # 실제로 옮기고 정리
    python3 tools/intake.py --apply --fetch # URL 까지 접속해 내용·API 확인
    python3 tools/intake.py --dir <경로>

설계 근거
  · unzip CLI 가 없는 환경이라 zip 은 파이썬 zipfile 로 푼다.
  · 한글 zip 은 파일명이 cp949 로 들어있는 경우가 많아 그대로 풀면 깨진다. 복원한다.
  · 용량 큰 원본은 "전부 읽고 재편성 → 경량본 저장 → 원본 삭제" 가 사용자 지시다.
    기준 5MB. 선례로 지역화폐 27,374건이 짧은 키 6개로 4.2MB 다.
  · zip 폭탄·경로 탈출(../) 방어를 넣는다. 공공데이터 zip 을 그대로 믿지 않는다.
"""
import argparse, csv, hashlib, io, json, os, re, shutil, sys, tarfile, time, zipfile
import urllib.parse, urllib.request

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RAW, PROC, DESC, SRC = (os.path.join(DATA, d) for d in ("raw", "processed", "descriptions", "sources"))
CATALOG = os.path.join(DATA, "CATALOG.md")

WORK = "/home/jovyan/work"
KEEP = {"hwaseong_AI", "logs", ".vscode", ".ipynb_checkpoints", "화성시 관광지 사진"}

BIG = 5 * 1024 * 1024          # 이 크기를 넘으면 경량화 대상
MAX_UNPACK = 2 * 1024 ** 3     # 압축 해제 총량 상한 (zip 폭탄 방어)

TABLE_EXT = (".csv", ".tsv", ".json", ".xlsx", ".xls")
TEXT_EXT = (".txt", ".md")
ARCH_EXT = (".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".gz", ".bz2", ".xz", ".zst")

URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return "%.1f%s" % (n, u) if u != "B" else "%dB" % n
        n /= 1024.0


def safe_name(n):
    """경로 탈출·절대경로 차단."""
    n = n.replace("\\", "/")
    parts = [p for p in n.split("/") if p not in ("", ".", "..")]
    return os.path.join(*parts) if parts else ""


def fix_cp949(name):
    """한글 zip 파일명 복원. zipfile 은 EFS 플래그가 없으면 cp437 로 디코딩한다."""
    try:
        return name.encode("cp437").decode("cp949")
    except Exception:
        return name


# ── 압축 해제 ────────────────────────────────────────────────────────────────
def unpack(path, dest):
    """(풀린 파일 목록, 메모). 실패 시 ([], 사유)."""
    os.makedirs(dest, exist_ok=True)
    low = path.lower()
    out, total = [], 0
    try:
        if low.endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    total += info.file_size
                    if total > MAX_UNPACK:
                        return out, "해제 총량이 %s 를 넘어 중단" % human(MAX_UNPACK)
                    nm = safe_name(fix_cp949(info.filename))
                    if not nm:
                        continue
                    tgt = os.path.join(dest, nm)
                    os.makedirs(os.path.dirname(tgt), exist_ok=True)
                    with z.open(info) as s, open(tgt, "wb") as d:
                        shutil.copyfileobj(s, d)
                    out.append(tgt)
            return out, "zip %d개" % len(out)

        if any(low.endswith(e) for e in (".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz")):
            with tarfile.open(path) as t:
                for m in t.getmembers():
                    if not m.isfile():
                        continue
                    total += m.size
                    if total > MAX_UNPACK:
                        return out, "해제 총량 초과로 중단"
                    nm = safe_name(m.name)
                    if not nm:
                        continue
                    tgt = os.path.join(dest, nm)
                    os.makedirs(os.path.dirname(tgt), exist_ok=True)
                    f = t.extractfile(m)
                    if f:
                        with open(tgt, "wb") as d:
                            shutil.copyfileobj(f, d)
                        out.append(tgt)
            return out, "tar %d개" % len(out)

        # 단일 파일 압축
        import bz2, gzip, lzma
        opener = {".gz": gzip.open, ".bz2": bz2.open, ".xz": lzma.open}
        for ext, op in opener.items():
            if low.endswith(ext):
                tgt = os.path.join(dest, os.path.basename(path)[: -len(ext)])
                with op(path, "rb") as s, open(tgt, "wb") as d:
                    shutil.copyfileobj(s, d)
                return [tgt], "단일 압축 해제"
        if low.endswith(".zst"):
            try:
                import zstandard as zstd
            except ImportError:
                return [], "zstandard 미설치 — pip install zstandard"
            tgt = os.path.join(dest, os.path.basename(path)[:-4])
            with open(path, "rb") as s, open(tgt, "wb") as d:
                zstd.ZstdDecompressor().copy_stream(s, d)
            return [tgt], "zstd 해제"
    except Exception as e:
        return out, "해제 실패: %s: %s" % (type(e).__name__, e)
    return [], "지원하지 않는 압축 형식"


# ── 표 읽기 ──────────────────────────────────────────────────────────────────
def read_rows(path, limit=None):
    """(rows, 인코딩/메모). 실패 시 (None, 사유)."""
    low = path.lower()
    try:
        if low.endswith(".json"):
            d = json.load(open(path, encoding="utf-8"))
            rows = d if isinstance(d, list) else [d]
            return (rows[:limit] if limit else rows), "utf-8"
        if low.endswith((".xlsx", ".xls")):
            import pandas as pd
            df = pd.read_excel(path, nrows=limit)
            return df.where(pd.notna(df), None).to_dict("records"), "excel"
        raw = open(path, "rb").read()
        for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
            try:
                txt = raw.decode(enc)
            except UnicodeDecodeError:
                continue
            head = txt[:4000]
            delim = "\t" if (low.endswith(".tsv") or head.count("\t") > head.count(",")) else ","
            rows = list(csv.DictReader(io.StringIO(txt), delimiter=delim))
            if rows:
                return (rows[:limit] if limit else rows), enc
        return None, "인코딩 판별 실패"
    except Exception as e:
        return None, "%s: %s" % (type(e).__name__, e)


def compact(rows, out_path):
    """열 이름을 한 번만 적고 행은 배열로 저장한다. (건수, 바이트, 실제경로)

    ⚠ 행마다 {"키":"값"} 을 반복하면 CSV 보다 오히려 커진다. 실측으로 확인했다 —
       6만 행 7컬럼 CSV 5.3MB 를 객체 배열로 쓰면 7.7MB 가 된다(키가 42만 번 반복).
       그래서 columnar(열 이름 1회 + 행은 값 배열)로 쓴다.
       그래도 원본보다 크면 gzip 하고, 그것마저 크면 경량화를 포기하고 원본을 남긴다.
       "경량화했다"면서 용량이 늘고 원본까지 지우는 것이 가장 나쁜 결과다.
    """
    if not rows:
        return 0, 0, out_path
    cols = [c for c in rows[0].keys() if c]
    keep = [c for c in cols
            if any(str(r.get(c) or "").strip() for r in rows[:1000])]   # 전부 빈 컬럼 제거
    body = [[("" if r.get(c) is None else str(r.get(c)).strip()) for c in keep] for r in rows]
    payload = {"cols": keep, "n": len(body), "rows": body}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    return len(body), os.path.getsize(out_path), out_path


def maybe_gzip(path, budget):
    """budget(원본 크기)보다 크면 gzip 해서 더 작은 쪽을 남긴다."""
    import gzip as _gz
    if os.path.getsize(path) <= budget:
        return path
    gz = path + ".gz"
    with open(path, "rb") as s, _gz.open(gz, "wb", compresslevel=9) as d:
        shutil.copyfileobj(s, d)
    if os.path.getsize(gz) < os.path.getsize(path):
        os.remove(path)
        return gz
    os.remove(gz)
    return path


# ── txt 메모 분해 ────────────────────────────────────────────────────────────
def split_memo(path):
    """'---' 로 구분된 블록 → [{urls, text}]"""
    raw = open(path, "rb").read()
    txt = None
    for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
        try:
            txt = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    if txt is None:
        return []
    blocks = re.split(r"(?m)^\s*-{3,}\s*$", txt)
    out = []
    for b in blocks:
        b = b.strip()
        if not b:
            continue
        urls = URL_RE.findall(b)
        out.append({"urls": urls, "text": b})
    return out


def probe_url(u, timeout=12):
    """페이지를 받아 제목·형식·API 단서를 뽑는다."""
    info = {"url": u, "status": None, "type": "", "title": "", "hints": [], "bytes": 0}
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (hwaseong-itda intake)"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            info["status"] = r.status
            info["type"] = r.headers.get("Content-Type", "")
            body = r.read(400_000)
            info["bytes"] = len(body)
    except Exception as e:
        info["status"] = "ERR"
        info["hints"].append("%s: %s" % (type(e).__name__, e))
        return info

    ct = info["type"].lower()
    if "json" in ct:
        info["hints"].append("응답이 JSON — 그대로 API 로 쓸 수 있음")
        return info
    if "csv" in ct or "excel" in ct or "sheet" in ct:
        info["hints"].append("응답이 표 파일 — 직접 내려받기 가능")
        return info
    try:
        html = body.decode("utf-8", "replace")
    except Exception:
        return info
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    if m:
        info["title"] = re.sub(r"\s+", " ", m.group(1)).strip()[:120]
    # API·다운로드 단서
    for pat, why in [
        (r"openapi|api\.go\.kr|apis\.data\.go\.kr", "공공데이터포털 OpenAPI 링크"),
        (r"serviceKey", "serviceKey 파라미터 — 인증키 필요한 API"),
        (r'href="([^"]*\.(?:csv|xlsx|xls|json|zip))"', "직접 내려받을 수 있는 파일 링크"),
        (r"fileDataDetail|FileData|downloadFile", "파일데이터 상세 페이지"),
        (r"getList|selectList|\.do\?", "목록 조회 엔드포인트 후보"),
    ]:
        if re.search(pat, html, re.I):
            info["hints"].append(why)
    for href in re.findall(r'href="([^"]*\.(?:csv|xlsx|xls|json|zip))"', html, re.I)[:8]:
        info["hints"].append("파일: " + urllib.parse.urljoin(u, href))
    return info


# ── 카탈로그 ─────────────────────────────────────────────────────────────────
def append_catalog(entries):
    if not entries:
        return
    s = open(CATALOG, encoding="utf-8").read()
    a, b = "<!-- INTAKE-TABLE-START -->", "<!-- INTAKE-TABLE-END -->"
    i, j = s.index(a) + len(a), s.index(b)
    cur = s[i:j]
    cur = re.sub(r"\|\s*—\s*\|\s*\(아직 반입된 데이터가 없습니다\).*?\n", "", cur)
    n = len(re.findall(r"(?m)^\|\s*\d+\s*\|", cur))
    lines = []
    for e in entries:
        n += 1
        lines.append("| %d | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            n, e.get("name", ""), e.get("cat", ""), e.get("state", ""), e.get("count", ""),
            e.get("raw", ""), e.get("out", ""), e.get("source", ""), e.get("note", "")))
    if not cur.strip().endswith("|"):
        cur = cur.rstrip() + "\n"
    open(CATALOG, "w", encoding="utf-8").write(s[:i] + cur.rstrip() + "\n" + "\n".join(lines) + "\n\n" + s[j:])


def main():
    ap = argparse.ArgumentParser(description="데이터 반입 현관")
    ap.add_argument("--dir", default=WORK)
    ap.add_argument("--apply", action="store_true", help="실제로 옮기고 정리")
    ap.add_argument("--fetch", action="store_true", help="URL 접속해 내용·API 확인")
    args = ap.parse_args()

    for d in (RAW, PROC, DESC, SRC):
        os.makedirs(d, exist_ok=True)

    items = []
    for f in sorted(os.listdir(args.dir)):
        if f in KEEP or f.startswith("."):
            continue
        p = os.path.join(args.dir, f)
        items.append(p)

    print("스캔: %s" % args.dir)
    if not items:
        print("  새로 반입할 항목이 없습니다. (work/ 는 이미 깨끗합니다)")
        return 0
    print("  항목 %d개%s\n" % (len(items), "" if args.apply else "  — 계획만 출력합니다 (--apply 로 실행)"))

    stamp = time.strftime("%Y%m%d")
    entries, cleanup = [], []
    work_files = []                                    # (경로, 원본표시)

    # 1) 압축 먼저 푼다
    for p in items:
        base = os.path.basename(p)
        if os.path.isdir(p):
            for r, _, fs in os.walk(p):
                for f in fs:
                    work_files.append((os.path.join(r, f), base + "/"))
            cleanup.append(p)
            continue
        if any(base.lower().endswith(e) for e in ARCH_EXT):
            dest = os.path.join(RAW, "%s_%s" % (stamp, re.sub(r"\W+", "_", base)[:40]))
            print("📦 %s (%s)" % (base, human(os.path.getsize(p))))
            if args.apply:
                got, memo = unpack(p, dest)
                print("   %s → %d개" % (memo, len(got)))
                for g in got:
                    work_files.append((g, base + " 안"))
                cleanup.append(p)
            else:
                with_zip = zipfile.ZipFile(p).namelist()[:6] if base.lower().endswith(".zip") else []
                print("   해제 예정%s" % ("  예: " + ", ".join(fix_cp949(x) for x in with_zip) if with_zip else ""))
            continue
        work_files.append((p, ""))
        cleanup.append(p)

    # 2) 파일별 처리
    for p, origin in work_files:
        base = os.path.basename(p)
        try:
            size = os.path.getsize(p)
        except OSError:
            continue
        low = base.lower()

        if low.endswith(TEXT_EXT):
            blocks = split_memo(p)
            urls = [u for b in blocks for u in b["urls"]]
            print("\n📝 %s (%s) — 블록 %d개 / URL %d개" % (base, human(size), len(blocks), len(urls)))
            for b in blocks[:12]:
                head = re.sub(r"\s+", " ", b["text"])[:70]
                print("   · %s" % head)
            if args.fetch and args.apply:
                probes = []
                for u in urls:
                    info = probe_url(u)
                    probes.append(info)
                    print("   %s  %s  %s" % (info["status"], u[:60], info["title"][:40]))
                    for h in info["hints"][:4]:
                        print("      ↳ %s" % h)
                    time.sleep(0.3)
                if probes:
                    out = os.path.join(SRC, "%s_%s.json" % (stamp, re.sub(r"\W+", "_", base)[:30]))
                    json.dump({"file": base, "blocks": blocks, "probes": probes},
                              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    print("   → 출처 기록: %s" % os.path.relpath(out, ROOT))
            if args.apply:
                shutil.copy2(p, os.path.join(DESC, "%s_%s" % (stamp, base)))
                entries.append({"name": base, "cat": "desc", "state": "parsed",
                                "count": len(blocks), "raw": "-",
                                "out": "data/descriptions/%s_%s" % (stamp, base),
                                "source": "사용자 메모", "note": "URL %d개" % len(urls)})
            continue

        if low.endswith(TABLE_EXT):
            rows, memo = read_rows(p)
            if rows is None:
                print("\n❌ %s — %s" % (base, memo))
                continue
            cols = [c for c in rows[0].keys() if c] if rows else []
            print("\n📊 %s%s (%s) — %d행 / 컬럼 %d개 / %s"
                  % (origin, base, human(size), len(rows), len(cols), memo))
            print("   컬럼: %s" % ", ".join(map(str, cols[:10])))
            try:
                sys.path.insert(0, os.path.join(ROOT, "tools"))
                from ingest import classify
                cat, why = classify(rows)
            except Exception:
                cat, why = "misc", "분류기 사용 불가"
            print("   분류: %s  ← %s" % (cat, why))

            if args.apply:
                stem = re.sub(r"\W+", "_", os.path.splitext(base)[0])[:40]
                if size > BIG:
                    out = os.path.join(PROC, "%s_%s.min.json" % (stamp, stem))
                    n, nb, out = compact(rows, out)
                    out = maybe_gzip(out, size)
                    nb = os.path.getsize(out)
                    if nb < size:
                        print("   경량화: %s → %s (%.0f%% 감소), 원본 삭제"
                              % (human(size), human(nb), (1 - nb / size) * 100))
                        entries.append({"name": base, "cat": cat, "state": "processed", "count": n,
                                        "raw": "삭제(경량화)",
                                        "out": "data/processed/%s" % os.path.basename(out),
                                        "source": origin or "사용자 제공",
                                        "note": "원본 %s → %s" % (human(size), human(nb))})
                    else:
                        # 경량화가 이득이 없다 — 원본을 남긴다
                        os.remove(out)
                        tgt = os.path.join(RAW, "%s_%s" % (stamp, base))
                        shutil.copy2(p, tgt)
                        print("   경량화 이득 없음(%s → %s) — 원본을 그대로 보관합니다"
                              % (human(size), human(nb)))
                        entries.append({"name": base, "cat": cat, "state": "parsed", "count": len(rows),
                                        "raw": "data/raw/%s" % os.path.basename(tgt), "out": "-",
                                        "source": origin or "사용자 제공", "note": "경량화 이득 없어 원본 유지"})
                else:
                    tgt = os.path.join(RAW, "%s_%s" % (stamp, base))
                    shutil.copy2(p, tgt)
                    entries.append({"name": base, "cat": cat, "state": "parsed", "count": len(rows),
                                    "raw": "data/raw/%s" % os.path.basename(tgt), "out": "-",
                                    "source": origin or "사용자 제공", "note": ", ".join(map(str, cols[:5]))})
            continue

        # 그 밖의 파일 — 버리지 않고 보관
        print("\n📁 %s%s (%s) — 표·메모 아님. 보관합니다" % (origin, base, human(size)))
        if args.apply:
            tgt = os.path.join(RAW, "%s_%s" % (stamp, base))
            shutil.copy2(p, tgt)
            entries.append({"name": base, "cat": "misc", "state": "hold", "count": "-",
                            "raw": "data/raw/%s" % os.path.basename(tgt), "out": "-",
                            "source": origin or "사용자 제공", "note": "미분류 보관"})

    if args.apply:
        append_catalog(entries)
        for p in cleanup:
            try:
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
            except OSError as e:
                print("  ⚠ 정리 실패 %s: %s" % (p, e))
        print("\n✅ 카탈로그 %d건 추가 · work/ 정리 완료" % len(entries))
        print("   data/CATALOG.md 를 확인하십시오.")
    else:
        print("\n(계획만 출력했습니다. --apply 를 붙이면 실행합니다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
