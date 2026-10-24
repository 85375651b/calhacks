// Fictional fixtures: no live lookup or valuation is performed.
export const mockProperty = {
  type: "Single-family home",
  facts: [
    {
      id: "beds",
      label: "Bedrooms",
      value: "3",
      source: "County assessor records (placeholder)",
    },
    {
      id: "baths",
      label: "Bathrooms",
      value: "2",
      source: "County assessor records (placeholder)",
    },
    {
      id: "sqft",
      label: "Living area",
      value: "1,840",
      unit: "sq ft",
      source: "County assessor records (placeholder)",
    },
    {
      id: "year",
      label: "Year built",
      value: "1986",
      source: "County assessor records (placeholder)",
    },
    {
      id: "lot",
      label: "Lot size",
      value: "6,200",
      unit: "sq ft",
      source: "County parcel records (placeholder)",
    },
    {
      id: "sale",
      label: "Last sale",
      value: "$685,000",
      unit: "Jun 2021",
      source: "County recorded sales (placeholder)",
    },
  ],
  estimate: {
    value: "$842,000",
    low: "$800,000",
    high: "$885,000",
    source: "Property AVM provider (placeholder)",
  },
};
