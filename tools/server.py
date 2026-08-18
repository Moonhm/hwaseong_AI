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
        data = [
            {
                "id":      int(p["PARKING_ID"]),
                "name":    p.get("PARKING_NM", ""),
                "address": (p.get("CELL_ADDR_LOAD") or p.get("CELL_ADDR_JIBUN") or "").strip(),
                "lat":     float(p["LAT"]) if p.get("LAT") else 0,
                "lng":     float(p["LNG"]) if p.get("LNG") else 0,
                "total":   int(p.get("CELL_CNT") or 0),
                "free":    p.get("FREE_YN") == "Y",
                "type":    p.get("PARKING_DIV_NM", ""),
                "tel":     p.get("TEL_NO", ""),
                "zone":    p.get("REGION_DIV_NM", ""),
                "open":    p.get("OPEN_YN") == "Y",
            }
            for p in raw
            if p.get("PARKING_ID") != 9999
            and p.get("LAT") and float(p.get("LAT", 0)) > 0
        ]
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
