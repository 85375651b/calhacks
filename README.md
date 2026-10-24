# calhack

## PropertyLens

A Cal Hacks frontend prototype for exploring US property facts, a price range, and the sources behind each number. Built with Vite, React (JavaScript), React Router, and plain CSS. All results are explicitly labeled fictional sample data; the entered address does not trigger a lookup.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

## Folder structure

```text
src/
  components/  Navbar, Footer, SearchBar, PropertyFactsCard, EstimateCard, SourcesList
  pages/       Home, Results, NotFound
  lib/         config.js (app name), mockProperty.js (fictional fixtures)
  styles/      global.css, layout.css (responsive styles)
  App.jsx      Routes and shared page layout
  main.jsx     React entry point
```

Routes: `/`, `/results?address=...`, and a not-found page for unknown paths. The results page also supports opening without an address. Future static hosting must rewrite unknown paths to `index.html` for React Router deep links.

Rename the app in `src/lib/config.js`. Replace the fixtures in `src/lib/mockProperty.js` when real data is ready; display components accept data through props. Facts are individual labeled fields ready for future editing controls, but are read-only today.

## Planned next

- Real data via Apify and property APIs
- Claude-generated summaries
- Azure deployment
- Visa payments

These are planned only. This prototype has no backend, API calls, authentication, payments, or database. Estimates are not appraisals.

## Manual checks

- Submit an empty or whitespace-only search: an inline error appears.
- Search an address: the results URL and heading preserve the address.
- Check the sample badge, all six facts, estimate range, and placeholder sources.
- Open `/results` directly, refresh a results URL, and visit an unknown route.
- Follow Home and How it works; use keyboard navigation and inspect widths from 360px to desktop.
