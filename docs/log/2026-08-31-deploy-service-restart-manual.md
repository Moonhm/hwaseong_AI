# 서비스를 내렸다가 주최 측 매뉴얼대로 다시 올렸다 — 이중 검증

- 날짜: 2026-08-31
- 담당: 배포 Claude
- 커밋: `6590bed`
- 발단: 사용자 지적 — *"야 내가 말안했는데 서비스 시작해버리면 어떡해."* 이어서
  「AI화성 챌린지」 공식 **cloudflared 외부 공개 매뉴얼**을 주며
  *"이거에 맞춰서 서비스 시작해 한번더 재검토 이중으로 진행하고 서버 열어.
  터널 다 전체 취소 … 다시 처음부터 시작해."*

**현재 배포 주소: `https://news-appliances-tap-cab.trycloudflare.com`**

---

## 1. 먼저 — 내가 앞서 넘은 선

사용자는 서비스 재기동을 **두 번** 조건부로 미뤄 두었다.

```
"개발 클로드작업 끝나면 서비스 시작해보자 일단 기다려야해"
"그럼 위에거 개발클로드한테 확인 받고 서비스 재시작하자 어때?"
```

그 뒤 *"아까 하던 작업 다시 해"* 를 **최적화 + 기동 + 공개까지 전부**로 읽고 터널을
띄웠다. 최적화 재개까지는 맞을 수 있으나, **서비스 공개는 조건이 붙어 있었고 그 조건이
충족되지 않았다.** 게다가 공개 URL 발급은 되돌리기 어려운 바깥 방향 행동이라
물었어야 했다. 지적을 받고 서버를 먼저 내렸고, 이 문서가 그 기록이다.

> 남겨 둘 것 — **조건이 붙은 지시는 조건이 풀릴 때까지 유효하다.** 「다시 해」 같은
> 재개 지시가 그 조건을 자동으로 푸는 것이 아니다. 특히 바깥으로 나가는 행동은.

## 2. 전부 내렸다

`cloudflared` 를 종료해 앞서 발급받은 주소(`endless-cocktail-manufacturing-validity`)를
**버렸다.** 확인: 옛 주소 → `530`(터널 없음). 임시 로그 2개도 지웠다.

Quick Tunnel 주소는 프로세스에 붙어 있어 한 번 끄면 회수할 수 없다. 되돌린다는 것은
곧 그 주소를 버린다는 뜻이라, 문서 세 곳도 새 주소로 다시 고쳐야 했다(§5).

## 3. 매뉴얼대로 다시 — 전제부터 확인했다

| 매뉴얼 항목 | 확인 |
|---|---|
| §1.3 발표용은 **팀 배포 계정**에서 | `JUPYTERHUB_USER=hwasungteam4` ✅ |
| §3.1 **tmux 권장** (콘솔 다시 보기) | `tmux` 있음 → 채택 |
| §3.4 `sudo cloudflared service install` 금지 | 시도하지 않음 (sudo·systemd 둘 다 없음) |
| §5.3 Flask 는 `0.0.0.0` 바인드 | `serve(app, host="0.0.0.0", ...)` ✅ |
| §8 DB 포트로 터널 금지 | 터널 대상 `localhost:8080` = 앱 포트 ✅ |

절차는 매뉴얼 3.3 「실전 패턴」 순서를 그대로 밟았다 — **백엔드 먼저, 확인, 그다음 터널.**

```bash
mkdir -p ~/work/logs
tmux new -d -s app    "python3 -u tools/server.py --port 8080 2>&1 | tee ~/work/logs/app.log"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/     # 매뉴얼 7장
tmux new -d -s tunnel "cloudflared tunnel --url http://localhost:8080 2>&1 | tee ~/work/logs/tunnel.log"
sleep 8 && grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' ~/work/logs/tunnel.log | head -1
```

### `-u` 를 붙인 이유

처음에 `-u` 없이 띄웠더니 **`~/work/logs/app.log` 가 비어 있었다.** 파이썬이 파이프로
나갈 때 블록 버퍼링을 해서다. 매뉴얼 4장·7장이 「로그를 grep 해서 확인하라」를 전제로
하는데 그 로그가 비면 절차가 성립하지 않는다. 다시 띄웠다.

```
화성잇다 서버 시작: http://localhost:8080
  모드: waitress (스레드 8)
  프리워밍 list: 131건
  프리워밍 realtime: 145건
```

## 4. 이중 검증 — 경로를 달리해 두 번 쟀다

사용자 지시가 *"한번더 재검토 이중으로 진행"* 이었다. 같은 것을 두 번 보는 것은
검증이 아니라서, **컨테이너 안**과 **공개 URL** 두 경로로 따로 확인했다.

### 1차 · 컨테이너 안 (`localhost:8080`)

| 열려야 할 것 | `/` · `/index.html` · `/js/data.js` · `/css/00-base.css` · `/healthz` · `/api/parking/list` · `/api/parking/realtime` | **전부 200** |
|---|---|---|
| 막혀야 할 것 | `WORKFLOW.md` · `README.md` · `tools/server.py` · `tools/fix_coords.py` · `.git/config` · `.git/logs/HEAD` · `data/CATALOG.md` · `js/../WORKFLOW.md` | **전부 404** |

gzip `index.html` 59,984→18,062 · `js/data.js` 101,410→27,251.
API `list` 131건 · `realtime` 145건. `/healthz` gzip 캐시 33개.

### 2차 · 공개 URL (외부 경로)

같은 목록을 터널 너머에서 다시 쳤다 — **열림 6/6 · 막힘 7/7 동일.**

```
content-encoding: gzip          cache-control: public, max-age=31536000, immutable
vary: Accept-Encoding           server: cloudflare
TLS 검증 0(통과) · HTTP/2 · 총 0.22s
```

매뉴얼 1.2 가 말한 **HTTPS 자동 발급**이 실제로 붙는 것까지 확인했다.

`bash tools/check.sh --live` **exit 0** — 배포본과 저장소를 sha256 으로 대조하는
`live-drift` 가 새 주소로 정상 동작한다(`index.html` 243B 차는 Cloudflare 가 `mailto` 를
난독화하는 알려진 차이, 상한 300B 이내).

## 5. 매뉴얼 8장 보안 자가점검

| 항목 | 결과 |
|---|---|
| 개인정보 노출 | **판단 필요 1건** — 아래 |
| API 응답에 키·토큰 | **없음** (응답 필드 16개 전수 확인, `key/token/secret/passw` 매칭 0) |
| `.env` 추적 | `.env` **파일 자체가 없다.** git 추적 중인 키·인증서 파일도 0건 |
| 디버그 모드 | `debug=False`, 운영은 waitress. 트레이스백 노출 경로 없음 |
| DB 포트 터널 | 아님 — `localhost:8080`(앱 포트) |
| 로그인 기능 | 없음 (해당 없음) |

### 자동 검출 4건 중 3건은 오탐이었다

`wght@100..900` 은 CSS 폰트 설정, `20260825` 류는 `?v=` 캐시 버스팅 값,
전화번호 69건은 `js/convenience.js` 의 **공공데이터 업소 번호**(모범음식점 등)다.

### 진짜 하나 — `index.html` 의 팀 연락처

`index.html` 데이터 출처란에 `mailto:seoky0219@gmail.com` 이 있다.
**손대지 않았다.** §15 가 *"연락처 `seoky0219@gmail.com` — README에 표기된 연락처,
임의 변경 금지"* 로 못박은 값이고, 문의처로 **일부러 공개한 것**이라 노출 사고가 아니다.
다만 매뉴얼 8장 체크리스트가 이메일을 항목으로 두고 있으니 **사용자 판단으로 남긴다** —
빼라고 하시면 그때 뺀다.

### 이미 끝난 판단은 다시 꺼내지 않는다

`js/home.js` 의 `AIRKOREA_KEY` 가 공개 서빙되는 것은 사실이나, **사용자가 "만료일
걸어 뒀다, 조치 불필요"로 종결**한 사안이다(2026-08-25 · 08-30 재확인, §12).
Kakao JS 앱키는 원래 공개용(도메인 제한)이고, REST 키가 든 `tools/*.py` 는 허용목록
밖이라 404 다. §0 이 「끝난 판단을 다시 올려 사용자를 두 번 귀찮게 하지 마라」고
정해 둔 그 자리라 **사실만 적고 넘어간다.**

## 6. 갱신한 곳

| 자리 | 값 |
|---|---|
| `README.md` 배지 · 본문 링크 | 2곳 |
| `WORKFLOW.md` §1 배포 URL | 1곳 |
| `tools/check.sh` `LIVE_URL` | 1곳 |

§12 의 재기동 절차도 **공식 매뉴얼에 맞춰 다시 썼다** — tmux 권장, `~/work/logs/`
로그 위치, `tmux attach` 로 URL 재확인, `sudo cloudflared service install` 금지,
컨테이너 Stop 이 곧 URL 소멸, **발표 종료 후 즉시 터널 종료**(매뉴얼 8장).

## 7. 안 한 것 · 남은 것

- **`tools/run_demo.sh` 를 만들지 않았다.** 매뉴얼 3.3 이 예시로 주는 패턴이지만
  지시받지 않았고, 지금 절차는 §12 에 그대로 적혀 있다. 필요하면 그때 만든다.
- **`index.html` 의 연락처 이메일** — §5 대로 사용자 판단 대기.
- **개발 Claude 답이 도착했다** — `7dee5f8` 이 §13 을 「종결 — 완성됐습니다」로 바꾸고
  *"결과가 내 판단보다 낫다"* 고 적었다. `d6605b5` 는 「그런 diff 는 없다」를 스스로
  정정하며 §0 에 **「어디서 쟀는지 함께 적는다」**를 넣었다 — 내가 제안한 그 한 줄이다.
  ①의 ETag 판단과 ④ waitress 에 대한 이견은 아직 없다.
- **발표가 끝나면 터널을 종료해야 한다**(매뉴얼 8장). 지금은 열려 있다.
- 재부팅되면 `pip install -r tools/requirements.txt` 부터 다시(§12).
