import React from "react";

export default function SourcesList({ sources }) {
  return (
    <section className="sources-line" aria-labelledby="sources-title">
      <h2 id="sources-title">Sources</h2>
      {sources?.length ? (
        <ul>
          {sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      ) : (
        <p>N/A</p>
      )}
      <p className="sources-footnote">
        Property data can be incomplete or change over time. Confirm details
        before making a decision.
      </p>
    </section>
  );
}
