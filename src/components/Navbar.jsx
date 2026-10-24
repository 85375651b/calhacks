import React from "react";
import { useFavorites } from "../lib/Favorites";
import { Link, NavLink } from "react-router-dom";
import { APP_NAME } from "../lib/config";
export default function Navbar() {
  const { favorites } = useFavorites();
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
            Search
          </NavLink>
          <NavLink to="/planner">Planner</NavLink>
          <NavLink to="/favorites">
            Favorites <span className="count-badge">{favorites.length}</span>
          </NavLink>
          <Link to="/#how-it-works">
            How it works <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
