---
tags: [area/integracion, type/indice, area/sync]
aliases: [Companion Apps, Apps de sincronización, Sync]
---
# 📱 Companion-Apps — Sincronización de streaming

> Clientes que capturan tu actividad de reproducción y la envían a The Show Verse
> para el **Universal Streaming Sync**: una extensión de navegador y una app Android.

## Clientes
| Cliente | Qué hace | Doc |
|---|---|---|
| Extensión de navegador | Captura reproducción en Netflix/plataformas web y la sincroniza. | [[netflix-extension/README\|Extensión de navegador]] |
| App companion de Android | Sincroniza desde las apps nativas (Netflix, Disney+, Prime, Max, Crunchyroll, Movistar+…). | [[android-companion/README\|App companion de Android]] |

## Diseño e implementación
- [[2026-07-03-universal-streaming-sync-design|Diseño del Universal Streaming Sync]]
- [[2026-07-03-universal-streaming-sync|Plan de implementación del sync]]

## Relacionado
- [[Home]]
- [[Backend]] — recibe y almacena la actividad sincronizada.
- [[Frontend-Lib]] — lógica de streaming en `src/lib/streaming` y `src/lib/netflix`.
