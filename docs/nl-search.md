# Plain-text home search

Use **Describe it**, enter up to 500 characters and press Enter or Search. Shift+Enter adds a line. The box also accepts exact addresses. Interpretation chips show the criteria actually sent to search; assumptions, unresolved wording and place questions stay visible. Unknown wording does not block results when a location is known. Choose **Search it as a keyword**, **Ignore it**, or **Edit in filters**. Keywords are offered for the current Zillow/Redfin sources; unsupported filters are still reported per source.

## Examples and semantics

| Category | Examples |
| --- | --- |
| Bare places and word order | `4 bed los angeles`, `los angeles 4 bed`, `los angeles`, `LA 3br 2ba under 1.5m`, `sf condo`, `austin tx 3 bed`, `90210 2 bed`, `downtown LA condo` |
| Aliases | LA, SF, San Fran, NYC, DC, Philly, Vegas, ATX, PDX, OC; Bay Area and Silicon Valley ask for a representative city |
| Landmarks | `houses near UCLA`, `by Golden Gate Park`, `close to Stanford`: surrounding city plus a disclosed default five-mile radius |
| Beds and baths | `4br`, `4bd`, `4 bdrm`, `four bedroom`, `4-bed`, `3+ beds`, `3 or more bedrooms`, `at least 3 beds`, `3bd/2ba`, `2/1`, `2-3 beds`, `exactly 2 beds`, `studio` |
| Price | `under 1.5m`, `<600k`, `<1 million dollars`, `below $1.2M`, `max 750,000`, `no more than 700k`, `budget 800k`, `>=400k`, `750-900k`, `700 to 900k`, `around 500k`, `$1,500,000` |
| Area, lot, age, costs | `1,800 sq ft`, `1.8k sf`, `2000+ sqft`, `8000 sqft lot`, `quarter acre`, `built after 2000`, `newer than 1990`, `older than 1980`, `no HOA`, `HOA under 300` |
| Types | house, single family, SFH/SFR, condo/condominium/co-op, townhome/townhouse, duplex/triplex/fourplex/multifamily, apartment, manufactured/mobile home, land/lot |
| Features and freshness | pool, garage, `2 car garage`, waterfront, ocean view, basement, central air/A/C, single story, fireplace, ADU, backyard, open house, new listings/just listed, price drops/reduced |
| Sort and insights | cheapest first, newest, biggest; good schools, safe, quiet, low flood risk, walkable, near grocery |
| Commute and radius | `<30 minute commute to work at 1 Market St, San Francisco`, `under 25 min drive to Googleplex`, `commute under 45 minutes to UC Berkeley`, `within 5 miles of downtown Oakland` |

N beds/baths means N or more, with an assumption; exactly means min=max. `around` means plus/minus 10 percent. A small number after a price word (`under 600`) means thousands, with an assumption. A bare five-digit number is a ZIP, not a price; `under 90210` is a price. HOA, size, lot, commute and address numerals cannot become price bounds. Bare home/place/property/listing adds no type filter. House/houses does request the house type.

Insights enable modules when a home is opened; they are not hard guarantees or listing filters. Walkable enables the groceries insight as an available proxy, not a Walk Score filter. Missing fields and native-only actor filters remain subject to the existing source disclosures. Only currently for-sale homes appear; pending, sold and coming-soon are recognized but unsupported.

## Pipeline and extension points

1. `src/lib/search/intent.js` classifies intent first. Confident exact addresses bypass the rules extractor, place resolver and ChatGPT. Uncertain street fragments remain address candidates; the existing retry safety nets run in both directions. Address results bypass description criteria.
2. `server/search/nlParser.js` normalizes Unicode/case/whitespace/dashes/operators with original UTF-16 character offsets. Spans consume the working text without changing its length. Specific numeric scopes precede general prices and ZIPs; consumed spans cannot overlap. Number words and price suffixes share deterministic conversion.
3. The exported `vocabulary` table maps phrases to canonical property types, feature fields, insight modules and keywords. Add a synonym there, then add a labeled corpus case and extractor test. Spelling correction uses Damerau-Levenshtein against vocabulary only: one edit for five-to-seven-letter words, two for longer words, and only a unique best match. Corrections are assumptions. Location spelling is handled separately by the place resolver.
4. Matched spans and fillers are removed; contiguous remaining token runs become `leftover`. Place candidates use the longest runs, up to three. Embedded known cities/aliases can split a run so unknown words beside a known city remain visible. Excess runs remain unrecognized rather than disappearing.
5. `server/search/places.js` tries aliases, the offline city/fixture list, then bounded geocoding. It produces canonical city/state or ZIP/county locations, city typo assumptions, ambiguity/region/state-only questions, and landmark radius extras. The server never silently fills a missing location from history. Last location and saved work area are optional buttons.
6. Only unresolved/low-confidence rules results may use ChatGPT. The server validates, merges and re-resolves grounded model-provided place text. Explicit rule values win. All criteria pass the shared allowlist and numeric clamps. Instruction-shaped clauses cannot set model fields.

`understood` contains `{start,end,text,kind,confidence}` spans. Tokens retain original offsets and kinds. `unrecognized` contains `{text,suggestions}` runs. `notApplied` is reserved for recognized requests that cannot be applied. The old unknown-filter dead end has been removed.

### Places and data

`server/search/data/placeAliases.json` holds aliases, region choices and selected landmark/neighborhood reference points. `topCities.json` contains 167 selected US cities, primarily major cities plus explicit ambiguous/demo counterparts, with reference points from the [2024 US Census Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2024.html). These are representative place points, not street geocodes or neighborhood boundaries. Existing demo/reference points are retained in `legacyPlaces.js`; saved normalized place responses are in `server/fixtures/places.json`.

Bare Portland, Springfield and Columbus require a choice. More than one recognized place also requires a choice; no multi-city actor run is launched. State-only input asks for a city. Neighborhood aliases currently search the enclosing city and disclose that expansion; they do not promise precise neighborhood boundaries. The **Change location / not right?** control lets the user correct an assumption.

Administrative geocoding is separate from address autocomplete: [Geoapify](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/) uses `filter=countrycode:us`, `type=locality`, then accepts only city/suburb/district/postcode/county results; Photon is the fallback. Landmark/work/radius point searches can accept address/amenity points. The shared address autocomplete adapter and its typed-input/selection contract remain unchanged.

A parse shares a maximum of three external geocoder HTTP attempts, including fallbacks and commute/radius resolution. Each HTTP request has at most a three-second timeout, shortened to the remaining 2.2-second aggregate geocoding deadline. Three place HTTP requests can run concurrently in one process. Geoapify retains its persisted daily cap. Successful normalized results cache for 30 days, with 1,000-entry bounds and in-flight coalescing, in ignored `server/.cache/places.json` and `place-points.json`. Missing/expired/unavailable results ask for clarification. The budget is shared with a subsequent model-place re-resolution; a fresh clarification request has its own bounded budget.

### ChatGPT selection, validation and privacy

The only AI provider is the existing `server/providers/llm.js` OpenAI provider, shared with furniture extraction. No additional AI service or project dependency was introduced. Rules-complete resolved searches do not call ChatGPT, even when a key is configured. Missing location, unexplained words or low confidence can call it; deliberate place-choice questions already have a deterministic resolution path.

The strict schema adds `unparsedText`, `confidence`, `stateHint`, verbatim `locationText` and optional `normalizedLocation`. The model receives the text, rules-understood criteria/extras, unexplained text, last search location and saved work context. The model does not geocode. State/normalized hints cannot choose an ambiguous city by themselves. Place text must occur in the query and is resolved on the server. Explicit rule numbers win conflicts with an assumption; ungrounded model numbers/keywords are dropped. New numeric values are clamped through `criteria.js`. Unknown structured fields cause fallback.

`OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_MAX_CALLS_PER_HOUR` remain server-only. Responses API calls retain strict Structured Outputs, Ajv validation, `store:false`, eight-second timeout, no SDK retries, 800 output tokens, a shared persisted hourly cap (default 30) and concurrency two. Furniture uses the same cap. Missing key, fixtures, cap, error, timeout, refusal and invalid output preserve the rules result. No key is required. The panel accurately labels `rules` or `rules+openai`.

Parsing is submit-only, limited to 20 requests/minute/client, with a bounded 24-hour in-memory response cache. Original text is included in the presentation cache key so offsets remain correct across whitespace/case variants; the paid model cache uses normalized text plus work/history/model context for 24 hours. Identical in-flight work coalesces. Responses use `Cache-Control: no-store`. Service caches are single-process and clear on restart; persisted geocoder caches and provider budgets survive it.

The browser stores its last five query strings, preferred tab, last selected search area and work preferences locally. Session storage restores text, interpretation, criteria and results on Back to listing without new parsing or actor runs. Unusual text/work context may be sent to OpenAI only on the fallback path; unresolved place/work text may go to geocoders. Ignored server caches can contain place queries, including work addresses. SDK errors, provider URLs, credentials and raw search queries are not logged by this pipeline. The explicit local debug command prints the query supplied by its operator; do not use it for secret text.

## API and debug tools

`POST /api/search/parse` accepts `{text, savedWork?: {label,lat,lng}, lastLocation?: string, debug?: boolean}`. Exact addresses return `{intent:"address",address:{text},confidence,notApplied}`. Descriptions retain the existing criteria/extras/interpretation/assumptions/notApplied/questions shape and add `understood`, `tokens`, `leftover`, `unrecognized`, `parserNote`, place/model traces and keyword capability metadata. `debug:true` adds a diagnostic summary only outside production. The summary includes normalized text, intent, token spans/kinds, rules leftovers, candidate resolution methods, model selection/reason/validated output when called, merge decisions and final values. It never includes environment or provider credentials.

`POST /api/search/resolve` still accepts `{parsed,field,choice}` for `location`, `work` or `radius`; a choice is offered coordinates or new text. Coordinate objects must exactly match an offered candidate; arbitrary coordinate injection is rejected. Questions are `{field,message,options:[{label,lat,lng}]}`. Choosing a place automatically continues search when all required questions are resolved.

`POST /api/search/described` remains the existing bounded search/merge pipeline with for-sale-only filtering. `POST /api/search/address`, `/api/autocomplete` and their existing sale/typed-input behavior are unchanged. Radius is straight-line haversine distance; missing coordinates are excluded and counted. Commute requests driving routes for next Tuesday at the chosen departure (default 08:00). `arrive by` is disclosed as departure planning.

Commute searches retain `COMMUTE_SEARCH_LIMIT=30` per source (maximum 50), `COMMUTE_VERIFY_LIMIT=8` per batch (maximum 12), existing actor quotas/charge caps, one batch/client and actor concurrency two. **Check more** uses another bounded paid batch. Rounded-coordinate/time route caches last seven days; failures cache five minutes. Unknown routes never become passing commutes. These filters remain separate from insight preferences.

```sh
npm run debug:parse -- "4 bed los angeles"
npm run test:parse:corpus
npm test
npm run build
npm run check:secrets
```

The scripts use Node APIs and package scripts, with no Unix-shell dependencies; they work from a quoted Windows workspace path. The debug command uses current provider configuration. To force offline diagnostics, set `USE_FIXTURES=true` in the shell or ignored server environment file before running it. The corpus and regression tests inject offline place/model doubles and never call real APIs.

## Measured results and regression coverage

The fixed labeled corpus at `server/tests/fixtures/nlCorpus.json` has **236 cases**, including **40 exact addresses** and all requested language categories. Labels check intent and canonical criteria/extras subsets, location text, and required question fields. Corpus accuracy is a deterministic constraint/intent metric; it is not a claim about live listing availability or arbitrary language.

| Measurement | Before | After |
| --- | ---: | ---: |
| Cases passing | 100 / 236 | 236 / 236 |
| Pass rate | 42.37% | 100% |
| OpenAI calls in final corpus | — | 0 |
| Pure rules P95 | not separately recorded | 0.487 ms |
| Full offline parse + place resolution P95 | see baseline JSON | 5.905 ms |
| Full offline maximum | see baseline JSON | 18.582 ms |

These are local Node 24 measurements without network, stored in `docs/nl-search-baseline.json` and `nl-search-final.json`. They exclude provider latency and module loading. No live-geocoder P95 is claimed; the 2.2-second aggregate budget is a designed ceiling for geocoding waits, and the 2.5-second no-model P95 remains a deployment target to validate under real load. Tests guard at least 95 percent corpus accuracy, under-100-ms rules P95 and under-2.5-second offline pipeline P95.

Tests also cover original spans/Unicode/typos, price-vs-ZIP/HOA/bed scope, aliases and ambiguous/state/region questions, landmarks, unknown actions and saved state, selective mocked ChatGPT calls, merge precedence, schema rejection, clamps, injection-shaped input, failure/cap/timeout fallback, caching, exact addresses with units/directionals/ordinals, both retry paths, for-sale-only results and the unchanged autocomplete reducer contract. Browser checks cover the formerly failing example, unknown Ignore action, missing/ambiguous location choices and responsive clarification controls at 360px.

## Offline mode and limits

With `USE_FIXTURES=true`, parsing and place resolution use only aliases, cities and saved reference points. Corpus examples need no credentials or network. Listings remain saved Austin data regardless of the query location, which is disclosed in the UI. An LA/SF radius can therefore correctly exclude all Austin fixtures. Separate address autocomplete retains its pre-existing fixture/live-fallback policy.

The vocabulary and offline city list are finite; unusual names need a live geocoder or explicit clarification. County/neighborhood coverage is not a parcel boundary service. Word spelling correction is conservative and short words are not corrected. Keywords and some features depend on the source actor; unsupported native filters are reported. The model has a finite output budget and can fall back on complex input. Actual listing freshness, photos, geocoder coverage and source outages remain outside the parser's accuracy metric. No real API or paid actor was called to validate this rewrite.
