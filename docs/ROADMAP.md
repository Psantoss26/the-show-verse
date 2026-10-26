---
tags: [area/planning, type/indice]
aliases: [Roadmap, Pendiente]
---
# 🧭 Roadmap

Estado de lo planificado y lo que queda por hacer. Revisado el 22-10-2026 contra el código de `main`.

> **Cómo mantenerlo:** al terminar algo de esta lista, muévelo a *Hecho* y añade su línea en el [`CHANGELOG.md`](../CHANGELOG.md). Al planificar algo nuevo, añádelo a *Pendiente*.

## Planes existentes

| Plan | Estado | Notas |
|---|---|---|
| [[2026-06-25-dashboard-recommendation-engine]] | ✅ Hecho | Motor en `backend/src/dashboard/`, documentado en [[dashboard-recommendations-v3]]. Las casillas del plan nunca se marcaron. |
| [[2026-07-03-universal-streaming-sync]] | ✅ Hecho | Extensión + app Android, Netflix, Prime Video, Max, Crunchyroll y más. Ver [[streaming-sync-reliability]]. |
| [[2026-07-08-calendar-episodes-migration]] | ✅ Hecho | `/v1/calendar/episodes`, sin Trakt. |
| [[2026-07-08-community-content-migration]] | ✅ Hecho | `backend/src/community/`. Ver [[comunidad]]. |
| [[2026-06-23-featured-hero-inicio-design]] | ✅ Hecho | `FeaturedHero` implementado; hoy se usa en Películas y Series. |
| [[dashboard-recommendations-improvement-plan]] | 🟡 Parcial | Mejoras de criterio aplicadas en octubre; sin medición formal. |
| [[2026-10-26-planes-de-pago-design]] | 🟡 Parcial | Planes, Stripe, `/planes`, Ajustes → Suscripción y bloqueos Pro hechos y apagados (`BILLING_ENABLED`). Falta: acuerdo comercial con TMDB, configurar Stripe, conectar una red de anuncios con su consentimiento (CMP) y aplicar en el backend los bloqueos de estadísticas, recap y vista neuronal. Ver [[planes-y-suscripciones]]. |
| [[vercel-resource-optimization-plan]] | 🟡 Parcial | Muchas rutas ya pasan por el backend (dashboards, historial, progreso, ratings, estados). Falta medir en Vercel y revisar `middleware.js` e imágenes. |

## Pendiente

- **Terminar de retirar Trakt del frontend:** 26 ficheros de `src/` (fuera de `src/app/api`) siguen llamando a `/api/trakt/*` (historial, estadísticas, temporadas, scoreboard…). Ver *Gaps conocidos* en [[backend_api_reference]].
- **Sincronización de streaming al nivel de Trakt** (ver [[trakt-comparativa-sync]]): primero, para que falle menos y se comporte igual en cada plataforma (el mapa de ids `(plataforma, content_id)` → TMDb ya está hecho en la extensión; falta en Android con `METADATA_KEY_MEDIA_ID`; Netflix ya se lee desde el reproductor y sus metadatos, falta probarlo con una cuenta real), un contrato común por plataforma (id, reproducción, identidad) y recuperación de historial en Prime Video, Max y Crunchyroll; después, panel de conexiones por servicio con estado y «última sincronización», registro de sincronizaciones con deshacer y elementos omitidos visibles, Plex/Jellyfin por webhook desde el backend, escritura hacia Trakt (scrobble) con OAuth en el backend, número de episodio absoluto para anime y marcas `last_activities` para sincronizaciones delta.
- **Sentimiento con LLM:** `generateSentiment` (Ollama) existe en `backend/src/community/sentiment.js` pero no se usa; hoy se usan los temas de Trakt o la heurística.
- **Publicar la app en Google Play:** pasos pendientes (firma, permisos sensibles…) en [[android-play-store]].
- **Medir el consumo de Vercel** antes y después del plan de optimización.
- **Capturas del `README.md`:** enlaza ~30 imágenes en `docs/screenshots/` y un `LICENSE` que no existen en el repositorio. Hay que hacer capturas nuevas (las de `docs/assets/screenshots/` son de pruebas) o quitar las referencias.
- **Consolidar la documentación del TFG** (`docs/tfg/`, 12 documentos solapados) y los duplicados de `docs/architecture/` (`RESUMEN_TECNICO*`, `MODULOS_FUNCIONALES_PROFUNDO*`).

## Relacionado
- [[Planning]]
- [[Features]]
- [[Home]]
