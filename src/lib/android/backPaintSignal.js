// Cuándo avisar a la app de Android de que la página a la que se vuelve ya está
// pintada (ver AndroidBackPaintSignal y AtrasPredictivo.kt). Puro, con pruebas.

/** Ruta comparable: sin barra final y sin codificar (`usePathname` decodifica). */
export function normalizePath(path) {
  let value = String(path || "/");
  try {
    value = decodeURIComponent(value);
  } catch {
    /* ruta mal codificada: se compara tal cual */
  }
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value || "/";
}

/**
 * Tras un `popstate`: si la ruta de destino es la ya pintada (solo cambia la
 * query o el hash) no habrá un commit de ruta que esperar y se avisa ya; si
 * cambia, se espera al commit de la nueva ruta.
 */
export function popStateNeedsRouteCommit(destinationPath, committedPath) {
  return normalizePath(destinationPath) !== normalizePath(committedPath);
}
