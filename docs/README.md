# Documentación de The Show Verse

Índice general de la documentación del proyecto. Todo vive bajo `docs/`
(antes repartido entre `.docs/` y `docs/`; unificado aquí).

## 🚀 Empezar

- **[Arranque local (guía exacta)](./infrastructure/ARRANQUE-LOCAL.md)** — levantar el proyecto completo en tu máquina.
- **[Infraestructura (índice)](./infrastructure/README.md)** — despliegue, Docker, NAS, Cloudflare, CI/CD.

## 📂 Secciones

### [`backend/`](./backend/) — API propia (Fastify + PostgreSQL + Redis)
- [Referencia de la API](./backend/backend_api_reference.md)
- [Cobertura funcional](./backend/backend_functionality_coverage.md)
- [Plan de implementación](./backend/backend_implementation_plan.md)
- [Arranque y pruebas manuales](./backend/backend_manual_testing.md)
- [Despliegue del backend](./backend/backend_deployment.md)
- [Configuración de login con Google](./backend/google_auth_setup.md)

### [`infrastructure/`](./infrastructure/) — despliegue y entornos
Arranque local, Docker, autoalojamiento en el NAS, túnel de Cloudflare y CI/CD con
GitHub Actions. Ver su [índice](./infrastructure/README.md).

### [`architecture/`](./architecture/) — diseño técnico
- [Módulos funcionales (visión general)](./architecture/README_MODULOS_FUNCIONALES.md)
- [Módulos funcionales en profundidad](./architecture/MODULOS_FUNCIONALES_PROFUNDO.md) · [parte 2](./architecture/MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md)
- [Resumen técnico](./architecture/RESUMEN_TECNICO.md)
- [Implementación de los dashboards](./architecture/dashboards-implementation.md)

### [`guides/`](./guides/) — integraciones y features
- [Plex: integración](./guides/PLEX_INTEGRATION.md) · [quickstart](./guides/PLEX_QUICKSTART.md)
- [JustWatch](./guides/JUSTWATCH_INTEGRATION.md)
- [Sistema de caché de Trakt](./guides/TRAKT_CACHE_SYSTEM.md)
- [Estrategia de caché](./guides/estrategia-cache.md)
- [Liquid Buttons](./guides/LIQUID_BUTTONS.md) · [resumen](./guides/LIQUID_BUTTONS_SUMMARY.md) · [testing](./guides/TESTING_LIQUID_BUTTONS.md)

### [`planning/`](./planning/) — planes y mejoras
- [Mejora de recomendaciones del dashboard](./planning/dashboard-recommendations-improvement-plan.md)
- [Optimización de recursos en Vercel](./planning/vercel-resource-optimization-plan.md)

### [`tfg/`](./tfg/) — memoria académica (Trabajo Fin de Grado)
Documentación del TFG y sus capturas ([`tfg/images/`](./tfg/images/)). Entradas
principales: [TFG_TheShowVerse.md](./tfg/TFG_TheShowVerse.md),
[DOCUMENTACION_TFG.md](./tfg/DOCUMENTACION_TFG.md),
[RESUMEN_TFG.md](./tfg/RESUMEN_TFG.md).

### [`agents/`](./agents/) — perfiles de agente IA
Perfiles de contexto para asistentes de código:
[backend (Node/Fastify)](./agents/backend-node-fastify-agent.md) ·
[web (Next.js)](./agents/nextjs-web-agent.md).

### `superpowers/` — specs y planes (gestionado por la herramienta)
Diseños e implementaciones generados durante el desarrollo (`superpowers/specs/`,
`superpowers/plans/`). No editar a mano.

---

> **Convención:** los documentos conservan sus nombres originales; solo se han
> reorganizado en subcarpetas temáticas. Los enlaces internos entre documentos son
> relativos y se han verificado tras el movimiento.
