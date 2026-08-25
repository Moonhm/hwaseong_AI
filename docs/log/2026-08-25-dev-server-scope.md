# 실서비스 공개 범위 제한 tools/server.py

> 원래 `WORKFLOW.md` §19-1 이었다. 2026-08-25 에 기록을 `docs/log/` 로 분리하면서 옮겼다.
> 규칙·현황은 `WORKFLOW.md` 에, 작업 기록은 이 폴더에 둔다 — 새 파일만 만들면 충돌이 구조적으로 안 난다.

## 실서비스 공개 범위 제한 `tools/server.py` (개발 Claude 담당 · 2026-08-25)

> ## 결론: 보안 문제 아님 — 재시작 급하지 않음
>
> **사용자(문형민) 판단 (2026-08-25):** 아래 노출은 **우려 대상이 아닙니다.**
>
> | 근거 | 내용 |
> |------|------|
> | 데모 프로젝트 | 해커톤 출품·시연용이며 운영 서비스가 아님 |
> | 전부 공공데이터 | 관광지·축제·주차장·지역화폐 모두 화성시·한국관광공사 공개 데이터. 감출 것이 없음 |
> | API 키에 만료일 설정됨 | Kakao REST 키는 무료 키이고 사용자가 **만료일을 지정해 둠**. 유출되어도 피해가 제한됨 |
>
> 따라서 **`tools/server.py` 의 접근 제한은 예방 차원으로만 남겨 둡니다.**
> Flask 를 재시작하지 않아도 되고, 급히 조치할 항목이 아닙니다.
> 다음에 Flask 를 재시작할 일이 생기면 그때 자연히 적용됩니다.
>
> 이 판단을 뒤집을 조건은 하나뿐입니다 — **운영 서비스로 전환하거나, 만료일 없는 키·개인정보를 저장소에 넣게 될 때.** 그때 이 절을 다시 읽으십시오.
>
> 아래 기록은 "무엇이 어떻게 돼 있었는지"를 남기기 위한 것이지 조치 요구가 아닙니다.

### 무엇이 노출돼 있었는가 (사실 기록)

`tools/server.py` 의 `Flask(__name__, static_folder=ROOT, static_url_path="")` 가 **저장소 루트를 통째로** 정적 서빙하고 있었습니다. 2026-08-25 실측 결과 배포 URL에서 아래가 전부 `HTTP 200` 이었습니다.

| 경로 | 크기 | 내용 |
|------|------|------|
| `/.git/logs/HEAD` | 43KB | 전체 reflog — 커밋 SHA 전량 |
| `/.git/config` | 312B | 커밋 계정 이메일 |
| `/WORKFLOW.md` | 41KB | **이 문서 전체** (내부 개발 기록·미해결 항목) |
| `/tools/fix_coords.py` | 2.4KB | Kakao REST 키 평문 |

### 조치

`before_request` 훅으로 **허용 목록** 방식을 적용했습니다. 거부 목록이 아니라 허용 목록이라, 루트에 새 파일이 생겨도 기본이 비공개입니다.

- 공개: `js/` · `img/` · `assets/` · `css/` · `index.html` · `favicon.ico` · `/api/*`
- 그 외 전부 404, `..` 포함 경로도 404

앱이 실제로 요청하는 정적 경로가 `js/`·`img/`·`assets/` 뿐임을 코드 전수 확인 후 정했습니다.

### 검증 (로컬 8099 포트)

정상 경로 5종 전부 200(`/`, `/index.html`, `/js/data.js`, `/js/parking-static.json?v=`, `/img/logo-icon.png`), 민감 경로 8종 전부 404, `/api/parking/realtime` 200 정상.

> **배포 Claude에게**: 이 변경은 Flask 재시작 시점에 적용됩니다. **일부러 재시작할 필요는 없습니다**(위 결론 참고).
> 다만 어떤 이유로든 재시작할 때, 아래 「주소가 바뀔까 봐」 항목은 반드시 읽으십시오 — 여기서 `cloudflared` 를 잘못 끄면 배포 주소가 영구히 사라집니다.

#### 주소가 바뀔까 봐 재시작이 걱정된다면 — 안 바뀝니다 (재시작할 때만 해당)

**재시작해야 하는 것은 Flask(`tools/server.py`) 뿐이고, `cloudflared` 는 건드리지 않습니다.**

```
cloudflared  ──터널──▶  localhost:8080  ──▶  Flask (tools/server.py)
   ↑ 이건 계속 켜둔다              ↑ 이것만 껐다 켠다
```

Quick Tunnel 의 `*.trycloudflare.com` 주소는 **`cloudflared` 프로세스에 붙어 있습니다.** `cloudflared` 가 살아 있으면 주소는 그대로입니다.
Flask 만 껐다 켜면 그 몇 초 동안 502 가 뜨고 곧 정상으로 돌아옵니다. **주소는 유지됩니다.**

반대로 `cloudflared` 를 끄면 그 순간 주소가 영구히 사라지고 새 랜덤 주소가 발급됩니다 — README 배지·발표자료·제출물의 링크가 전부 죽습니다. **`cloudflared` 는 절대 끄지 마십시오.**

```bash
# 올바른 절차 (배포 서버에서)
pkill -f "tools/server.py"          # Flask 만 종료 — cloudflared 는 그대로 둔다
python3 tools/server.py --port 8080 &
```

#### 적용 확인

```bash
curl -o /dev/null -w '%{http_code}\n' <배포URL>/WORKFLOW.md   # 404 여야 정상
curl -o /dev/null -w '%{http_code}\n' <배포URL>/js/data.js    # 200 이어야 정상
```

---
