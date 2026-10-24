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

Uses the private actor's version `0.7`, pinned to successful build `0.7.1`, with `{ address }`. The input schema and an existing successful run were checked on October 24, 2026 without launching a paid run. Scores now use a relative scale across cities in the same state (0–10); the actor's `scoreNote` explains the comparison and is displayed on the site. Existing project credentials can access it.

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

Photon's added place-resolution mode accepts city and landmark results while the existing house-address autocomplete remains unchanged. Ambiguous/missing places produce inline questions. Radius filtering is haversine distance with counts for unavailable coordinates.

The directions actor supports multiple labelled routes per run. Search checks at most `COMMUTE_VERIFY_LIMIT=8` (hard 12) of `COMMUTE_SEARCH_LIMIT=30` candidates per source (hard 50). Actor concurrency is 2, with one commute batch in flight per client. Search and detail modules share rounded-coordinate, Tuesday/departure route caching for seven days; failures cache five minutes. All runs count against the existing Apify cap, with no quota bypass on Check more. Results are mapped by label; missing routes remain unverified. Fixtures match saved route coordinates and time exactly.
