import React from "react";
export default function PropertyFactsCard({ facts }) {
  return (
    <section className="card facts-card" aria-labelledby="facts-title">
      <div className="card-heading">
        <h2 id="facts-title">Property details</h2>
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
        N/A means the data provider did not supply that detail.
      </p>
    </section>
  );
}
