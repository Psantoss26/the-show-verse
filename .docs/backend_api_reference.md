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

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/register` | No | Registro por email/password |
| `POST` | `/v1/auth/login` | No | Login por email/password |
| `POST` | `/v1/auth/tmdb` | No | Crea/recupera usuario backend desde sesion TMDb valida |
| `POST` | `/v1/auth/refresh` | No | Rota refresh token y devuelve access token nuevo |
| `POST` | `/v1/auth/logout` | No | Revoca un refresh token |
| `POST` | `/v1/auth/logout/all` | Si | Revoca todas las sesiones del usuario |
| `GET` | `/v1/auth/me` | Si | Perfil autenticado |
| `PATCH` | `/v1/auth/me` | Si | Actualiza perfil |

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
| `POST` | `/v1/history/seasons` | Marca/desmarca temporada |

### Ratings

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/ratings` | Lista ratings |
| `POST` | `/v1/ratings` | Crea o actualiza rating |
| `DELETE` | `/v1/ratings/{tmdbId}/{mediaType}` | Elimina rating |

### Listas

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/lists` | Lista listas propias |
| `POST` | `/v1/lists` | Crea lista |
| `GET` | `/v1/lists/{id}` | Detalle de lista |
| `PATCH` | `/v1/lists/{id}` | Actualiza lista |
| `DELETE` | `/v1/lists/{id}` | Elimina lista |
| `POST` | `/v1/lists/{id}/items` | Anade item a lista |
| `DELETE` | `/v1/lists/{id}/items/{tmdbId}/{mediaType}` | Elimina item de lista |
| `PATCH` | `/v1/lists/{id}/items/reorder` | Reordena items |

### Estado unificado

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/items/{tmdbId}/{mediaType}/status` | Estado privado de item: favorito, watchlist, visto, rating y episodios vistos |

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

## Importacion

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/v1/import/trakt` | Inicia importacion desde Trakt |
| `GET` | `/v1/import/trakt/status` | Estado de importacion |

## Estadisticas

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `GET` | `/v1/stats` | Totales basicos |
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

Todavia no esta completamente reemplazado por backend propio:

- Comunidad Trakt: comentarios, sentimientos, listas publicas y temporadas.
- Estadisticas avanzadas basadas en perfil Trakt.
- Recomendaciones y descubrimiento publico que hoy mezclan Trakt/TMDb.
- Plex, Spotify, OMDb, IMDb, Filmaffinity, SeriesGraph, soundtrack e IA.

Mantener fallback hasta que cada area tenga endpoints propios equivalentes y QA manual.
