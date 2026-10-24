# calhack

## PropertyLens

A Cal Hacks property explorer built with Vite, React (JavaScript), React Router, plain CSS, and a small Express server. Search a US address for property facts, an active listing price or estimated value, an estimate range, and the RentCast sources used. Estimates are not appraisals.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
```

Create `server/.env` from `server/.env.example` (PowerShell: `Copy-Item server/.env.example server/.env`; macOS/Linux: `cp server/.env.example server/.env`). If you already have `server/.env`, keep it instead of overwriting it.

```dotenv
RENTCAST_API_KEY=your_key_here
USE_FIXTURES=true
PORT=3001
```

For live lookups, put your RentCast key in that ignored file and set `USE_FIXTURES=false`. For development without quota usage, leave `USE_FIXTURES=true`; no key is required in that mode. The existing development workspace already has its local environment configured. Never commit real keys or prefix them with `VITE_`.

```sh
npm run dev
```

This single command starts Express on `127.0.0.1:3001` and Vite (normally `http://127.0.0.1:5173`). Vite proxies `/api` to Express; no CORS configuration is needed. Open the URL printed by Vite. Restart the dev command after changing `server/.env`. Close an older Phase 1 server if it is still occupying port 5173.

For a production frontend build:

```sh
npm run build
npm run preview
```

`npm run preview` previews the frontend and proxies `/api`; run `npm run start:server` in a second terminal for lookups. The frontend build does not bundle or deploy the backend. Future deployment must run Express and route `/api` to it; static hosting alone is insufficient.

### Windows terminal runtime

If VS Code cannot find `node` or `npm`, install Node.js LTS with npm and reopen the terminal. In the original development workspace, the temporary runtime used for development can also be enabled for the current PowerShell session:

```powershell
$env:PATH = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH"
function npm { node "$env:LOCALAPPDATA\Temp\calhack-npm\package\bin\npm-cli.js" @args }
npm run dev
```

That temporary npm path is machine-specific and may be removed when Windows clears temporary files. A normal Node.js installation is the portable setup.

## Data flow and quota

- The browser calls only `GET /api/lookup?address=...`. The key stays on the server in `process.env`; RentCast requests use the documented `X-Api-Key` header ([authentication docs](https://developers.rentcast.io/reference/getting-started-guide)).
- A cold live lookup normally makes **two parallel requests**: `/avm/value` and `/listings/sale?status=Active`. The inspected AVM `subjectProperty` already includes beds, baths, square footage, property type, year built, lot size, and last-sale date when available. The UI never uses comparable-property attributes as subject details.
- `/properties` is a third, fallback request only when the AVM lacks subject-address details. Missing provider fields remain `null` in JSON and render as `N/A`; a missing last-sale price alone does not trigger another request.
- Returned listing status is checked explicitly. Inactive records are never shown as active, even if returned by an Active-filtered request. An empty/inactive listing result means no active listing; a failed listing request produces an error rather than a false not-listed claim.
- Successful live results are cached in ignored `server/.cache/lookups.json` for 24 hours, keyed by trimmed, lowercase address with repeated whitespace collapsed. Concurrent duplicate requests share one lookup; later repeats and server restarts use the disk cache. Different punctuation/address abbreviations are not considered identical. The cache assumes one Express process, not multiple replicas.
- Failed lookups are not saved as successes. Quota/access errors trigger a short in-memory cooldown. No automatic upstream retry spends extra quota.
- The normalized response includes `listing`, `estimate`, `lastSale`, computed `pricePerSqft`, `sources`, and `sampleData`. Only normalized display fields reach the browser, not raw owner/agent information or comparables. Sources include the sale-listings check even when it finds no active listing.

## Fixture mode

`USE_FIXTURES=true` reads the saved raw RentCast responses in `server/fixtures/` and makes **zero external calls**. Any nonempty search shows the same saved property, preserving its actual address and displaying a **Sample data** badge and explanatory notice. These are recorded responses, not fresh data for the entered address. Fixture results never enter the live cache. Set `USE_FIXTURES=false` and restart to use live data.

The one-off `npm run inspect:rentcast` script calls each of the three endpoints once and saves raw JSON plus capture metadata. It refuses to overwrite existing fixtures or silently repeat calls; the checked-in fixtures are already captured, so **do not run it during ordinary setup**. `node server/scripts/verify-live.js` explicitly exercises live mode with the persistent cache; a cold run normally costs two API requests and asserts that the repeated search adds zero requests.

## Folder structure

```text
src/
  components/  Shared layout, search, listing, facts, estimate, sources, lookup states
  pages/       Home, Results, NotFound
  lib/         config.js (app name), format.js (safe number/date formatting)
  styles/      Shared, responsive, and results styles
  App.jsx      Routes and shared page layout
  main.jsx     React entry point
server/
  app.js, index.js       Express route and startup
  config.js             Server-only environment loading
  rentcast.js           Fetch client, timeouts, sanitized provider errors
  lookup.js             Request orchestration, fixture mode, deduplication
  normalize.js          Provider-to-UI data mapping
  cache.js              24-hour JSON cache
  fixtures/             Recorded raw responses and capture metadata
  scripts/              One-off inspection, live verification, secret checks
  tests/                Offline tests; never spend API quota
  .env.example          Placeholder settings only
vite.config.js          Same-origin API proxy
```

Routes: `/`, `/results?address=...`, and a not-found page for unknown paths. Opening results without an address shows a recovery action. Future hosting must rewrite frontend paths to `index.html` for React Router deep links, while routing `/api` to Express.

Rename the app in `src/lib/config.js`. Display components accept normalized data through props. The original `mockProperty.js` is retained from Phase 1 but is no longer imported or shown.

## Planned next

- Additional property data integrations, potentially Apify
- Claude-generated summaries
- Azure deployment
- Visa payments

These are planned only. There is no map, comparables UI, autocomplete, field editing, database, authentication, payments, or AI integration.

## Verification

```sh
npm test
npm run build
npm run check:secrets
```

Offline tests cover normalization, price precedence, missing fields, inactive listings, server errors, quota handling, concurrent duplicate searches, persistence, 24-hour expiry, no-key fixtures, property-record fallback, and formatting. `check:secrets` checks the current key against tracked/staged files, Git history, and the frontend build without printing it. Always inspect `git status` before committing; the only staged environment file allowed is the placeholder `server/.env.example`.

- Submit an empty or whitespace-only search: an inline error appears.
- Search an address: results show the provider’s full address, listing status, price, stats, details, estimate range, and actual sources.
- In fixture mode, verify the sample badge and saved-address notice. In live mode, there is no sample badge.
- Check loading and address-not-found, provider-limit, and server-error states; each offers “Try another address.”
- Repeat a successful live search: the provider request count must not increase.
- Open `/results` directly, refresh a results URL, and visit an unknown route.
- Follow Home and How it works; use keyboard navigation and inspect widths from 360px to desktop.
