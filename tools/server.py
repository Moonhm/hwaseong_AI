"""
화성잇다 — 통합 서버 (정적 파일 + 주차장 API 프록시)
=====================================================
Cloudflare Tunnel이 이 서버를 가리키도록 설정하세요.

사용법:
  pip install -r tools/requirements.txt     # flask · requests · waitress
  python tools/server.py                    # 기본 포트 8080
  python tools/server.py --port 3000
  python tools/server.py --dev              # waitress 대신 Flask 개발 서버

⚠ 컨테이너가 재시작되면 pip 설치분이 사라집니다(/home/jovyan/work 만 영속).
  서버가 안 뜨면 먼저 위 requirements 를 다시 설치하십시오.

이 서버가 하는 일:
  - / → index.html 및 정적 파일 서빙
  - /api/parking/list     → 화성시 주차장 목록 (정적 정보 + 좌표)
  - /api/parking/realtime → 실시간 주차 현황 (여유 면수)
  - /healthz              → 살아있는지 확인 (터널 점검용)

2026-08-31 최적화 (배포 Claude) — 근거·실측은
docs/log/2026-08-31-deploy-server-optimize.md
  ① gzip 응답 압축 + 압축 결과 메모리 캐시
       첫 화면(index.html + js 23 + css 7 = 31개)  876,170 B → 279,123 B  (-68.1%)
       지연 로드 지역화폐 JSON                    4,365,304 B → 836,985 B  (-80.8%)
  ② 상류 주차장 API 캐시 (list 1h · realtime 45s) + 실패 시 stale 반환
  ③ requests.Session 연결 재사용 (요청마다 TLS 핸드셰이크하던 것)
  ④ waitress WSGI (스레드 8) — 31개 동시 6 요청 209ms → 110ms. 개발 서버는 --dev 로만
  ⑤ 기동 시 상류 프리워밍 → 첫 방문자가 상류 응답을 기다리지 않는다

⚠ 위 숫자는 전부 이 서버를 띄워 실제로 잰 값입니다. 처음 이 docstring 에 적혀
  있던 "6.46MB → 1.28MB (80%)" 는 **재지 않고 쓴 값**이었습니다 — 4.2MB 짜리
  지연 로드 JSON 을 첫 화면 몫으로 세고 있었습니다. 고칠 때는 다시 재십시오.
"""

import argparse
import gzip as _gzip
import io
import os
import threading
import time
import requests
import warnings

warnings.filterwarnings("ignore")

from flask import Flask, jsonify, request, send_from_directory

# 프로젝트 루트 = tools/ 의 상위 디렉토리
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_STARTED = time.time()                   # /healthz 의 uptime 기준

# ── 요금구역별 요금 정보 (출처: 화성시_공영주차장_실시간_정보.py) ──────────────
FEE_TABLE = {
    "동부권": {
        "기본무료": "89분 (1시간 29분)",
        "야간무료": "23:00 ~ 익일 10:00",
        "요금단계": ["90분~149분: 10분당 400원", "150분~: 10분당 600원"],
        "상한선": "환승주차장 10,000원 / 그 외 없음",
        "비고": "유인노상(영천1·2, 반송마을) 공휴일·주말 무료",
    },
    "서부권": {
        "기본무료": "89분 (1시간 29분)",
        "야간무료": "23:00 ~ 익일 10:00",
        "요금단계": ["90분~149분: 10분당 300원", "150분~: 10분당 400원"],
        "상한선": "없음",
        "비고": "",
    },
    "전통시장": {
        "기본무료": "119분 (1시간 59분)",
        "야간무료": "23:00 ~ 익일 10:00",
        "요금단계": ["120분~179분: 10분당 300원", "180분~: 10분당 400원"],
        "상한선": "없음",
        "비고": "재래시장 이용객 50% 감면",
    },
    "관광지(제부도4·5호)": {
        "기본무료": "없음",
        "야간무료": "없음",
        "요금단계": ["~4시간 59분: 1,000원", "5~9시간 59분: 2,000원", "10~24시간: 3,000원"],
        "상한선": "3,000원 (24시간)",
        "비고": "",
    },
    "관광지(제부도임시)": {
        "기본무료": "없음",
        "야간무료": "없음",
        "요금단계": ["시간당 3,000원"],
        "상한선": "없음",
        "비고": "",
    },
    "공원1": {
        "기본무료": "59분",
        "야간무료": "없음",
        "요금단계": ["1~2시간 59분: 1,000원 (정액)", "3시간~: 10분당 500원"],
        "상한선": "10,000원 (24시간)",
        "비고": "",
    },
    "공원2": {
        "기본무료": "59분",
        "야간무료": "없음",
        "요금단계": ["1~2시간 59분: 1,000원 (정액)", "3시간~: 10분당 500원"],
        "상한선": "없음",
        "비고": "",
    },
    "공원3": {
        "기본무료": "119분 (1시간 59분)",
        "야간무료": "없음",
        "요금단계": ["2~2시간 59분: 1,000원 (정액)", "3시간~: 10분당 500원"],
        "상한선": "10,000원 (24시간)",
        "비고": "",
    },
    "공원4": {
        "기본무료": "5시간 59분",
        "야간무료": "없음",
        "요금단계": ["6시간 이후: 10,000원 (정액)"],
        "상한선": "10,000원 (24시간)",
        "비고": "",
    },
}

# ── 주차장명 → 요금구역 매핑 ──────────────────────────────────────────────────
_ZONE_MAP = {
    "진안": "동부권", "석우동 제1": "동부권", "석우동 제2": "동부권",
    "석우동 제3공영주차장": "동부권", "한빛": "동부권", "한빛(지하)": "동부권",
    "다은": "동부권", "다은(지하)": "동부권", "동탄2오산동(신리천로)": "동부권",
    "동탄2 주21 공영주차장": "동부권", "동탄2 주64 공영주차장": "동부권",
    "동탄2지구 주65 공영주차장": "동부권", "동탄 캠핑카(임시)": "동부권",
    "노작마을": "동부권", "목동": "동부권", "목동2": "동부권",
    "동탄산단": "동부권", "병점복합타운": "동부권", "산척동(주22)": "동부권",
    "산척동1 유인노상": "동부권", "산척동2 유인노상": "동부권",
    "선납숲공원": "동부권", "송동721 공영주차장": "동부권",
    "여울동": "동부권", "영천3공영주차장": "동부권", "영천동772(노상)": "동부권",
    "호수주차타워": "동부권", "태안3 주5 공영주차장": "동부권",
    "태안3 주6 공영주차장": "동부권", "비봉지구 주4": "동부권",
    "센트럴파크(노상)": "동부권", "능동(노상)": "동부권", "능동 제1(노상)": "동부권",
    "동탄 북광장(노상)": "동부권", "동탄 남광장(노상)": "동부권",
    "나루(노상)": "동부권", "솔빛(노상)": "동부권", "은행사거리(노상)": "동부권",
    "노작공원(노상)": "동부권", "영천1 유인노상": "동부권",
    "영천2 유인노상": "동부권", "반송동 유인노상": "동부권",
    "동탄역임시": "동부권", "병점역(환승)": "동부권", "향남 환승터미널": "동부권",
    "향남2 하길리(중심상가)": "동부권", "하길리임시": "동부권",
    "동화 중심주차타워": "동부권", "향남 행정리": "동부권",
    "봉담상리1": "동부권", "봉담상리2": "동부권",
    "남양리 구도심": "서부권", "남양리 나눔주차장": "서부권",
    "남양리 중심상가": "서부권", "하가등천": "서부권",
    "남양뉴타운 주5": "서부권", "향남2 상신리": "서부권",
    "남양택지 주3": "서부권", "봉담읍 와우리": "서부권",
    "내리지구공영": "서부권", "상리(행복주택)": "서부권",
    "시청앞(노상)": "서부권",
    "남양 재래시장": "전통시장", "평리": "전통시장", "우정(조암)": "전통시장",
    "제부도 4호": "관광지(제부도4·5호)", "제부도 5호": "관광지(제부도4·5호)",
    "제부도 임시": "관광지(제부도임시)",
    "여울 공원(관리동)": "공원1", "여울 공원(작가공원)": "공원1",
    "여울 공원(지하)": "공원1", "여울 공원(LH)": "공원1",
    "동탄호수공원(지하)": "공원1", "동탄호수공원(노외)": "공원1",
    "봉담2 체육공원(지하)": "공원1", "다람산체육공원": "공원1",
    "센트럴파크": "공원1", "치동천 체육공원": "공원1",
    "에코스쿨": "공원1", "노작 공원": "공원1",
    "돌모루공원": "공원2", "동학산 공원": "공원2",
    "근린공원4호": "공원3",
    "수노을 중앙공원": "공원4",
}

app = Flask(__name__, static_folder=ROOT, static_url_path="")

# ── 공개 범위 제한 ────────────────────────────────────────────────────────────
# static_folder=ROOT 는 저장소 루트를 통째로 정적 서빙한다. Cloudflare 터널이
# 이 서버를 그대로 인터넷에 노출하므로, 막지 않으면 아래가 전부 공개로 읽힌다.
# 실측(2026-08-25): /.git/config, /.git/logs/HEAD(43KB), /WORKFLOW.md(41KB),
#                   /tools/fix_coords.py 가 전부 HTTP 200 이었다.
# .git/config 에는 커밋 계정 이메일이, tools/*.py 와 WORKFLOW.md 에는
# Kakao REST 키가 평문으로 들어 있다.
#
# 거부 목록이 아니라 허용 목록이다 — 새 파일이 루트에 생겨도 기본이 비공개다.
# 앱이 실제로 요청하는 정적 경로는 js/ · img/ · assets/ 뿐이다(코드 전수 확인).
# css/ 는 향후 CSS 분리를 대비해 미리 열어 둔다.
_PUBLIC_DIRS   = ("js/", "img/", "assets/", "css/")
_PUBLIC_FILES  = ("index.html", "favicon.ico")
_PUBLIC_ROUTES = ("healthz",)            # 정적 파일이 아니라 라우트다 — 허용목록에 없으면 404 다


@app.before_request
def _restrict_static_scope():
    path = request.path.lstrip("/")
    if not path or path.startswith("api/") or path in _PUBLIC_ROUTES:
        return None                      # 루트(/) 와 API·점검 라우트는 아래 핸들러가 맡는다
    if ".." in path:
        return ("Not Found", 404)        # 경로 탈출 시도
    if path in _PUBLIC_FILES:
        return None
    if any(path.startswith(d) for d in _PUBLIC_DIRS):
        return None
    return ("Not Found", 404)


@app.after_request
def _cache_headers(resp):
    """?v= 를 단 js/css 만 장기 캐시한다 (2026-08-26, 배포 Claude).

    왜: Flask 기본값이라 정적 파일이 전부 Cache-Control: no-cache 로 나간다.
      no-cache 는 no-store 가 아니라 브라우저가 본문은 갖고 있고 조건부 GET 으로
      304 를 받는다. 그래서 절감되는 것은 **바이트가 아니라 왕복 시간**이다.
      index.html 의 <link>·<script> 30개는 전부 defer/async 없는 렌더 블로킹이라,
      재방문마다 화면이 뜨기 전 30건 재검증이 끝나기를 기다린다(터널 실측 1.4~1.7초).

    ⚠ 조건 셋은 전부 지켜야 한다. 하나라도 풀면 되돌릴 수 없는 사고가 난다.

      1) assets/ · img/ 는 건드리지 않는다.
         이미지 URL 에는 ?v= 가 없고(실측 0건) 경로가 런타임 조립이다
         (js/ui.js placePhotoSrc 등). 파일명이 장소명이라 내용을 갈아도 URL 이
         그대로다 — 실제로 오늘 places 를 57.5→20.7MB 로 같은 이름 그대로 바꿨다.
         장기 캐시였다면 그 이전 방문자를 되돌릴 방법이 전혀 없다.

      2) .json 에 immutable 을 붙이지 않는다.
         JSON 버전은 JS 안에 하드코딩돼 있고(js/ui.js 의 localcurrency ?v= 등)
         tools/check.sh 의 ?v= 검사는 index.html 의 .js/.css 태그만 본다.
         갱신하고 문자열을 안 올리면 아무 검사도 못 잡는데, immutable 은
         Firefox·Safari 에서 새로고침조차 무시한다. 짧게만 준다.

      3) 로컬 직접 접근은 예외다.
         앱의 30개 태그는 항상 ?v= 를 달고 있어 개발 중 새로고침이 100%
         이 경로를 탄다. 두 Claude 가 파일을 고치고 확인하는 흐름이 막힌다.
    """
    host = (request.host or "").split(":")[0]
    if host in ("127.0.0.1", "localhost", "0.0.0.0", "::1"):
        return resp                      # 조건 3 — 개발 중에는 캐시하지 않는다
    if not request.args.get("v"):
        return resp                      # 버전이 없으면 무효화 수단이 없다
    p = request.path.lstrip("/")
    if p.startswith(("js/", "css/")):
        if p.endswith((".js", ".css")):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif p.endswith(".json"):
            resp.headers["Cache-Control"] = "public, max-age=3600"   # 조건 2
    return resp                          # assets/·img/ 는 손대지 않는다 (조건 1)


# ── ① gzip 응답 압축 + 압축 결과 메모리 캐시 (2026-08-31, 배포 Claude) ─────────
#
# 왜: 터널이 내보내는 정적 텍스트가 커서(실측은 로그 참조) 첫 방문 전송이 그만큼이다.
#   02aebda 의 캐시 헤더는 **재방문**만 줄인다(304 왕복). 첫 방문 바이트는 그대로였다.
#
# 압축 결과를 캐시하는 이유: js/data.js 같은 큰 파일을 요청마다 다시 압축하면
#   waitress 스레드가 CPU 에 묶인다. 한 번 압축해 두면 그 뒤로는 메모리에서 나간다.
#
# ⚠ 캐시 키는 **ETag** 다. Flask 가 파일 mtime+크기로 만드는 값이라 파일이 바뀌면
#   키가 저절로 갈린다. `?v=` 를 키로 쓰면 안 된다 — `?v=` 를 안 올린 채 내용만
#   바뀌는 사고가 이 저장소에서 세 번 났다(§12 「`?v=` 는 손으로 올리지 않는다」).
_GZIP_TYPES = (
    "text/html", "text/css", "text/plain", "text/javascript",
    "application/javascript", "application/json", "image/svg+xml",
)
_GZIP_MIN     = 1024                 # 이보다 작으면 헤더 오버헤드가 이득을 먹는다
_GZIP_LEVEL   = 6                    # 9 는 눈에 띄게 느린데 몇 % 더 줄 뿐이다
_GZ_CACHE_MAX = 64 * 1024 * 1024     # 압축본 보관 상한

_gz_cache = {}                       # ETag -> 압축 바이트
_gz_bytes = 0
_gz_lock  = threading.Lock()
_gz_stat  = {"hit": 0, "miss": 0, "skip": 0}


def _gzip_bytes(raw):
    buf = io.BytesIO()
    # mtime=0 — 같은 내용이면 항상 같은 바이트가 나오게 한다(재현 가능)
    with _gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=_GZIP_LEVEL, mtime=0) as f:
        f.write(raw)
    return buf.getvalue()


def _apply_gzip(resp, gz):
    resp.set_data(gz)
    resp.headers["Content-Encoding"] = "gzip"
    resp.headers["Content-Length"]   = str(len(gz))
    vary = resp.headers.get("Vary") or ""
    if "Accept-Encoding" not in vary:
        resp.headers["Vary"] = (vary + ", Accept-Encoding").lstrip(", ")


@app.after_request
def _compress(resp):
    """텍스트 응답만 gzip 으로 내보낸다.

    ⚠ **ETag 를 바꾸지 않는다.** 압축본에 `-gz` 를 붙이는 구현이 흔한데, 그러면
      브라우저가 보낸 `If-None-Match` 와 어긋나 **304 가 영영 안 나온다.**
      `index.html` 은 `?v=` 가 없어 `no-cache` 로 나가므로 재방문마다 재검증하는데,
      그 304 를 깨면 02aebda 가 줄여 놓은 왕복이 되살아난다. 대신 `Vary:
      Accept-Encoding` 을 붙여 캐시가 인코딩별로 나눠 갖게 한다.
    """
    if resp.status_code != 200 or resp.headers.get("Content-Encoding"):
        return resp
    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
    if ctype not in _GZIP_TYPES:
        return resp                      # 이미지·폰트는 다시 압축해 봐야 커지기만 한다
    if "gzip" not in (request.headers.get("Accept-Encoding") or ""):
        return resp

    etag = resp.headers.get("ETag")      # 정적 파일에만 있다. API 응답에는 없다
    if etag:
        with _gz_lock:
            hit = _gz_cache.get(etag)
        if hit is not None:
            _gz_stat["hit"] += 1
            _apply_gzip(resp, hit)
            return resp

    resp.direct_passthrough = False      # 파일 래퍼를 실제 바이트로 바꾼다
    raw = resp.get_data()
    if len(raw) < _GZIP_MIN:
        _gz_stat["skip"] += 1
        return resp
    gz = _gzip_bytes(raw)
    if len(gz) >= len(raw):              # 이미 압축된 내용이면 그대로 보낸다
        _gz_stat["skip"] += 1
        return resp

    _gz_stat["miss"] += 1
    if etag:
        global _gz_bytes
        with _gz_lock:
            if _gz_bytes + len(gz) <= _GZ_CACHE_MAX:
                _gz_cache[etag] = gz
                _gz_bytes += len(gz)
    _apply_gzip(resp, gz)
    return resp


_LIST_URL = "https://smartparking.hscity.go.kr/api/parking/searchParkingList.json"
_RT_URL   = "https://smartparking.hscity.go.kr/api/parking/allOperating.json"

# ── ③ 연결 재사용 ─────────────────────────────────────────────────────────────
# 종전에는 요청마다 requests.get 이 새 연결을 열어 TLS 핸드셰이크를 다시 했다.
# Session 은 keep-alive 로 그 왕복을 없앤다. 실시간 API 는 앱이 60초마다 부른다.
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "hwaseong-itda/1.0 (+deploy)"})

# ── ② 상류 API 캐시 + 실패 시 stale 반환 ──────────────────────────────────────
# list 는 좌표·요금 같은 정적 정보라 1시간, realtime 은 여유 면수라 45초를 준다.
# 앱의 갱신 주기가 60초(js/parking.js REFRESH_INTERVAL)이므로 45초면 화면이
# 낡아 보이지 않으면서 방문자가 여럿일 때 상류 호출이 합쳐진다.
_TTL = {"list": 3600, "realtime": 45}
_UP_LOCK  = threading.Lock()
_UP_CACHE = {}                       # key -> {"at": epoch, "data": [...]}


def _upstream(key, fetch, ttl=None):
    """캐시에 있으면 그것을, 없으면 받아서 채운다. 상류가 죽으면 **낡은 값이라도** 준다.

    ⚠ stale 반환이 이 함수의 핵심이다. 화성시 API 가 잠깐 죽었다고 지도에서
      주차장이 통째로 사라지는 것보다, 몇 분 낡은 여유 면수를 보여 주는 편이 낫다.
      호출부가 `src` 로 무엇을 받았는지 알 수 있고 `/healthz` 에도 나온다.
    """
    ttl = _TTL[key] if ttl is None else ttl
    now = time.time()
    with _UP_LOCK:
        ent = _UP_CACHE.get(key)
    if ent and (now - ent["at"]) < ttl:
        return ent["data"], "cache", now - ent["at"]
    try:
        data = fetch()
    except Exception:
        if ent:
            return ent["data"], "stale", now - ent["at"]
        raise
    with _UP_LOCK:
        _UP_CACHE[key] = {"at": now, "data": data}
    return data, "fresh", 0.0

HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET",
    "Cache-Control":                "no-cache",
}


@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


def _fetch_list():
    """화성시 주차장 기본 정보 + 좌표. 앱이 쓰는 필드만 남겨 응답을 줄인다."""
    res = _SESSION.get(_LIST_URL, verify=False, timeout=10)
    raw = res.json().get("parkingList", [])
    data = []
    for p in raw:
        if p.get("PARKING_ID") == 9999:
            continue
        if not p.get("LAT") or float(p.get("LAT", 0)) <= 0:
            continue
        name      = p.get("PARKING_NM", "")
        fee_zone  = _ZONE_MAP.get(name, "")
        fee_info  = FEE_TABLE.get(fee_zone, {})
        data.append({
            "id":         int(p["PARKING_ID"]),
            "name":       name,
            "address":    (p.get("CELL_ADDR_LOAD") or p.get("CELL_ADDR_JIBUN") or "").strip(),
            "lat":        float(p["LAT"]),
            "lng":        float(p["LNG"]),
            "total":      int(p.get("CELL_CNT") or 0),
            "free":       p.get("FREE_YN") == "Y",
            "type":       p.get("PARKING_DIV_NM", ""),
            "tel":        p.get("TEL_NO", ""),
            "zone":       fee_zone,
            "open":       p.get("OPEN_YN") == "Y",
            "feeFreePeriod": fee_info.get("기본무료", ""),
            "feeNight":      fee_info.get("야간무료", ""),
            "feeSteps":      fee_info.get("요금단계", []),
            "feeCap":        fee_info.get("상한선", ""),
            "feeNote":       fee_info.get("비고", ""),
        })
    return data


def _fetch_realtime():
    """실시간 주차 현황 (여유 면수)."""
    res = _SESSION.get(_RT_URL, verify=False, timeout=10)
    raw = res.json().get("operating", [])
    return [
        {
            "id":    int(p["PARKING_ID"]),
            "used":  int(p.get("USE_CNT") or 0),
            "avail": int(p.get("CURRENT_CNT") or 0),
            "open":  p.get("OPEN_YN") == "Y",
        }
        for p in raw
    ]


def _serve_upstream(key, fetch):
    """캐시를 거쳐 응답한다. 어디서 온 값인지 X-Cache 로 밝힌다."""
    try:
        data, src, age = _upstream(key, fetch)
    except Exception as e:
        # 캐시도 비어 있고 상류도 죽었을 때만 여기 온다 (기동 직후 상류 장애)
        return jsonify({"ok": False, "error": str(e)}), 500, HEADERS
    head = dict(HEADERS)
    head["X-Cache"] = src
    head["X-Cache-Age"] = str(round(age, 1))
    return jsonify({"ok": True, "data": data}), 200, head


@app.route("/api/parking/list")
def parking_list():
    return _serve_upstream("list", _fetch_list)


@app.route("/api/parking/realtime")
def parking_realtime():
    return _serve_upstream("realtime", _fetch_realtime)


@app.route("/healthz")
def healthz():
    """살아있는지 + 캐시가 실제로 먹고 있는지. 터널 점검과 최적화 확인에 함께 쓴다."""
    now = time.time()
    with _UP_LOCK:
        up = {k: {"age": round(now - v["at"], 1), "n": len(v["data"])}
              for k, v in _UP_CACHE.items()}
    with _gz_lock:
        gz = dict(_gz_stat, entries=len(_gz_cache), bytes=_gz_bytes)
    return jsonify({
        "ok": True,
        "uptime": round(now - _STARTED, 1),
        "upstream": up,
        "gzip": gz,
    }), 200, HEADERS


# ── ⑤ 기동 시 상류 프리워밍 ───────────────────────────────────────────────────
# 첫 방문자가 상류 응답(느릴 때 10초 가까이)을 기다리지 않게 미리 채운다.
# 데몬 스레드라 상류가 죽어 있어도 기동을 막지 않는다 — 실패하면 첫 요청이 다시 받는다.
def _prewarm():
    for key, fetch in (("list", _fetch_list), ("realtime", _fetch_realtime)):
        try:
            _upstream(key, fetch, ttl=0)          # ttl 0 → 무조건 받아서 캐시에 넣는다
            print(f"  프리워밍 {key}: {len(_UP_CACHE[key]['data'])}건")
        except Exception as e:
            print(f"  프리워밍 {key} 실패: {e} — 첫 요청 때 다시 받습니다")



if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--dev", action="store_true",
                        help="waitress 대신 Flask 개발 서버로 띄운다")
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()

    print(f"화성잇다 서버 시작: http://localhost:{args.port}")
    print(f"Cloudflare Tunnel이 포트 {args.port}를 가리키도록 설정하세요.")
    threading.Thread(target=_prewarm, daemon=True).start()

    # ── ④ waitress WSGI ──────────────────────────────────────────────────────
    # Flask 개발 서버는 한 번에 한 요청씩 처리한다. index.html 이 js/css 30개를
    # 한꺼번에 요청하므로 그 줄서기가 그대로 첫 화면 지연이 된다.
    # waitress 는 순수 파이썬이라 빌드 도구 없이 pip 만으로 들어온다.
    if args.dev:
        print("  모드: Flask 개발 서버 (--dev)")
        app.run(host="0.0.0.0", port=args.port, debug=False)
    else:
        try:
            from waitress import serve
        except ImportError:
            print("  ⚠ waitress 가 없어 Flask 개발 서버로 떨어집니다 —"
                  " pip install -r tools/requirements.txt")
            app.run(host="0.0.0.0", port=args.port, debug=False)
        else:
            print(f"  모드: waitress (스레드 {args.threads})")
            serve(app, host="0.0.0.0", port=args.port,
                  threads=args.threads, ident="hwaseong-itda")
