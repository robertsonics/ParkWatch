// backend/src/index.js
const express = require("express");
const app = express();
const PORT = process.env.PORT || 4000;

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "parkwatch-backend" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
