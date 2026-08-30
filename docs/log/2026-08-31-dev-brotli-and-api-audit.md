# 외부 API 전수 점검 + brotli 압축 — URL 변경이 남긴 것은 없었다

- 날짜: 2026-08-31
- 담당: 개발 Claude (hm8824@naver.com)
- 커밋: `(push 뒤에 읽어 뒤따르는 커밋에서 채운다 — §0)`
- 발단: 사용자 지시 — *"다른 api는 괜찮은지, 또 이런 url변경으로 문제가 있는지 확인해봐.
  그리고 flask도 업데이트 했는데 이것도 확인해. 그럼 더 최적화 할게 있나."*

## 0. 요약

| 물음 | 답 |
|---|---|
| 다른 API 는 괜찮나 | **전부 정상.** 외부 6개 중 6개 응답. 아래 ①의 단서 하나만 주의 |
| URL 변경이 다른 곳을 깼나 | **저장소 안에는 없다.** 앱 코드에 주소 하드코딩이 0건이다 |
| Flask 업데이트는 | 3.1.3 · requests 2.34.2 · waitress 3.0.2 — 정상 동작 중 |
| 더 최적화할 것 | **있다. brotli** — 첫 화면 -7.8%, 지연 로드 JSON -33.7% |

부수적으로 **문서가 틀린 것 2건**과 **잠복 버그 1건**을 찾아 고쳤다(§4).

## 1. 외부 API 전수 — 6개 중 6개 정상

앱이 부르는 외부 도메인을 `index.html` · `js/*.js` · `tools/server.py` 에서 전부 긁어 쟀다.

| 대상 | 결과 |
|---|---|
| `api.open-meteo.com` (날씨) | 200 · 1.08s |
| `air-quality-api.open-meteo.com` (미세먼지) | 200 · 0.96s |
| `nominatim.openstreetmap.org` (역지오코딩) | 200 · 0.34s |
| `smartparking.hscity.go.kr` list · realtime | **아래 참조** |
| `live.saharax.io` (챗봇 위젯) | 200 |
| 프록시 `/api/parking/realtime` · `/healthz` | 200 |

### ⚠ 주차장 API 가 개발 컨테이너에서만 실패한다 — 장애가 아니다

`curl` 이 `000` 을 냈다. **API 장애로 읽으면 안 된다.** 원인은 이것이다.

```
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

상류가 **중간 인증서를 안 딸려 보낸다.** DNS 는 정상이고 443 도 열려 있다.
`verify=False` 로 부르면 `200 · 22,081 B` 가 온다 — 실제로 확인했다.
그래서 `tools/server.py` 가 `verify=False` 를 쓰고 있고, 프록시 경유는 200 이다.

**이건 어제 배운 것을 그대로 적용한 자리다.** 「개발 컨테이너에서 000」과
「API 가 죽었다」는 다르다(§0 「어디서 쟀는지를 적으십시오」).

## 2. URL 변경이 남긴 것 — 저장소 안에는 없다

`index.html` · `js/*.js` · `css/*.css` 어디에도 배포 주소가 박혀 있지 않다.
공유 기능은 `window.location.href` 를 읽으므로 주소를 따라온다.
배포 Claude 가 `2026-08-31-deploy-url-sweep.md` 에서 이미 확인한 것과 일치한다.

바깥의 카카오 콘솔 도메인 건은 그쪽에서 이어서 처리 중이다(§12 「Kakao API」).
**SDK 는 이 글을 쓰는 시점에도 401** 이다 — 지도는 아직 안 뜬다.

## 3. 더 최적화 — brotli

### 왜 이득이 남아 있나

Cloudflare Quick Tunnel 은 **무료 제품이라 zone 설정이 없어 edge 가 br 을 안 해 준다.**
실측으로 확인했다 — 브라우저가 보내는 그대로 요청해도 gzip 이 온다.

```
Accept-Encoding: gzip, deflate, br, zstd   →  content-encoding: gzip
Accept-Encoding: br                        →  (압축 없음)
```

`cf-cache-status` 가 계속 `DYNAMIC` 인 것과 같은 이유다. **원본이 해야 한다.**

### 품질을 9로 고른 근거 — 재서 골랐다

이 저장소 파일로 직접 쟀다.

| 품질 | 첫 화면 31개 | gzip 대비 | 압축 총시간 | 파일당 최장 |
|---|---:|---:|---:|---:|
| gzip-6 | 279,886 B | — | 37ms | — |
| br q6 | 269,312 B | −3.8% | 49ms | 6ms |
| br q9 | **258,083 B** | **−7.8%** | 501ms | 31ms |
| br q10 | 245,899 B | −12.1% | 772ms | 86ms |
| br q11 | 240,922 B | −13.9% | — | **13.9초** ⚠ |

지연 로드 지역화폐 JSON(4.2MB)은 차이가 훨씬 크다.

| | 크기 | 시간 |
|---|---:|---:|
| gzip-6 | 836,985 B | 177ms |
| br q6 | 597,840 B (−28.6%) | 167ms |
| br q9 | **554,929 B (−33.7%)** | 407ms |
| br q11 | 429,455 B (−48.7%) | **13,863ms** |

**q11 은 4.2MB 에 13.9초가 걸려 쓸 수 없다.** q6 은 큰 파일에서 gzip 보다
**빠르면서 더 작다**(167ms vs 177ms)는 재미있는 구간이지만 첫 화면 이득이 작다.

**q9 를 골랐다.** 압축본을 ETag 로 캐시하므로 이 시간은 **파일당 1회**다 —
그래서 501ms 를 감당할 수 있다. q10 이상은 4.2MB 쪽 시간이 급격히 나빠진다.

### 구현에서 지킨 것

배포 Claude 가 `4803176` 에 남긴 불변식을 그대로 지켰다.

- **ETag 를 안 바꾼다.** 압축본에 접미사를 붙이면 `If-None-Match` 가 어긋나 304 가 죽는다.
- **`Vary: Accept-Encoding`** 을 그대로 둔다.
- **모듈이 없으면 gzip 만 쓴다** — waitress 와 같은 방식. `pip install` 전에 배포해도 안 깨진다.

새로 넣은 것 둘.

1. **캐시 키를 `(ETag, 인코딩)` 으로 바꿨다.** ETag 하나로 두면 br 바이트를
   gzip 클라이언트에 보내게 된다 — **화면이 통째로 깨지는데 원인이 안 보인다.**
2. **`Accept-Encoding` 을 제대로 판다.** 기존은 `"gzip" not in header` 였는데
   그러면 `gzip;q=0`(명시적 거부)을 허용으로 읽는다. 여기서 틀리면 클라이언트가
   못 푸는 인코딩을 보낸다. q 값을 보고 0이면 뺀다.

서버를 띄우지 않고 검증했다(§15 — 개발 Claude 는 서버를 안 띄운다).
`__main__` 가드 덕에 import 만으로는 아무것도 안 도는 것을 확인하고,
`_accepted` 6케이스 · `_pick_encoding` 5케이스 · 압축 왕복 복원을 전부 통과시켰다.

**배포 쪽에서 `pip install -r tools/requirements.txt` 와 재기동이 필요하다.**
`/healthz` 의 `compress.brotli` 로 적용 여부를 볼 수 있게 해 뒀다.

## 4. 곁들여 찾은 것 — 문서 오류 2건 · 잠복 버그 1건

### ① `?v=` 4곳이 2026-08-25 이후 한 번도 안 올랐다 (잠복)

```
js/boot.js     'js/parking-static.json?v=20260825'
js/parking.js  'js/parking-static.json?v=20260825'
js/ui.js       'js/localcurrency-static.json?v=20260825'
js/home.js     'js/parking-static.json?v=2026082502'
```

`tools/bump_version.py` 가 **`index.html` 만** 보고 있었다. `js/datalab.js` 의
`DL_VER` 는 챙기면서 이 넷은 몰랐다. 값이 둘로 갈려 있는 것도 그 증거다.

**아직 사고는 안 났다** — 두 JSON 이 08-25 이후 한 번도 안 바뀌었다(git 로그 확인).
사고가 안 난 것이지 구조가 안전한 게 아니다. 배포 Claude 가 `parking-static.json`
을 갱신하는 순간 재방문자는 최대 1시간(서버가 `.json` 에 주는 `max-age`) 낡은 값을 본다.

`bump_version.py` 가 `js/*.js` 안의 `?v=` 도 올리게 했다. 네 곳이 즉시 동기화됐다.

### ② `AIRKOREA_KEY` 는 죽은 변수인데 문서가 「표시 중」이라고 적고 있었다

`js/home.js` 에 실제 키가 들어 있지만 **어디서도 안 읽는다**(전수 확인).
미세먼지는 `air-quality-api.open-meteo.com` 이 표시한다 — **키가 필요 없는 API** 다.
에어코리아 연동을 계획하다 갈아탄 흔적이고 선언만 남았다.

§27 이 *「`AIRKOREA_KEY` — 실제 키 입력됨, 미세먼지 표시 중」* 이라고 적어
**이 키가 동작 중인 것으로 읽혔다.** 고쳤다.

**지우지는 않았다.** §28 대로 이 값은 이미 공개 히스토리에 들어가 있어 HEAD 에서
지워도 회수되지 않는다 — 보안은 그대로고 나중 연동용 값만 잃는다.
대신 **죽은 변수라는 것을 코드 주석과 §27 양쪽에 박았다.** 다음 사람이
이 키를 살아 있는 것으로 착각해 시간을 쓰지 않게.

> §12 의 「키 평문 노출은 종결된 사안」을 다시 꺼내는 것이 아니다.
> 그 판단은 그대로다. 여기서 고친 것은 **문서가 사실과 달랐던 것** 하나뿐이다.

### ③ `verify=False` 에 근거가 안 적혀 있었다

`tools/server.py` 가 상류 주차장 API 를 `verify=False` 로 부르는데 왜인지가 없었다.
**다음 사람이 「보안 문제」로 보고 `verify=True` 로 고치면 주차장이 통째로 사라진다.**
위 §1 의 실측(중간 인증서 누락)을 주석으로 박았다.

그리고 `warnings.filterwarnings("ignore")` 가 **모든 경고**를 끄고 있었다.
끄려던 것은 `InsecureRequestWarning` 하나인데, 그러면 무관한 Deprecation·Runtime
경고까지 같이 삼켜 **진짜 문제가 조용해진다.** 그 하나만 정확히 끄게 좁혔다.

## 5. 안 건드린 것

- **`live.saharax.io` 챗봇 위젯** (`index.html`). 제3자 스크립트를 새 창으로 여는
  링크 하나다. 누가 왜 넣었는지 기록이 없어 판단을 미룬다 — **사용자 확인이 필요하다.**
- **카카오 콘솔 도메인 등록** — 사용자·배포 Claude 담당. SDK 는 여전히 401 이다.
- **`js/data.js` 등 데이터 파일** — §17 상 배포 Claude 담당.
