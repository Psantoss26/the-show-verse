# Infraestructura de The Show Verse

Documentación de referencia de la configuración completa del proyecto: desarrollo
local, imágenes Docker, autoalojamiento en el NAS, túnel de Cloudflare y CI/CD con
GitHub Actions.

## Índice

| Documento | Contenido |
|---|---|
| ▶️ [**Arranque local (guía exacta)**](./ARRANQUE-LOCAL.md) | **Cómo levantar el proyecto completo en local, paso a paso.** Empieza aquí. |
| [01 · Desarrollo local](./01-local-development.md) | Referencia ampliada: setup, env, datos de producción. |
| [02 · Docker](./02-docker.md) | Imágenes, Dockerfiles, contextos de build y salida `standalone`. |
| [03 · NAS (autoalojado)](./03-nas-selfhosting.md) | Stack `deploy/nas`: servicios, volúmenes, primer arranque y actualización. |
| [04 · Cloudflare Tunnel](./04-cloudflare-tunnel.md) | Exponer `theshowverse.com` sin abrir puertos, con TLS gestionado. |
| [05 · GitHub Actions (CI/CD)](./05-github-actions-cicd.md) | Runner self-hosted y workflow de despliegue. |

## Arquitectura (visión general)

```
                Internet
                   │  HTTPS (theshowverse.com)
                   ▼
        ┌────────────────────┐
        │   Cloudflare Edge   │   TLS + DNS + WAF
        └─────────┬──────────┘
                  │  túnel saliente (sin abrir puertos)
                  ▼
   ┌──────────────────────────────────────────────┐
   │            NAS (Docker Compose)               │
   │                                               │
   │  cloudflared ──► web:3000  (Next.js standalone)│
   │                    │                          │
   │                    ▼                          │
   │                backend:3001 (Fastify API)     │
   │                  │        │                   │
   │                  ▼        ▼                    │
   │            postgres:5432  redis:6379          │
   │                                               │
   │  ollama:11434 (IA local)   github-runner (CI) │
   └──────────────────────────────────────────────┘
```

- **web** (Next.js 16, salida *standalone*): SSR + rutas `/api/*` que hablan con el
  backend por la red interna (`http://backend:3001`). Es el único servicio expuesto
  (vía Cloudflare).
- **backend** (Fastify): API propia (auth, favoritos, pendientes, historial,
  dashboards). Datos en Postgres; caché opcional en Redis.
- **postgres / redis**: datos y caché. No se exponen a Internet.
- **cloudflared**: túnel saliente a Cloudflare; publica la web sin port-forwarding.
- **ollama**: LLM local para funciones de IA.
- **github-runner**: runner self-hosted que ejecuta el CI/CD del repo en el NAS.

## Mapa de ficheros de configuración

```
deploy/
├── local/docker-compose.yml       # DEV local: Postgres + Redis
├── nas/
│   ├── docker-compose.yml          # PROD: stack completo del NAS
│   ├── Dockerfile.backend          # imagen del backend (Fastify)
│   ├── Dockerfile.web              # imagen de la web (Next standalone)
│   ├── .env.example                # ${VARS} que interpola el compose
│   ├── backend.env.example         # entorno del servicio backend
│   ├── web.env.example             # entorno del servicio web
│   └── runner.env.example          # entorno del self-hosted runner
└── nas-postgres/docker-compose.yml # Postgres suelto (alternativa de dev)

.github/workflows/deploy-nas.yml    # CI/CD → NAS
scripts/sync-prod-db.sh             # traer datos de prod al Postgres local
.env.example / backend/.env.example # plantillas de entorno
```

> **Secretos:** ningún `.env`, `.env.local` ni `deploy/**/*.env` real se versiona
> (ver `.gitignore`). Solo se versionan las plantillas `*.env.example`.
