---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/userLists

> Actualización optimista de las cachés locales de Favoritos, Pendientes e Historial tras una mutación exitosa, para que un título nuevo aparezca al instante en esas páginas.

## Responsabilidad

Las páginas de Favoritos/Pendientes/Historial pintan al instante desde una caché *stale-while-revalidate* en `localStorage` y refrescan en segundo plano. Si el usuario añade un título desde otra pantalla (ficha, dashboard), esa caché no lo contiene todavía y tarda en aparecer hasta que termina el refresco. Este módulo actualiza la caché correspondiente en cuanto la mutación tiene éxito, para que el nuevo título aparezca a la vez que el resto en el pintado instantáneo; el refresco posterior reescribe igualmente la lista completa con los datos canónicos. Ninguna función lanza excepciones — un fallo aquí nunca debe romper la mutación que la invoca.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `optimisticListCache.js` | Núcleo puro y testeable: `addItemToEnvelope(envelope, item, {keyOf, itemsField})` (antepone deduplicando), `removeItemsFromEnvelope(envelope, predicate, {itemsField})`. Construcción de items mínimos renderizables: `buildTmdbListItem` (favoritos/watchlist), `buildHistoryEntry` (historial, con id temporal `optimistic:...` y sin deduplicar — el historial admite repetidos). Configuración por lista (`LISTS`: `favorites`/`watchlist` con clave `media_type:id`, `history` sin dedup) y claves de caché de "En progreso"/"Completadas" que en su lugar se **invalidan** (no se actualizan optimistamente, por ser demasiado frágil reconstruir el progreso). API pública: `cacheAddFavorite`/`cacheRemoveFavorite`, `cacheAddWatchlist`/`cacheRemoveWatchlist`, `cacheAddHistory`/`cacheRemoveHistory`, `clearWatchDerivedCaches`. Acceso a `localStorage` con guardas (`typeof window`, try/catch por cuota/modo privado). |

## Cómo se usa

Llamado exclusivamente desde [[lib-api]] tras confirmar una mutación en el backend: `tmdb.js` (`markAsFavorite`→`cacheAddFavorite/cacheRemoveFavorite`, `markInWatchlist`→`cacheAddWatchlist/cacheRemoveWatchlist`) y `traktClient.js` (marcar visto/historial → `cacheAddHistory/cacheRemoveHistory`; marcar episodio visto → `clearWatchDerivedCaches`). No lo consume ningún componente directamente — actúa "por detrás" de las funciones de mutación.

## Dependencias

- Ninguna API externa. Solo `window.localStorage` (con las mismas claves de caché que usan las páginas `FavoritesClient`, `WatchlistClient`, `HistoryClient`, `InProgressClient`).
- Consumido por [[lib-api]] (`tmdb.js`, `traktClient.js`).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[lib-offline]]
