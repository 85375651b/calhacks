import React from "react";
import AddressCombobox from "../AddressCombobox";
import { usePreferences } from "../../lib/Preferences";
export default function WorkAddress() {
  const { work, setWork } = usePreferences();
  return (
    <details className="work-address">
      <summary>Work address {work?.label ? "· " + work.label : ""}</summary>
      <AddressCombobox
        label="Choose your work address for commute estimates"
        onSelect={(p) => setWork(p)}
      />
      <p className="small-note">Your work location is stored only in your browser and sent to our commute data provider to estimate drive times.</p>
      {work && !Number.isFinite(work.lat) && (
        <p role="status">
          Choose a suggestion to save coordinates for commute estimates.
        </p>
      )}
      {work && (
        <button
          type="button"
          className="quiet-button"
          onClick={() => setWork(null)}
        >
          Clear work address
        </button>
      )}
    </details>
  );
}
