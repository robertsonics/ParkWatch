// src/MapView.jsx
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Consistent ID for each park (same logic as in App)
function getParkId(feature) {
  const p = feature?.properties || {};
  return (
    p.permit ?? // preferred
    `${p.park_name ?? ""}|${p.park_address ?? ""}` // last resort
  );
}

export default function MapView({ parks, selectedPark, onSelectPark }) {
  const mapRef = useRef(null); // DOM node for the map
  const mapInstanceRef = useRef(null); // Leaflet map instance
  const geoJsonLayerRef = useRef(null); // current GeoJSON layer
  const markerRefs = useRef({}); // { [id]: markerInstance }
  const firstSelectionRef = useRef(true); // NEW: track initial selection

  // One-time map initialization
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current).setView([27.5, -81.5], 6);
    mapInstanceRef.current = map;

    // Base layers
    const osm = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }
    ).addTo(map);

    const esriSat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      }
    );

    L.control
      .layers(
        { "Street Map": osm, Satellite: esriSat },
        {}
      )
      .addTo(map);
  }, []);

  // Build/update GeoJSON layer whenever parks change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove previous layer if it exists
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    // Clear marker ref map
    markerRefs.current = {};

    if (!parks || parks.length === 0) return;

    const featureCollection = {
      type: "FeatureCollection",
      features: parks,
    };

    const geoJsonLayer = L.geoJSON(featureCollection, {
      pointToLayer: (feature, latlng) => {
        const marker = L.circleMarker(latlng, {
          radius: 5,
          fillColor: "#4dd0e1", // default style
          color: "#26c6da",
          weight: 1,
          fillOpacity: 1,
        });

        // Store reference for later highlighting
        const id = getParkId(feature);
        markerRefs.current[id] = marker;

        return marker;
      },
      onEachFeature: (feature, layer) => {
        const p = (feature && feature.properties) || {};

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

        const popupContent = `
          <b>${p.park_name ?? ""}</b><br>
          ${p.park_address ?? ""}<br>
          ${p.park_city ?? ""}, ${p.park_state ?? "FL"} ${
          p.park_zip ?? ""
        }<br>
          <br>
          <b>County:</b> ${p.county ?? ""}<br>
          <b>MH Spaces:</b> ${p.mh_spaces ?? "N/A"}<br>
          <b>RV Spaces:</b> ${p.rv_spaces ?? "N/A"}<br>
          <b>Billing Spaces:</b> ${p.billing_spaces ?? "N/A"}<br>
          <b>Total Spaces:</b> ${totalSpaces}<br>
          <b>Latitude:</b> ${p.latitude ?? ""}<br>
          <b>Longitude:</b> ${p.longitude ?? ""}<br>
          <b>Geocode Status:</b> ${p.geocode_status ?? ""}<br>
        `;
        layer.bindPopup(popupContent);

        // When marker is clicked, notify parent so it can update list + details
        layer.on("click", () => {
          if (onSelectPark) onSelectPark(feature);
        });
      },
    });

    geoJsonLayerRef.current = geoJsonLayer;
    geoJsonLayer.addTo(map);
  }, [parks, onSelectPark]);

  // When selectedPark changes: zoom/fly and highlight marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedPark) return;

    const coords = selectedPark.geometry?.coordinates;

    // Skip flyTo on the very first selection (initial load)
    if (firstSelectionRef.current) {
      firstSelectionRef.current = false;
    } else if (coords && coords.length >= 2) {
      const [lon, lat] = coords; // GeoJSON: [lon, lat]
      map.flyTo([lat, lon], 12);
    }

    const selectedId = getParkId(selectedPark);

    // Reset all markers to default style
    Object.values(markerRefs.current).forEach((marker) => {
      marker.setStyle({
        radius: 5,
        fillColor: "#4dd0e1",
        color: "#26c6da",
        weight: 1,
        fillOpacity: 1,
      });
    });

    // Highlight selected marker
    const selectedMarker = markerRefs.current[selectedId];
    if (selectedMarker) {
      selectedMarker.setStyle({
        radius: 8,
        fillColor: "#ffeb3b", // bright yellow
        color: "#fdd835",
        weight: 2,
        fillOpacity: 1,
      });
      selectedMarker.bringToFront();
    }
  }, [selectedPark]);

  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
