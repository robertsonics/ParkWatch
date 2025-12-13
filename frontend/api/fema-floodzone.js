// frontend/api/fema-floodzone.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=86400"
  );

  const BASE =
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

  const CANDIDATES = 25;

  function buildQueryUrl(params) {
    const url = new URL(BASE);
    url.searchParams.set("f", "geojson");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("outFields", "*");
    url.searchParams.set("resultRecordCount", String(CANDIDATES));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return url;
  }

  async function fetchGeoJson(url) {
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`FEMA query failed: ${r.status}`);
    return r.json();
  }

  function featureScoreNearestVertex(feature, lon0, lat0) {
    const geom = feature?.geometry;
    if (!geom) return Number.POSITIVE_INFINITY;

    const coords =
      geom.type === "Polygon"
        ? geom.coordinates
        : geom.type === "MultiPolygon"
          ? geom.coordinates.flat()
          : null;

    if (!coords || coords.length === 0) return Number.POSITIVE_INFINITY;

    let best = Number.POSITIVE_INFINITY;
    for (const ring of coords) {
      if (!Array.isArray(ring)) continue;
      for (const pt of ring) {
        const x = pt?.[0], y = pt?.[1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const dx = x - lon0, dy = y - lat0;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
    }
    return best;
  }

  function chooseBestFeature(fc, lon0, lat0) {
    const feats = fc?.features;
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

  function oneOrEmpty(best, meta) {
    // Keep output valid GeoJSON; include meta so you can debug gaps
    return {
      type: "FeatureCollection",
      features: best ? [best] : [],
      meta,
    };
  }

  // Convert meters to degrees around this latitude
  function metersToDeg(meters) {
    const degLat = meters / 111320; // ~meters per degree latitude
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const degLon = cosLat > 0.2 ? degLat / cosLat : degLat;
    return { degLat, degLon };
  }

  try {
    // 1) Primary: point intersects
    const intersectsUrl = buildQueryUrl({
      geometryType: "esriGeometryPoint",
      geometry: `${lon},${lat}`,
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    });

    const intersectsGJ = await fetchGeoJson(intersectsUrl);
    let best = chooseBestFeature(intersectsGJ, lon, lat);
    if (best) {
      return res.status(200).json(oneOrEmpty(best, { method: "point_intersects" }));
    }

    // 2) Progressive fallback envelopes: 300m → 1km → 3km
    const radiiMeters = [300, 1000, 3000];

    for (const rMeters of radiiMeters) {
      const { degLat, degLon } = metersToDeg(rMeters);
      const xmin = lon - degLon;
      const xmax = lon + degLon;
      const ymin = lat - degLat;
      const ymax = lat + degLat;

      const envelopeUrl = buildQueryUrl({
        geometryType: "esriGeometryEnvelope",
        geometry: `${xmin},${ymin},${xmax},${ymax}`,
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
      });

      const envelopeGJ = await fetchGeoJson(envelopeUrl);
      best = chooseBestFeature(envelopeGJ, lon, lat);

      if (best) {
        return res.status(200).json(
          oneOrEmpty(best, { method: "envelope_fallback", radius_m: rMeters })
        );
      }
    }

    // 3) Still nothing: genuine gap/unmapped or very bad coordinates
    return res.status(200).json(
      oneOrEmpty(null, { method: "none", reason: "no_features_within_3km" })
    );
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "FEMA query failed", details: String(err?.message ?? err) });
  }
}
