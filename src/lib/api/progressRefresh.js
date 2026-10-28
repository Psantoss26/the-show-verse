// Continuar viendo se alimenta de lo que se reproduce FUERA de la web (la
// extensión del navegador y la app de Android), y su progreso llega al servidor
// cada ~30 s mientras se ve. Leerlo solo al montar dejaba la barra de progreso
// quieta en el primer punto. Esto relee:
//   - al volver a la pestaña o a la app (con un mínimo entre lecturas), y
//   - cada `intervalMs` mientras la página está a la vista.
// Devuelve la función que lo desactiva.

export const PROGRESS_REFRESH_MIN_MS = 30_000;
export const PROGRESS_REFRESH_INTERVAL_MS = 60_000;

export function watchProgressRefresh(
  load,
  { minMs = PROGRESS_REFRESH_MIN_MS, intervalMs = PROGRESS_REFRESH_INTERVAL_MS, now = () => Date.now() } = {},
) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let lastLoadAt = now();
  const refresh = () => {
    if (document.visibilityState !== "visible") return;
    if (now() - lastLoadAt < minMs) return;
    lastLoadAt = now();
    load();
  };
  const timer = window.setInterval(refresh, intervalMs);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
  };
}
