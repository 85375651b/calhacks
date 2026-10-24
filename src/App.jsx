import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { APP_NAME } from "./lib/config";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import "./styles/global.css";
import "./styles/layout.css";
export default function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${APP_NAME} · Property, in perspective`;
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<Results />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  );
}
