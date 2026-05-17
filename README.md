# F.R.I.D.A.Y — Professional NSE Scanner (React)

A professional NSE stock & F&O scanner powered by the **Upstox API**, now converted to a modern **React + Vite** application.

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start development server (opens http://localhost:3000)
npm run dev

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview
```

---

## 📁 Project Structure

```
friday-react/
├── .github/
│   └── workflows/
│       └── ci.yml            ← GitHub Actions: npm install → build → deploy
├── public/
│   └── stocks/
│       └── stocks.json        ← Optional: override stock universe from GitHub
├── src/
│   ├── main.jsx               ← React entry point
│   ├── App.jsx                ← Root component + pane routing
│   ├── index.css              ← Global styles (extracted from original HTML)
│   ├── constants/
│   │   └── config.js          ← DEF config, INDEX_OPTS, TABS
│   ├── context/
│   │   └── AppContext.jsx     ← Global state (token, cfg, market status, etc.)
│   ├── services/
│   │   ├── api.js             ← Upstox API layer (proxy rotation, rate limiting)
│   │   └── github.js          ← GitHub signal log & settings sync
│   ├── utils/
│   │   ├── formatters.js      ← fmt, fmtC, fmtVol, interpVIX
│   │   └── marketTime.js      ← getIST, localIsOpen, sleep
│   ├── components/
│   │   ├── Header.jsx         ← Sticky top bar with countdown & scan button
│   │   ├── NavDrawer.jsx      ← Slide-in hamburger menu
│   │   ├── Ticker.jsx         ← Green marquee ticker tape
│   │   ├── TokenGate.jsx      ← Upstox token entry screen
│   │   ├── StockCard.jsx      ← Individual stock pick card
│   │   └── common.jsx         ← Spinner, ErrorBanner, StatCard, Toast, LogDrawer
│   └── panes/
│       ├── StocksPane.jsx     ← Picks + Breakout scanner
│       ├── OptionsPane.jsx    ← F&O options analysis
│       ├── PortfolioPane.jsx  ← Live portfolio P&L
│       ├── LookupPane.jsx     ← Analyse any stock by symbol
│       ├── LogPane.jsx        ← Signal log (GitHub-backed)
│       ├── AnalysisPane.jsx   ← Signal performance analytics
│       └── SettingsPane.jsx   ← All config + GitHub + token management
├── index.html
├── package.json
└── vite.config.js
```

---

## 🔑 Getting Your Upstox Token

1. Go to [developer.upstox.com](https://developer.upstox.com)
2. Login → My Apps → your app
3. Click **"Get Token"** → Login with Upstox
4. Copy the Access Token → paste in the app

Tokens expire daily — paste a fresh token each morning.

---

## ⚙️ GitHub Actions CI/CD

The `.github/workflows/ci.yml` workflow:

| Step | Description |
|------|-------------|
| **Install** | `npm ci` — clean, reproducible install from `package-lock.json` |
| **Lint** | `eslint src` (non-blocking) |
| **Build** | `vite build` → `dist/` |
| **Deploy** | GitHub Pages (on push to `main`/`master`) |

### Enabling GitHub Pages Deployment

1. Go to your repo → **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow deploys automatically

---

## 📋 Signal Logging (GitHub)

FRIDAY stores signal history in your GitHub repo as daily JSON files:

```
signal-logs/{upstox-user-id}/2024-01-15.json
signal-logs/{upstox-user-id}/index.json
settings/{upstox-user-id}/config.json
```

Configure in **Settings → Signal Log (GitHub)**:
- Generate a token at: `github.com/settings/tokens/new?scopes=repo`
- Enter your username + repo name

---

## 🏗️ Integrating the Analysis Engine

The `StocksPane` and `OptionsPane` connect to the Upstox API for quotes but
currently return empty picks arrays as placeholders.

To plug in the full FRIDAY analysis engine from your `.NET MAUI` app:

1. Port the analysis services from `MAUI/Services/` into `src/services/analysis.js`
2. In `StocksPane.jsx` → `runPicksScan()`, replace the placeholder with:
   ```js
   const picks = await runFullAnalysis(token, cfg, stocks, onTokenExpired);
   setPicks(picks);
   ```
3. The full technical indicator logic (RSI, MACD, Supertrend, Confidence, Risk)
   lives in your existing C# services — port those formulas to JS.

---

## ⚠️ Disclaimer

Not SEBI-registered investment advice. FRIDAY is an analysis tool only.
Always do your own due diligence (DYODD) before trading.
