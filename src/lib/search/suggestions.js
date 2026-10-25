import { addressLabel } from "./address.js";
export function fastSuggestion(p) {
  const { standardized, providerZip, ...rest } = p;
  const result = { ...rest, zip: "", verified: false };
  result.label = addressLabel(result);
  return result;
}
export function verifiedRows(rows, verified) {
  // Merge by positional identity, never by a new label or a provider's ordering.
  return rows.map((p, i) => {
    const v = verified[i];
    if (!v?.verified || v.originalLabel !== p.label) return p;
    const next = { ...p, zip: v.zip, verified: true, standardized: v.standardized };
    next.label = addressLabel(next);
    return next;
  });
}
