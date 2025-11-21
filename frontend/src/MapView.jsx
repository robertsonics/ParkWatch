import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapView() {
  const mapRef = useRef(null);   // DOM node for the map
  const mapInstanceRef = useRef(null); // store Leaflet map instance

  useEffect(() => {
    if (mapInstanceRef.current) return; // don't reinitialize

    // Initialize the map
    const map = L.map(mapRef.current).setView([27.5, -81.5], 6);
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
    fetch("/parks.geojson")
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
            const p = feature.properties;
            const popupContent = `
              <b>${p.name}</b><br>
              ${p.address}<br>
              ${p.city}, FL ${p.zip}<br>
              <br>
              <b>County:</b> ${p.county}<br>
              <b>Lots:</b> ${p.lots}<br>
              <b>Status:</b> ${p.status}<br>
              <b>Latitude:</b> ${p.latitude}<br>
              <b>Longitude:</b> ${p.longitude}
            `;
            layer.bindPopup(popupContent);
          },
        }).addTo(map);
      })
      .catch((err) => {
        console.error("Error loading parks.geojson:", err);
      });
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
