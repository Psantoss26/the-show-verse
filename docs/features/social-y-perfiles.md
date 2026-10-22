---
tags: [area/features, area/frontend, area/backend, type/referencia]
aliases: [Social, Perfiles públicos, Seguidores]
---
# Social y perfiles públicos

Capa social de The Show Verse: perfiles públicos de cada miembro, seguir y dejar de seguir, un feed de actividad y un directorio de miembros.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/u/[username]` | Perfil público de un miembro (layout persistente `layout.jsx` + `ProfileRouteShell`). |
| `/u/[username]/[section]` | Pestañas del perfil (ver abajo). |
| `/u/[username]/followers`, `/following` | Seguidores y seguidos (`FollowListClient`). |
| `/profile` y `/profile/[section]` | El mismo perfil, para el usuario con sesión. El layout persistente cambia solo la sección activa. |
| `/social` | Feed: actividad de las cuentas que sigo (`scope=following`) o la mía (`scope=me`), con cifras en la cabecera. Color propio: rosa/fucsia. |
| `/members` | Directorio y buscador de miembros (`/api/users/search`). |

### Pestañas del perfil (`src/app/u/[username]/profileRoutes.js`)

`profile` (resumen), `level` ([[niveles-y-logros]]), `statistics`, `neuronal`, `activity`, `watched`, `reviews`, `favorites`, `watchlist`, `ratings`, `lists` y `social`.

- **Destacados del perfil:** 5 películas y 5 series elegidas por el usuario (`/v1/users/me/profile-favorites`).
- **Vista neuronal:** grafo de todos los títulos del usuario con sus géneros, sagas, meses de visionado y listas. El backend responde `{ unchanged: true }` si el cliente ya tiene la versión vigente (`?v=<firma>`), y guarda el grafo en Redis por firma (`backend/src/lib/neuralGraph.js`, colores en `src/lib/profile/neuralGraph.js`).
- **Tarjetas ajenas decoradas:** al ver el perfil de otro, `POST /v1/items/states` marca qué títulos están también en la biblioteca del visitante, sin revelar nada más de él.

## Feed y actividad

El feed mezcla los mismos tipos de evento en los dos modos: visto, reseña, favorito, pendiente, puntuación y lista. `/v1/users/feed/summary` va aparte porque la cabecera no cambia al paginar.

Las alertas de la campana del navbar (`/v1/users/notifications`) reutilizan el feed propio. Ver [[push-notifications]].

## «Tus amigos» en la ficha

En cada ficha, `FollowingActivity` (`src/components/details/FollowingActivity.jsx`) enseña qué han hecho con ese título las cuentas que sigues: visto o progreso, nota, favorito, pendiente, reseña y listas públicas. Backend: `GET /v1/community/{type}/{tmdbId}/following` → `backend/src/lib/followingTitleActivity.js`, con una consulta por tabla filtrada por el título, así que el coste no crece con el historial de los seguidos.

## Endpoints

Ver la sección *Social y perfiles* de [[backend_api_reference]]. En Next, los proxies están en `src/app/api/users/**`.

## Relacionado
- [[Features]]
- [[comunidad]]
- [[niveles-y-logros]]
