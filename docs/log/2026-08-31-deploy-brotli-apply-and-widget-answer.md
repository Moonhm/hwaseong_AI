# brotli 배포 반영 확인 + 「출처 불명 위젯」에 답한다

- 날짜: 2026-08-31
- 담당: 배포 Claude
- 커밋: `8cc324f`
- 발단: 개발 Claude 보고 — *"배포 쪽에서 `pip install -r tools/requirements.txt` + 재기동이
  필요합니다"*, *"`index.html` 에 `live.saharax.io` 제3자 챗봇 위젯이 걸려 있습니다.
  누가 왜 넣었는지 기록이 없어 손대지 않았습니다"*. 사용자 지시 — *"이거하고 깃 풀 푸시 한번하자."*

---

## 1. brotli 는 이미 반영돼 있었다

`5f5a6b4` 를 받은 뒤 **16:47 에 Flask 만 재시작**해 둔 상태였다(터널은 안 건드려 URL 유지).
그래서 별도 재기동 없이 이미 돌고 있었다. `pip install -r tools/requirements.txt` 는
다시 돌려 확인했다 — flask 3.1.3 · requests 2.34.2 · waitress 3.0.2 · **brotli 1.1.0**.

```
$ curl -s localhost:8080/healthz
"compress": { "brotli": "q9", "br": 35, "gzip": 71, "hit": 40, "miss": 66,
              "entries": 64, "bytes": 552988 }
```

전송량도 다시 쟀다(로컬, `js/data.js` 101,410 B 원본).

| Accept-Encoding | 응답 | 크기 |
|---|---|---:|
| `br, gzip` | **br** | 24,465 B |
| `gzip` | gzip | 27,251 B |
| 없음 | 무압축 | 101,410 B |

첫 화면 31개 합계는 **gzip 280,173 B → br 258,355 B (−7.8%)** 로, 개발 Claude 가 잰
값과 일치한다.

## 2. 새로 막았다는 두 가지를 깨 보려 했다 — 둘 다 막힌다

### ① `Accept-Encoding` q값 파싱 — 8케이스 전수

| 보낸 값 | 응답 | 판정 |
|---|---|---|
| `br, gzip` | br | ✅ |
| `gzip` | gzip | ✅ |
| `br` | br | ✅ |
| **`gzip;q=0`** | **무압축** | ✅ 명시적 거부를 지킨다 |
| **`br;q=0, gzip`** | **gzip** | ✅ br 만 거부 |
| **`gzip;q=0, br;q=0`** | **무압축** | ✅ 둘 다 거부 |
| `*` | br | ✅ |
| `identity` | 무압축 | ✅ |

예전 `"gzip" not in header` 방식이었다면 `gzip;q=0` 을 **허용으로 읽어** 거부한
클라이언트에게 압축본을 보냈을 자리다.

### ② 캐시 키가 `(ETag, 인코딩)` 인가 — 교차 오염 검사

캐시가 채워진 뒤에도 섞이지 않는지 3회 반복해 확인했다.

```
gzip 요청 → Content-Encoding: gzip, gzip 매직(1f 8b) 일치, 27,251 B
br   요청 → Content-Encoding: br,   gzip 아님,            24,465 B
ETag 두 응답 동일 → 304 재검증이 그대로 산다
gzip 복원본 == brotli 복원본  (바이트 단위 동일)
```

키가 ETag 하나였다면 **br 바이트가 gzip 클라이언트로 가서 화면이 백지가 되고, 원인이
안 보인다.** 개발 Claude 가 짚은 그 위험이 실제로 막혀 있다.

## 3. 「출처 불명 제3자 위젯」 — 위젯이 아니고, 기록도 있다

두 가지를 정정한다. **둘 다 실측이다.**

### ① 위젯이 아니라 링크다

`index.html` 에 `saharax` 는 **1회** 나온다. 그 한 곳이 이것이다.

```html
<a class="menu-item menu-item--ext"
   href="https://live.saharax.io/chat-core/index.html?programId=…&open=true&popup=true"
   target="_blank" rel="noopener noreferrer" onclick="closeMenu()">
  🤖 화성in — 행정정보 AI 상담
     화성시청 공식 챗봇 · 민원·행정 궁금증을 물어보세요
```

`<script>` · `<iframe>` · `fetch` 로 부르는 곳은 **0건**이다. 즉 **남의 코드가 우리
페이지에서 실행되지 않는다.** 사용자가 눌러야 새 탭으로 나가고, `rel="noopener
noreferrer"` 까지 붙어 있다. 「위젯이 걸려 있다」는 표현은 스크립트가 심겨 도는 것으로
읽히는데 그런 상태가 아니다.

같은 메뉴 묶음의 다른 두 개도 같은 성격이다 —
`hscity.go.kr`(시청 홈페이지) · `blog.naver.com/hsview`(공식 블로그).
**「화성시청 공식 서비스」 세 줄**이고 이 링크는 그중 하나다.

### ② 기록이 있다 — 개발 Claude 가 넣고 개발 Claude 가 적었다

```
1772804  Moonhm <hm8824@naver.com>  2026-08-26 07:08:08
         메뉴에 화성시청 공식 AI '화성in' 외부 링크 추가
```

`hm8824@naver.com` 은 **개발 Claude** 다(§2 의 이메일 구분). 게다가 같은 쪽 로그가
시연 대본 사실 확인 표에 이미 넣어 뒀다 —
`docs/log/2026-08-26-dev-readme-demo-script.md:263` 의 `| "화성in, 공식 블로그" | index.html:797, :806 ✅ |`.

**자기가 넣고 자기가 기록한 것을 닷새 뒤에 출처 불명으로 올린 것이다.** 나무랄 일이
아니라 이 저장소가 이미 아는 실패 형태다 — 커밋 메시지와 로그에만 있는 사실은
다음 사람(자신 포함)이 못 찾는다. §0 이 「끝난 판단은 `WORKFLOW.md` 로」라고 정한 이유다.

그래서 **§12 「핵심 현황」에 행을 하나 넣었다** — 링크 셋이 무엇이고, 스크립트가
아니며, 어느 커밋에서 왔는지. 다음에 또 올라오면 그 표에서 끝난다.

## 4. 안 한 것

- **링크를 지우거나 바꾸지 않았다.** 시청 공식 서비스 안내이고 사용자 지시가 없었다.
  다만 이 주소가 시청 공식인지에 대한 최종 확인은 사용자 몫이다 — 도메인이
  `hscity.go.kr` 이 아니라 `live.saharax.io`(위탁 운영사로 보인다)라 눈에 걸릴 수 있다.
- **`?v=` 4곳 · `AIRKOREA_KEY` 죽은 변수** — 둘 다 개발 Claude 가 이미 고쳐 push 했다.
  받아서 확인만 했다.
- **서버 재기동을 또 하지 않았다.** 16:47 재시작본이 이미 최신 코드이고
  `/healthz` 의 `compress.brotli=q9` 로 확인된다.

## 5. 지금 상태

```
서버   tmux app     16:47 기동 · waitress 8스레드 · 프리워밍 131·145건
터널   tmux tunnel  15:47 기동 · URL 변경 없음
공개   https://news-appliances-tap-cab.trycloudflare.com  → 200
검사   bash tools/check.sh  exit 0
```
