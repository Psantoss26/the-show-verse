// Only effective settings select a recording; inactive preferences are retained.
export function detailOpenPreview(value, scope = "dashboard") {
  const prefix = scope === "userPages" ? "user-pages/" : "";
  if (value.target === "page") return `${prefix}page`;
  if (value.placement !== "right") return `${prefix}center`;
  return `${prefix}${value.drawerView === "docked" ? "docked" : "overlay"}-${value.contentView === "mobile" ? "mobile" : "modal"}`;
}
