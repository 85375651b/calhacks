const numeric = (value) => typeof value === "number" && Number.isFinite(value);
export const formatNumber = (value) =>
  numeric(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
    : "N/A";
export const formatCurrency = (value) =>
  numeric(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value)
    : "N/A";
export const formatArea = (value) =>
  numeric(value) ? `${formatNumber(value)} sq ft` : "N/A";
export function formatDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
