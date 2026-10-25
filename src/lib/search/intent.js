const suffix =
  "(?:st(?:reet)?|ave(?:nue)?|ln|lane|rd|road|dr|drive|blvd|boulevard|ct|court|way|pl|place|ter(?:race)?|cir(?:cle)?|hwy|highway|pkwy|parkway|trl|trail)";
const preferences =
  /\b(?:beds?|bedrooms?|bd|baths?|bathrooms?|ba|sqft|square feet|acres?|under|over|below|above|max|min|between|price|million|house|home|condo|townhouse|listing|commute|near|with|hoa|pool|garage|studio)\b/i;
export function classifyIntent(value) {
  const text =
    typeof value === "string"
      ? value
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[.!?;]+$/, "")
      : "";
  if (/^\$?\d+(?:\.\d+)?[km]\b/i.test(text))
    return { intent: "description", confidence: 0.99 };
  const start = text.match(/^\d+[a-z]?(?:-\d+)?\s+(.+)$/i);
  if (start) {
    if (
      /^(?:beds?|bedrooms?|bd|baths?|bathrooms?|ba|acres?|sqft|square feet|car|story|storey|houses|homes|condos|studios?)\b/i.test(
        start[1],
      )
    )
      return { intent: "description", confidence: 0.99 };
    const street = new RegExp(
      `^\\d+[a-z]?(?:-\\d+)?\\s+(?:[nsew]\\.?\\s+)?[a-z0-9][a-z0-9 .'-]*?\\b${suffix}\\b`,
      "i",
    ).exec(text);
    if (street) {
      const extra =
        /\s+(?=(?:\d+(?:\.\d+)?\s*(?:beds?|bedrooms?|bd|baths?|ba|sqft)|under\b|with\b|no hoa\b|pool\b))/i.exec(
          text.slice(street[0].length),
        );
      const end = extra ? street[0].length + extra.index : text.length;
      return {
        intent: "address",
        confidence: 0.98,
        addressText: text.slice(0, end).replace(/[,\s]+$/, ""),
        ...(extra ? { ignoredText: text.slice(end).trim() } : {}),
      };
    }
    if (!preferences.test(start[1]) && /^[a-z0-9]/i.test(start[1]))
      return {
        intent: "address",
        confidence: /^[nsew]\b/i.test(start[1]) ? 0.85 : 0.65,
        addressText: text,
      };
  }
  return {
    intent: "description",
    confidence:
      preferences.test(text) ||
      /\b\d+(?:\.\d+)?\s*[km]\b/i.test(text) ||
      /^in\s/i.test(text)
        ? 0.98
        : 0.55,
  };
}
