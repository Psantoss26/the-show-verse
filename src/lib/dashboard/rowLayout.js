// La alternancia poster/backdrop forma parte del diseño de escritorio. En móvil
// todas las filas genéricas comparten la tarjeta poster; las filas especiales
// (Top de hoy y Mejor valoradas) no pasan por esta decisión.
export function shouldUseDashboardBackdropRow({
  isMobile,
  rowIndex,
  forcePoster = false,
}) {
  return !isMobile && rowIndex % 2 === 1 && !forcePoster;
}
