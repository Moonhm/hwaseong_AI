<div align="center">

# 화성잇다 · Hwaseong-itda

### All-in-One Tourism Web App for Hwaseong Special City (화성특례시)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Cloudflare%20Tunnel-orange?style=for-the-badge&logo=cloudflare)](https://culture-reed-dee-rug.trycloudflare.com)
[![GitHub](https://img.shields.io/badge/GitHub-hwaseong__AI-181717?style=for-the-badge&logo=github)](https://github.com/Moonhm/hwaseong_AI)
[![Kakao Maps](https://img.shields.io/badge/Kakao%20Maps-JS%20API-FFCD00?style=for-the-badge&logo=kakao)](https://apis.map.kakao.com/)
[![Made with](https://img.shields.io/badge/Made%20with-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI-Powered](https://img.shields.io/badge/Built%20with-Claude%20AI-5A67D8?style=for-the-badge&logo=anthropic)](https://claude.ai)

**Hackathon Entry · 2026 Hwaseong City AI Hackathon (2026 화성시 해커톤)**

*Connecting tourists to Hwaseong (화성) — maps, festivals, parking, local currency, and personalized recommendations, all in one mobile app.*

</div>

---

## What is Hwaseong-itda (화성잇다)?

**Hwaseong-itda** (화성잇다) is a mobile-first single-page web app that integrates all the information a tourist needs to explore **Hwaseong Special City (화성특례시)**, Gyeonggi-do (경기도), South Korea.

> The name *화성잇다* means **"connecting Hwaseong"** — linking tourists to places, events, parking, and local commerce in one seamless experience.

The app was built entirely with Claude AI through an innovative **dual-Claude bidirectional workflow**, where one Claude instance developed code while another deployed and tested it — communicating asynchronously via GitHub README as a message channel.

---

## Features

### 🗺 Interactive Map (지도)
- **Kakao Maps (카카오맵)** powered interactive map with category chip filters
- **159 tourist spots** (관광지) rendered as dynamic clusters at low zoom → individual pins when zoomed in
- **131 public parking lots** (공영주차장) with real-time availability colors (green/orange/red)
- **27,374 local currency merchants** (지역화폐 가맹점) — *Hwaseong Love Card (화성사랑카드)*
- **48 upcoming festivals & events** (2026 축제) with date-based availability
- Convenience info: model restaurants (모범음식점), tourist restaurants (관광식당), hotels (관광호텔), campsites (캠핑장), temple stays (템플스테이), Jebu Island (제부도) accommodations
- Slide-up detail card per pin with photo, star rating, description, directions, and nearby merchants

### 🏠 Home (홈)
- Location-based **nearest tourist spot recommendation**
- **Nearby public parking** with real-time availability display
- **Search bar** — find spots by name or area
- Quick share: tap the logo to copy the app URL to clipboard

### 🍽 Food (음식)
- Model restaurants (모범음식점) and tourist-designated restaurants (관광식당업) listed with map links

### 🎉 Tourism (관광)
- Full list of 159 tourist spots with thumbnail photos and star ratings
- Filterable by theme: scenic (명소), festival (축제), natural (자연), etc.
- **Festival calendar** with month navigation and event detail pages
- Festival detail: dates, venue, map link, nearby merchants

### 🧭 Tourist Recommendation Quiz (관광지 추천 퀴즈)
- 5-question quiz matching user preferences (mood, companion, activity type, etc.) to the best-fit tourist spots
- Top-3 ranked results with styled cards, photo, tags, and direct map focus

### ⭐ Star Rating System (별점)
- All 159 tourist spots carry a star rating (3.2 – 4.9) and review count
- Ratings synthesized from Kakao Search API rank signals + description analysis
- Displayed in spot list, home cards, and slide-up detail panel

### 📤 Share
- Logo tap → instant clipboard copy of app URL
- Side menu "Share" option with native share sheet on mobile

---

## Screenshots

| Home (홈) | Map (지도) | Tourism List (관광) |
|:---------:|:---------:|:---------:|
| Location-based recommendations | Real-time category pins | Rated tourist spot list |

| Quiz (퀴즈) | Festival Detail (축제) | Parking (주차장) |
|:-----------:|:---------------------:|:---------------:|
| 5-step preference quiz | Date · venue · nearby info | Real-time availability colors |

> Live: [https://culture-reed-dee-rug.trycloudflare.com](https://culture-reed-dee-rug.trycloudflare.com)

---

## Data

| Category | Count | Source |
|----------|------:|-------|
| Tourist spots (관광지) — natural & historic | 41 | Hwaseong City official tourism API (`tour.hscity.go.kr`) |
| Tourist spots — experience villages & sites | 51 | Hwaseong City experience tourism (`tour.hscity.go.kr/2exp`) |
| Tourist spots — shopping, golf, hotels, cinemas, parks… | 67 | Korea Tourism Data Hub (한국관광 데이터랩) + manual survey |
| **Tourist spots total** | **159** | |
| Festivals & events (2026, future only) | 48 | Hwaseong City reservation system (`yeyak.hscity.go.kr`) |
| Public parking lots (공영주차장) | 131 | Hwaseong Smart Parking API (`smartparking.hscity.go.kr`) |
| Local currency merchants (지역화폐 가맹점) | 27,374 | Hwaseong Love Card data |
| Convenience facilities (모범음식점, hotels, campsites…) | 157 | Hwaseong City official data |

> All data is current as of **August 2026**.

---

## Tech Stack

```
Frontend      Vanilla HTML · CSS · JavaScript  (zero frameworks, single-file SPA)
Map           Kakao Maps JavaScript SDK v2      (custom overlays, clustering, idle events)
Proxy Server  Flask (Python)                   (CORS proxy for parking API)
Deployment    Cloudflare Quick Tunnel           (permanent public URL via cloudflared)
AI Tooling    Claude Sonnet 4.6                (dual-instance bidirectional dev workflow)
```

### Architecture Highlights

- **Single-file SPA** (`index.html` ~3,100 lines) — no build step, zero dependencies
- **Dynamic cluster rendering**: tourist spots and parking lots switch between cluster circles (zoomed out) and individual pins (zoomed in) based on Kakao Maps `idle` events with 100ms debounce
- **Lazy loading**: Local currency dataset (4.2 MB JSON) loaded only when the user opens the relevant map filter — not at startup
- **Mobile-first layout**: max-width 480px, 52px fixed bottom nav, touch targets ≥ 36px

---

## Project Structure

```
hwaseong_AI/
├── index.html                   # Main SPA — all CSS inline, 5-tab bottom nav
├── img/                         # Git-tracked: logo, favicon
│   ├── favicon.png
│   ├── favicon-192.png
│   ├── logo-icon.png
│   └── logo-name.png
├── js/
│   ├── data.js                  # Place data (159 tourist · 48 festival) + tags + ratings
│   ├── map.js                   # Kakao map init · markers · filters · tourist clustering
│   ├── parking.js               # Real-time parking overlay (cluster pattern)
│   ├── parking-static.json      # 131 parking lots — coords, fees, tags (static cache)
│   ├── ratings.json             # Star ratings for 159 tourist spots
│   ├── localcurrency.js         # Local currency merchant overlay
│   ├── localcurrency-static.json # 27,374 merchants (4.2 MB, lazy-loaded)
│   ├── conv_map.js              # Convenience facility geocoder init
│   └── convenience.js           # Convenience facility data
├── tools/
│   ├── server.py                # Flask proxy (static files + parking API relay)
│   ├── geocode.py               # Address → lat/lng converter for data pipeline
│   └── 화성시_공영주차장_실시간_정보.py   # Parking API wrapper
├── assets/                      # ⚠️ Git-ignored — deployment server only
│   └── images/places/           # Place photos: {name}.jpg (159 tourist spots)
└── WORKFLOW.md                  # Dual-Claude workflow log & technical record
```

---

## Running Locally

```bash
# 1. Clone
git clone https://github.com/Moonhm/hwaseong_AI.git
cd hwaseong_AI

# 2. Install Flask
pip install flask requests

# 3. Start proxy server (required for real-time parking API — CORS workaround)
python tools/server.py --port 8080

# 4. Open http://localhost:8080
```

> **Note:** The real-time parking feature requires the Flask server.
> The Kakao Maps API key is pre-configured for the Cloudflare domain.
> For local development, register your own key at [https://developers.kakao.com](https://developers.kakao.com).

---

## The Dual-Claude Workflow

This project was built using an experimental **bidirectional Claude AI collaboration** model:

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│   Development Claude (개발)  │         │   Deployment Claude (배포)   │
│                             │         │                              │
│  • Reads code via git fetch │◄───────►│  • Holds place photos locally│
│  • Writes & edits code      │         │  • Runs Flask + Cloudflare   │
│  • git push to main         │──push──►│  • git pull → live deploy    │
│  • Leaves messages in README│◄──msg──►│  • Pushes data/JSON fixes    │
└─────────────────────────────┘         └──────────────────────────────┘
                           GitHub README as message channel
```

Both Claude instances communicated **asynchronously through the README.md** — one would push a code change and leave a message; the other would pull, review the live site, and reply. This enabled features like:
- The deployment Claude directly managing place photos (not in git)
- The development Claude writing quiz and map features while the deployment Claude tested real-time parking
- Conflict-free parallel work using `git pull --rebase` discipline

See [`WORKFLOW.md`](./WORKFLOW.md) for the full session log, bug history, and technical decisions.

---

## Team

| Name | Role |
|------|------|
| **문형민** (Moon Hyeongmin) | Project lead, data pipeline, Claude coordination |
| **서교연** (Seo Gyoyeon) | UI/UX design reference (Figma), QA |
| **Claude Sonnet 4.6** | Development AI (dual-instance workflow) |

> Contact: seoky0219@gmail.com

---

## License

This project was submitted to the **2026 Hwaseong City AI Hackathon (2026 화성시 해커톤)**.
All Hwaseong City data is sourced from official public APIs and the Korea Tourism Data Hub under open data terms.

---

<div align="center">

*Made with ♥ for Hwaseong (화성), Korea*

**[Try the live app →](https://culture-reed-dee-rug.trycloudflare.com)**

</div>
