// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import MapView from "./MapView";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [parks, setParks] = useState([]);       // array of GeoJSON features
  const [selectedPark, setSelectedPark] = useState(null);
  const [sortMode, setSortMode] = useState("alpha"); // "alpha" or "risk" (stub for now)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch parks from backend once
  useEffect(() => {
    async function fetchParks() {
      try {
        if (!API_BASE_URL) {
          throw new Error("VITE_API_BASE_URL is not defined");
        }

        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE_URL}/parks`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading ${API_BASE_URL}/parks`);
        }

        const data = await res.json();
        const features = data?.features ?? [];
        setParks(features);

        if (features.length > 0) {
          setSelectedPark(features[0]); // default selection
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load parks.");
      } finally {
        setLoading(false);
      }
    }

    fetchParks();
  }, []);

  // Sort parks for list panel
  const sortedParks = useMemo(() => {
    const copy = [...parks];

    if (sortMode === "risk") {
      // Placeholder – wire up when you add a risk field
      copy.sort((a, b) => {
        const ra = a.properties?.risk_score ?? 0;
        const rb = b.properties?.risk_score ?? 0;
        return rb - ra; // high risk first
      });
    } else {
      // Alphabetical by name
      copy.sort((a, b) => {
        const nameA = (a.properties?.park_name ?? "").toLowerCase();
        const nameB = (b.properties?.park_name ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    return copy;
  }, [parks, sortMode]);

  // Unified selection handler – used by both map and list
  function handleSelectPark(feature) {
    setSelectedPark(feature);
  }

  return (
    <div className="app-layout">
      {/* LEFT: map panel */}
      <div className="panel map-panel">
        {loading && <div className="panel-loading">Loading parks…</div>}
        {error && <div className="panel-error">{error}</div>}

        {!loading && !error && (
          <MapView parks={parks} onSelectPark={handleSelectPark} />
        )}
      </div>

      {/* RIGHT-TOP: scrollable sorted list */}
      <div className="panel list-panel">
        <div className="panel-header">
          <h2>Parks</h2>
          <div className="sort-controls">
            <span>Sort by:</span>
            <button
              className={sortMode === "alpha" ? "active" : ""}
              onClick={() => setSortMode("alpha")}
            >
              A–Z
            </button>
            <button
              className={sortMode === "risk" ? "active" : ""}
              onClick={() => setSortMode("risk")}
            >
              Risk
            </button>
          </div>
        </div>

        <div className="park-list">
          {sortedParks.map((feature, index) => {
            const p = feature.properties ?? {};
            const name = p.park_name ?? "Unnamed park";

            const isSelected = selectedPark === feature; // object identity

            // Placeholder risk field – safe even if not present
            const risk = p.risk_score ?? p.overall_risk ?? null;

            return (
              <div
                key={p.permit ?? index}
                className={`park-list-item ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelectPark(feature)}
              >
                <div className="park-list-name">{name}</div>
                {risk != null && (
                  <div className="park-list-risk">
                    Risk: {Number(risk).toFixed(1)}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && !error && sortedParks.length === 0 && (
            <div className="panel-empty">No parks found.</div>
          )}
        </div>
      </div>

      {/* RIGHT-BOTTOM: details of selected park */}
      <div className="panel detail-panel">
        <div className="panel-header">
          <h2>Park Details</h2>
        </div>

        <div className="park-details">
          {!selectedPark && <div>Select a park from the map or list.</div>}

          {selectedPark && <ParkDetailCard feature={selectedPark} />}
        </div>
      </div>
    </div>
  );
}

// Detail card – uses your existing field names
function ParkDetailCard({ feature }) {
  const p = feature.properties ?? {};

  const mhSpacesRaw = p.mh_spaces ?? 0;
  const rvSpacesRaw = p.rv_spaces ?? 0;

  const mhSpaces =
    typeof mhSpacesRaw === "number"
      ? mhSpacesRaw
      : Number(String(mhSpacesRaw).replace(/,/g, "")) || 0;

  const rvSpaces =
    typeof rvSpacesRaw === "number"
      ? rvSpacesRaw
      : Number(String(rvSpacesRaw).replace(/,/g, "")) || 0;

  const totalSpaces = mhSpaces + rvSpaces;

  const name = p.park_name ?? "Unnamed park";
  const address = p.park_address ?? "";
  const city = p.park_city ?? "";
  const state = p.park_state ?? "FL";
  const zip = p.park_zip ?? "";

  const county = p.county ?? "";
  const billingSpaces = p.billing_spaces ?? "N/A";
  const geocodeStatus = p.geocode_status ?? "";
  const lat = p.latitude ?? "";
  const lon = p.longitude ?? "";

  const risk = p.risk_score ?? p.overall_risk; // placeholder

  return (
    <div className="park-detail-card">
      <h3>{name}</h3>

      {risk != null && (
        <div className="park-detail-row">
          <strong>Risk score:</strong> {Number(risk).toFixed(1)}
        </div>
      )}

      {(address || city || zip) && (
        <div className="park-detail-row">
          <strong>Address:</strong>{" "}
          {address && <span>{address}, </span>}
          {city && <span>{city}, </span>}
          <span>{state}</span>
          {zip && <span> {zip}</span>}
        </div>
      )}

      {county && (
        <div className="park-detail-row">
          <strong>County:</strong> {county}
        </div>
      )}

      <div className="park-detail-row">
        <strong>MH Spaces:</strong> {p.mh_spaces ?? "N/A"}
      </div>
      <div className="park-detail-row">
        <strong>RV Spaces:</strong> {p.rv_spaces ?? "N/A"}
      </div>
      <div className="park-detail-row">
        <strong>Billing Spaces:</strong> {billingSpaces}
      </div>
      <div className="park-detail-row">
        <strong>Total Spaces:</strong> {totalSpaces}
      </div>

      {(lat || lon) && (
        <div className="park-detail-row">
          <strong>Lat/Lon:</strong> {lat}, {lon}
        </div>
      )}

      {geocodeStatus && (
        <div className="park-detail-row">
          <strong>Geocode Status:</strong> {geocodeStatus}
        </div>
      )}
    </div>
  );
}

export default App;
