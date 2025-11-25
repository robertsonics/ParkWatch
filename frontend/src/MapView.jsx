import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapView() {
  const mapRef = useRef<HTMLDivElement | null>(null);   // DOM node for the map
  const mapInstanceRef = useRef<L.Map | null>(null);    // store Leaflet map instance

  useEffect(() => {
    if (mapInstanceRef.current) return; // don't reinitialize

    // Initialize the map
    const map = L.map(mapRef.current as HTMLDivElement).setView([27.5, -81.5], 6);
    mapInstanceRef.current = map;

    // Base layers
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

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

    // Load GeoJSON from /public
    fetch("/FL_Parks_2025.geojson")
      .then((r) => r.json())
      .then((data) => {
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
            const p: any = feature.properties || {};

            // MH + RV spaces combined
            const mhSpaces = p.mh_spaces ?? 0;
            const rvSpaces = p.rv_spaces ?? 0;
            const totalSpaces =
              (typeof mhSpaces === "number" ? mhSpaces : Number(mhSpaces) || 0) +
              (typeof rvSpaces === "number" ? rvSpaces : Number(rvSpaces) || 0);

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
        console.error("Error loading FL_Parks_2025.geojson:", err);
      });
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
