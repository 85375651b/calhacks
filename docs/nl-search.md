# Describe it search

Use **Describe it** on the home page, enter up to 500 characters, and press Enter or Search. Shift+Enter adds a line. Examples run immediately. The last five queries and preferred tab are stored in localStorage; Clear removes the recent-query list. Interpretation chips, assumptions, unresolved requests and questions remain visible. Removing a chip searches again; removing the location asks for a new one. **Edit in filters** shares the same criteria object. Session storage restores text, criteria, interpretation and results after the planner without running parsing or actors again.

## Supported phrases

| Category | Examples and meaning |
| --- | --- |
| Location | `in San Francisco`, `near Berkeley`, `78704`; city/state and full addresses are resolved with Photon. Ambiguous names such as Portland and Springfield need a choice. |
| Bedrooms / bathrooms | `2 beds` means 2+, `exactly 2 beds` / `only 2 baths` means min=max, `2-3 beds`, `at least 2 baths`, `studio` means zero bedrooms. |
| Price | `under 600k`, `below $1.2M`, `max 750,000`, `between 400k and 700k`, `400k-700k`, `over 300k`, `around 500k` means ±10%. |
| Type | House / single family, condo, townhome / townhouse, multi-family, apartment, manufactured, land / lot. Home/place alone adds no type. |
| Area | `at least 1500 sqft`, `under 2000 square feet`, `100 sqm` converted to sqft, `quarter acre`, `1/2 acre lot`. |
| Age / costs | `built after 2000`, `older than 1980`, `new construction`, `no HOA`, `HOA under $300`. Year boundaries are inclusive canonical bounds. |
| Features | `2 car garage`, pool, waterfront, basement, central air, single story, fireplace, water/mountain view, open house. Feature exclusion (e.g. no pool) is reported unsupported. |
| Status / freshness | Pending, recently sold, coming soon, `new listings` (7 days), `listed in the last 7 days`. |
| Keywords / sort | Updated kitchen, quiet street, fixer upper; cheapest first, newest first, biggest first. Provider-specific unsupported filters remain disclosed under results. |
| Insights | Safe neighborhood, good schools, close to grocery stores, low flood risk, short commute enable modules; they are not hard filters. |
| Radius | `within 5 miles of downtown Oakland`: straight-line haversine distance, not road distance; unknown coordinates are excluded and counted. |
| Commute | `under 25 min drive to Googleplex`, `commute under 45 minutes to UC Berkeley`, `work at X under 30 minutes`, `<30 minute commute to work at 1 Market St, San Francisco`. `my work` uses the saved browser address or asks for one. |
| Departure | `leave at 7:30`, `depart at 8 am`; default 08:00 next Tuesday in the origin timezone. `arrive by 9` is treated as departure at 09:00 with a visible assumption. Driving only; other modes are disclosed as driving. |

Unrecognized text is surfaced in **Couldn’t apply**. Recognized numeric values are clamped through the canonical schema. Unknown model/schema fields are rejected. Explicit rule-derived numbers take precedence over model contradictions. Instruction-like requests do not become housing preferences.

## API

`POST /api/search/parse` accepts `{ text, savedWork?: { label, lat, lng } }`. Text must contain 1–500 characters after trimming. The response is:

```json
{
  "parser": "rules",
  "criteria": { "location": "Austin, TX", "status": "sale", "sources": ["Redfin", "Zillow"], "homeTypes": [], "views": [], "limit": 12, "minBeds": 2 },
  "extras": { "commute": null, "radius": null, "insights": [], "sort": null },
  "interpretation": [{ "key": "minBeds", "label": "Min beds", "value": "2+" }],
  "assumptions": ["2 beds treated as 2 or more; say 'exactly 2 beds' for an exact match."],
  "notApplied": [],
  "questions": []
}
```

Commute is `{ maxMinutes, workText, work: {label,lat,lng} | null, departAt }`; radius is `{ miles, centerText, center: {label,lat,lng} | null }`. Questions are `{field,message,options:[{label,lat,lng}]}`. A search waits until all questions are answered. `POST /api/search/resolve` accepts `{parsed,field,choice}`; choice is a candidate or new place text. Numeric coordinates must be finite and in range. Limits: prices up to $100M, beds/baths 0–20, commute 1–180 minutes, radius 0.1–200 miles.

`POST /api/search/described` accepts `{criteria,extras}` and runs the existing Zillow/Redfin merge and RentCast fallback. The original `POST /api/search` remains unchanged. `POST /api/search/commute-more` accepts `{token}` from the last response. Tokens are random, scoped to `X-Client-Id`, and expire after one hour or server restart. The UI asks for a fresh search if expired. `GET /api/search/config` exposes only the `openaiConfigured` boolean.

## Providers, costs and privacy

Optional `OPENAI_API_KEY` lives only in `server/.env`. The official `openai` SDK calls the Responses API with strict Structured Outputs, Ajv validation, `store:false`, 800 output tokens, an eight-second timeout and no retries. The default model is `gpt-4.1-mini`, verified against [OpenAI's model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). Override with `OPENAI_MODEL`. No temperature override is sent, allowing compatible model overrides. Search and furniture extraction share a persisted `OPENAI_MAX_CALLS_PER_HOUR` cap (30 by default, zero disables calls) and two concurrent requests. Failed calls count. Missing key, fixture mode, failure, refusal, invalid output or exhaustion falls back to rules.

Parsing is submit-only, limited to 20 requests per minute per client, and memoized for 24 hours by normalized text, saved work, model/config and fixture mode. Concurrent identical requests share a promise. This cache is bounded, in memory, and clears on restart. Photon results are cached for ten minutes. Raw search text, errors from SDKs and secrets are not logged. Work addresses can appear in submitted text, which is sent to OpenAI when configured; place text also goes to Photon in live mode. Commute coordinates go to Apify/Google Maps. Browser work preferences persist locally; the server temporarily holds parsed requests and active commute sessions. Route caches persist rounded coordinates in ignored server cache files.

Commute searches request up to `COMMUTE_SEARCH_LIMIT=30` candidates per source (hard maximum 50). Homes beyond maxMinutes × 1 mile are pruned, remaining homes sorted nearest first. `COMMUTE_VERIFY_LIMIT=8` routes (hard maximum 12) are verified in one actor run with per-actor concurrency 2. Each run uses the existing `APIFY_MAX_RUNS_PER_HOUR` budget and charge cap. Only one batch per client runs at once. More checks require pressing **Check more**, labeled as using Apify credits. Results map by route labels rather than output order. Detail-view and search routes share seven-day caches keyed by coordinates rounded to three decimals, Tuesday and departure time; failures cache for five minutes. Actor input support is documented in the [directions actor schema](https://apify.com/rastriq/google-maps-directions-traffic/input-schema).

Only homes with returned numerical commute estimates are verified. Over-limit homes are hidden behind a toggle; unchecked homes are collapsed. Errors/caps never become a passing commute. Estimates describe typical traffic, not guarantees. Bounds and caches are for **one Express process**; this is not a distributed quota system.

## Offline mode and limitations

Set `USE_FIXTURES=true`: no OpenAI, Photon or Apify requests are made by text search. Five saved parser examples are in `server/fixtures/nl-search.json`. The gazetteer covers demo cities, two ambiguous cities, and selected landmarks/addresses. Other offline places ask for clarification; use a known demo city to continue. Property fixtures describe Austin regardless of query location, so an SF radius/commute constraint can correctly leave no matches. Commute fixtures are matched only to their actual route and departure; other homes say **Commute not verified (sample data)**. An Austin query with work in Austin is the useful offline commute demo.

Rules do not offer arbitrary language understanding or typo correction beyond common bedroom misspellings. Vague unknown phrases stay visible; richer language depends on the optional model. Native-only filters are not simulated by fixtures; live source capabilities and missing listing fields still limit filtering. Straight-line commute pruning is a generous heuristic, not a proof of road travel time. Changing the filter fields does not rewrite the original prose; chips show the current canonical values. Existing three-dimensional planner behavior remains unchanged apart from its shared language provider.

Run `npm test`, `npm run build`, `npm run check:secrets`. Develop with `npm run dev` after configuring `server/.env` from the example. No real API calls are made in the new tests.

## Rewrite baseline (2026-10-25)

Before changing the parser: **100/236 (42.37%)** on the labeled corpus, including 40 exact addresses. The runner uses fixture mode, a mocked external place provider and no model or network. Full offline parse-and-resolution P95: 0.380 ms. Run `npm run test:parse:corpus`. Corpus labels cover required constraints and question fields; unknown wording and trace behavior are tested separately.
