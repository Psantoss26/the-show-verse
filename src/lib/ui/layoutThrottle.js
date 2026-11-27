// Cadencia con la que los datos que llegan por lotes (plataformas, notas de
// IMDb/Trakt) pueden recolocar las tarjetas de Favoritos y Pendientes.
//
// Cada lote reagrupa o reordena, y <FlipReorder> anima el cambio en ~320 ms.
// Si los lotes llegan más rápido, cada recolocación corta la anterior a mitad:
// las tarjetas cambian de rumbo varias veces por segundo y se ven saltar. Con
// este intervalo cada movimiento termina (y reposa un instante) antes del
// siguiente; el último lote se aplica siempre.
export const LAYOUT_SETTLE_MS = 450;

// Milisegundos que faltan para poder aplicar un valor nuevo: 0 = ya.
export function throttleDelay(lastAppliedAt, now, intervalMs = LAYOUT_SETTLE_MS) {
  if (lastAppliedAt == null) return 0;
  const elapsed = now - lastAppliedAt;
  if (!(elapsed >= 0)) return 0; // reloj hacia atrás: no bloquear
  return Math.max(0, intervalMs - elapsed);
}
