---
tags: [type/indice, area/home]
aliases: [Inicio, Mapa de documentación, MOC]
---
# 🏠 Home — The Show Verse

> Nodo central del vault. Desde aquí llegas a cualquier sección de la documentación.
> Para ver el grafo ("vista neuronal") y cómo abrir el proyecto en Obsidian, mira **[[OBSIDIAN]]**.

**The Show Verse** es tu universo personal de películas y series: una web (Next.js) con
integraciones (Trakt, Plex, JustWatch, Spotify), dashboards de recomendaciones,
calendario de estrenos y **sincronización universal de streaming** (extensión de
navegador + app companion de Android).

---

## 🗺️ Mapas de sección (MOCs)

| Sección | Qué encontrarás |
|---|---|
| [[Frontend]] | La app web Next.js: páginas, componentes, hooks y librerías (`src/`). |
| [[Frontend-Lib]] | Módulos de lógica e integraciones en `src/lib`. |
| [[Backend]] | API propia (Fastify + PostgreSQL + Redis). |
| [[Architecture]] | Diseño técnico y módulos funcionales. |
| [[Infrastructure]] | Arranque local, Docker, NAS, Cloudflare y CI/CD. |
| [[Guides]] | Integraciones y features (Plex, Trakt, JustWatch, Liquid Buttons…). |
| [[Planning]] | Planes de mejora y optimización. |
| [[Superpowers]] | Specs y planes de diseño generados durante el desarrollo. |
| [[Companion-Apps]] | Extensión de navegador y app Android de sincronización. |
| [[Agents]] | Perfiles de contexto para asistentes de IA. |
| [[TFG]] | Memoria académica (Trabajo Fin de Grado). |

---

## 🚀 Empezar rápido

- [[ARRANQUE-LOCAL|Arranque local (guía exacta)]] — levantar todo el proyecto.
- [[RESUMEN_TECNICO|Resumen técnico]] — visión de alto nivel de la arquitectura.
- [[backend_api_reference|Referencia de la API del backend]].
- [[2026-07-03-universal-streaming-sync-design|Diseño del Universal Streaming Sync]].

---

## 🧭 Convenciones del vault

- Cada sección tiene una nota **MOC** (`Frontend`, `Backend`, …) que enlaza sus documentos.
- Los documentos originales conservan su nombre; los MOCs y las notas nuevas usan
  `[[wikilinks]]` y `tags` (`#area/…`, `#type/…`) para tejer el grafo y colorearlo.
- Índice para GitHub: [README](README.md). Índice para Obsidian: **esta nota**.

## Relacionado
- [[OBSIDIAN]]
- [[Frontend]]
- [[Backend]]
- [[Architecture]]
- [[Infrastructure]]
