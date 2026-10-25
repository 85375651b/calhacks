// Form inputs use inches. Accept the Actor's explicit inch fields or its
// width/length/height fields when the result declares inches.
export function prefillMeasurements(value) {
  const fields = { widthIn: ["width"], depthIn: ["depth", "length"], heightIn: ["height"] };
  const result = { ...value };
  for (const [field, aliases] of Object.entries(fields)) {
    const candidates = [value[field], ...(value.unit === "in" ? aliases.map(key => value[key]) : [])];
    result[field] = candidates.find(n => typeof n === "number" && Number.isFinite(n) && n > 0) ?? null;
  }
  return result;
}
