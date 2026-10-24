import React from "react";
import { Link, NavLink } from "react-router-dom";
import { APP_NAME } from "../lib/config";
export default function Navbar() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Link className="brand" to="/" aria-label={`${APP_NAME} home`}>
          <span className="brand-icon" aria-hidden="true">
            ⌂
          </span>
          {APP_NAME}
          <span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          <Link to="/#how-it-works">
            How it works <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
