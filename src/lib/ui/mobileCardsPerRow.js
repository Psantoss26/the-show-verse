// src/lib/ui/mobileCardsPerRow.js
// Nº de tarjetas por fila en móvil para las filas tipo dashboard (carruseles
// de Inicio, Películas, Series). Configurable en Ajustes ("Tarjetas por fila
// (móvil)"): 3 (por defecto) o 4. NO se aplica a las páginas de usuario que
// muestran un grid (Favoritos/Pendientes/Historial/Biblioteca) ni a filas de
// diseño especial con componente propio (hero/ranking), que mantienen su nº de
// tarjetas propio independientemente de este ajuste.
export const DEFAULT_MOBILE_CARDS_PER_ROW = 3;
export const MOBILE_CARDS_PER_ROW_OPTIONS = [3, 4];

export function getMobileCardsPerRow(preferences) {
  const value = preferences?.uiSettings?.mobileCardsPerRow;
  return value === 4 ? 4 : DEFAULT_MOBILE_CARDS_PER_ROW;
}
