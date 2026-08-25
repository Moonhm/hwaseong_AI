# 주요 버그 수정 이력 (BUG-1~13 외)

> 원래 `WORKFLOW.md` §6 이었다. 2026-08-25 에 기록을 `docs/log/` 로 분리하면서 옮겼다.
> 규칙·현황은 `WORKFLOW.md` 에, 작업 기록은 이 폴더에 둔다 — 새 파일만 만들면 충돌이 구조적으로 안 난다.

## 주요 버그 수정 이력

| 버그 | 증상 | 원인 | 수정 |
|------|------|------|------|
| BUG-1 | tourist id:84–116이 festival과 충돌 | ID 범위 중복 설계 | tourist → id:201–233 재번호 |
| BUG-3/4 | localcurrency.js와 map.js 변수명 충돌 | `LC_PIN_LEVEL` 동일 변수명 | map.js는 `TK_PIN_LEVEL`/`TK_GRID`로 네임스페이스 분리 |
| BUG-8 | 달력 ‹/› 버튼 클릭 무반응 | onclick 연결 누락 | calNav() 함수에 연결 |
| BUG-9 | 축제 카드 배경 단색 | 인덱스 기반 클래스 미적용 | `IMG_CLASSES[festIdx % 5]` |
| BUG-11 | 슬라이드 drag 이벤트 2중 등록 | setupSlideCardDrag 중복 호출 | 1회만 호출하도록 수정 |
| 퀴즈 오버레이 계속 표시 | 탭 전환 후에도 퀴즈 떠있음 | `go()` 함수에 `closeQuiz()` 없음 | `go()` 첫 줄에 `closeQuiz()` + `closeMenu()` 추가 |
| ← 버튼 화면 삐져나옴 | 퀴즈 오버레이 버튼이 우측 뷰포트 밖 | `translateX(100%)` = 뷰포트 끝 | `translateX(110%)` + `visibility:hidden` |
| 사이드 메뉴 shadow 노출 | 메뉴 닫힌 상태에서 그림자 보임 | box-shadow 28px가 화면 끝 밖으로 새어나옴 | `translateX(110%)` + `visibility:hidden` + transition delay |
| 지도 핀 토글 버그 | 관광 탭→지도 이동 시 핀이 사라짐 | `goMapFocus()`에서 `setFilter('tourist')` 재호출 → 토글 OFF | `chip.classList.contains('active')` 확인 후 조건부 호출 |
| 좌표 중복 (15곳) | 같은 위치에 핀 겹쳐 한쪽 클릭 불가 | data.js 입력 오류 (동일 항구/단지 내 복수 시설) | 약 100m 오프셋으로 분리 |

---
