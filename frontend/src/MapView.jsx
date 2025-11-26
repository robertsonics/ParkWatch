import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapView() {
  const mapRef = useRef(null);        // DOM node for the map
  const mapInstanceRef = useRef(null); // store Leaflet map instance

  useEffect(() => {
    // Don't reinitialize the map
    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    // Initialize the map
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

    // 👉 Backend base URL from Vite env
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (!apiBase) {
      console.error("VITE_API_BASE_URL is not defined. Check your .env and Vercel env vars.");
      return;
    }

    // Load GeoJSON from backend API instead of static file
    fetch(`${apiBase}/parks`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} loading ${apiBase}/parks`);
        }
        return r.json();
      })
      .then((data) => {
        console.log("Loaded parks GeoJSON from backend:", data);

        L.geoJSON(data, {
          pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
              radius: 4,
              fillColor: "#007bff", // blue fill
              color: "#003f88",     // darker outline
              weight: 1,
              fillOpacity: 1,
            });
          },
          onEachFeature: function (feature, layer) {
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
          },
        }).addTo(map);
      })
      .catch((err) => {
        console.error("Error loading parks from backend:", err);
      });
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
