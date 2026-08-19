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

**Hwaseong-itda** (화성잇다) is a mobile-first web app that integrates all the information a tourist needs to explore **Hwaseong Special City (화성특례시)**, Gyeonggi-do (경기도), South Korea.

The name *화성잇다* means **"connecting Hwaseong"** — linking tourists to places, events, parking, and local commerce in one seamless experience.

---

## Features

### 🗺 Interactive Map (지도)
- **Kakao Maps (카카오맵)** with category chip filters
- **159 tourist spots** — dynamic clusters when zoomed out, individual pins when zoomed in
- **131 public parking lots (공영주차장)** with real-time availability (green / orange / red)
- **27,374 local currency merchants (지역화폐 가맹점)** — *Hwaseong Love Card (화성사랑카드)*
- **48 upcoming festivals & events** (2026)
- Convenience info: model restaurants (모범음식점), hotels (관광호텔), campsites (캠핑장), temple stays (템플스테이), Jebu Island (제부도) accommodations
- Slide-up detail card per pin: photo, star rating, description, directions, nearby merchants

### 🏠 Home (홈)
- GPS-based **nearest tourist spot** recommendation
- **Nearby public parking** with real-time availability
- **Search bar** — find places by name or neighborhood
- Tap the logo to instantly share the app URL

### 🎉 Tourism (관광)
- Full list of 159 tourist spots with thumbnail photos and star ratings
- Filterable by theme: nature (자연), history (역사), festival (축제), and more
- **Festival calendar** with month navigation and event detail pages

### 🧭 Tourist Recommendation Quiz (관광지 추천 퀴즈)
- 5-question quiz matching user preferences to the best-fit tourist spots
- Top-3 results with photo cards, tags, and direct map focus

### ⭐ Star Rating System (별점)
- All 159 tourist spots carry a star rating (3.2 – 4.9) and review count
- Displayed in the spot list, home cards, and detail panel

---

## Data

| Category | Count | Source |
|----------|------:|-------|
| Tourist spots — natural & historic (자연·역사) | 41 | Hwaseong City official tourism API (`tour.hscity.go.kr`) |
| Tourist spots — experience villages & sites (체험마을) | 51 | `tour.hscity.go.kr/2exp` |
| Tourist spots — shopping, hotels, parks, and more | 67 | Korea Tourism Data Hub (한국관광 데이터랩) |
| **Tourist spots total** | **159** | |
| Festivals & events 2026 (축제·행사) | 48 | Hwaseong City reservation system (`yeyak.hscity.go.kr`) |
| Public parking lots (공영주차장) | 131 | Hwaseong Smart Parking API (`smartparking.hscity.go.kr`) |
| Local currency merchants (지역화폐 가맹점) | 27,374 | Hwaseong Love Card data |
| Convenience facilities (모범음식점, hotels, campsites…) | 157 | Hwaseong City official data |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML · CSS · JavaScript (single-file SPA, no framework) |
| Map | Kakao Maps JavaScript SDK v2 |
| Proxy Server | Flask (Python) — CORS relay for parking API |
| Deployment | Cloudflare Quick Tunnel |
| AI | Claude (Anthropic) |

---

## Project Structure

```
hwaseong_AI/
├── index.html                   # Main SPA (~3,100 lines, all CSS inline)
├── img/                         # Logo & favicon (git-tracked)
├── js/
│   ├── data.js                  # 159 tourist spots + 48 festivals (tags, ratings)
│   ├── map.js                   # Kakao map, markers, filters, clustering
│   ├── parking.js               # Real-time parking overlay
│   ├── parking-static.json      # 131 parking lots — static cache
│   ├── ratings.json             # Star ratings for 159 tourist spots
│   ├── localcurrency.js         # Local currency merchant overlay
│   ├── localcurrency-static.json # 27,374 merchants (4.2 MB, lazy-loaded)
│   ├── conv_map.js              # Convenience facility geocoder
│   └── convenience.js           # Convenience facility data
├── tools/
│   ├── server.py                # Flask proxy server
│   └── geocode.py               # Address → lat/lng converter
└── assets/                      # Place photos — deployment server only (git-ignored)
    └── images/places/           # {name}.jpg × 159
```

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
