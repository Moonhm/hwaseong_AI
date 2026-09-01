<div align="center">

# 화성잇다 · Hwaseong-itda

### All-in-One Tourism Web App for Hwaseong Special City (화성특례시)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Try%20Now-orange?style=for-the-badge&logo=cloudflare)](https://checks-sciences-palestinian-cottages.trycloudflare.com)
[![Kakao Maps](https://img.shields.io/badge/Kakao%20Maps-JS%20API-FFCD00?style=for-the-badge&logo=kakao)](https://apis.map.kakao.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI Powered](https://img.shields.io/badge/AI%20Powered-Claude-5A67D8?style=for-the-badge)](https://claude.ai)

**2026 Hwaseong City AI Hackathon (2026 화성시 해커톤)**

*Connecting tourists to Hwaseong (화성) — maps, festivals, parking, local currency, and personalized recommendations, all in one mobile app.*

</div>

---

## What is Hwaseong-itda (화성잇다)?

**Hwaseong-itda (화성잇다)** means *"Connecting Hwaseong"* — linking tourists to everything Hwaseong Special City (화성특례시) has to offer.

Built on official city data, the app brings together 151 tourist spots (관광지), 50 festivals and events (축제·행사), 42 designated cultural heritage sites (지정문화재), 131 public parking lots (공영주차장) with real-time availability, and 27,374 local currency merchants (지역화폐 가맹점) onto a single interactive map. An AI-powered recommendation quiz helps users discover destinations that match their travel style.

---

## Administrative Districts (행정구역)

Hwaseong Special City (화성특례시) is organized into **4 districts (구), 4 towns (읍), 9 townships (면), and 16 neighborhoods (동)** — 29 divisions in total. Every place in this app belongs to one of them.

| District (구) | Divisions | Composition |
|---------------|----------:|-------------|
| **Mansae-gu (만세구)** | 10 | Ujeong-eup (우정읍) · Hyangnam-eup (향남읍) · Namyang-eup (남양읍) · Mado-myeon (마도면) · Songsan-myeon (송산면) · Seosin-myeon (서신면) · Paltan-myeon (팔탄면) · Jangan-myeon (장안면) · Yanggam-myeon (양감면) · Saesol-dong (새솔동) |
| **Hyohaeng-gu (효행구)** | 5 | Bongdam-eup (봉담읍) · Maesong-myeon (매송면) · Bibong-myeon (비봉면) · Jeongnam-myeon (정남면) · Gibae-dong (기배동) |
| **Byeongjeom-gu (병점구)** | 5 | Jinan-dong (진안동) · Byeongjeom 1-dong (병점1동) · Byeongjeom 2-dong (병점2동) · Banwol-dong (반월동) · Hwasan-dong (화산동) |
| **Dongtan-gu (동탄구)** | 9 | Dongtan 1-dong through Dongtan 9-dong (동탄1동 ~ 동탄9동) |

Hwaseong covers a wide range of landscapes across these districts — the western coast and islands of Mansae-gu (제부도·궁평항·전곡항), the UNESCO World Heritage royal tombs in Byeongjeom-gu (융릉과 건릉), and the dense new town of Dongtan-gu (동탄 신도시).

---

## Features

The app has five bottom tabs — Home (홈) · News (소식) · Recommend (추천) · Map (지도) · Menu (메뉴).

| Screen | Description |
|--------|-------------|
| **🏠 Home (홈)** | Live weather and air quality (날씨·미세먼지) · Recently viewed places · Favorites (즐겨찾기) · Search across every dataset · Tourism / Living toggle |
| **📰 News (소식)** | This week's events (이번 주 소식) · This month's festival carousel (이번 달 축제) · Full event list with 진행중 / 예정 / 종료 status · Living info by category |
| **🧭 Recommend (추천)** | Nearest spot by GPS · 5-question travel personality quiz → Top 3 picks · Popular places by navigation data · Age-group trends · City Tour courses (시티투어) |
| **🗺 Map (지도)** | Kakao Maps with 11 category chips — tourist spots · cultural heritage · real-time parking (🟢🟡🔴) · local currency merchants · restaurants · hotels · campsites · cinemas · Jebu Island stays |
| **☰ Menu (메뉴)** | Official Hwaseong City links · Jebu Island tide timetable (제부도 바닷길) · Today's weather panel · Shortcuts · Settings |

### Also inside

- **District view (구별 보기)** — search a district name to zoom the map to that area
- **Festival calendar (축제 달력)** — month grid with 진행중 / 예정 / 종료 badges
- **Jebu Island sea road (제부도 바닷길)** — 2026 tide timetable, tells you when the road opens
- **Accessibility** — pinch-zoom enabled, WCAG AA text contrast, full keyboard operation

### Convenience Info (편의정보) — Map Chip Filter

| Category | Count | Content |
|----------|------:|---------|
| Model Restaurants (모범음식점) | 94 | City-certified quality restaurants |
| Tourist Restaurants (관광식당업) | 35 | Registered tourist dining establishments |
| Cinemas (영화상영관) | 13 | Screens and seat counts |
| Campsites (캠핑장) | 17 | Number of pitches and facilities |
| Tourist Hotels (관광호텔) | 10 | Grade and room count displayed |
| Tourist Facilities (관광편의시설) | 10 | Registered tourism-convenience businesses |
| Temple Stay (템플스테이) | 1 | Yongjusa (용주사) program guide |
| Jebu Island Accommodations (제부도 숙박) | 115 | Pensions, guesthouses, motels, condos |

---

## Data Sources

| Data | Source | Note |
|------|--------|------|
| Tourist spots — natural & historic (자연·역사) · 41 | Hwaseong City Tourism (`tour.hscity.go.kr`) | Official API |
| Tourist spots — experience villages (체험마을) · 51 | Hwaseong City Tourism (`tour.hscity.go.kr/2exp`) | |
| Tourist spots — additional (쇼핑·골프·공원 등) · 59 | Korea Tourism Data Lab (`datalab.visitkorea.or.kr`) | 8 cinemas moved to Convenience Info |
| Festivals & events (축제·행사) · 50 | Hwaseong City Reservation System (`yeyak.hscity.go.kr`) | 2026 |
| Designated cultural heritage (지정문화재) · 42 | Public Data Portal (`data.go.kr`) | National · provincial · city designations |
| Public parking lots (공영주차장) · 131 | Hwaseong Smart Parking API (`smartparking.hscity.go.kr`) | Real-time via Flask proxy |
| Local currency merchants (지역화폐 가맹점) · 27,374 | Hwaseong Love Card (화성사랑카드) public data | 4.2 MB lazy-loaded |
| Convenience facilities (편의정보) · 179 | Hwaseong City official data · Public Data Portal | Restaurants, hotels, campsites, cinemas |
| Weather & air quality (날씨·미세먼지) | Open-Meteo | No API key required |
| Jebu Island tide times (제부도 물때) · 2026 | Hwaseong City (`hscity.go.kr/jebudo`) | Full-year timetable |
| City Tour courses (시티투어) | Hwaseong City Tourism (`tour.hscity.go.kr/citytour`) | Course details + reservation link |
| Jebu Island accommodations (제부도 숙박) · 115 | Hwaseong City Tourism website | Pensions, guesthouses, motels |

> **On accuracy.** Coordinates are geocoded from the source addresses; where an address
> is incomplete the pin can be off by a few hundred meters. Parking availability is
> refreshed about every 60 seconds while the map is open. The star ratings shown on
> tourist spots are **placeholder values for layout, not real user reviews** — the app
> states this in its own data notice. The full notice is at the bottom of the Home tab.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML · CSS · JavaScript — no framework, no build step (23 JS + 7 CSS modules) |
| Map | Kakao Maps JavaScript SDK v2 |
| Proxy Server | Flask (Python) — CORS relay for parking API (주차장 API) |
| Deployment | Cloudflare Quick Tunnel |
| AI | Claude (Anthropic) — two instances, one for the app and one for the data pipeline |

---

## Running Locally

```bash
# 1. Clone
git clone https://github.com/Moonhm/hwaseong_AI.git
cd hwaseong_AI

# 2. Install Flask
pip install flask requests

# 3. Start the proxy server (required for real-time parking data)
python tools/server.py --port 8080

# 4. Open http://localhost:8080
```

> The Kakao Maps API key is pre-configured for the Cloudflare domain.
> For local development, register your own key at [developers.kakao.com](https://developers.kakao.com).

---

## Team

| Name | Role |
|------|------|
| 문형민 (Moon Hyeongmin) | Development, data pipeline |
| 서교연 (Seo Gyoyeon) | UI/UX design (Figma), QA |

> Contact: seoky0219@gmail.com

---

<div align="center">

*Made with ♥ for Hwaseong (화성), Korea · 2026 Hwaseong City AI Hackathon*

**[Try the live app →](https://checks-sciences-palestinian-cottages.trycloudflare.com)**

</div>
