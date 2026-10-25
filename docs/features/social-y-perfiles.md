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
| `/social` | Sección Social. Su barra elige entre **Hoy / Siguiendo / Yo**. Hoy (por defecto) es lo destacado de hoy, ayer o la semana, con historias y más activos, y sus filtros Quién, Día y Agrupar van en la misma barra (ver [[hoy]]). Siguiendo (`?view=activity`) y Yo (`?view=mine`) son el feed de las cuentas que sigo o el mío. Las cifras de la cabecera son Actividades y Personas de Hoy y Activos de la semana. Color propio: rosa/fucsia. |
| `/today` | Redirige a la vista Hoy de `/social`. |
| `/members` | Directorio y buscador de miembros (`/api/users/search`). |

### Pestañas del perfil (`src/app/u/[username]/profileRoutes.js`)

`profile` (resumen), `level` ([[niveles-y-logros]]), `statistics`, `neuronal`, `activity`, `watched`, `reviews`, `favorites`, `watchlist`, `ratings`, `lists` y `social`.

- **Destacados del perfil:** 5 películas y 5 series elegidas por el usuario (`/v1/users/me/profile-favorites`).
- **Vista neuronal:** grafo de todos los títulos del usuario con sus géneros, sagas, meses de visionado y listas. El backend responde `{ unchanged: true }` si el cliente ya tiene la versión vigente (`?v=<firma>`), y guarda el grafo en Redis por firma (`backend/src/lib/neuralGraph.js`, colores en `src/lib/profile/neuralGraph.js`).
- **Tarjetas ajenas decoradas:** al ver el perfil de otro, `POST /v1/items/states` marca qué títulos están también en la biblioteca del visitante, sin revelar nada más de él.

## Feed y actividad

El feed mezcla los mismos tipos de evento en los dos modos: visto, reseña, favorito, pendiente, puntuación y lista. En Siguiendo y Yo se ve como lista, lista con póster o lista con backdrop; en las tres, cada evento lleva la foto de perfil de quien lo hizo (con póster o backdrop, junto a la imagen del título). `/v1/users/feed/summary` va aparte porque la cabecera no cambia al paginar.

Las alertas de la campana del navbar (`/v1/users/notifications`) reutilizan el feed propio. Ver [[push-notifications]]. La campana está montada dos veces (barra de escritorio y de móvil); las dos comparten la petición en curso (`fetchAlertsShared` en `AlertsMenu.jsx`), así que al entrar o navegar se pide una sola vez.

## «Tus amigos» en la ficha

En cada ficha, `FollowingActivity` (`src/components/details/FollowingActivity.jsx`) enseña qué han hecho con ese título las cuentas que sigues: visto o progreso, nota, favorito, pendiente, reseña y listas públicas. Backend: `GET /v1/community/{type}/{tmdbId}/following` → `backend/src/lib/followingTitleActivity.js`, con una consulta por tabla filtrada por el título, así que el coste no crece con el historial de los seguidos.

## Endpoints

Ver la sección *Social y perfiles* de [[backend_api_reference]]. En Next, los proxies están en `src/app/api/users/**`.

## Relacionado
- [[hoy]]
- [[Features]]
- [[comunidad]]
- [[niveles-y-logros]]
