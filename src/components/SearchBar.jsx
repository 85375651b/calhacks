import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
export default function SearchBar() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function submit(event) {
    event.preventDefault();
    if (!address.trim()) {
      setError("Enter a property address to get started.");
      return;
    }
    navigate(`/results?${new URLSearchParams({ address: address.trim() })}`);
  }
  return (
    <form className="search-form" onSubmit={submit} noValidate>
      <label htmlFor="address">Start with a US property address</label>
      <div className={`search-box ${error ? "has-error" : ""}`}>
        <span aria-hidden="true" className="search-icon">
          ⌕
        </span>
        <input
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="Enter street address, city, state"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError("");
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "address-error" : "search-note"}
        />
        <button type="submit">
          Search <span aria-hidden="true">↗</span>
        </button>
      </div>
      {error && (
        <p className="error" id="address-error" role="alert">
          {error}
        </p>
      )}
      <p className="search-note" id="search-note">
        Explore the demo. All results use sample data.
      </p>
    </form>
  );
}
