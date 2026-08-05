// Espera lo suficiente para distinguir un hover intencional de un simple paso
// del cursor, pero mantiene la vista previa perceptiblemente inmediata.
export const DASHBOARD_PREVIEW_OPEN_DELAY_MS = 240;

export const DASHBOARD_PREVIEW_CLOSE_DELAY_MS = 280;

// Curva compartida por todas las filas de dashboard. La entrada desacelera de
// forma suave y la salida conserva movimiento suficiente para que el cambio de
// vuelta a la portada no parezca un corte.
export const DASHBOARD_PREVIEW_EASE = [0.16, 1, 0.3, 1];
export const DASHBOARD_PREVIEW_EXIT_EASE = [0.4, 0, 0.2, 1];

export const DASHBOARD_PREVIEW_ENTER_TRANSITION = {
  duration: 0.38,
  ease: DASHBOARD_PREVIEW_EASE,
};

export const DASHBOARD_PREVIEW_EXIT_TRANSITION = {
  duration: 0.24,
  ease: DASHBOARD_PREVIEW_EXIT_EASE,
};

export const DASHBOARD_PREVIEW_REDUCED_TRANSITION = {
  duration: 0.08,
};
