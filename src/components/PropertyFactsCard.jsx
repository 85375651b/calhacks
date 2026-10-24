import React from "react";
export default function PropertyFactsCard({ facts, type }) {
  return (
    <section className="card facts-card" aria-labelledby="facts-title">
      <div className="card-heading">
        <h2 id="facts-title">The property at a glance</h2>
        <span className="quiet-tag">{type}</span>
      </div>
      <dl className="facts-grid">
        {facts.map((fact) => (
          <div className="fact" key={fact.id}>
            <dt>{fact.label}</dt>
            <dd>
              {fact.value}
              {fact.unit && <span>{fact.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="card-note">
        Illustrative property details · Not matched to this address
      </p>
    </section>
  );
}
