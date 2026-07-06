---
tags: [area/frontend, type/indice, capa/lib]
---
# Frontend Lib (`src/lib`)

> Mapa de contenidos de `src/lib`: toda la lógica de negocio, clientes de APIs externas y utilidades compartidas del frontend Next.js.

## Visión general

`src/lib` concentra todo lo que **no es UI**: clientes HTTP hacia TMDb, Trakt, JustWatch, Deezer/iTunes, Spotify, Plex, Wikidata y OMDb; el puente hacia el backend propio (Node/Fastify); la lógica de los dashboards; utilidades de las fichas de detalle; caché optimista de listas de usuario; búsqueda fuzzy; hooks de dominio; y unos pocos ficheros sueltos de utilidad general.

No todos los módulos tienen nota propia aquí: `dashboard`, `netflix`/`streaming`, `plex` y `trakt` ya cuentan con documentación de referencia dedicada (más extensa que una nota de `lib`) y se enlazan directamente.

## Módulos

| Módulo | Qué resuelve | Nota |
|---|---|---|
| `api/` | Clientes de APIs externas (TMDb, Trakt, JustWatch, OMDb, IMDb, iTunes/Deezer, Wikidata) y del backend propio de calendario | [[lib-api]] |
| `backend/` | Puente de autenticación y fetch hacia el backend Fastify propio (cookies, refresh de tokens) | [[lib-backend]] |
| `dashboard/` | Motor de los dashboards de Inicio/Películas/Series (pools, hero destacado, personalización) — **no usa Trakt** | [[dashboards-implementation|Implementación de dashboards]] |
| `details/` | Utilidades de las fichas de detalle: formateo, imágenes, premios, sentimiento de reseñas, gráfico de valoraciones por episodio | [[lib-details]] |
| `hooks/` | Hooks de dominio: auth, listas TMDb/Trakt, animaciones de scroll de los dashboards | [[lib-hooks]] |
| `netflix/` | Ingesta y resolución de actividad de Netflix (extensión de navegador, bookmarklet, CSV) hacia TMDb + backend | [[2026-07-03-universal-streaming-sync-design|Universal Streaming Sync]] |
| `offline/` | Cola de mutaciones offline — hoy un *shim* neutralizado tras revertir la PWA offline | [[lib-offline]] |
| `plex/` | Integración con servidor Plex personal (auth, cliente desde el navegador) | [[PLEX_INTEGRATION|Integración Plex]] |
| `search/` | Búsqueda fuzzy (Levenshtein/trigramas) e historial de búsquedas del Navbar | [[lib-search]] |
| `server/` | Utilidades solo-servidor: dataset de valoraciones IMDb y traducción EN→ES | [[lib-server]] |
| `spotify/` | OAuth de Spotify por usuario (tokens en cookies, refresco, perfil) | [[lib-spotify]] |
| `streaming/` | Resolución del *wordmark* de plataformas de streaming a partir de un provider de TMDb | [[2026-07-03-universal-streaming-sync-design|Universal Streaming Sync]] |
| `trakt/` | Cliente Trakt de bajo nivel: caché + rate limiting, resolución de IDs, scoreboard | [[TRAKT_CACHE_SYSTEM|Sistema de caché de Trakt]] |
| `userLists/` | Actualización optimista de las cachés locales de Favoritos/Pendientes/Historial | [[lib-userlists]] |
| `utils/` + sueltos (`artworkApi.js`, `i18n.js`, `pageTitle.js`) | Utilidades generales: traducción de tipo de media, overrides de carátulas, i18n de la UI, título de pestaña | [[lib-utils]] |

## Relacionado
- [[Frontend]]
- [[Home]]
- [[app-router-pages]]
- [[components]]
