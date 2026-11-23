// Deslizamientos en curso de la pastilla de los selectores de sección
// (useSlidingSectionIndicator), por grupo.
//
// Entre rutas hermanas (Historial ↔ Continuar viendo, En progreso ↔
// Completadas) el toque arranca el deslizamiento en el selector de la página
// que se va, y el de la página nueva se monta a mitad. Si este no lo retoma,
// la pastilla salta al final en cuanto llega la página: unas veces se ve el
// recorrido entero y otras medio, según lo que tarde en montarse (en la APK,
// casi siempre medio). Con el mismo origen y el mismo instante de inicio el
// selector nuevo sigue el mismo deslizamiento, como en Social y Listas, donde
// el selector no se vuelve a montar.

export function recordSlide(flights, groupId, { key, from, to, startedAt }) {
  if (startedAt == null) return;
  flights.set(groupId, { key, from, to, startedAt });
}

// Devuelve { from, startedAt } si en `groupId` hay un deslizamiento hacia
// `key` que aún no ha terminado en `now` (tiempo de document.timeline).
export function resumableSlide(flights, groupId, key, now, duration) {
  const flight = flights.get(groupId);
  if (!flight || flight.key !== key || now == null) return null;
  const elapsed = now - flight.startedAt;
  if (!(elapsed >= 0 && elapsed < duration)) return null;
  return { from: flight.from, startedAt: flight.startedAt };
}
