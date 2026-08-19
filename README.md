<div align="center">

# 화성잇다 · Hwaseong-itda

### All-in-One Tourism Web App for Hwaseong Special City (화성특례시)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Try%20Now-orange?style=for-the-badge&logo=cloudflare)](https://culture-reed-dee-rug.trycloudflare.com)
[![Kakao Maps](https://img.shields.io/badge/Kakao%20Maps-JS%20API-FFCD00?style=for-the-badge&logo=kakao)](https://apis.map.kakao.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI Powered](https://img.shields.io/badge/AI%20Powered-Claude-5A67D8?style=for-the-badge)](https://claude.ai)

**2026 Hwaseong City AI Hackathon (2026 화성시 해커톤)**

*Connecting tourists to Hwaseong (화성) — maps, festivals, parking, local currency, and personalized recommendations, all in one mobile app.*

</div>

---

## What is Hwaseong-itda (화성잇다)?

**Hwaseong-itda (화성잇다)** means *"Connecting Hwaseong"* — linking tourists to everything Hwaseong Special City (화성특례시) has to offer.

Built on official city data, the app brings together 159 tourist spots (관광지), 48 festivals and events (축제·행사), 131 public parking lots (공영주차장) with real-time availability, and 27,374 local currency merchants (지역화폐 가맹점) onto a single interactive map. An AI-powered recommendation quiz helps users discover destinations that match their travel style.

---

## Features

| Screen | Description |
|--------|-------------|
| **🏠 Home (홈)** | GPS-based nearest tourist spot recommendation · Real-time nearby parking availability · Place search bar · App URL sharing |
| **🗺 Map (지도)** | Kakao Maps with category chip filters — tourist clusters/pins · Real-time parking lots (🟢🟡🔴) · Local currency merchants · Convenience info |
| **🎉 Tourism (관광)** | Full list of 159 tourist spots with theme filters · 2026 Festival calendar (축제 달력) · Monthly event browsing |
| **🧭 AI Recommendation (AI 추천)** | 5-question travel personality quiz → AI recommends Top 3 destinations · Photo cards + direct map focus |
| **⭐ Star Ratings (별점)** | Ratings (3.2–4.9) and review counts for all 159 tourist spots · Shown in list, home cards, and detail panel |

### Convenience Info (편의정보) — Map Chip Filter

| Category | Count | Content |
|----------|------:|---------|
| Model Restaurants (모범음식점) | 94 | City-certified quality restaurants |
| Tourist Restaurants (관광식당업) | 35 | Registered tourist dining establishments |
| Tourist Hotels (관광호텔) | 14 | Grade and room count displayed |
| Campsites (캠핑장) | 11 | Number of pitches and facilities |
| Temple Stay (템플스테이) | 1 | Yongjusa (용주사) program guide |
| Jebu Island Accommodations (제부도 숙박) | 115 | Pensions, guesthouses, motels, condos |

---

## Data Sources

| Data | Source | Note |
|------|--------|------|
| Tourist spots — natural & historic (자연·역사) · 41 | Hwaseong City Tourism (`tour.hscity.go.kr`) | Official API |
| Tourist spots — experience villages (체험마을) · 51 | Hwaseong City Tourism (`tour.hscity.go.kr/2exp`) | |
| Tourist spots — additional (쇼핑·골프·호텔·공원 등) · 67 | Korea Tourism Data Lab (`datalab.visitkorea.or.kr`) | |
| Festivals & events (축제·행사) · 48 | Hwaseong City Reservation System (`yeyak.hscity.go.kr`) | 2026 |
| Public parking lots (공영주차장) · 131 | Hwaseong Smart Parking API (`smartparking.hscity.go.kr`) | Real-time via Flask proxy |
| Local currency merchants (지역화폐 가맹점) · 27,374 | Hwaseong Love Card (화성사랑카드) public data | 4.2 MB lazy-loaded |
| Convenience facilities (편의정보) · 157 | Hwaseong City official data (`tour.hscity.go.kr`) | Restaurants, hotels, campsites |
| Jebu Island accommodations (제부도 숙박) · 115 | Hwaseong City Tourism website | Pensions, guesthouses, motels |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML · CSS · JavaScript (single-file SPA, no framework) |
| Map | Kakao Maps JavaScript SDK v2 |
| Proxy Server | Flask (Python) — CORS relay for parking API (주차장 API) |
| Deployment | Cloudflare Quick Tunnel |
| AI | Claude Sonnet 4.6 (Anthropic) |

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

**[Try the live app →](https://culture-reed-dee-rug.trycloudflare.com)**

</div>
