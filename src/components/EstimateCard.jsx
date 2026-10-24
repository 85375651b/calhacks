import React from "react";
export default function EstimateCard({ estimate }) {
  return (
    <section className="card estimate-card" aria-labelledby="estimate-title">
      <div className="card-heading">
        <h2 id="estimate-title">Estimated value</h2>
        <span aria-hidden="true">↗</span>
      </div>
      <p className="estimate-value">{estimate.value}</p>
      <p className="estimate-caption">Sample midpoint estimate</p>
      <div className="range-track" aria-hidden="true">
        <span />
      </div>
      <div className="range-labels">
        <span>
          {estimate.low}
          <small>Low estimate</small>
        </span>
        <span>
          {estimate.high}
          <small>High estimate</small>
        </span>
      </div>
      <p className="estimate-note">
        Automated valuation models (AVMs) can be off by 5–10% or more. This
        sample is not a valuation of your property.
      </p>
    </section>
  );
}
