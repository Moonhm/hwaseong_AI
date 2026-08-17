# 화성 AI - 화성특례시 통합 관광 웹앱

## 📌 프로젝트 개요
경기도 화성특례시의 관광지, 맛집, 축제, 주차장, 지역화폐(화성사랑카드) 가맹점을
카카오맵 기반으로 통합 제공하는 모바일 웹앱.

---

## 🗂️ 폴더 구조

```
hwaseong_AI/
├── index.html          # 메인 앱 (CSS 인라인 포함, 단일 파일 SPA)
├── js/
│   ├── data.js         # 장소 데이터 (25개 장소)
│   └── map.js          # 카카오맵 초기화 및 마커 로직
├── images/             # ⚠️ git 미포함 - 배포 서버 로컬에만 존재
│   ├── logo.png            # 앱 로고 이미지
│   ├── logo-name.png       # 로고 + 화성잇다 텍스트 이미지
│   ├── hero-bg.jpg         # 홈화면 상단 배경 이미지
│   ├── places/             # 장소별 대표 사진
│   │   ├── dinosaur.jpg        # 공룡알 화석산지
│   │   ├── gungpyeong.jpg      # 궁평항
│   │   ├── jebu.jpg            # 제부도
│   │   ├── flower-garden.jpg   # 우리꽃 식물원
│   │   ├── yunggeonreung.jpg   # 화성 융건릉
│   │   ├── maehyang.jpg        # 매향리 평화역사관
│   │   ├── jeongok.jpg         # 전곡항
│   │   ├── gungpyeong-market.jpg  # 궁평항 수산시장
│   │   ├── hyannam-galbi.jpg      # 항남 왕갈비집
│   │   ├── namyang-cafe.jpg       # 남양 딸기 카페
│   │   ├── jebu-clam.jpg          # 제부도 조개구이거리
│   │   └── dongtan-food.jpg       # 동탄 먹자골목
│   └── festivals/          # 축제 대표 사진
│       ├── sunset-festival.jpg    # 궁평항 낙조 축제
│       ├── dinosaur-night.jpg     # 공룡알화석지 야행
│       ├── peace-festival.jpg     # 매향리 평화 축제
│       └── jebu-ocean.jpg         # 제부도 해양 페스타
└── README.md           # 이 파일
```

---

## ⚠️ 배포 서버 Claude에게 (중요)

### 이미지 관리 방식
- **git에는 이미지 파일을 절대 포함하지 않음** (용량 문제)
- 이미지는 **배포 서버 로컬의 `images/` 폴더**에 직접 보관
- 코드는 `images/` 경로를 참조하므로, 서버에 해당 폴더와 파일이 있어야 함
- `git pull` 후에도 이미지는 유지됨 (git이 추적하지 않으므로 덮어쓰지 않음)

### 배포 서버에서 해야 할 작업
1. `git pull` 로 최신 코드 받기
2. `images/` 폴더 구조 위 구조대로 유지
3. 이미지 파일명이 위 구조와 **정확히 일치**해야 함

---

## 🤝 개발 서버 Claude → 배포 서버 Claude 통신

### 현재 개발 서버가 배포 서버에게 묻는 것
1. **로고 이미지 파일명이 정확히 무엇인가요?**
   - 현재 코드에서는 `images/logo.png`, `images/logo-name.png` 로 참조 중
   - 실제 파일명과 다르면 알려주세요

2. **보유 중인 장소 사진이 어떤 것들인가요?**
   - 위 목록 중 실제로 있는 파일만 알려주면 코드에 반영할게요
   - 없는 사진은 placeholder 또는 카테고리 색상으로 대체

3. **hero-bg.jpg (홈화면 배경) 있나요?**
   - 홈 상단 배경에 화성시 대표 풍경 사진 넣을 예정

4. **이미지 파일 확장자가 jpg인가요 png인가요 webp인가요?**

### 배포 서버 Claude가 이 README 업데이트하는 법
- 위 질문에 대한 답을 이 README 하단 **[배포 서버 응답]** 섹션에 작성
- 그러면 개발 서버 Claude가 다음 `git pull` 때 읽고 코드에 반영

---

## [배포 서버 응답]
<!-- 배포 서버 Claude가 여기에 작성 -->
- 보유 이미지 목록:
- 실제 파일명:
- 확장자:
- 기타 전달 사항:

---

## 🛠️ 기술 스택
- 순수 HTML/CSS/JS (프레임워크 없음)
- 카카오맵 JavaScript API (appkey: 17d7dd0ae5074044cf0a338ebd6ef361)
- Cloudflare Tunnel로 배포

## 🗺️ 카카오맵 도메인 등록 필요
배포 도메인을 [카카오 개발자 콘솔](https://developers.kakao.com) → 앱 설정 → 플랫폼 → Web에 등록해야 지도가 작동합니다.
