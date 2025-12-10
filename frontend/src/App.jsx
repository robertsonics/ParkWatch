// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import "./App.css";
import { supabase } from "./supabaseClient";

// Helper: consistent ID for each park
function getParkId(feature) {
  const p = feature?.properties || {};
  return (
    p.permit ?? // primary
    `${p.park_name ?? ""}|${p.park_address ?? ""}` // fallback
  );
}

function App() {
  const [parks, setParks] = useState([]);
  const [selectedPark, setSelectedPark] = useState(null);
  const [sortMode, setSortMode] = useState("alpha");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectionSource, setSelectionSource] = useState(null); // "map" | "list" | null

  // refs to each list item: { [id]: HTMLElement }
  const itemRefs = useRef({});

  // Fetch parks from Supabase once
  useEffect(() => {
    async function fetchParks() {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("fl_parks")
          .select(`
            permit,
            county,
            park_name,
            park_address,
            park_city,
            park_state,
            park_zip,
            phone,
            owner_co,
            owner_first,
            owner_last,
            owner_address,
            owner_city,
            owner_state,
            owner_zip,
            mail_address,
            mail_city,
            mail_state,
            mail_zip,
            park_type,
            mh_spaces,
            rv_spaces,
            billing_spaces,
            latitude,
            longitude,
            geocode_status
          `)
          .range(0, 9999);   // <-- FIX: fetch all rows (removes 1000-row cap)

        console.log("Supabase fl_parks data:", data);
        console.log("Supabase fl_parks error:", error);

        if (error) throw error;

        const features =
          (data || []).map((row) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              // GeoJSON uses [lon, lat]
              coordinates: [
                row.longitude != null ? Number(row.longitude) : null,
                row.latitude != null ? Number(row.latitude) : null,
              ],
            },
            properties: row,
          })) ?? [];

        setParks(features);

        if (features.length > 0) {
          setSelectedPark(features[0]);
        }
      } catch (err) {
        console.error("Error loading parks from Supabase:", err);
        setError("Failed to load parks from Supabase.");
      } finally {
        setLoading(false);
      }
    }

    fetchParks();
  }, []);

  // Sort parks for list
  const sortedParks = useMemo(() => {
    const copy = [...parks];

    if (sortMode === "risk") {
      copy.sort((a, b) => {
        const ra = a.properties?.risk_score ?? a.properties?.overall_risk ?? 0;
        const rb = b.properties?.risk_score ?? b.properties?.overall_risk ?? 0;
        return rb - ra;
      });
    } else {
      copy.sort((a, b) => {
        const nameA = (a.properties?.park_name ?? "").toLowerCase();
        const nameB = (b.properties?.park_name ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    return copy;
  }, [parks, sortMode]);

  // Unified selection handler; source = "map" or "list"
  function handleSelectPark(feature, source) {
    setSelectedPark(feature);
    setSelectionSource(source);
  }

  // When a marker selects a park, scroll list to that park
  useEffect(() => {
    if (!selectedPark || selectionSource !== "map") return;

    const id = getParkId(selectedPark);
    const el = itemRefs.current[id];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    // reset to avoid re-triggering on rerenders
    setSelectionSource(null);
  }, [selectedPark, selectionSource]);

  return (
    <div className="app-layout">
      {/* LEFT: map panel */}
      <div className="panel map-panel">
        {loading && <div className="panel-loading">Loading parks…</div>}
        {error && <div className="panel-error">{error}</div>}

        {!loading && !error && (
          <MapView
            parks={parks}
            selectedPark={selectedPark}
            onSelectPark={(feature) => handleSelectPark(feature, "map")}
          />
        )}
      </div>

      {/* RIGHT-TOP: park list */}
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
          {sortedParks.map((feature) => {
            const p = feature.properties ?? {};
            const name = p.park_name ?? "Unnamed park";
            const id = getParkId(feature);
            const isSelected =
              selectedPark && getParkId(selectedPark) === id;

            const risk = p.risk_score ?? p.overall_risk ?? null;

            return (
              <div
                key={id}
                ref={(el) => {
                  if (el) itemRefs.current[id] = el;
                  else delete itemRefs.current[id];
                }}
                className={`park-list-item ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelectPark(feature, "list")}
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

      {/* RIGHT-BOTTOM: details */}
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

  const risk = p.risk_score ?? p.overall_risk;

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
