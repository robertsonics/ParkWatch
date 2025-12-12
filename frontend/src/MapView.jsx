// src/MapView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Tooltip,
  GeoJSON,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { floodTier, tierColor } from "./risk";

/**
 * React-Leaflet MapView
 *
 * Adds a FEMA Flood Hazard Zones overlay for the selected park:
 * - No selection → no overlay
 * - Selection → fetch /api/fema-floodzone?lat=...&lon=...
 * - Overlay is rendered as a GeoJSON polygon with muted fill + outlined edge
 */

// Stable ID must match App.jsx logic
function getParkId(p) {
  return p?.permit ?? `${p?.park_name ?? ""}|${p?.park_address ?? ""}`;
}

// Leaflet expects [lat, lon]
function parkLatLng(p) {
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

// Approx Florida bounds
const FL_BOUNDS = [
  [24.35, -87.65],
  [31.1, -79.8],
];

// Marker style by tier and selection
function markerStyle(tier, isSelected) {
  const c = tierColor(tier);
  return {
    color: isSelected ? "#e5e7eb" : c,
    weight: isSelected ? 2.5 : 1.5,
    fillColor: c,
    fillOpacity: isSelected ? 0.95 : 0.75,
  };
}

export default function MapView({ parks, selectedId, onSelect }) {
  // Precompute marker inputs for performance
  const markerData = useMemo(() => {
    return (parks ?? [])
      .map((p) => ({ park: p, id: getParkId(p), latlng: parkLatLng(p) }))
      .filter((x) => x.latlng);
  }, [parks]);

  // Selected park object (for overlay + zoom)
  const selectedPark = useMemo(() => {
    if (!selectedId) return null;
    return (parks ?? []).find((p) => getParkId(p) === selectedId) ?? null;
  }, [parks, selectedId]);

  // FEMA overlay GeoJSON for the selected park
  const [femaGeoJson, setFemaGeoJson] = useState(null);

  // Fetch the FEMA polygon whenever selection changes
  useEffect(() => {
    let cancelled = false;

    async function fetchOverlay() {
      if (!selectedPark) {
        setFemaGeoJson(null);
        return;
      }

      const lat = Number(selectedPark.latitude);
      const lon = Number(selectedPark.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setFemaGeoJson(null);
        return;
      }

      try {
        // IMPORTANT: This hits your local/prod Vercel Function, not FEMA directly from the browser.
        const r = await fetch(`/api/fema-floodzone?lat=${lat}&lon=${lon}`);
        if (!r.ok) {
          setFemaGeoJson(null);
          return;
        }

        const gj = await r.json();

        // Some responses may be empty FeatureCollections. Handle gracefully.
        if (!cancelled) {
          const hasFeatures = Array.isArray(gj?.features) && gj.features.length > 0;
          setFemaGeoJson(hasFeatures ? gj : null);
        }
      } catch (e) {
        if (!cancelled) setFemaGeoJson(null);
      }
    }

    fetchOverlay();
    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  // Determine overlay style based on the selected park's flood risk tier
  const overlayStyle = useMemo(() => {
    if (!selectedPark) return null;
    const tier = floodTier(selectedPark.flood_risk);
    const c = tierColor(tier);
    return {
      color: c,
      weight: 3,
      opacity: 0.9,
      fillColor: c,
      fillOpacity: 0.12,
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

        {/* Initial view: Florida */}
        <FitFloridaOnce />

        {/* Zoom only after user selection (selectedId is null on load in App.jsx) */}
        <ZoomToSelection selectedPark={selectedPark} />

        {/* FEMA flood hazard zone overlay for the selected park */}
        {femaGeoJson && overlayStyle ? (
          <GeoJSON
            key={selectedId} // force clean replace when selection changes
            data={femaGeoJson}
            style={() => overlayStyle}
          />
        ) : null}

        {/* Park markers */}
        {markerData.map(({ park, id, latlng }) => {
          const tier = floodTier(park.flood_risk);
          const isSelected = selectedId != null && id === selectedId;

          return (
            <CircleMarker
              key={id}
              center={latlng}
              radius={isSelected ? 8 : 5}
              pathOptions={markerStyle(tier, isSelected)}
              eventHandlers={{ click: () => onSelect?.(park) }}
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

function ZoomToSelection({ selectedPark }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPark) return;

    const latlng = parkLatLng(selectedPark);
    if (!latlng) return;

    map.setView(latlng, Math.max(map.getZoom(), 11), { animate: true });
  }, [selectedPark, map]);

  return null;
}
