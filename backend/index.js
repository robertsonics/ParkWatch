const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

// Allow CORS from anywhere for now (you can lock this down later)
app.use(cors());

// Postgres connection (Railway DB)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Root route just to confirm the server is alive
app.get("/", (req, res) => {
  res.send("ParkWatch backend is running");
});

// /parks route returning GeoJSON built from fl_parks table
app.get("/parks", async (req, res) => {
  try {
    const sql = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(feature)
      ) AS geojson
      FROM (
        SELECT jsonb_build_object(
          'type',       'Feature',
          'geometry',   jsonb_build_object(
                          'type', 'Point',
                          'coordinates', jsonb_build_array(longitude, latitude)
                        ),
          'properties', to_jsonb(row) - 'latitude' - 'longitude'
        ) AS feature
        FROM (
          SELECT
            id,
            permit,
            county,
            park_name,
            park_address,
            park_city,
            park_state,
            park_zip,
            phone,
            owner_co,
            owner_first,
            owner_last,
            owner_address,
            owner_city,
            owner_state,
            owner_zip,
            mail_address,
            mail_city,
            mail_state,
            mail_zip,
            park_type,
            mh_spaces,
            rv_spaces,
            billing_spaces,
            latitude,
            longitude,
            geocode_status
          FROM fl_parks
        ) row
      ) features;
    `;

    const result = await pool.query(sql);
    const geojson =
      result.rows[0]?.geojson || { type: "FeatureCollection", features: [] };

    res.json(geojson);
  } catch (err) {
    console.error("Error in /parks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`ParkWatch backend listening on port ${port}`);
});
