# The Show Verse API Reference

Documento oficial de referencia para la API propia de The Show Verse.

## URLs

Produccion:

```text
https://the-show-verse-production.up.railway.app
```

Local:

```text
http://localhost:3001
```

Documentacion interactiva:

```text
/docs
```

Contrato OpenAPI:

```text
/openapi.json
/docs/json
/docs/yaml
```

## Autenticacion

La API usa JWT Bearer tokens.

Header:

```http
Authorization: Bearer <accessToken>
```

Puedes obtener tokens desde:

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/tmdb`
- `POST /v1/auth/refresh`

El frontend de Vercel usa el login TMDb existente y, durante el callback, crea una sesion propia del backend con `POST /v1/auth/tmdb`. Despues guarda cookies httpOnly:

- `showverse_access_token`
- `showverse_refresh_token`

Las rutas Next.js de compatibilidad usan esas cookies para llamar al backend como primera opcion.

## Convenciones

Media types internos del backend:

```text
movie
tv
episode
```

Compatibilidad Trakt en el frontend:

```text
show -> tv
```

Errores:

```json
{
  "error": "Validation error",
  "issues": []
}
```

Paginacion habitual:

```text
?page=1&limit=50
```

## Endpoints publicos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/` | Metadata del servicio |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check con PostgreSQL y Redis |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/openapi.json` | OpenAPI JSON |

## Auth

Prefijo `/v1/auth` (`backend/src/routes/auth.js`).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/register` | No | Registro por email/password |
| `POST` | `/v1/auth/login` | No | Login por email/password |
| `POST` | `/v1/auth/google` | No | Login con Google (ver [google_auth_setup](./google_auth_setup.md)) |
| `POST` | `/v1/auth/tmdb` | No | Crea/recupera usuario backend desde sesion TMDb valida |
| `POST` | `/v1/auth/tmdb/connect` | Si | Vincula TMDb al usuario autenticado actual sin cambiar de cuenta |
| `POST` | `/v1/auth/refresh` | No | Rota refresh token y devuelve access token nuevo |
| `POST` | `/v1/auth/logout` | No | Revoca un refresh token |
| `POST` | `/v1/auth/logout/all` | Si | Revoca todas las sesiones del usuario |
| `GET` | `/v1/auth/me` | Si | Perfil autenticado |
| `PATCH` | `/v1/auth/me` | Si | Actualiza perfil |
| `GET` | `/v1/auth/connections` | Si | Cuentas vinculadas del usuario (Netflix/dispositivos, Letterboxd, etc.) |

### Cuenta (email y contraseña)

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/account/email/change-request` | Si | Pide el cambio de email y envia un enlace de confirmacion al nuevo correo |
| `POST` | `/v1/auth/account/email/confirm` | No | Confirma el cambio con el token de un solo uso del enlace (pagina `/auth/verify-email`) |
| `PUT` | `/v1/auth/account/password` | Si | Cambia la contraseña |

### Sincronizacion de streaming (extension y app Android)

Las rutas `sync`/`progress` se autentican con el **token de sincronizacion** del dispositivo (`tsv_netflix_...`), no con la sesion web. Ver [streaming-sync-reliability](../streaming-sync-reliability.md) y [Companion-Apps](../Companion-Apps.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/netflix/connect` | Si | Genera el token de la extension de navegador |
| `POST` | `/v1/auth/netflix/pair-mobile` | Si | Empareja la app Android con un token propio (no pisa el de la extension) |
| `POST` | `/v1/auth/netflix/sync` | Token | Registra un visionado detectado |
| `POST` | `/v1/auth/netflix/sync/batch` | Token | Registra varios visionados de una vez |
| `POST` | `/v1/auth/netflix/progress` | Token | Progreso de reproduccion; al cruzar el 90% registra un play (ver `lib/rewatchCompletion.js`) |
| `POST` | `/v1/auth/netflix/disconnect` | Si | Revoca el token |

## Datos privados de usuario

### Favoritos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/favorites` | Lista favoritos |
| `POST` | `/v1/favorites` | Anade o refresca favorito |
| `DELETE` | `/v1/favorites/{tmdbId}/{mediaType}` | Elimina favorito |
| `GET` | `/v1/favorites/check/{tmdbId}/{mediaType}` | Comprueba favorito |

### Watchlist

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/watchlist` | Lista pendientes |
| `POST` | `/v1/watchlist` | Anade o refresca pendiente |
| `DELETE` | `/v1/watchlist/{tmdbId}/{mediaType}` | Elimina pendiente |
| `PATCH` | `/v1/watchlist/{tmdbId}/{mediaType}` | Actualiza prioridad |
| `GET` | `/v1/watchlist/check/{tmdbId}/{mediaType}` | Comprueba pendiente |

### Historial

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/history` | Historial paginado |
| `POST` | `/v1/history` | Anade entrada de historial |
| `DELETE` | `/v1/history/{id}` | Elimina entrada por UUID |
| `DELETE` | `/v1/history/bulk` | Elimina varias entradas |
| `GET` | `/v1/history/movies/{tmdbId}` | Plays de pelicula |
| `GET` | `/v1/history/shows/{tmdbId}` | Episodios vistos agrupados por temporada |
| `GET` | `/v1/history/episodes/{tmdbId}/{season}/{episode}` | Plays de episodio |
| `POST` | `/v1/history/episodes` | Marca/desmarca episodio |
| `POST` | `/v1/history/episodes/bulk` | Marca/desmarca varios episodios (rewatches, fechas personalizadas) |
| `POST` | `/v1/history/seasons` | Marca/desmarca temporada |

### Progreso ("Continuar viendo")

`backend/src/routes/progress.js`. Las escrituras automaticas llegan por `/v1/auth/netflix/progress`; con sesion se lee la fila y se pueden añadir entradas a mano.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/progress` | Entradas en curso del usuario |
| `POST` | `/v1/progress` | Añade una entrada manual (plataforma, porcentaje < 90%, episodio opcional) |
| `POST` | `/v1/progress/{id}/complete` | Marca la entrada como terminada: la quita y registra el visionado en el historial (en una transacción) |
| `DELETE` | `/v1/progress/{id}` | Descarta una entrada |

### Ratings

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/ratings` | Lista ratings |
| `POST` | `/v1/ratings` | Crea o actualiza rating (peliculas, series, temporadas y episodios) |
| `DELETE` | `/v1/ratings/{tmdbId}/{mediaType}` | Elimina rating |

### Listas

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/lists` | Lista listas propias |
| `GET` | `/v1/lists/membership` | En que listas propias esta un titulo |
| `POST` | `/v1/lists` | Crea lista |
| `GET` | `/v1/lists/{id}` | Detalle de lista |
| `PATCH` | `/v1/lists/{id}` | Actualiza lista. Una lista publica se publica en "Listas de la comunidad" (`community/userLists.js`) |
| `DELETE` | `/v1/lists/{id}` | Elimina lista |
| `POST` | `/v1/lists/{id}/items` | Anade item(s) a lista |
| `DELETE` | `/v1/lists/{id}/items` | Elimina varios items |
| `DELETE` | `/v1/lists/{id}/items/{tmdbId}/{mediaType}` | Elimina item de lista |
| `PATCH` | `/v1/lists/{id}/items/reorder` | Reordena items |

### Estado unificado

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/items/{tmdbId}/{mediaType}/status` | Estado privado de item: favorito, watchlist, visto, rating y episodios vistos |
| `POST` | `/v1/items/states` | Estados del visitante para un grupo de titulos (decora tarjetas en perfiles ajenos) |

### Preferencias, exportacion y alertas

Prefijo `/v1/users` (`backend/src/routes/users.js`), todo con sesion.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/users/preferences` | Lee preferencias personales del usuario autenticado |
| `PATCH` | `/v1/users/preferences` | Actualiza preferencias personales: vista por defecto, idioma, contenido adulto, notificaciones y ajustes UI |
| `GET` | `/v1/users/me/export?include=favorites,watchlist,ratings` | Exportacion completa de la biblioteca (el navegador la convierte en CSV, JSON o formato Letterboxd). Limite 10/min |
| `GET` | `/v1/users/notifications` | Alertas de la campana del navbar: actividad propia, recordatorios de puntuar/reseñar y novedades (ver [push-notifications](../push-notifications.md)) |

## Social y perfiles

Ver [social-y-perfiles](../features/social-y-perfiles.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/v1/users/search` | Si | Busca miembros |
| `GET` | `/v1/users/feed?scope=following\|me` | Si | Feed de la seccion Social |
| `GET` | `/v1/users/feed/summary` | Si | Cifras de la cabecera de Social |
| `GET` | `/v1/users/me/profile-favorites` | Si | 5 peliculas y 5 series destacadas del perfil |
| `PUT` | `/v1/users/me/profile-favorites` | Si | Guarda los destacados |
| `GET` | `/v1/users/{username}/profile` | Si | Perfil (con `isSelf`/`isFollowing`) |
| `POST` | `/v1/users/{username}/follow` | Si | Seguir |
| `DELETE` | `/v1/users/{username}/follow` | Si | Dejar de seguir |
| `GET` | `/v1/users/{username}/followers` | Si | Seguidores |
| `GET` | `/v1/users/{username}/following` | Si | Seguidos |
| `GET` | `/v1/users/{username}/{reviews\|watched\|watchlist\|favorites\|ratings\|lists\|activity}` | Si | Secciones del perfil |
| `GET` | `/v1/users/{username}/neural?v=` | Si | Vista neuronal (grafo de titulos, generos y sagas). Con la firma `v` ya vigente responde `{ unchanged: true }` |
| `GET` | `/v1/users/public/resolve-usernames?usernames=a,b` | No | Que handles son miembros reales (para enlazar autores de comentarios) |
| `GET` | `/v1/users/public/{username}/profile` | Opcional | Perfil publico y estadisticas agregadas |
| `GET` | `/v1/users/public/{username}/activity` | Opcional | Actividad publica |

## Nivel y logros

`backend/src/routes/level.js`, montado bajo `/v1/users`. Ver [niveles-y-logros](../features/niveles-y-logros.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/v1/users/level/catalog` | No | Catalogo estatico: rangos, fuentes de XP y logros |
| `GET` | `/v1/users/{username}/level` | No | Nivel, XP, rango, rachas y logros. `?refresh=1` solo para el propio usuario |

## Comunidad

`backend/src/routes/community.js`. `{type}` es `movie` o `tv`. Ver [comunidad](../features/comunidad.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/v1/community/{type}/{tmdbId}/comments` | Opcional | Comentarios por pestaña (`popular`, `recent`) y orden (`sort=likes`) |
| `POST` | `/v1/community/{type}/{tmdbId}/comments` | Si | Publica una reseña/comentario |
| `PATCH` | `/v1/community/{type}/{tmdbId}/comments/{id}` | Si | Edita un comentario propio |
| `DELETE` | `/v1/community/{type}/{tmdbId}/comments/{id}` | Si | Borra un comentario propio |
| `POST`/`DELETE` | `/v1/community/{type}/{tmdbId}/comments/{id}/like` | Si | Me gusta en un comentario (idempotente) |
| `GET` | `/v1/community/{type}/{tmdbId}/sentiment` | No | Resumen de sentimiento (temas a favor/en contra) |
| `GET` | `/v1/community/{type}/{tmdbId}/summary` | Opcional | Resumen de comunidad del titulo |
| `GET` | `/v1/community/{type}/{tmdbId}/lists` | Opcional | Listas de la comunidad que contienen el titulo |
| `GET` | `/v1/community/{type}/{tmdbId}/following` | Si | "Tus amigos": que han hecho con este titulo las cuentas que sigues |
| `GET` | `/v1/community/lists/discover` | Opcional | Descubrir listas de la comunidad |
| `GET` | `/v1/community/lists/{id}` | Opcional | Detalle de una lista de la comunidad |
| `POST`/`DELETE` | `/v1/community/lists/{id}/like` | Si | Me gusta en una lista |
| `GET` | `/v1/community/collections/likes` | Opcional | Me gusta de colecciones (sagas TMDb) |
| `POST`/`DELETE` | `/v1/community/collections/{id}/like` | Si | Me gusta en una coleccion |
| `GET` | `/v1/community/actors/likes` | Opcional | Me gusta de actores |
| `POST`/`DELETE` | `/v1/community/actors/{id}/like` | Si | Me gusta en un actor |

## Dashboard, calendario y recomendaciones

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/v1/dashboard/{surface}` | Opcional | Filas del dashboard para `home`, `movies` o `series`. Con sesion añade filas personales. Ver [dashboards-implementation](../architecture/dashboards-implementation.md) |
| `GET` | `/v1/dashboard/sections/{key}` | Opcional | Lista completa de una seccion (`anticipated`, `for_you`, `trending`) para su pagina "Ver todos" |
| `GET` | `/v1/calendar/episodes` | Opcional | Proximos episodios. Anonimo: series populares; con sesion prioriza en progreso, favoritos y pendientes. Nunca consulta Trakt |
| `GET` | `/v1/recommendations?type=all\|movie\|tv&limit=40` | Si | Baraja de la pagina Recomendaciones (deslizar), sin descartados, pendientes ni favoritos |
| `POST` | `/v1/recommendations/dismiss` | Si | Descarta un titulo |
| `DELETE` | `/v1/recommendations/dismiss/{mediaType}/{tmdbId}` | Si | Deshace un descarte |
| `GET` | `/v1/recommendations/dismissed` | Si | Titulos descartados |

## Notificaciones push

`backend/src/routes/push.js`. Ver [push-notifications](../push-notifications.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/v1/push/config` | No | Clave publica VAPID y canales activos |
| `POST` | `/v1/push/subscriptions` | Si | Registra este navegador (Web Push) o la app Android (FCM) |
| `DELETE` | `/v1/push/subscriptions` | Si | Deja de avisar a este dispositivo |
| `POST` | `/v1/push/test` | Si | Notificacion de prueba |

## Detecciones de streaming

`backend/src/routes/streamingDetections.js`. Ver [detecciones-streaming](../features/detecciones-streaming.md).

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/v1/streaming/detections/lookup` | Token sync | Reglas aprendidas para una huella |
| `POST` | `/v1/streaming/detections` | Token sync | Registra una deteccion notificada |
| `GET` | `/v1/streaming/rules/not-a-title` | Token sync | Textos que no son titulos, por plataforma |
| `GET` | `/v1/streaming/device/detections` | Token movil | Detecciones de la app Android |
| `GET` | `/v1/streaming/device/detections/{id}` | Token movil | Una deteccion |
| `POST` | `/v1/streaming/device/detections/{id}/correction` | Token movil | Corrige una deteccion desde la app |
| `GET` | `/v1/streaming/device/titles?q=` | Token movil | Busca el titulo correcto |
| `GET` | `/v1/streaming/detections` | Si | Detecciones recientes (salvo las del movil) |
| `GET` | `/v1/streaming/detections/{id}` | Si | Una deteccion |
| `POST` | `/v1/streaming/detections/{id}/correction` | Si | «No habia ficha» / «es otro titulo» |

## TMDb cache/proxy

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/tmdb/movie/{id}` | Detalle de pelicula |
| `GET` | `/v1/tmdb/tv/{id}` | Detalle de serie |
| `GET` | `/v1/tmdb/person/{id}` | Detalle de persona |
| `GET` | `/v1/tmdb/search` | Busqueda TMDb |
| `GET` | `/v1/tmdb/discover/movies` | Discover peliculas |
| `GET` | `/v1/tmdb/discover/tv` | Discover series |
| `GET` | `/v1/tmdb/trending` | Trending |
| `GET` | `/v1/tmdb/{type}/{id}/providers` | Watch providers |
| `GET` | `/v1/tmdb/title-names?keys=movie:603,tv:1396` | Nombre en ingles, español y original (hasta 100) para el buscador de las paginas de usuario |

## Importacion

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/v1/import/trakt` | Inicia importacion desde Trakt. Body: `{ accessToken, mode?: "history_ratings" \| "all" }` |
| `POST` | `/v1/import/trakt/data` | Importa datos de Trakt ya descargados |
| `POST` | `/v1/import/trakt/data/chunk` | Importa un lote de datos de Trakt |
| `GET` | `/v1/import/trakt/status` | Estado de importacion |
| `POST` | `/v1/import/tmdb/data/chunk` | Importa un lote de favoritos, pendientes y puntuaciones de TMDb descargado por Next. Las puntuaciones sobrescriben ratings existentes |
| `GET` | `/v1/import/tmdb/status` | Estado de importacion TMDb |
| `POST` | `/v1/import/imdb/data/chunk` | Importa un lote de IMDb (puntuaciones, vistos, watchlist y listas, ya resueltos a TMDb por `/api/imdb/import`) |
| `POST` | `/v1/import/letterboxd/data/chunk` | Importa un lote de la exportacion oficial de Letterboxd (incluye reseñas) |
| `GET` | `/v1/import/letterboxd/status` | Estado de importacion Letterboxd |
| `GET` | `/v1/import/letterboxd/connection` | Cuenta de Letterboxd vinculada |
| `POST` | `/v1/import/letterboxd/connection` | Vincula un usuario de Letterboxd (sincronizacion por RSS) |
| `DELETE` | `/v1/import/letterboxd/connection` | Desvincula |
| `POST` | `/v1/import/letterboxd/sync` | "Sincronizar ahora" (lee el RSS; tambien corre cada pocas horas) |
| `POST` | `/v1/import/letterboxd/extension-sync` | Sincronizacion enviada por la extension |
| `POST` | `/v1/import/netflix/data/chunk` | Importa un lote del historial de Netflix |
| `GET` | `/v1/import/netflix/status` | Estado de importacion Netflix |
| `GET` | `/v1/import/netflix/poll` | Sondeo de visionados nuevos (sincronizacion) |
| `POST` | `/v1/import/netflix/simulate` | Simula un visionado (pruebas) |

## Estadisticas

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/stats` | Totales basicos |
| `GET` | `/v1/stats/profile` | Perfil completo de estadisticas desde PostgreSQL (`?compact=1` reduce el historial) |
| `GET` | `/v1/stats/year-in-review?year=&refresh=` | "Tu año en The Show Verse" (recap). Ver [recap-anual](../features/recap-anual.md) |
| `GET` | `/v1/stats/calendar` | Calendario de actividad |
| `GET` | `/v1/stats/shows/in-progress` | Series en progreso |
| `GET` | `/v1/stats/shows/completed` | Series candidatas a completadas |

## Ejemplos

Registro:

```bash
curl -sS -X POST http://localhost:3001/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@example.com",
    "username": "demo_user",
    "password": "DemoPassword123",
    "displayName": "Demo User"
  }'
```

Favorito autenticado:

```bash
curl -sS -X POST http://localhost:3001/v1/favorites \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "tmdbId": 550,
    "mediaType": "movie",
    "title": "Fight Club",
    "posterPath": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg"
  }'
```

Estado unificado:

```bash
curl -sS http://localhost:3001/v1/items/550/movie/status \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Relacion con frontend

El frontend no llama siempre directamente a `/v1`. Muchas pantallas mantienen rutas historicas de Next.js, por ejemplo:

- `/api/trakt/item/status`
- `/api/trakt/history`
- `/api/tmdb/account/favorite`
- `/api/tmdb/account/watchlist`

Estas rutas actuan como compatibilidad y usan el backend propio como primera opcion cuando existen `showverse_access_token` y `showverse_refresh_token`.

## Gaps conocidos

Ya tienen endpoints propios (antes dependian de Trakt): comentarios y sentimiento de la comunidad, listas de la comunidad, calendario de episodios, recomendaciones del dashboard y estadisticas del perfil.

Todavia no estan completamente reemplazados por backend propio:

- Parte del descubrimiento publico y algunas filas que mezclan Trakt/TMDb.
- Plex, Spotify, OMDb, IMDb (valoraciones), Filmaffinity, SeriesGraph, soundtrack e IA, que siguen como rutas de Next (`src/app/api`).

Mantener fallback hasta que cada area tenga endpoints propios equivalentes y QA manual.

> Ultima revision de esta referencia: 22-10-2026, contra `backend/src/routes/*.js`.
