#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check_markup.py — index.html 구조 검사 (표준 라이브러리만, node 불필요)

index.html 한 파일에 CSS 1,311줄 + HTML 478줄 + 인라인 JS 2,085줄이 들어 있고
개발/배포 Claude 둘이 같은 파일을 고친다. git 이 자동 병합에 성공해도
중괄호 하나, 닫는 태그 하나가 어긋나면 화면이 통째로 무너지는데
브라우저 HTML 파서는 예외를 던지지 않고 조용히 복구한다.
그 조용한 복구를 여기서 소리 나게 만든다.
"""
import glob, os, re, sys
from html.parser import HTMLParser

ROOT = os.environ.get("HW_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def fail(m): FAIL.append(m)

src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

# ── 1. CSS 중괄호 균형 ───────────────────────────────────────────────────────
# 하나만 어긋나도 그 뒤 CSS 규칙 전부가 무시돼 페이지가 스타일 없이 렌더된다.
#
# 2026-08-25 CSS 를 css/ 6개 파일로 분리했다. 그때 이 검사가 <style> 블록만 보고 있어서,
# 블록이 사라지자 for 문이 한 번도 안 돌고 아무 말 없이 통과했다 — 검사가 죽은 줄도 모르고
# 초록불이 뜨는 상태였다. 그래서 지금은 index.html 의 <style>(남아 있다면)과
# css/*.css 를 함께 보고, 볼 대상이 하나도 없으면 그 자체를 실패로 만든다.
_targets = []
for m in re.finditer(r"<style\b[^>]*>(.*?)</style\s*>", src, re.S | re.I):
    _targets.append(("index.html:%d" % (src.count("\n", 0, m.start()) + 1), m.group(1)))
_cssdir = os.path.join(ROOT, "css")
if os.path.isdir(_cssdir):
    for fn in sorted(f for f in os.listdir(_cssdir) if f.endswith(".css")):
        _targets.append(("css/" + fn, open(os.path.join(_cssdir, fn), encoding="utf-8").read()))

# index.html 이 <link> 로 부르는 css 가 실제로 있는지도 본다.
# 404 는 브라우저가 조용히 넘어가고, 그 파일의 규칙만 통째로 사라진다.
_linked = re.findall(r'<link\b[^>]*\bhref\s*=\s*["\']css/([^"\'?]+)', src, re.I)
_ondisk = set(os.listdir(_cssdir)) if os.path.isdir(_cssdir) else set()
for f in _linked:
    if f not in _ondisk:
        fail("index.html 이 css/%s 를 부르는데 파일이 없다 — 그 규칙이 전부 사라진다" % f)
for f in sorted(_ondisk):
    if f.endswith(".css") and f not in _linked:
        fail("css/%s 가 디스크에 있는데 index.html 이 안 부른다 — 죽은 파일이거나 <link> 를 빠뜨렸다" % f)

if not _targets:
    fail("검사할 CSS 가 하나도 없다 — <style> 도 css/*.css 도 못 찾았다. "
         "스타일 위치가 바뀌었다면 tools/check_markup.py 도 함께 고쳐라")
else:
    _rules = 0
    for label, raw in _targets:
        css = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        d = css.count("{") - css.count("}")
        if d:
            fail("%s  중괄호 불균형 %+d — 이후 CSS 규칙이 전부 무시된다" % (label, d))
        _rules += css.count("{")
    print("  i   CSS 중괄호 균형 (%d개 파일, 규칙 %d개)" % (len(_targets), _rules))

# ── 2. 태그 중첩 ────────────────────────────────────────────────────────────
# HTMLParser 는 <script>/<style> 를 CDATA 로 처리하므로 인라인 JS 문자열 속 '</div>' 를 태그로 오인하지 않는다.
VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.st = []; s.err = []
    def handle_starttag(s, t, a):
        if t not in VOID: s.st.append((t, s.getpos()[0]))
    def handle_startendtag(s, t, a): pass
    def handle_endtag(s, t):
        if t in VOID: return
        if not s.st:
            s.err.append("index.html:%d  </%s> 에 대응하는 여는 태그가 없다" % (s.getpos()[0], t)); return
        if s.st[-1][0] == t: s.st.pop(); return
        for i in range(len(s.st) - 1, -1, -1):
            if s.st[i][0] == t:
                for tt, ll in s.st[i+1:]:
                    s.err.append("index.html:%d  <%s> 가 </%s>(줄 %d) 전에 안 닫혔다" % (ll, tt, t, s.getpos()[0]))
                del s.st[i:]; return
        s.err.append("index.html:%d  </%s> 짝이 없다" % (s.getpos()[0], t))
p = P(); p.feed(src)
FAIL.extend(p.err)
FAIL.extend("index.html:%d  <%s> 가 끝까지 안 닫혔다" % (l, t) for t, l in p.st)
if not p.err and not p.st: print("  i   태그 중첩 정상")

# ── 3. id 중복 ──────────────────────────────────────────────────────────────
# getElementById 는 첫 번째만 잡는다 → 조용히 엉뚱한 요소를 조작한다.
ids = {}
for m in re.finditer(r'\bid\s*=\s*(["\'])([^"\'>]+)\1', src):
    ids.setdefault(m.group(2), []).append(src.count("\n", 0, m.start()) + 1)
dup = {k: v for k, v in ids.items() if len(v) > 1}
for k, v in dup.items():
    fail("index.html  id 중복 '%s' → 줄 %s. getElementById 는 첫 번째만 잡는다" % (k, v))
if not dup: print("  i   정적 id %d개, 중복 0" % len(ids))

# ── 4. getElementById 대상 존재 ─────────────────────────────────────────────
# 대상이 없으면 null 참조로 그 핸들러만 죽는다.
# ★ 정적 HTML 의 id 만 모으면 6건이 오탐난다 — js/*.js 가 문자열로 만들어내는 요소가 있다
#   (js/map.js:999 'my-loc-style', js/map.js:513-515 'sl-desc-short/full/btn',
#    'liv-cat-'/'page-' 접두사 연결 등).
#   그래서 js/*.js 안의 id="..." 문자열까지 함께 모아 대조한다. 실측 결과 오탐 0건.
allids = set(ids)
files = [os.path.join(ROOT, "index.html")] + sorted(glob.glob(os.path.join(ROOT, "js", "*.js")))
for f in files:
    t = open(f, encoding="utf-8").read()
    allids |= {m.group(1) for m in re.finditer(r"""\bid\s*=\s*\\?["'`]([A-Za-z_][\w:-]*)""", t)}
n = 0; miss = 0
for f in files:
    t = open(f, encoding="utf-8").read()
    for m in re.finditer(r"""getElementById\(\s*(["'])([^"']+)\1\s*\)""", t):
        n += 1
        if m.group(2) not in allids:
            miss += 1
            fail("%s:%d  getElementById('%s') 의 대상 id 가 어디에도 없다 — null 참조로 이 경로가 죽는다"
                 % (os.path.relpath(f, ROOT), t.count("\n", 0, m.start()) + 1, m.group(2)))
if not miss: print("  i   getElementById 참조 %d건 전부 대상 존재 (기준선 125)" % n)

for m in FAIL: print("  FAIL " + m)
print("  ── FAIL %d" % len(FAIL))
sys.exit(1 if FAIL else 0)
