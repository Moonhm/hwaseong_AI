#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/intake.py — 데이터 반입 현관 (배포 Claude 담당)

관련 문서
  · 규칙·현황  WORKFLOW.md §18 「외부 데이터 반입 파이프라인」
  · 작업 기록  docs/log/2026-08-25-deploy-data-intake.md
  · 데이터 목록 data/CATALOG.md

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
import argparse, csv, hashlib, io, json, os, re, shutil, sys, tarfile, time, unicodedata, zipfile
import urllib.parse, urllib.request

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RAW, PROC, DESC, SRC = (os.path.join(DATA, d) for d in ("raw", "processed", "descriptions", "sources"))
RAW_BIG = os.path.join(DATA, "raw-large")
CATALOG = os.path.join(DATA, "CATALOG.md")

WORK = "/home/jovyan/work"
KEEP = {"hwaseong_AI", "logs", ".vscode", ".ipynb_checkpoints", "화성시 관광지 사진"}

BIG = 5 * 1024 * 1024          # 이 크기를 넘으면 경량화 대상
GIT_MAX = 3 * 1024 * 1024      # 이 크기 미만이면 data/raw/ (git 추적), 이상이면 data/raw-large/ (로컬 전용)
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
def raw_dir_for(size):
    """3MB 미만이면 git 에 올리는 data/raw/, 이상이면 로컬 전용 data/raw-large/.

    .gitignore 는 파일 크기를 판정할 수 없다. "작으면 올린다" 를 규칙으로만 두면
    반드시 어긋나므로 디렉터리로 갈라 구조적으로 강제한다."""
    return RAW if size < GIT_MAX else RAW_BIG


def rel(path):
    return os.path.relpath(path, ROOT)


def uniq(dirpath, stamp, sub, base):
    """겹치지 않는 저장 경로를 만든다. (겹치면 원본이 조용히 사라진다)

    · 하위 폴더 이름을 접두사로 녹인다  받은자료/2024/list.csv → 20260101_받은자료_2024_list.csv
    · 그래도 겹치면 _2, _3 을 붙인다. 확장자는 반드시 지킨다.
      ⚠ basename 만 쓰면 받은자료/2024/list.csv 와 받은자료/2025/list.csv 가 같은 이름이 되어
        뒤엣것이 앞엣것을 덮어쓴다. 그 뒤 main() 끝의 정리가 원본 폴더를 통째로 지우므로
        한쪽이 영구 소실된다. 카탈로그에는 2행이 남아 둘 다 들어온 것처럼 보인다.
    · .gz 사본도 함께 본다 — 경량화 분기는 out 을 gzip 한 뒤 지우므로,
      이름만 보면 비어 있는 것처럼 보여 지난 경량본을 덮어쓴다.
    """
    pre = re.sub(r"\W+", "_", sub).strip("_")[:40]
    name = "%s_%s_%s" % (stamp, pre, base) if pre else "%s_%s" % (stamp, base)
    tgt = os.path.join(dirpath, name)
    stem, ext = os.path.splitext(tgt)
    i = 2
    while os.path.exists(tgt) or os.path.exists(tgt + ".gz"):
        tgt = "%s_%d%s" % (stem, i, ext)
        i += 1
    return tgt


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

    for d in (RAW, RAW_BIG, PROC, DESC, SRC):
        os.makedirs(d, exist_ok=True)

    # ⚠ 한글 폴더·파일명이 NFD(자모 분리)로 저장돼 있는 경우가 있다.
    #   KEEP 은 NFC 문자열이라 그대로 비교하면 '화성시 관광지 사진' 이 안 걸러진다.
    #   실제로 사진 137장을 잡동사니로 쓸어 담을 뻔했다. 정규화해서 비교한다.
    KEEP_N = {unicodedata.normalize("NFC", k) for k in KEEP}
    items = []
    for f in sorted(os.listdir(args.dir)):
        if unicodedata.normalize("NFC", f) in KEEP_N or f.startswith("."):
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
    work_files = []                                    # (경로, 원본표시, 상대경로 기준 루트)
    preserved = set()                                  # 실제로 어딘가에 보존이 끝난 원본 경로

    # 1) 압축 먼저 푼다
    for p in items:
        base = os.path.basename(p)
        if os.path.isdir(p):
            for r, _, fs in os.walk(p):
                for f in fs:
                    work_files.append((os.path.join(r, f), base + "/", args.dir))
            cleanup.append(p)
            continue
        if any(base.lower().endswith(e) for e in ARCH_EXT):
            dest = os.path.join(RAW, "%s_%s" % (stamp, re.sub(r"\W+", "_", base)[:40]))
            print("📦 %s (%s)" % (base, human(os.path.getsize(p))))
            if args.apply:
                got, memo = unpack(p, dest)
                print("   %s → %d개" % (memo, len(got)))
                for g in got:
                    # 해제된 파일은 dest 아래에 상대경로가 살아 있다. 기준 루트도 dest 다.
                    work_files.append((g, base + " 안", dest))
                if got:
                    cleanup.append(p)      # 내용이 data/raw 에 남았으니 원본 압축은 지워도 된다
                else:
                    # 한 개도 못 풀었는데 지우면 원본이 통째로 사라진다.
                    print("   ⚠ 해제된 파일이 없습니다 — 원본을 work/ 에 그대로 둡니다")
            else:
                with_zip = zipfile.ZipFile(p).namelist()[:6] if base.lower().endswith(".zip") else []
                print("   해제 예정%s" % ("  예: " + ", ".join(fix_cp949(x) for x in with_zip) if with_zip else ""))
            continue
        work_files.append((p, "", args.dir))
        cleanup.append(p)

    # 2) 파일별 처리
    for p, origin, sroot in work_files:
        base = os.path.basename(p)
        try:
            size = os.path.getsize(p)
        except OSError:
            continue
        low = base.lower()
        # 저장 이름에 녹일 하위 폴더. 같은 이름의 파일이 폴더만 달리해 들어오는 일이
        # 공공데이터 배포에서 흔한데, basename 만 쓰면 한 개만 남는다.
        try:
            sub = os.path.dirname(os.path.relpath(p, sroot))
        except ValueError:
            sub = ""
        if sub.startswith(".."):
            sub = ""

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
                    out = uniq(SRC, stamp, sub, "%s.json" % re.sub(r"\W+", "_", base)[:30])
                    json.dump({"file": base, "blocks": blocks, "probes": probes},
                              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    print("   → 출처 기록: %s" % os.path.relpath(out, ROOT))
            if args.apply:
                dtgt = uniq(DESC, stamp, sub, base)
                shutil.copy2(p, dtgt)
                preserved.add(p)
                entries.append({"name": base, "cat": "desc", "state": "parsed",
                                "count": len(blocks), "raw": "-",
                                "out": rel(dtgt),
                                "source": "사용자 메모", "note": "URL %d개" % len(urls)})
            continue

        if low.endswith(TABLE_EXT):
            rows, memo = read_rows(p)
            if rows is None:
                # ⚠ 여기서 그냥 continue 하면 아무 데도 복사하지 않은 채 아래 정리가
                #   원본을 지운다 — work/ 에 올라온 것은 유일본이라 영구 소실이다.
                #   읽지 못한 것은 '분류를 못 한 것' 이지 '버려도 되는 것' 이 아니다.
                #   아래 '그 밖의 파일' 분기와 같은 정책으로 보관하고 hold 로 남긴다.
                print("\n❌ %s%s (%s) — %s. 분류는 못 했지만 보관합니다"
                      % (origin, base, human(size), memo))
                if args.apply:
                    tgt = uniq(raw_dir_for(size), stamp, sub, base)
                    shutil.copy2(p, tgt)
                    preserved.add(p)
                    entries.append({"name": base, "cat": "misc", "state": "hold", "count": "-",
                                    "raw": rel(tgt), "out": "-",
                                    "source": origin or "사용자 제공",
                                    "note": "읽기 실패: %s" % memo})
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
                    out = uniq(PROC, stamp, sub, "%s.min.json" % stem)
                    n, nb, out = compact(rows, out)
                    out = maybe_gzip(out, size)
                    nb = os.path.getsize(out)
                    if nb < size:
                        print("   경량화: %s → %s (%.0f%% 감소), 원본 삭제"
                              % (human(size), human(nb), (1 - nb / size) * 100))
                        preserved.add(p)      # 경량본이 원본을 대신한다 (원본 삭제가 설계다)
                        entries.append({"name": base, "cat": cat, "state": "processed", "count": n,
                                        "raw": "삭제(경량화)",
                                        "out": "data/processed/%s" % os.path.basename(out),
                                        "source": origin or "사용자 제공",
                                        "note": "원본 %s → %s" % (human(size), human(nb))})
                    else:
                        # 경량화가 이득이 없다 — 원본을 남긴다
                        os.remove(out)
                        tgt = uniq(raw_dir_for(size), stamp, sub, base)
                        shutil.copy2(p, tgt)
                        preserved.add(p)
                        print("   경량화 이득 없음(%s → %s) — 원본을 그대로 보관합니다"
                              % (human(size), human(nb)))
                        entries.append({"name": base, "cat": cat, "state": "parsed", "count": len(rows),
                                        "raw": rel(tgt), "out": "-",
                                        "source": origin or "사용자 제공", "note": "경량화 이득 없어 원본 유지"})
                else:
                    tgt = uniq(raw_dir_for(size), stamp, sub, base)
                    shutil.copy2(p, tgt)
                    preserved.add(p)
                    entries.append({"name": base, "cat": cat, "state": "parsed", "count": len(rows),
                                    "raw": rel(tgt), "out": "-",
                                    "source": origin or "사용자 제공", "note": ", ".join(map(str, cols[:5]))})
            continue

        # 그 밖의 파일 — 버리지 않고 보관
        print("\n📁 %s%s (%s) — 표·메모 아님. 보관합니다" % (origin, base, human(size)))
        if args.apply:
            tgt = uniq(raw_dir_for(size), stamp, sub, base)
            shutil.copy2(p, tgt)
            preserved.add(p)
            entries.append({"name": base, "cat": "misc", "state": "hold", "count": "-",
                            "raw": rel(tgt), "out": "-",
                            "source": origin or "사용자 제공", "note": "미분류 보관"})

    if args.apply:
        append_catalog(entries)
        # ⚠ cleanup 은 '처리하기 전' 에 채워진다. 그래서 중간에 어떤 이유로든 보존이
        #   빠지면 유일본이 그대로 사라진다. 지우기 직전에 '원본 수 == 보존된 수' 를
        #   맞춰 보고, 하나라도 어긋나면 그 항목은 지우지 않고 알린다.
        #   압축 해제분(sroot != args.dir)은 data/raw 아래 사본이 이미 남으므로 제외한다.
        unsaved = [q for q, _o, sroot in work_files
                   if sroot == args.dir and q not in preserved and os.path.exists(q)]
        kept = 0
        for p in cleanup:
            blocked = [q for q in unsaved if q == p or q.startswith(p + os.sep)]
            if blocked:
                kept += 1
                print("  ⚠ 보존하지 못한 파일이 있어 원본을 지우지 않습니다: %s" % p)
                for q in blocked[:5]:
                    print("      · %s" % q)
                continue
            try:
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
            except OSError as e:
                print("  ⚠ 정리 실패 %s: %s" % (p, e))
        if kept:
            # '정리 완료' 만 찍으면 남은 것을 아무도 안 본다. 숫자를 같이 낸다.
            print("\n⚠ 카탈로그 %d건 추가 · work/ 에 %d개를 남겼습니다 (위 경고를 확인하십시오)"
                  % (len(entries), kept))
        else:
            print("\n✅ 카탈로그 %d건 추가 · work/ 정리 완료" % len(entries))
        print("   data/CATALOG.md 를 확인하십시오.")
    else:
        print("\n(계획만 출력했습니다. --apply 를 붙이면 실행합니다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
