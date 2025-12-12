// src/risk.js
// Single source of truth for flood risk tiering.

export function floodTier(flood_risk) {
  const r = Number(flood_risk);

  // Treat unknown/missing conservatively.
  if (!Number.isFinite(r)) return "yellow";

  // IMPORTANT: Adjust these thresholds to your real scale.
  // If your flood_risk is 1=green, 2=yellow, 3=red, this is correct:
  if (r >= 3) return "red";
  if (r >= 2) return "yellow";
  return "green";
}

export function tierColor(tier) {
  return (
    {
      green: "#22c55e",
      yellow: "#eab308",
      red: "#ef4444",
    }[tier] ?? "#eab308"
  );
}
