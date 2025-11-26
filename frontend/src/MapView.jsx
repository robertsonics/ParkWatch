// src/MapView.jsx
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapView({ parks, selectedPark, onSelectPark }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const geoJsonLayerRef = useRef(null);

  // One-time map initialization
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current).setView([27.5, -81.5], 6);
    mapInstanceRef.current = map;

    // Use whatever basemap(s) you currently have configured
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

  // Build/update GeoJSON layer when parks change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (!parks || parks.length === 0) return;

    const featureCollection = {
      type: "FeatureCollection",
      features: parks,
    };

    const geoJsonLayer = L.geoJSON(featureCollection, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 5,
          fillColor: "#4dd0e1", // bright for dark theme
          color: "#26c6da",
          weight: 1,
          fillOpacity: 1,
        }),
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
          ${p.park_city ?? ""}, ${p.park_state ?? "FL"} ${p.park_zip ?? ""}<br>
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

        // When marker clicked, notify parent so it can update list + details
        layer.on("click", () => {
          if (onSelectPark) onSelectPark(feature);
        });
      },
    });

    geoJsonLayerRef.current = geoJsonLayer;
    geoJsonLayer.addTo(map);
  }, [parks, onSelectPark]);

  // When selectedPark changes (e.g. from list click), zoom to it
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedPark) return;

    const coords = selectedPark.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    const [lon, lat] = coords; // GeoJSON order: [lon, lat]
    map.flyTo([lat, lon], 12); // tweak zoom level as desired
  }, [selectedPark]);

  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
