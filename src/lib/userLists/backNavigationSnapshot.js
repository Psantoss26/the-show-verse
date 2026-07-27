// Decide qué caché puede pintar una página de usuario en su primer render.
//
// SOLO se restaura la instantánea al volver con atrás/adelante: ahí representa
// exactamente la vista que el usuario acaba de dejar (y conviene restaurarla al
// instante para conservar el scroll). En una entrada NORMAL no se pinta la caché
// aunque sea "reciente": esa caché es LOCAL de cada dispositivo, así que puede no
// reflejar cambios hechos desde otro dispositivo con el mismo usuario. Pintarla
// mostraría primero lo viejo y, tras revalidar (lento en móvil/producción), los
// títulos nuevos "aparecerían después". En su lugar se carga fresco y se pinta
// TODO a la vez. (La caché sigue sirviendo de respaldo offline en `loadX`.)
export function resolveUserListInitialSnapshot(cache, isBackNavigation) {
  const hasItems = Array.isArray(cache?.items) && cache.items.length > 0;
  const hasBackNavigationSnapshot = Boolean(isBackNavigation && hasItems);

  return {
    hasBackNavigationSnapshot,
    shouldRestoreSnapshot: hasBackNavigationSnapshot,
  };
}

// El índice de "añadido" se deriva de la posición de la respuesta remota. En una
// vuelta atrás no debe sustituir el orden que ya estaba visible; la respuesta se
// puede persistir para la próxima entrada sin repintar esta instantánea.
export function shouldPreserveAddedOrderSnapshot({
  hasBackNavigationSnapshot,
  sortBy,
}) {
  return Boolean(
    hasBackNavigationSnapshot &&
      (sortBy === "added-desc" || sortBy === "added-asc"),
  );
}

// Clave estable de un item de lista de usuario (favoritos/pendientes). El tipo
// se deriva igual que en las tarjetas: `media_type` si viene, si no se infiere
// de la presencia de `title` (película) frente a `name` (serie). Se incluye el
// tipo porque un id de TMDb puede coincidir entre una película y una serie.
export function userListItemKey(item) {
  const type = item?.media_type || (item?.title ? "movie" : "tv");
  return `${type}:${item?.id}`;
}

// Reconcilia la instantánea visible (el orden EXACTO que el usuario dejó al
// salir) con la respuesta fresca del servidor, SIN reordenar los elementos que
// persisten. Resuelve el bug de que, al volver atrás con la lista ordenada por
// fecha de añadido, los títulos añadidos o quitados desde una ficha quedaban
// invisibles hasta recargar la página:
//   - se descartan los que ya no están en el servidor (des-marcados),
//   - los que siguen conservan su `_addedIndex` previo → su posición no cambia,
//   - los NUEVOS reciben un `_addedIndex` por debajo del mínimo actual, de modo
//     que la ordenación por fecha (que ordena por `_addedIndex`) los coloca en el
//     extremo "reciente" —arriba en added-desc, abajo en added-asc— conservando
//     su orden relativo del servidor.
// Devuelve la MISMA referencia `prevItems` si no hubo altas ni bajas, para no
// forzar un re-render innecesario.
export function reconcileAddedOrderSnapshot(prevItems, freshItems, keyOf) {
  const prev = Array.isArray(prevItems) ? prevItems : [];
  const fresh = Array.isArray(freshItems) ? freshItems : [];
  const key = typeof keyOf === "function" ? keyOf : (item) => String(item?.id);

  const freshByKey = new Map();
  for (const item of fresh) freshByKey.set(key(item), item);

  const keptKeys = new Set();
  const kept = [];
  for (const item of prev) {
    const k = key(item);
    if (freshByKey.has(k) && !keptKeys.has(k)) {
      keptKeys.add(k);
      // Metadatos frescos del servidor, pero conservando SU posición previa
      // (mismo `_addedIndex` que ya estaba en pantalla).
      kept.push({ ...freshByKey.get(k), _addedIndex: item._addedIndex });
    }
  }

  const added = fresh.filter((item) => !keptKeys.has(key(item)));

  // Ni altas ni bajas respecto a la instantánea → nada que reconciliar.
  if (added.length === 0 && kept.length === prev.length) return prevItems;

  const minAddedIndex = kept.reduce(
    (min, item) => Math.min(min, Number(item._addedIndex) || 0),
    0,
  );
  // Los nuevos van todos por debajo del mínimo, conservando su orden relativo
  // del servidor (índice 0 = más reciente → el más "arriba" en added-desc).
  const rebasedAdded = added.map((item, i) => ({
    ...item,
    _addedIndex: minAddedIndex - added.length + i,
  }));

  return [...kept, ...rebasedAdded];
}
