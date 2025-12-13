// frontend/api/fema-floodzone.js
export default async function handler(req, res) {
  // CORS (public data; keeps local/dev simple)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  // Cache at Vercel edge: 1 day
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=86400"
  );

  const BASE =
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

  // How many candidates to retrieve when multiple polygons intersect / overlap.
  // More than 1 is critical; "first" is not deterministic.
  const CANDIDATES = 25;

  // Fallback search radius, approx. 300m, in degrees latitude.
  // 1 deg lat ~ 111,320 m => 300m ~ 0.0027 deg
  const fallbackDegLat = 300 / 111320;

  // Longitude degrees shrink with latitude; adjust for Florida
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const fallbackDegLon = cosLat > 0.2 ? fallbackDegLat / cosLat : fallbackDegLat;

  // Build an ArcGIS REST query URL
  function buildQueryUrl(params) {
    const url = new URL(BASE);
    url.searchParams.set("f", "geojson");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("outFields", "*");
    // Helpful for performance: only return candidates near the point
    url.searchParams.set("resultRecordCount", String(CANDIDATES));
    url.searchParams.set("resultOffset", "0");

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    return url;
  }

  async function fetchGeoJson(url) {
    const r = await fetch(url.toString());
    if (!r.ok) {
      const text = await safeText(r);
      throw new Error(`FEMA query failed: ${r.status} ${text ?? ""}`.trim());
    }
    return r.json();
  }

  async function safeText(resp) {
    try {
      return await resp.text();
    } catch {
      return null;
    }
  }

  // Compute squared distance from point to a polygon ring vertex set (fast + robust)
  // We use "nearest vertex" as a practical proxy for "nearest polygon" without heavy geo libs.
  function featureScoreNearestVertex(feature, lon0, lat0) {
    const geom = feature?.geometry;
    if (!geom) return Number.POSITIVE_INFINITY;

    // GeoJSON polygon/multipolygon coordinates
    const coords = geom.type === "Polygon"
      ? geom.coordinates
      : geom.type === "MultiPolygon"
        ? geom.coordinates.flat()
        : null;

    if (!coords || coords.length === 0) return Number.POSITIVE_INFINITY;

    let best = Number.POSITIVE_INFINITY;

    // coords is an array of rings; ring is array of [lon,lat]
    for (const ring of coords) {
      if (!Array.isArray(ring)) continue;
      for (const pt of ring) {
        const x = pt?.[0];
        const y = pt?.[1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const dx = x - lon0;
        const dy = y - lat0;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
    }
    return best;
  }

  // Pick the "best" feature: nearest to the query point
  function chooseBestFeature(featureCollection, lon0, lat0) {
    const feats = featureCollection?.features;
    if (!Array.isArray(feats) || feats.length === 0) return null;

    let bestF = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const f of feats) {
      const score = featureScoreNearestVertex(f, lon0, lat0);
      if (score < bestScore) {
        bestScore = score;
        bestF = f;
      }
    }
    return bestF;
  }

  // Return a FeatureCollection with exactly one feature (or empty)
  function singleFeatureCollection(featureOrNull) {
    if (!featureOrNull) return { type: "FeatureCollection", features: [] };
    return { type: "FeatureCollection", features: [featureOrNull] };
  }

  try {
    // 1) Primary: point intersects polygon
    const intersectsUrl = buildQueryUrl({
      geometryType: "esriGeometryPoint",
      geometry: `${lon},${lat}`,
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    });

    const intersectsGJ = await fetchGeoJson(intersectsUrl);
    let best = chooseBestFeature(intersectsGJ, lon, lat);

    // 2) Fallback: small envelope around point (approx "nearest within ~300m")
    if (!best) {
      const xmin = lon - fallbackDegLon;
      const xmax = lon + fallbackDegLon;
      const ymin = lat - fallbackDegLat;
      const ymax = lat + fallbackDegLat;

      const envelopeUrl = buildQueryUrl({
        geometryType: "esriGeometryEnvelope",
        geometry: `${xmin},${ymin},${xmax},${ymax}`,
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
      });

      const envelopeGJ = await fetchGeoJson(envelopeUrl);
      best = chooseBestFeature(envelopeGJ, lon, lat);
    }

    return res.status(200).json(singleFeatureCollection(best));
  } catch (err) {
    // If FEMA is down or returns unexpected results, fail gracefully
    console.error(err);
    return res.status(502).json({
      error: "FEMA query failed",
      details: String(err?.message ?? err),
    });
  }
}
