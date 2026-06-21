// Shared chart palette + theme for the Profile page.
// Kept in its own module so both StatsClient (data prep) and the lazily-loaded
// profileCharts module can import them without pulling recharts into the main
// Profile bundle.

export const COLORS = {
  emerald: "#10b981",
  blue: "#3b82f6",
  purple: "#a855f7",
  yellow: "#eab308",
  pink: "#ec4899",
  red: "#ef4444",
  cyan: "#06b6d4",
  orange: "#f97316",
  slate: "#64748b",
  indigo: "#6366f1",
  teal: "#14b8a6",
  rose: "#f43f5e",
  lime: "#84cc16",
  background: "#18181b", // zinc-900
};

export const CHART_THEME = {
  background: "transparent",
  text: "#a1a1aa", // zinc-400
  grid: "#27272a", // zinc-800
  tooltipBg: "#18181b",
  tooltipBorder: "#27272a",
};
