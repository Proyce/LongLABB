# LongLAB

Frontend for LongLAB, a Vite + React dashboard for tracking Binance futures opportunities, risk levels, and related signal metrics.

## Tech Stack

- React 18
- Vite
- Recharts
- Binance Futures public API

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Project Structure

```text
src/main.jsx                 App entry point
short-losers-tracker.jsx     Main dashboard component
index.html                   Vite HTML shell
vite.config.js               Vite configuration
```

## Notes

The app uses browser storage through `window.storage`, with a localStorage fallback in development.
