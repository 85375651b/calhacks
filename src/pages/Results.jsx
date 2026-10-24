import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import PropertyFactsCard from "../components/PropertyFactsCard";
import EstimateCard from "../components/EstimateCard";
import SourcesList from "../components/SourcesList";
import { mockProperty } from "../lib/mockProperty";
export default function Results() {
  const [params] = useSearchParams();
  const address = params.get("address")?.trim();
  return (
    <main id="main" className="container results">
      <Link className="back-link" to="/">
        ← Search another address
      </Link>
      <div className="results-heading">
        <div>
          <p className="eyebrow">YOUR PROPERTY OVERVIEW</p>
          <h1>{address || "Sample property overview"}</h1>
        </div>
        <span className="sample-badge">
          <span className="status-dot" />
          Sample data
        </span>
      </div>
      <p className="demo-notice">
        This is a frontend demo. All facts, prices, and sources below are
        fictional placeholders
        {address
          ? " and are not associated with this address."
          : ". Enter an address on the home page to try the search flow."}
      </p>
      <div className="results-grid">
        <PropertyFactsCard
          facts={mockProperty.facts}
          type={mockProperty.type}
        />
        <EstimateCard estimate={mockProperty.estimate} />
      </div>
      <SourcesList property={mockProperty} />
    </main>
  );
}
