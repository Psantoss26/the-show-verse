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
| [[vercel-resource-optimization-plan]] | 🟡 Parcial | Muchas rutas ya pasan por el backend (dashboards, historial, progreso, ratings, estados). Falta medir en Vercel y revisar `middleware.js` e imágenes. |

## Pendiente

- **Terminar de retirar Trakt del frontend:** 26 ficheros de `src/` (fuera de `src/app/api`) siguen llamando a `/api/trakt/*` (historial, estadísticas, temporadas, scoreboard…). Ver *Gaps conocidos* en [[backend_api_reference]].
- **Sentimiento con LLM:** `generateSentiment` (Ollama) existe en `backend/src/community/sentiment.js` pero no se usa; hoy se usan los temas de Trakt o la heurística.
- **Publicar la app en Google Play:** pasos pendientes (firma, permisos sensibles…) en [[android-play-store]].
- **Medir el consumo de Vercel** antes y después del plan de optimización.
- **Capturas del `README.md`:** enlaza ~30 imágenes en `docs/screenshots/` y un `LICENSE` que no existen en el repositorio. Hay que hacer capturas nuevas (las de `docs/assets/screenshots/` son de pruebas) o quitar las referencias.
- **Consolidar la documentación del TFG** (`docs/tfg/`, 12 documentos solapados) y los duplicados de `docs/architecture/` (`RESUMEN_TECNICO*`, `MODULOS_FUNCIONALES_PROFUNDO*`).

## Relacionado
- [[Planning]]
- [[Features]]
- [[Home]]
