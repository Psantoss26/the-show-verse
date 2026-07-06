---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/offline

> Cola de mutaciones offline para la PWA — hoy un *shim* neutralizado que solo hace de passthrough a `fetch`.

## Responsabilidad

El módulo mantiene la **misma API** que tenía cuando existía una funcionalidad PWA offline completa (cola de mutaciones en `localStorage`, reintento al recuperar conexión), pero esa funcionalidad fue revertida (commit `12579f8 revertir cambios bloqueo url y app pwa offline`, tras `d6c261b aplicación pwa offline`). El fichero se dejó como *shim* — cada función es efectivamente un no-op o un passthrough directo a `fetch` — para no tener que tocar todos los puntos de llamada que ya importaban `offlineMutationFetch` y compañía.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `syncQueue.js` | `getOfflineQueueCount()` → siempre `0`. `subscribeOfflineQueue(listener)` → invoca al listener con `0` y devuelve un unsubscribe vacío. `enqueueOfflineMutation()` → limpia cualquier cola antigua en `localStorage` y devuelve `0` (ya no encola nada). `flushOfflineMutations()` → limpia la cola y devuelve `{synced: 0, pending: 0}`. `offlineMutationFetch(url, init)` → limpia la cola antigua y hace un `fetch(url, init)` normal, sin pasar por ninguna cola. `OFFLINE_QUEUE_EVENT` — nombre del evento (`showverse:mutation-queue-disabled`) que se sigue disparando al limpiar restos de una cola previa en el navegador del usuario. |

## Cómo se usa

`offlineMutationFetch` sigue siendo el punto de entrada usado por las mutaciones críticas (favoritos, watchlist, historial y valoraciones de Trakt/TMDb), por si en el futuro se retoma una cola real; hoy simplemente hace la petición de red directamente:

- [[lib-api]]: `tmdb.js` (`markAsFavorite`, `markInWatchlist`) y `traktClient.js` (marcar visto, historial, episodios/temporadas, valoraciones).
- Componentes: `ScoreboardBar.jsx`, `EpisodeDetailsClient.jsx`, `SeasonDetailsClient.jsx`.

## Dependencias

- Ninguna API externa. Solo `window.localStorage`/`CustomEvent` del navegador para limpiar restos de la cola offline anterior.

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[lib-userlists]]
