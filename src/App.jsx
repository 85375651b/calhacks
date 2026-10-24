import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { APP_NAME } from "./lib/config";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { PreferencesProvider } from "./lib/Preferences";
import Favorites from "./pages/Favorites";
import { FavoritesProvider } from "./lib/Favorites";
import Home from "./pages/Home";
import Lookup from "./pages/Lookup";
import "./styles/search.css";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/results.css";
import "./styles/autocomplete.css";
import "./styles/enrichment.css";
const Planner = lazy(() => import('./pages/Planner'));
export default function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${APP_NAME} Â· Property, in perspective`;
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <PreferencesProvider>
      <FavoritesProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/planner" element={<Suspense fallback={<main id="main">Loading planner…</main>}><Planner /></Suspense>} />
          <Route path="/planner/:homeId" element={<Suspense fallback={<main id="main">Loading planner…</main>}><Planner /></Suspense>} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/lookup" element={<Lookup />} />
          <Route path="/results" element={<Results />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </FavoritesProvider>
    </PreferencesProvider>
  );
}
