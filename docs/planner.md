# Try Your Furniture

Open a listing popup and choose **Open 3D room planner**, or use its card's **3D** shortcut. `/planner` offers favorites, a custom home, saved layouts, and the demo. `/planner/demo` works without provider keys; its initial seven catalog items also work if the API is unavailable.

Every house is labelled **Estimated layout, not the real floor plan**. This is a planning aid, not a reconstruction from listing photos. Measure rooms, doors, stairs, and furniture before buying or moving anything.

## Generator and units

`src/lib/planner/houseGenerator.js` is pure and deterministic. A hash of the home ID chooses a 1.2–1.6 footprint aspect ratio. Area is clamped to 250–8,000 square feet, bedrooms to 0–10, bathrooms to 1–8, and stories to 1–3. Missing inputs use 1,500 sqft, three bedrooms, two bathrooms, and one story. Zero bedrooms creates a studio with a kitchen area and bathroom.

Each floor partitions its area into two exterior-facing room bands around a connecting hallway. Room weights allocate living, kitchen, dining, bedroom, and bathroom areas. Multi-story bedrooms go on the second floor; additional floors have flex space. Door records connect rooms to the hallway and include an exterior entrance. Windows sit on exterior walls. Rooms below minimum dimensions are flagged **Tight**, rather than silently making the footprint larger.

Storage coordinates use inches: X runs across the plan, Z runs down it, and furniture positions are footprint centers. The Three.js scene uses feet. Rotation is stored in degrees. Room editing supports feet/inches and centimeters. Fixed dimensions repack rooms along a hallway and may change the total area and exterior shape. Existing furniture stays in place and warnings identify invalid positions. Reset restores the generated layout. `roomDimensions: [{name,widthIn,depthIn}]` is used when supplied and matched by room name; those dimensions are labelled from listing data. Most providers do not supply it.

Custom homes can supply up to 20 explicit rooms as `name, width feet, depth feet`, one per line. These rooms are packed along a hallway. Stair space is represented by the hallway label; stairs are not modelled or checked for moving clearance.

## Interaction and collision model

The 2D orthographic view pans and zooms; the 3D perspective view orbits. Below 768px, 2D is the default. Furniture is made from simple local primitives with no downloaded models or textures. Low quality is the default; high enables shadows. Pixel ratio is capped at two. React Three Fiber disposes declarative geometry/material resources on unmount. Camera focus changes are immediate, including for reduced-motion users.

Drag furniture or use inspector position controls. Mobile users first select an item, then drag. Grid snapping defaults to three inches; optional wall snapping applies within two inches. Imperative transforms during dragging avoid React updates per pointer move; pointer release records one undo step. Library items can be dragged into the scene on desktop or added with **Add to room**.

The separating-axis test compares oriented rectangular floor footprints. It checks other furniture, wall segments excluding door openings, and 36-inch clearance zones on both sides of doors. Rugs are excluded. Collisions tint items red and appear in the warnings panel; placement remains allowed. This is a conservative footprint approximation, not a 3D geometry intersection or accessible-route certification. Sectionals and decor use their full rectangular envelope. Oversized items are warned about even when they cannot fit within the outer footprint.

Arrow keys move one inch (Shift: six), brackets rotate 15 degrees (Shift: 90), Delete removes, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, and Escape clears selection. The inspector supplies equivalent buttons. History keeps 50 edits per session. PNG export includes the canvas and estimate watermark; HTML room labels are not part of the PNG.

## Furniture and resolution

IKEA description search now connects to the user's IKEA furniture finder actor,
then reads available product dimensions and offers **Save and place in house**.
Missing measurements must be entered, and the actor's ranking score is never
displayed as a confidence percentage. See [IKEA integration](ikea-furniture.md)
for configuration, recorded sample behavior and the prepared actor revision.

Choose among 30 catalog items or add a name, product URL, manually measured item, or up to ten lines in bulk. Every resolved item opens an editable native confirmation dialog before being saved to the library. Catalog sizes and AI guesses are estimated. Product dimensions come from the page you link and must be verified on the retailer's site; text extraction can mistake axis order or packaging dimensions.

Fixture URLs:

- `https://example.com/sofa`
- `https://example.com/queen-bed`
- `https://example.com/desk`

With `USE_FIXTURES=true`, these return sample dimensions. Other URLs get labelled local heuristics without DNS, web, OpenAI, or Apify requests. Without a server, names and manual forms still work locally; live URL reading is unavailable.

## Storage and API

All routes require the same `X-Client-Id` UUID used for favorites. This is browser-scoped anonymous storage, not account authentication. Losing the ID loses access to its server-side records. Do not store private information in furniture names or product URLs. Product URLs are sent to their host, and may be sent to configured Apify and OpenAI services; OpenAI receives at most 6,000 characters of extracted product content, never the API key in browser code.

`GET/POST /api/furniture`, `PATCH/DELETE /api/furniture/:id`, and `POST /api/furniture/resolve` manage the shared library. Each definition has `id`, `name`, `category`, `widthIn`, `depthIn`, `heightIn`, `color`, `imageUrl`, `sourceUrl`, `source`, `estimated`, and `createdAt`. The library cap is 50. Definitions used by a saved layout cannot be deleted until those placements are removed.

`GET /api/planner/layouts` and `GET/PUT/DELETE /api/planner/layouts/:homeId` manage up to ten layouts. A layout contains `homeId`, `homeSnapshot`, `roomOverrides`, `placements`, and `updatedAt`. Placements contain `id`, `furnitureId`, `level`, `xIn`, `zIn`, `rotationDeg`, optional `colorOverride`, and optional dimension overrides. Each layout permits 80 placements. Request JSON is capped at 200 KB. Validators whitelist fields, bound numbers, and reject invalid IDs.

`server/data/furniture.json` and `server/data/layouts.json` use the shared atomic JSON write queue also used by favorites. Run one Express process per data directory. This is a hackathon store, not a multi-process database. Favorites remain capped at five; removing a favorite does not delete layouts. Delete old layouts from the chooser when the cap is reached.

Edits are backed up immediately to localStorage and autosaved after 650ms. The UI distinguishes **Saved**, **Saving...**, **Saved locally only**, and failed local storage. Unsynced local layouts take precedence on reload. If both browser storage and the server are unavailable, keep the page open until saving works. Search criteria, results, selection, scroll, and home snapshots live in sessionStorage with a 24-hour expiry, so returning to search restores results without rerunning actors.

## Verification

Run `npm test`, `npm run check:secrets`, and `npm run build`. Node's existing test runner directly imports the pure front-end planner modules, avoiding an additional test runtime. Tests cover generation across hundreds of inputs, SAT, history, catalog parsing, snapshots, SSRF and redirect rejection, extraction fixtures, output validation, atomic writes, and storage caps. Live paid provider calls are deliberately not part of the suite.

Browser smoke checks should cover demo 2D/3D, add/confirm/place, collision warnings, undo/redo, reload, image export, listing popup -> planner -> Back, and a narrow viewport. WebGL is required for the interactive canvas.
