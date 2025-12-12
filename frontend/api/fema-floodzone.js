// frontend/api/fema-floodzone.js
export default async function handler(req, res) {
  // CORS (safe for public FEMA data; keeps local/dev simple too)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  // FEMA NFHL Flood Hazard Zones layer (28)
  // MapServer: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer
  // Layer 28: Flood Hazard Zones
  const url = new URL(
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
  );

  // ArcGIS REST query parameters
  url.searchParams.set("f", "geojson"); // NFHL service supports geoJSON
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("geometry", `${lon},${lat}`); // x,y = lon,lat
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("resultRecordCount", "1");

  // Cache at Vercel edge: 1 day
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=86400"
  );

  const r = await fetch(url.toString());
  if (!r.ok) {
    return res.status(502).json({ error: "FEMA query failed", status: r.status });
  }

  const geojson = await r.json();
  return res.status(200).json(geojson);
}
