// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import "./App.css";
import { sql } from "./neonClient";

/**
 * ParkWatch – Clean UI Restart
 *
 * Design principles:
 * - App owns data + selection state (single source of truth).
 * - MapView is a visual component: render markers + handle map interactions.
 * - NO default selection on load.
 * - Map only zooms after the user selects a park (from map or list).
 */

// Stable ID for each park row
function getParkId(p) {
  return p?.permit ?? `${p?.park_name ?? ""}|${p?.park_address ?? ""}`;
}

/**
 * Flood risk → 3-tier mapping (green/yellow/red).
 * Adjust thresholds if your flood_risk scale differs.
 */
function floodTier(flood_risk) {
  const r = Number(flood_risk);
  if (!Number.isFinite(r)) return "yellow"; // unknown -> caution
  if (r >= 3) return "red";
  if (r >= 2) return "yellow";
  return "green";
}

function tierColor(tier) {
  if (tier === "green") return "#22c55e";
  if (tier === "red") return "#ef4444";
  return "#eab308";
}

export default function App() {
  const [parks, setParks] = useState([]); // array of rows from Neon
  const [selectedId, setSelectedId] = useState(null); // null until user selects
  const [selectionSource, setSelectionSource] = useState(null); // "map" | "list" | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refs so we can scroll the list to the selected park when user clicks a marker
  const itemRefs = useRef({}); // { [id]: HTMLElement }

  // Load parks from Neon (serving DB)
  useEffect(() => {
    let cancelled = false;

    async function fetchParks() {
      try {
        setLoading(true);
        setError(null);

        // Keep query minimal: only what the UI needs now
        const rows = await sql`
          SELECT
            permit,
            park_name,
            park_address,
            park_city,
            billing_spaces,
            latitude,
            longitude,
            flood_zone,
            flood_risk
          FROM fl_parks
          WHERE latitude IS NOT NULL
            AND longitude IS NOT NULL;
        `;

        if (cancelled) return;

        setParks(rows ?? []);

        // CRITICAL: start with NO selection to avoid zooming on refresh
        setSelectedId(null);
        setSelectionSource(null);
      } catch (e) {
        console.error("Neon load error:", e);
        if (!cancelled) setError("Failed to load parks from Neon.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchParks();
    return () => {
      cancelled = true;
    };
  }, []);

  // Selected park object (derived)
  const selectedPark = useMemo(() => {
    if (!selectedId) return null;
    return parks.find((p) => getParkId(p) === selectedId) ?? null;
  }, [parks, selectedId]);

  // Sort parks A–Z for a clean, predictable list (add sort controls later if desired)
  const sortedParks = useMemo(() => {
    const copy = [...parks];
    copy.sort((a, b) =>
      String(a.park_name ?? "").localeCompare(String(b.park_name ?? ""), undefined, {
        sensitivity: "base",
      })
    );
    return copy;
  }, [parks]);

  // Unified selection handler
  function selectPark(park, source) {
    const id = getParkId(park);
    setSelectedId(id);
    setSelectionSource(source);
  }

  // If selection originated from the map, scroll list to the selected park
  useEffect(() => {
    if (!selectedId || selectionSource !== "map") return;

    const el = itemRefs.current[selectedId];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    // Reset source so we don’t keep triggering scroll on incidental rerenders
    setSelectionSource(null);
  }, [selectedId, selectionSource]);

  return (
    <div className="pw-root">
      <header className="pw-topbar">
        <div className="pw-brand">
          <div className="pw-title">ParkWatch</div>
          <div className="pw-subtitle">Florida • Flood risk visualization</div>
        </div>
      </header>

      <main className="pw-grid">
        {/* MAP */}
        <section className="pw-panel pw-map">
          <div className="pw-panelHeader">Map</div>

          {loading && <div className="pw-status">Loading communities…</div>}
          {error && <div className="pw-status pw-error">{error}</div>}

          {!loading && !error && (
            <MapView
              parks={parks}
              selectedId={selectedId}
              // MapView should only zoom when selection was user-driven:
              // Because we never set selectedId on load, the first selection is always user action.
              onSelect={(park) => selectPark(park, "map")}
            />
          )}
        </section>

        {/* LIST */}
        <section className="pw-panel pw-list">
          <div className="pw-panelHeader">Communities</div>

          <div className="pw-listBody">
            {sortedParks.map((p) => {
              const id = getParkId(p);
              const isSelected = selectedId === id;
              const tier = floodTier(p.flood_risk);

              return (
                <button
                  key={id}
                  ref={(el) => {
                    if (el) itemRefs.current[id] = el;
                    else delete itemRefs.current[id];
                  }}
                  className={`pw-row ${isSelected ? "isSelected" : ""}`}
                  onClick={() => selectPark(p, "list")}
                >
                  <div className="pw-rowMain">
                    <div className="pw-rowName">{p.park_name ?? "Unnamed park"}</div>
                    <div className="pw-rowSub">
                      {p.park_city ?? ""}
                      {p.park_city && (p.park_address ? " • " : "")}
                      {p.park_address ?? ""}
                    </div>
                  </div>

                  <div className={`pw-badge ${tier}`}>{tier.toUpperCase()}</div>
                </button>
              );
            })}

            {!loading && !error && sortedParks.length === 0 && (
              <div className="pw-status">No parks found.</div>
            )}
          </div>
        </section>

        {/* DETAILS */}
        <section className="pw-panel pw-detail">
          <div className="pw-panelHeader">Community Details</div>

          {!selectedPark ? (
            <div className="pw-empty">
              Select a park from the map or list. The map will only zoom after you select.
            </div>
          ) : (
            <ParkDetails park={selectedPark} />
          )}
        </section>
      </main>
    </div>
  );
}

function ParkDetails({ park }) {
  const tier = floodTier(park.flood_risk);

  return (
    <div className="pw-detailBody">
      <div className="pw-detailTitleRow">
        <div className="pw-detailTitle">{park.park_name ?? "Unnamed park"}</div>
        <div className={`pw-badge ${tier}`}>{tier.toUpperCase()}</div>
      </div>

      <div className="pw-kv">
        <div className="pw-k">Park address</div>
        <div className="pw-v">{park.park_address ?? "—"}</div>

        <div className="pw-k">Park city</div>
        <div className="pw-v">{park.park_city ?? "—"}</div>

        <div className="pw-k">Billing spaces</div>
        <div className="pw-v">{park.billing_spaces ?? "—"}</div>

        <div className="pw-k">Flood zone</div>
        <div className="pw-v">{park.flood_zone ?? "—"}</div>

        <div className="pw-k">Flood risk</div>
        <div className="pw-v">{park.flood_risk ?? "—"}</div>
      </div>
    </div>
  );
}
