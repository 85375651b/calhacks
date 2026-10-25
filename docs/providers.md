# Actor review — Phase 4

Read the public default-build README and input schema on October 24, 2026. Settings are in `server/config/apify.js`; adapters intentionally expose only documented fields.

## benthepythondev/zillow-scraper

Input fields: `locations`, `listingType`, `maxResults`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `homeTypes`, `daysOnZillow`, `includeDetails`.

[README and schema](https://api.apify.com/v2/acts/benthepythondev~zillow-scraper/builds/default)

## brilliant_gum/redfin-scraper

Input fields: `locations`, `searchMode`, `maxListings`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `propertyTypes`, `minSqFt`, `maxSqFt`, `minYearBuilt`, `maxDaysOnMarket`, `maxHOA`, `isNewConstruction`, `sortOrder`, `soldWithin`.

[README and schema](https://api.apify.com/v2/acts/brilliant_gum~redfin-scraper/builds/default)

## crawlerbros/google-maps-directions

Public build was not accessible (403).

[README and schema](https://api.apify.com/v2/acts/crawlerbros~google-maps-directions/builds/default)

## fatihtahta/zillow-property-scraper

Input fields: `location`, `deal_type`, `sort_by`, `min_price`, `max_price`, `min_monthly_payment`, `max_monthly_payment`, `bedroom_count`, `bathroom_count`, `property_type`, `max_hoa`, `listing_type`, `listing_status`, `tours`, `min_parking`, `closed_garage`, `min_floor_area`, `max_floor_area`, `min_land_area`, `max_land_area`, `min_building_year`, `max_building_year`, `basement`, `single_story`, `55_plus_communities`, `amenities`, `view`, `commute_time`, `price_reduced`, `publication_date`, `keyword`, `url`, `maximize_coverage`, `enrich_data`, `mcpConnectors`, `limit`.

[README and schema](https://api.apify.com/v2/acts/fatihtahta~zillow-property-scraper/builds/default)

## gio21/redfin-scraper

Input fields: `searchUrls`, `listingType`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `minSqft`, `maxItems`, `proxyConfiguration`, `debug`.

[README and schema](https://api.apify.com/v2/acts/gio21~redfin-scraper/builds/default)

## hichemdev/redfin-scraper

Input fields: `regionId`, `regionType`, `listingType`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `searchUrls`, `maxProperties`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/hichemdev~redfin-scraper/builds/default)

## johnvc/google-maps-directions-api

Input fields: `start_addr`, `end_addr`, `start_coords`, `end_coords`, `start_data_id`, `end_data_id`, `travel_mode`, `distance_unit`, `avoid_tolls`, `avoid_highways`, `avoid_ferries`, `transit_prefer`, `transit_routing`, `time_type`, `time_value`, `hl`, `gl`.

[README and schema](https://api.apify.com/v2/acts/johnvc~google-maps-directions-api/builds/default)

## Neighborhood Crime Safety (QMw7eHkWvgqxhnd0C)

Uses the private actor's version `0.7`, pinned to successful build `0.7.1`, with `{ address }`. The input schema and an existing successful run were checked on October 24, 2026 without launching a paid run. Scores now use a relative scale across cities in the same state (0–10); the actor's `scoreNote` explains the comparison in the API response but is not displayed in the safety panel. Existing project credentials can access it.

Output `type: address-safety-score` provides `safetyScore` (0–10, higher is safer), `violentPer100k`, `population`, `nationalGrade`, `stateGrade`, `latestYear`, and `scoreNote`. These are SpotCrime city-level figures, not street or ZIP-level assessments. `not-covered`, `error`, and empty datasets show unavailable. No fallback to the previous crime actor is used.

Schema/source and saved successful output were inspected through the authenticated Apify API on October 24, 2026. No new paid run was launched for this integration. Cache keys include the actor/build and address to avoid reusing old CrimeGrade results. Favorite snapshots retain the new fields and discard old crime snapshots when saved.

[Actor source](https://console.apify.com/actors/QMw7eHkWvgqxhnd0C/source)

## lukass/zillow-scraper

Input fields: `search`, `startUrls`, `zpids`, `type`, `priceMin`, `priceMax`, `bedsMin`, `bedsMax`, `bathsMin`, `homeTypes`, `sqftMin`, `sqftMax`, `lotSizeMin`, `lotSizeMax`, `yearBuiltMin`, `yearBuiltMax`, `daysOnZillowMax`, `keywords`, `showOnly`, `amenities`, `parkingSpotsMin`, `basementStatuses`, `viewTypes`, `hoaMaxPerMonth`, `includeHomesWithNoHoaData`, `includePending`, `includeForeclosed`, `includePreforeclosure`, `pets`, `rentalAmenities`, `availableFrom`, `excludeSeniorCommunity`, `sortOrder`, `sortAscending`, `maxItems`, `maxSplitLevel`, `proxy`, `debugLog`.

[README and schema](https://api.apify.com/v2/acts/lukass~zillow-scraper/builds/default)

## malonestar/fema-nri-county-risk-profile

Input fields: `assets`, `resolution`, `states`, `counties`, `maxResults`.

[README and schema](https://api.apify.com/v2/acts/malonestar~fema-nri-county-risk-profile/builds/default)

## mangudai/redfin-real-estate-scraper

Input fields: `startUrls`, `maxItemsPerRegion`, `maxItems`, `propertyTypes`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minYearBuilt`, `maxDaysOnMarket`, `keyword`, `includeDescription`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/mangudai~redfin-real-estate-scraper/builds/default)

## rastriq/google-maps-directions-traffic

Input fields: `routes`, `travelModes`, `timeMode`, `travelDate`, `travelTime`, `routesBulk`, `origins`, `destinations`, `directionsUrls`, `trafficProfileStartDate`, `trafficProfileEndDate`, `trafficProfileWeekdays`, `trafficProfileStartTime`, `trafficProfileEndTime`, `trafficProfileInterval`, `avoidTolls`, `avoidHighways`, `avoidFerries`, `transitTypes`, `transitRoutePreference`, `maxRoutes`, `outputFormat`, `includeSteps`, `stepsForAllRoutes`, `includePolyline`, `includeDetailedPolyline`, `includeSpeedProfile`, `includeStreetView`, `language`, `countryCode`, `fixAmbiguousPlaces`, `maxResults`, `maxConcurrency`, `proxyConfiguration`, `dateTime`, `trafficProfileDates`, `trafficProfileIntervalMinutes`, `debug`.

[README and schema](https://api.apify.com/v2/acts/rastriq~google-maps-directions-traffic/builds/default)

## rl1987/redfin-api-scraper

Input fields: `location`, `status`, `soldWithinDays`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `includeDetails`, `maxItems`, `propertyTypes`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/rl1987~redfin-api-scraper/builds/default)

## scrapesage/zillow-scraper

Input fields: `locations`, `zipCodes`, `searchUrls`, `propertyUrls`, `startUrls`, `listingType`, `forSaleByOwnerOnly`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minYearBuilt`, `maxYearBuilt`, `homeTypes`, `daysOnZillow`, `sort`, `includePropertyDetails`, `extractAgentLeads`, `maxPhotosPerListing`, `maxResults`, `maxResultsPerSearch`, `maxRunSeconds`, `detailConcurrency`, `deduplicateResults`, `monitorMode`, `monitorStoreName`, `proxyConfiguration`, `urlsFromFile`.

[README and schema](https://api.apify.com/v2/acts/scrapesage~zillow-scraper/builds/default)

## silentflow/zillow-scraper

Input fields: `location`, `locations`, `startUrls`, `locationType`, `operation`, `maxItems`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `homeTypes`, `sortBy`, `fetchDetails`, `debugMode`.

[README and schema](https://api.apify.com/v2/acts/silentflow~zillow-scraper/builds/default)

## solidcode/redfin-scraper

Input fields: `searchUrls`, `regionId`, `areaType`, `listingStatus`, `propertyTypes`, `maxItems`, `enrichDetails`, `concurrency`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/solidcode~redfin-scraper/builds/default)

## steadyscrape/zillow-scraper

Input fields: `locations`, `listingType`, `searchUrls`, `propertyUrls`, `includeDetails`, `maxItemsPerSearch`, `fullCoverage`.

[README and schema](https://api.apify.com/v2/acts/steadyscrape~zillow-scraper/builds/default)

## TopApi/zillow-scraper

Input fields: `searchLocation`, `listingStatus`, `searchUrls`, `startUrls`, `zipCodes`, `zpids`, `addresses`, `mapBounds`, `latitude`, `longitude`, `distanceMiles`, `searchResultsDatasetId`, `sortBy`, `homeTypes`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minLotSize`, `maxLotSize`, `minYearBuilt`, `maxYearBuilt`, `maxHoaFee`, `daysOnZillow`, `keywords`, `listingTypes`, `mustHave`, `views`, `parkingSpots`, `customFilterState`, `minDaysOnZillow`, `withZestimateOnly`, `withPhotosOnly`, `includeDetails`, `includeZestimateHistory`, `monitorMode`, `trackPriceChanges`, `monitorStoreName`, `maxResults`, `maxResultsPerSearch`, `extractionMethod`, `compact`, `flatOutput`, `proxyConfiguration`, `maxConcurrency`.

[README and schema](https://api.apify.com/v2/acts/TopApi~zillow-scraper/builds/default)

## Small live comparison

All search runs used Austin, TX and a five-row cap without optional full detail. Initial requests rejected before launch by the account concurrency limit were retried serially; the application now limits actor concurrency to three.

| Actor                        | Result | Elapsed | Decision                                                                     |
| ---------------------------- | ------ | ------- | ---------------------------------------------------------------------------- |
| TopApi/zillow-scraper        | 5 rows | 5.4 s   | Chosen: broad filters, fractional baths, search URLs and details for schools |
| lukass/zillow-scraper        | 5 rows | 11.2 s  | Worked; fewer status options, integer bath schema, slower                    |
| brilliant_gum/redfin-scraper | 5 rows | 9.6 s   | Chosen: broad size, HOA and construction filters; accepts URLs               |
| rl1987/redfin-api-scraper    | 5 rows | 7.0 s   | Worked; narrower filters, no documented URL input                            |

Search field coverage is documented in the README. Redfin chosen actor only resolves a documented subset of city names directly; other areas should use a Redfin URL. No actor is silently run for an unchecked source.

## Insight verification

- Neighborhood Crime Safety build `0.7.1` (version `0.7`): verified its address-only input and saved successful output (Vernon Hills, IL: 9.5, relative to 214 Illinois cities). Automated tests cover input formatting, score/rate handling, unavailable results, and saved favorite fields; no new paid run was launched.
- FEMA actor succeeded at census-tract resolution. The direct public point-query fallback also returned both demo homes’ tracts.
- TopApi detail mode returned three public schools and extra photo URLs for each of the two overlapping properties.
- johnvc returned different 8 AM / 3 AM durations, but its output arrival times showed that timezone-offset ISO input was interpreted incorrectly. Rastriq was tested separately with origin-local time. It returned 35 vs 20 minutes, with matching local arrival times, and was selected. Crawlerbros public build returned 403; it was not run.
- Overpass main and Kumi mirror timed out/unreachable in this environment. Live requests show unavailable; grocery fixtures explicitly name illustrative example stores.

[RentCast sale-listing parameters](https://developers.rentcast.io/reference/sale-listings) · [FEMA tract service](https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0)

## Furniture product dimensions

`POST /api/furniture/resolve` accepts a query or HTTPS URL. Names use catalog matching and explicit dimension parsing, then optional OpenAI estimates, then a labelled generic preset. URLs first use a 10-second, 2-MB HTML-only fetch with DNS/IP validation, pinned public addresses, and at most five revalidated redirects. Private, loopback, link-local, mapped, metadata, and reserved address ranges are rejected. Credentials and non-default ports are rejected.

JSON-LD Product fields and additionalProperty measurements take priority. Open Graph supplies title/image fallbacks. Nearby dimension text supports inches, feet, centimeters, and millimeters. The confirm dialog always asks users to verify measurements on the retailer's site.

Optional OpenAI uses the shared provider in `server/providers/llm.js`: official `openai` SDK, Responses API, strict JSON Schema with local Ajv validation, 800 output tokens, an eight-second timeout, no SDK retries and `store: false`. At most two calls run concurrently with a shared persisted rolling hourly cap (default 30). Default model: `gpt-4.1-mini`, verified in the [official model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Product content is untrusted data capped at 6,000 characters. Missing keys, failures and caps fall back to heuristics.

Optional `ENABLE_FURNITURE_APIFY=true` uses [Apify Cheerio Scraper](https://apify.com/apify/cheerio-scraper/input-schema), a raw HTTP actor that avoids browser-rendering costs. It uses one start URL, one page/result, one concurrency slot, no retries, no link following, disabled redirects, and the existing global actor concurrency/hourly/charge guards. Unsafe local URLs are never passed to the actor. Fallback is further limited to known retailer domains (IKEA, Wayfair, Target, Walmart, Amazon, West Elm, Crate and Barrel, Article, Room & Board, Home Depot, and Lowes); arbitrary hosts use direct safe fetch or manual fallback. Live execution remains provider-dependent and has not been exercised by automated tests.

Successful resolutions cache for seven days by normalized URL/query and coalesce concurrent requests. Resolution is limited to ten requests per minute per anonymous client. Fixture mode bypasses all external calls, using the three sample URLs in the planner guide and local estimates for other input. The library and planner do not require OpenAI or Apify.

## Natural-language search and shared commute routes

See [Describe it](nl-search.md) for the API, phrase table, cache/privacy behavior and limitations. The OpenAI Responses provider in `server/providers/llm.js` is the only OpenAI caller and is shared with furniture extraction. Strict JSON Schema and Ajv reject unknown fields; canonical validation clamps accepted values; rules cross-check explicit numeric preferences. Parsing uses a bounded 24-hour in-memory cache and a 20/minute client limit. No key or fixture mode uses deterministic rules.

Place-resolution mode accepts city and landmark results; the shared address autocomplete uses the adapters described below. Ambiguous/missing places produce inline questions. Radius filtering is haversine distance with counts for unavailable coordinates.

The directions actor supports multiple labelled routes per run. Search checks at most `COMMUTE_VERIFY_LIMIT=8` (hard 12) of `COMMUTE_SEARCH_LIMIT=30` candidates per source (hard 50). Actor concurrency is 2, with one commute batch in flight per client. Search and detail modules share rounded-coordinate, Tuesday/departure route caching for seven days; failures cache five minutes. All runs count against the existing Apify cap, with no quota bypass on Check more. Results are mapped by label; missing routes remain unverified. Fixtures match saved route coordinates and time exactly.

## Address search and autocomplete

`POST /api/search/address` accepts `{text}` or a complete structured `{selected: {line1,city,state,zip,lat,lng}}`, plus optional bias/savedWork coordinates. Responses distinguish `for_sale`, `not_for_sale`, `ambiguous`, and `not_found`. Only `for_sale` includes listings. Provider failures explain that an active listing could not be confirmed rather than asserting the property is definitively off market. The legacy GET `/api/lookup` production route uses this same pipeline. Every home search route filters at its response boundary.

Resolution uses up to five complete US candidates. Census verifies candidates before selection; multiple locations require a choice unless a supplied ZIP identifies one verified result. Structured selection skips forward search. Sale checks use recent search caches, then one [RentCast sale-listing request](https://developers.rentcast.io/reference/sale-listings) with the full `address`, `status=Active`, and `limit=50`, then at most one existing Zillow search actor if enabled. The exact normalized street number/name and ZIP must match; an entered unit must also match. Omitting the unit can return multiple active units. Photo enrichment happens after display, and only exact-address active-sale enrichment is accepted. This extra optional enrichment can consume an additional globally capped actor run.

### Provider behavior and limits

- [Geoapify autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/): `filter=countrycode:us`, `format=json`, `lang=en`, limit 12 before local filtering, and optional `bias=proximity:lon,lat`. Building/address results require number, street, city, state, ZIP, valid coordinates and confidence **≥0.6**. Streets/cities are offered before a house number. `AUTOCOMPLETE_PROVIDER=photon` bypasses Geoapify; `auto` and `geoapify` fall back on missing key, error, empty acceptable results or exhausted cap. The persisted UTC daily cap defaults to 2,500 and clamps to 0–2,500.
- [Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md): US-only, house layer for numbered input, optional lat/lon bias. Complete house results receive a local **0.75 quality score**, not provider confidence. Results with a different number or unrelated street prefix are discarded. This rule was tightened after the live probe exposed unrelated results.
- Both adapters collapse punctuation/spacing, expand suffixes and directionals, preserve ordinals, separate/re-attach units, dedupe normalized full addresses and return at most six. Prefix/number relevance precedes a known-for-sale badge boost; confidence and distance break remaining ties. Badges never filter out ordinary address suggestions.
- Autocomplete has a five-second timeout per attempted provider, a ten-minute cache by normalized query/unit and 0.01-degree bias cell, in-flight dedupe, and 30 requests/client/minute. Geoapify failure plus Photon fallback can take up to ten seconds. Home only requests suggestions for address-like text.
- [US Census Geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html): `locations/onelineaddress`, `benchmark=Public_AR_Current`, `format=json`. A single exact street/ZIP match standardizes the address; unit text is retained but is **not independently verified**. Six-second timeout, seven-day successful/no-match cache, one-minute transient-failure cache, unverified fallback on errors. The standalone verification endpoint allows 30/client/minute.
- Address checks: 20/client/minute; three concurrent lookups with a bounded queue of 30; one-hour positive/negative cache and in-flight dedupe. Recent-cache hits retain the original status-check time and remaining TTL. Failed sources cache only one minute. `RENTCAST_ADDRESS_MAX_REQUESTS_PER_DAY` defaults to 100, clamps to 0–1,000, and reserves a persisted daily slot before each address-only request. Existing criteria searches retain their own limits. All actor checks honor `ENABLE_APIFY`, fixture mode, and the shared `APIFY_MAX_RUNS_PER_HOUR`.
- Persistence and concurrency guards target one Express process. Run one instance per cache directory; these JSON guards are not a distributed quota service. Cache/data files remain ignored.

### Sale status mapping

Observed fixtures contain Zillow `forSale`/`other`, Redfin `Active`/`Coming Soon`, and RentCast `Active`/`Inactive`. Canonical statuses are `for_sale`, `coming_soon`, `pending`, `sold`, `off_market`, `for_rent`, and `unknown`; only `for_sale` is displayable. Explicit FSBO/agent sale labels are active. New construction and bank-owned property attributes do not independently prove active status. Pending/under-contract/contingent, rental-price flags, sold dates, removed dates and off-market text override active/unknown labels. Zillow `other` remains unknown and is accepted only in a known sale query with no contradictory signal. Mixed-status fixtures test this policy; no negative listing details are sent to the client. Favorites are intentionally exempt.

### Live probe observations — 2026-10-24

Ran `node server/scripts/probeAutocomplete.js --all` against all nine public queries below. Geoapify had no configured key for every query, so **0.6 is provisional and has not been calibrated against live Geoapify output**. These are connection observations from this run, not claims of address nonexistence.

| Query                          | Photon observation                                                                                       | Census observation                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 147 midway lane                | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 1600 pennsylvania ave          | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 350 5th ave                    | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 742 evergreen                  | HTTP 200: Evergreen Place (Ohio), Court (Illinois), Avenue (New York), plus unrelated 7421 Mazama Street | Illinois and New York matched; Ohio unverified; unrelated result timed out |
| 12 oak st apt 3                | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 100 n main                     | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 111 s grand ave los angeles ca | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 5101 trail west dr austin tx   | Five-second connection/timeout failure                                                                   | No candidates to verify                                                    |
| 400 broad st seattle wa        | HTTP 200: 400 Broad Street and unrelated 400 North 117th Street                                          | Both independently verified as real addresses                              |

The unrelated results demonstrate why geocoding verification alone does not establish query relevance. The final filter rejects the Mazama and North 117th results before verification/lookup. Sanitized successful suggestions are saved in `server/fixtures/autocomplete-examples.json`; fixture addresses in `address-fixtures.js` are explicitly illustrative. Missing ZIP/house numbers are never invented. No paid sale lookup was used for this probe.

Known limits: Photon US house coverage and latency remain uneven; short queries can require a city/ZIP. Census interpolates address locations and does not establish parcel boundaries, apartment existence, or listing availability. Source outages can prevent confirmation of an active listing. Status reflects the check time, not a continuous MLS feed. The UI keeps these states distinct and shows no home facts when sale status cannot be established.
