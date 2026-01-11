// src/MapView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Tooltip,
  GeoJSON,
  Pane,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * FIXES INCLUDED:
 * 1) Overlay fetch happens ONLY on selection.
 * 2) Overlay is cleared immediately on selection change (no stale outlines).
 * 3) Overlay does NOT block marker clicks:
 *    - Render polygon in a lower pane
 *    - Set interactive={false} so it doesn't capture pointer events
 * 4) Overlay styling matches the selected park's flood-risk tier.
 *
 * IMPORTANT:
 * For "wrong polygon" or "missing polygon" issues, you must also improve the API
 * selection logic (see recommended /api changes below).
 */

function getParkId(p) {
  return p?.permit ?? `${p?.park_name ?? ""}|${p?.park_address ?? ""}`;
}

function parkLatLng(p) {
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

// Adjust these thresholds to your real scale
function floodTier(flood_risk) {
  const r = Number(flood_risk);
  if (!Number.isFinite(r)) return "yellow";
  if (r >= 3) return "red";
  if (r >= 2) return "yellow";
  return "green";
}

function tierColor(tier) {
  if (tier === "green") return "#22c55e";
  if (tier === "red") return "#ef4444";
  return "#eab308";
}

const FL_BOUNDS = [
  [24.35, -87.65],
  [31.1, -79.8],
];

export default function MapView({ parks, selectedId, onSelect }) {
  const markerData = useMemo(() => {
    return (parks ?? [])
      .map((p) => ({ park: p, id: getParkId(p), latlng: parkLatLng(p) }))
      .filter((x) => x.latlng);
  }, [parks]);

  const selectedPark = useMemo(() => {
    if (!selectedId) return null;
    return (parks ?? []).find((p) => getParkId(p) === selectedId) ?? null;
  }, [parks, selectedId]);

  const selectedTier = useMemo(() => {
    if (!selectedPark) return null;
    return floodTier(selectedPark.flood_risk);
  }, [selectedPark]);

  // Exactly one overlay at a time
  const [overlayGeoJson, setOverlayGeoJson] = useState(null);
  const activeRequestIdRef = useRef(0);

  // Fetch overlay ONLY on selection
  useEffect(() => {
    let cancelled = false;

    async function fetchOverlay() {
      // Always clear overlay immediately when selection changes
      setOverlayGeoJson(null);

      if (!selectedPark) return;

      const lat = Number(selectedPark.latitude);
      const lon = Number(selectedPark.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const requestId = ++activeRequestIdRef.current;

      try {
        const r = await fetch(`/api/fema-floodzone?lat=${lat}&lon=${lon}`, {
          headers: { Accept: "application/json" },
        });

        if (cancelled) return;
        // Ignore stale responses
        if (requestId !== activeRequestIdRef.current) return;

        if (!r.ok) {
          setOverlayGeoJson(null);
          return;
        }

        const gj = await r.json();
        const hasFeatures = Array.isArray(gj?.features) && gj.features.length > 0;

        setOverlayGeoJson(hasFeatures ? gj : null);
      } catch {
        if (!cancelled && requestId === activeRequestIdRef.current) {
          setOverlayGeoJson(null);
        }
      }
    }

    fetchOverlay();

    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  return (
    <div className="pw-mapWrap">
      <MapContainer className="pw-leaflet" center={[27.8, -81.7]} zoom={6} scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Dark">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <FitFloridaOnce />
        <ZoomToSelection parks={parks} selectedId={selectedId} />

        {/* Pane order: polygon BELOW markers so it cannot block clicks */}
        <Pane name="floodPolygon" style={{ zIndex: 300 }} />
        <Pane name="parkMarkers" style={{ zIndex: 500 }} />

        {/* Single selected flood zone overlay */}
        {overlayGeoJson && selectedTier ? (
          <GeoJSON
            key={selectedId}                 // ensures only one layer exists
            data={overlayGeoJson}
            pane="floodPolygon"
            interactive={false}              // CRITICAL: don't capture clicks
            style={() => {
              const c = tierColor(selectedTier);
              return {
                color: c,
                weight: 1.0,
                opacity: 0.5,
                fillColor: c,
                fillOpacity: 0.12,
              };
            }}
          />
        ) : null}

        {/* Markers always above polygon */}
        {markerData.map(({ park, id, latlng }) => {
          const tier = floodTier(park.flood_risk);
          const c = tierColor(tier);
          const isSelected = selectedId != null && id === selectedId;

          return (
            <CircleMarker
              key={id}
              center={latlng}
              pane="parkMarkers"
              radius={isSelected ? 8 : 5}
              pathOptions={{
                color: isSelected ? "#e5e7eb" : c,
                weight: isSelected ? 2.5 : 1.5,
                fillColor: c,
                fillOpacity: isSelected ? 0.95 : 0.75,
              }}
              eventHandlers={{
                click: () => onSelect?.(park),
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 650 }}>{park.park_name ?? "Unnamed community"}</div>
                  <div>
                    {park.flood_zone ?? "—"} • risk {park.flood_risk ?? "—"}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function FitFloridaOnce() {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current) return;
    didFit.current = true;
    map.fitBounds(FL_BOUNDS, { padding: [18, 18] });
  }, [map]);

  return null;
}

function ZoomToSelection({ parks, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;

    const selected = (parks ?? []).find((p) => getParkId(p) === selectedId);
    const latlng = selected ? parkLatLng(selected) : null;
    if (!latlng) return;

    map.setView(latlng, Math.max(map.getZoom(), 11), { animate: true });
  }, [parks, selectedId, map]);

  return null;
}
