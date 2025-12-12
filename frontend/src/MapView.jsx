// src/MapView.jsx
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * React-Leaflet MapView
 *
 * Requirements covered here:
 * - Start with entire Florida visible.
 * - Do NOT zoom on load.
 * - Zoom only after user selects a park (selectedId becomes non-null).
 * - Markers color-coded by flood risk: green/yellow/red.
 * - Satellite layer retained.
 */

// Stable ID must match App.jsx logic
function getParkId(p) {
  return p?.permit ?? `${p?.park_name ?? ""}|${p?.park_address ?? ""}`;
}

// Flood risk tiers: green/yellow/red
function floodTier(flood_risk) {
  const r = Number(flood_risk);
  if (!Number.isFinite(r)) return "yellow";
  if (r >= 3) return "red";
  if (r >= 2) return "yellow";
  return "green";
}

// Marker visual style by tier and selection
function markerStyle(tier, isSelected) {
  const colors = {
    green: "#22c55e",
    yellow: "#eab308",
    red: "#ef4444",
  };
  const c = colors[tier] ?? colors.yellow;

  return {
    color: isSelected ? "#e5e7eb" : c, // stroke
    weight: isSelected ? 2.5 : 1.5,
    fillColor: c,
    fillOpacity: isSelected ? 0.95 : 0.75,
  };
}

// Leaflet expects [lat, lon]
function parkLatLng(p) {
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

// Approximate Florida bounds (tune if desired)
const FL_BOUNDS = [
  [24.35, -87.65], // SW
  [31.1, -79.8],   // NE
];

export default function MapView({ parks, selectedId, onSelect }) {
  // Precompute marker inputs for performance
  const markerData = useMemo(() => {
    return (parks ?? [])
      .map((p) => ({ park: p, id: getParkId(p), latlng: parkLatLng(p) }))
      .filter((x) => x.latlng);
  }, [parks]);

  return (
    <div className="pw-mapWrap">
      <MapContainer className="pw-leaflet" center={[27.8, -81.7]} zoom={6} scrollWheelZoom>
        <LayersControl position="topright">
          {/* Dark basemap (default) */}
          <LayersControl.BaseLayer checked name="Dark">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            />
          </LayersControl.BaseLayer>

          {/* Satellite imagery (retained as requested) */}
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* One-time: show Florida initially */}
        <FitFloridaOnce />

        {/* Critical: zoom only AFTER user selection (selectedId becomes non-null) */}
        <ZoomToSelection parks={parks} selectedId={selectedId} />

        {markerData.map(({ park, id, latlng }) => {
          const tier = floodTier(park.flood_risk);
          const isSelected = selectedId != null && id === selectedId;

          return (
            <CircleMarker
              key={id}
              center={latlng}
              radius={isSelected ? 8 : 5}
              pathOptions={markerStyle(tier, isSelected)}
              eventHandlers={{
                click: () => onSelect?.(park),
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 650 }}>{park.park_name ?? "Unnamed park"}</div>
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

/**
 * Fits the map to Florida ONCE.
 * We isolate this so it never re-fits on rerenders.
 */
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

/**
 * Zoom behavior:
 * - If selectedId is null (initial load), do nothing.
 * - Once the user selects a park (from list or marker), selectedId becomes non-null and we zoom.
 */
function ZoomToSelection({ parks, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;

    const selected = (parks ?? []).find((p) => getParkId(p) === selectedId);
    const latlng = selected ? parkLatLng(selected) : null;
    if (!latlng) return;

    // Smooth zoom/pan. Keep current zoom if already close-in.
    map.setView(latlng, Math.max(map.getZoom(), 11), { animate: true });
  }, [parks, selectedId, map]);

  return null;
}
