import React from "react";
import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <main id="main" className="container not-found">
      <p className="eyebrow">404 · OFF THE MAP</p>
      <h1>This address leads nowhere.</h1>
      <p>
        The page you’re looking for doesn’t exist. Let’s find your way home.
      </p>
      <Link className="button-link" to="/">
        Back to home <span aria-hidden="true">↗</span>
      </Link>
    </main>
  );
}
