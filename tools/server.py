"""
화성잇다 — 통합 서버 (정적 파일 + 주차장 API 프록시)
=====================================================
Cloudflare Tunnel이 이 서버를 가리키도록 설정하세요.

사용법:
  pip install flask requests
  python tools/server.py           # 기본 포트 8080
  python tools/server.py --port 3000

이 서버가 하는 일:
  - / → index.html 및 정적 파일 서빙
  - /api/parking/list     → 화성시 주차장 목록 (정적 정보 + 좌표)
  - /api/parking/realtime → 실시간 주차 현황 (여유 면수)
"""

import argparse
import os
import requests
import warnings

warnings.filterwarnings("ignore")

from flask import Flask, jsonify, send_from_directory

# 프로젝트 루트 = tools/ 의 상위 디렉토리
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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

_LIST_URL = "https://smartparking.hscity.go.kr/api/parking/searchParkingList.json"
_RT_URL   = "https://smartparking.hscity.go.kr/api/parking/allOperating.json"

HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET",
    "Cache-Control":                "no-cache",
}


@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/api/parking/list")
def parking_list():
    """화성시 주차장 기본 정보 + 좌표."""
    try:
        res = requests.get(_LIST_URL, verify=False, timeout=10)
        raw = res.json().get("parkingList", [])
        # 필요한 필드만 추출
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
        return jsonify({"ok": True, "data": data}), 200, HEADERS
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500, HEADERS


@app.route("/api/parking/realtime")
def parking_realtime():
    """실시간 주차 현황 (여유 면수)."""
    try:
        res = requests.get(_RT_URL, verify=False, timeout=10)
        raw = res.json().get("operating", [])
        data = [
            {
                "id":       int(p["PARKING_ID"]),
                "used":     int(p.get("USE_CNT") or 0),
                "avail":    int(p.get("CURRENT_CNT") or 0),
                "open":     p.get("OPEN_YN") == "Y",
            }
            for p in raw
        ]
        return jsonify({"ok": True, "data": data}), 200, HEADERS
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500, HEADERS


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    print(f"화성잇다 서버 시작: http://localhost:{args.port}")
    print(f"Cloudflare Tunnel이 포트 {args.port}를 가리키도록 설정하세요.")
    app.run(host="0.0.0.0", port=args.port, debug=False)
