// Use the same import boundary for preparation and rendering. Separate dynamic
// imports can emit distinct wrapper chunks, even when they share chart code.
export function loadProfileCharts() {
  return import("@/app/stats/profileCharts");
}
