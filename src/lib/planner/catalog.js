export const categories = [
  "seating",
  "table",
  "bed",
  "storage",
  "desk",
  "rug",
  "decor",
];
const rows = [
  ["2-seat sofa", "seating", 64, 36, 34],
  ["3-seat sofa", "seating", 84, 36, 34],
  ["Sectional", "seating", 108, 72, 34],
  ["Armchair", "seating", 34, 34, 36],
  ["Coffee table", "table", 48, 24, 18],
  ["Side table", "table", 22, 22, 24],
  ["TV stand", "storage", 60, 18, 24],
  ["Bookshelf", "storage", 32, 12, 72],
  ["Dresser", "storage", 60, 20, 34],
  ["Nightstand", "storage", 24, 18, 24],
  ["Twin bed", "bed", 42, 80, 42],
  ["Full bed", "bed", 58, 80, 42],
  ["Queen bed", "bed", 64, 84, 44],
  ["King bed", "bed", 80, 84, 44],
  ["Desk", "desk", 60, 30, 30],
  ["Office chair", "seating", 26, 26, 42],
  ["Dining table 4 seat", "table", 48, 36, 30],
  ["Dining table 6 seat", "table", 72, 36, 30],
  ["Dining chair", "seating", 20, 22, 36],
  ["Bar stool", "seating", 18, 18, 30],
  ["Wardrobe", "storage", 48, 24, 78],
  ["Console table", "table", 48, 14, 30],
  ["Rug 5x8", "rug", 60, 96, 1],
  ["Rug 8x10", "rug", 96, 120, 1],
  ["Floor lamp", "decor", 16, 16, 64],
  ["Plant", "decor", 20, 20, 42],
  ["Bench", "seating", 48, 18, 20],
  ["IKEA Kallax", "storage", 57.875, 15.375, 57.875],
  ["Ottoman", "seating", 28, 24, 18],
  ["Round table", "table", 40, 40, 30],
];
export const catalog = rows.map(
  ([name, category, widthIn, depthIn, heightIn], i) => ({
    id: "catalog-" + i,
    name,
    category,
    widthIn,
    depthIn,
    heightIn,
    color:
      category === "seating"
        ? "#8b9b87"
        : category === "bed"
          ? "#d4c5ae"
          : "#b48b65",
    source: "catalog",
    estimated: true,
    confidence: 0.6,
    notes: "Typical dimensions; verify your actual furniture.",
    createdAt: "2026-10-24T00:00:00.000Z",
  }),
);
export function toInches(value, unit = "in") {
  return (
    Math.round(
      Number(value) *
        (unit.toLowerCase() === "cm"
          ? 1 / 2.54
          : unit.toLowerCase() === "mm"
            ? 1 / 25.4
            : /^(ft|feet|foot)$/.test(unit)
              ? 12
              : 1) *
        10000,
    ) / 10000
  );
}
export function parseDimensions(text) {
  const match = String(text).match(
    /(\d+(?:\.\d+)?)\s*(?:["″]|in(?:ches)?|cm|mm|ft)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:["″]|in(?:ches)?|cm|mm|ft)?(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*(inches|in|cm|mm|ft|["″])?/i,
  );
  if (!match) return null;
  const unit = match[4] || String(text).match(/\b(cm|mm|ft)\b/i)?.[1] || "in";
  return {
    widthIn: toInches(match[1], unit),
    depthIn: toInches(match[2], unit),
    ...(match[3] ? { heightIn: toInches(match[3], unit) } : {}),
  };
}
export function matchCatalog(query) {
  const q = String(query)
    .toLowerCase()
    .replace(/seater/g, "seat")
    .replace(/three/g, "3")
    .replace(/two/g, "2");
  let best = null,
    score = 0;
  for (const item of catalog) {
    const words = item.name.toLowerCase().replaceAll("-", " ").split(/\s+/);
    const s =
      words.reduce((n, w) => n + (q.includes(w) ? w.length : 0), 0) /
      words.join("").length;
    if (s > score) {
      score = s;
      best = item;
    }
  }
  return score >= 0.5 ? best : null;
}
export function resolveName(query) {
  const item = matchCatalog(query);
  return {
    ...(item || {
      name: String(query).slice(0, 120) || "Furniture",
      category: "storage",
      widthIn: 36,
      depthIn: 24,
      heightIn: 30,
      color: "#b48b65",
      source: "heuristic",
      confidence: 0.2,
    }),
    ...parseDimensions(query),
    name: String(query).slice(0, 120),
    estimated: true,
    notes: item
      ? "Typical dimensions. Verify before placing."
      : "No catalog match. Edit these generic dimensions.",
    source: item ? "catalog" : "heuristic",
  };
}
