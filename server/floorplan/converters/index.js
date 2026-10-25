import { generateHouse } from "../../../src/lib/planner/houseGenerator.js";
import { validateHouseModel } from "../../../src/lib/planner/validateHouseModel.js";
import { createCubicasaConverter } from "./cubicasa.js";
export class NotImplementedError extends Error {
  constructor() {
    super("Floor plan conversion is coming soon.");
    this.name = "NotImplementedError";
  }
}
/**
 * Converter contract (server-only paths and trusted normalized assets):
 * convert({asset:{assetId,pngPath,widthPx,heightPx,floorLabel,detectedLabels},
 * calibration:{pixelsPerInch,rotationDeg},ceilingHeightIn,listingFacts})
 * => Promise<{houseModel,confidence:0..1,warnings:string[]}>.
 * HouseModel source="floorplan"; all geometry in inches, top-left origin,
 * +x right and +z down AFTER rotation. estimated=false only with confidence.
 * No converter may fetch untrusted output URLs or expose pngPath to the client.
 *
 * TODO auto pipeline, deliberately NOT implemented:
 * 1. Rotate the normalized PNG and retain the pixel-to-inch transform.
 * 2. Detect wall centerlines/thickness; reconcile intersections and outer shell.
 * 3. Segment enclosed rooms; reject overlaps, disconnected slivers and bad bounds.
 * 4. Detect doors and window openings, attach them to shared room boundaries.
 * 5. Assign Actor OCR room labels/dimensions using spatial evidence; flag ambiguity.
 * 6. Compare summed area with listing sqft and calibration; report inconsistencies.
 * 7. Produce rooms/doors/windows in the shared HouseModel coordinate space.
 * 8. Validate geometry and references; return confidence and actionable warnings.
 * Human verification remains necessary. OCR never overrides explicit calibration.
 */
export function createConverterRegistry(extra = {}) {
  const entries = new Map([
    [
      "auto",
      {
        label: "Automatic floor plan conversion",
        stub: true,
        imageBased: true,
        convert: async () => {
          throw new NotImplementedError();
        },
      },
    ],
    [
      "cubicasa", createCubicasaConverter(),
    ],
    [
      "estimated-layout",
      {
        label: "Estimated layout",
        stub: false,
        imageBased: false,
        convert: async ({ listingFacts, ceilingHeightIn }) => ({
          houseModel: {
            ...generateHouse(listingFacts || {}),
            ceilingHeightIn,
            source: "estimated",
            estimated: true,
          },
          confidence: 0,
          warnings: [
            "Estimated from listing facts; image geometry was not analyzed.",
          ],
        }),
      },
    ],
    ...Object.entries(extra),
  ]);
  return {
    list: () =>
      [...entries].map(([id, c]) => ({
        id,
        label: c.label || id,
        stub: c.stub === true,
        imageBased: c.imageBased === true,
        automaticScale: c.automaticScale === true,
      })),
    async convert(name, input) {
      const entry = entries.get(name);
      if (!entry) throw Error("Unknown converter.");
      const r = await entry.convert(input),
        houseModel = validateHouseModel(r.houseModel);
      if (entry.imageBased && houseModel.source !== "floorplan")
        throw Error("Converter returned the wrong coordinate source.");
      return {
        houseModel,
        ...(r.calibration ? { calibration: r.calibration } : {}),
        confidence: Number.isFinite(r.confidence)
          ? Math.max(0, Math.min(1, r.confidence))
          : 0,
        warnings: Array.isArray(r.warnings)
          ? r.warnings
              .slice(0, 20)
              .filter((w) => typeof w === "string")
              .map((w) => w.slice(0, 300))
          : [],
      };
    },
  };
}
export const converters = createConverterRegistry();
