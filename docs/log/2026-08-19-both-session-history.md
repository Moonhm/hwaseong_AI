# 세션별 작업 이력 (Session 1~4)

> 원래 `WORKFLOW.md` §5 이었다. 2026-08-25 에 기록을 `docs/log/` 로 분리하면서 옮겼다.
> 규칙·현황은 `WORKFLOW.md` 에, 작업 기록은 이 폴더에 둔다 — 새 파일만 만들면 충돌이 구조적으로 안 난다.

## 세션별 작업 이력

### Session 4 — 버그 검수 및 편의정보 개선 (2026-08-19 ~ 08-22)

| 커밋 | 내용 |
|------|------|
| `489e68f` | docs: README 영어 작성 + 한국어 용어 괄호 병기, 연락처 원상복구 |
| `9fb4e9d` | fix: conv_map.js p.name null 접근 / map.js 주차장 강제 활성화 수정 (사용자 직접 push) |
| `d836c7a` | fix: 버그 7건 — data.data null guard, ratio 음수, setParkingVisible 독립 토글, templeStay/jebu null guard, renderHotels 조기 return, 비ISO 날짜 캘린더 파싱 |

**주요 변경 내역:**
- `_parseFestDate()` 헬퍼 추가 — "2026년 N월 중" 형식을 해당 월 1일로 변환해 캘린더 점 표시
- `renderHotels()` 조기 return 버그 수정 — jebu 없어도 호텔 목록은 렌더
- `conv_map.js` templeStay/jebu null guard 추가
- `parking.js` data.data Array 검증, ratio `Math.max(0)` 보정
- `map.js` setFilter에서 주차장 독립 토글 완전 복원 (`setParkingVisible(parkActive)`)



### Session 1 — 기초 구축

| 커밋 | 내용 |
|------|------|
| `6590e46` | 화성잇다 초기 버전 — 카카오맵 통합 모바일 웹앱 |
| `f37e99c` | 지도 초기화 오류 수정 |
| `8322932` | autoload=false + kakao.maps.load() 방식 |
| `46961a5` | API 키 교체 (도메인 등록 키로 최종) |
| `b488910` | 더미 데이터 전체 제거, 동적 렌더링 전환 |
| `1a1eddc` | 실시간 주차장 API 연동 (parking.js + server.py) |
| `302cd4e` | parking-static.json 생성, 지오코더 단순화 |

### Session 2 — 데이터 대폭 확장

| 커밋 | 내용 |
|------|------|
| `3931360` | data.js — 체험지 51개 + 축제 24개 추가 (총 116개) |
| `c223d0b` | 장소 사진 시스템 구축 (assets/, onerror fallback) |
| `c98d94a` | 한국관광 데이터랩 관광지 67개 추가 (id:134–200) |
| `93fb388` | 관광지 줌레벨 클러스터/뷰포트 동적 렌더링 (idle 이벤트) |
| `901b4ab` | 관광지 슬라이드카드 전면 개선 |
| `a7037a9` | 관광지 좌표 9건 교정 + updateTouristDisplay 100ms 디바운스 |

### Session 3 — 기능 완성 (해커톤 당일)

| 커밋 | 내용 |
|------|------|
| `7e506e2` | 관광지 159개·주차장 131개 tags 추가 + README 전면 갱신 |
| `30e13fe` | 전체 탭 종합 버그 수정 (BUG-1~13) |
| `86c7f5a` | AI기반 관광지 추천 5문항 + 사이드 메뉴 드로어 |
| `7801150` | 지도 포커스 연동 + 주차장 대수 표시 |
| `fc9c95b` | 배포 Claude 검토 항목 4건 수정 |
| `2d96feb` | 성능·버그 7건 수정 (배포 Claude 직접 push) |
| `9ecd97f` | localcurrency 4.2MB 지연로드 + 달력 동적화 |
| `f76a447` | 지도 기본 빈 화면 + 주차장 칩 독립 멀티 선택 |
| `b5edec3` | 관광 탭 전체 목록 5개 미리보기 + 더보기 버튼 |
| `aabba6f` | 홈 로고 클릭 앱 주소 공유 기능 |
| `2d69c8b` | AI기반 관광지 추천 결과 화면 전면 재설계 |
| `afc7315` | 관광지 별점(★) 시스템 추가 |
| `5591bea` | 전체 코드 최적화 7가지 |
| `74e2f6d` | 경기지역화폐 공식 로고 적용 |
| `c50153c` | fix: 사이드 메뉴 shadow 버그 수정 |
| `ea3f134` | fix: 지도 핀 전수 검토 — 좌표 중복 15곳 분리 + 필터 토글 버그 수정 |

---
