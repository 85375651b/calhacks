import React from "react";
import { formatCurrency } from "../lib/format";
export default function EstimateCard({ estimate }) {
  return (
    <section className="card estimate-card" aria-labelledby="estimate-title">
      <div className="card-heading">
        <h2 id="estimate-title">Estimated value</h2>
        <span aria-hidden="true">↗</span>
      </div>
      <p className="estimate-value">{formatCurrency(estimate?.price)}</p>
      <p className="estimate-caption">RentCast automated valuation</p>
      {estimate?.low != null && estimate?.high != null && (
        <div className="range-track" aria-hidden="true">
          <span />
        </div>
      )}
      <div className="range-labels">
        <span>
          {formatCurrency(estimate?.low)}
          <small>Low estimate</small>
        </span>
        <span>
          {formatCurrency(estimate?.high)}
          <small>High estimate</small>
        </span>
      </div>
      <p className="estimate-note">
        Estimates are not appraisals. Automated valuation models (AVMs) can be
        off by 5–10% or more.
      </p>
    </section>
  );
}
