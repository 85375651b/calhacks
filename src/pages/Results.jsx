import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PropertyFactsCard from "../components/PropertyFactsCard";
import PropertyListingCard from "../components/PropertyListingCard";
import EstimateCard from "../components/EstimateCard";
import SourcesList from "../components/SourcesList";
import LookupState from "../components/LookupState";
import ZillowData from "../components/ZillowData";
import useEnrichment from "../lib/useEnrichment";
import { formatArea, formatCurrency, formatDate } from "../lib/format";

const fallbackError = {
  code: "SERVER_ERROR",
  message: "We couldn’t reach the property service. Please try again later.",
};

export default function Results() {
  const [params] = useSearchParams();
  const address = params.get("address")?.trim() || "";
  const [state, setState] = useState({
    address: null,
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    setState({ address, data: null, error: null });
    async function load() {
      try {
        const response = await fetch(
          `/api/lookup?${new URLSearchParams({ address })}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({
            address,
            data: null,
            error: body.error?.message ? body.error : fallbackError,
          });
          return;
        }
        if (
          !body ||
          typeof body.address !== "string" ||
          !Array.isArray(body.sources)
        )
          throw new Error("Invalid response");
        if (!controller.signal.aborted)
          setState({ address, data: body, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ address, data: null, error: fallbackError });
      }
    }
    load();
    return () => controller.abort();
  }, [address]);

  const property = state.address === address ? state.data : null;
  const enrichment = useEnrichment(property);
  const sources = [
    ...new Set([
      ...(property?.sources || []),
      ...(enrichment?.data?.sources || []),
    ]),
  ];
  const error = !address
    ? {
        code: "INVALID_ADDRESS",
        message: "Enter a US property address on the home page to get started.",
      }
    : state.address === address
      ? state.error
      : null;
  const facts = property
    ? [
        {
          id: "type",
          label: "Property type",
          value: property.propertyType || "N/A",
        },
        { id: "year", label: "Year built", value: property.yearBuilt ?? "N/A" },
        { id: "lot", label: "Lot size", value: formatArea(property.lotSize) },
        {
          id: "sale",
          label: "Last sale",
          value: formatCurrency(property.lastSale?.price),
          unit: formatDate(property.lastSale?.date),
        },
      ]
    : [];

  return (
    <main id="main" className="container results">
      <Link className="back-link" to="/">
        ← Try another address
      </Link>
      {!property ? (
        <LookupState loading={!error} error={error} />
      ) : (
        <>
          <div className="results-heading">
            <div>
              <p className="eyebrow">YOUR PROPERTY OVERVIEW</p>
              <h1>{property.address}</h1>
            </div>
            <div className="listing-badges">
              <span
                className={`listing-status ${property.listing ? "for-sale" : ""}`}
              >
                {property.listing ? "For sale" : "Not currently listed"}
              </span>
              {property.sampleData && (
                <span className="sample-badge">
                  <span className="status-dot" />
                  Sample data
                </span>
              )}
            </div>
          </div>
          {property.sampleData && (
            <p className="fixture-notice">
              <strong>Saved sample response.</strong> You searched for “
              {address}”. Fixture mode always shows the saved RentCast property
              at the address above, not a live lookup of your search. Its
              listing status and values reflect the saved response.
            </p>
          )}
          <PropertyListingCard property={property} />
          <div className="results-grid">
            <PropertyFactsCard facts={facts} />
            <EstimateCard estimate={property.estimate} />
          </div>
          <ZillowData state={enrichment} rentcastEstimate={property.estimate} />
          <SourcesList sources={sources} />
        </>
      )}
    </main>
  );
}
