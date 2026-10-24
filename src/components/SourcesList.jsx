import React from "react";
export default function SourcesList({ property }) {
  const rows = [
    ...property.facts.map((f) => ({
      label: f.label,
      value: `${f.value}${f.unit ? ` · ${f.unit}` : ""}`,
      source: f.source,
    })),
    {
      label: "Estimated value & range",
      value: `${property.estimate.value} · ${property.estimate.low}–${property.estimate.high}`,
      source: property.estimate.source,
    },
  ];
  return (
    <section className="card sources-card" aria-labelledby="sources-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">TRANSPARENCY, BUILT IN</p>
          <h2 id="sources-title">Behind the numbers</h2>
        </div>
        <span className="quiet-tag">Placeholder sources</span>
      </div>
      <p className="sources-intro">
        Every number should have a source. These show where future data could
        come from; no records have been retrieved.
      </p>
      <div className="source-list">
        {rows.map((row) => (
          <div className="source-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.value}</span>
            </div>
            <p>{row.source}</p>
            <span className="source-status">Sample only</span>
          </div>
        ))}
      </div>
    </section>
  );
}
