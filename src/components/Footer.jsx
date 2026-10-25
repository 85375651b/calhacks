import React from "react";
import { Link } from "react-router-dom";
import { APP_NAME } from "../lib/config";
export default function Footer() {
  return (
    <footer className="site-footer container">
      <div>
        <strong>{APP_NAME}.</strong>
        <span>A clearer view of home.</span>
        <br />
        <Link to="/lookup" className="small-note">
          Single-address lookup ↗
        </Link>
      </div>
      <p>
        Third-party data: Zillow and Redfin via Apify, RentCast, Neighborhood Crime Safety / SpotCrime via Apify,
        FEMA National Risk Index, OpenStreetMap and Google Maps via Apify.
        <br />
        Address search by Geoapify / Photon, © OpenStreetMap contributors. US Census address verification.
        <br />
        Informational only; not appraisal, insurance, legal or safety advice.
        Not affiliated with or endorsed by these sources.
      </p>
    </footer>
  );
}
