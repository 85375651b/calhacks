import React from "react";
import { APP_NAME } from "../lib/config";
export default function Footer() {
  return (
    <footer className="site-footer container">
      <div>
        <strong>{APP_NAME}.</strong>
        <span>A clearer view of home.</span>
      </div>
      <p>
        Estimates are not appraisals.
        <br />
        Built for Cal Hacks · Property data by RentCast
      </p>
    </footer>
  );
}
