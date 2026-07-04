# 02 · Docker

Imágenes, Dockerfiles y contextos de build del proyecto.

## Imágenes base (producción, NAS)

| Servicio | Imagen | Dockerfile | Contexto de build |
|---|---|---|---|
| `web` | Node 22 slim (multi-stage) | `deploy/nas/Dockerfile.web` | raíz del repo (`.`) |
| `backend` | Node 22 slim (multi-stage) | `deploy/nas/Dockerfile.backend` | `backend/` |
| `postgres` | `postgres:18` | — (oficial) | — |
| `redis` | `redis:7-alpine` | — (oficial) | — |
| `cloudflared` | `cloudflare/cloudflared:latest` | — (oficial) | — |
| `ollama` | `ollama/ollama:latest` | — (oficial) | — |
| `github-runner` | `myoung34/github-runner:latest` | — (oficial) | — |

## Web — `deploy/nas/Dockerfile.web`

Multi-stage `deps → builder → runner` con **salida standalone** de Next.js
(`output: "standalone"` en `next.config.ts`): la imagen final solo lleva
`server.js`, el `node_modules` mínimo y los estáticos.

- **Args de build** (`NEXT_PUBLIC_*` se hornean en el bundle del cliente):
  - `NEXT_PUBLIC_TMDB_API_KEY`
  - `NEXT_PUBLIC_API_BASE_URL` (en el NAS: `http://backend:3001`)
- **Runtime**: `PORT=3000`, `HOSTNAME=0.0.0.0`, arranca con `node server.js`.
- El compose pasa los args desde `deploy/nas/.env` y el runtime desde `web.env`.

> Recuerda: una `NEXT_PUBLIC_*` cambiada exige **reconstruir** la imagen (no basta
> con reiniciar el contenedor), porque se hornea en el build.

## Backend — `deploy/nas/Dockerfile.backend`

Multi-stage `deps → runner`. Instala solo dependencias de producción
(`npm ci --omit=dev`). Arranca con `npm start`, que:

```
node src/db/migrate.js && node src/server.js
```

es decir, **aplica migraciones** y luego levanta el servidor (`PORT=3001`).

## `.dockerignore`

Tanto la raíz como `backend/` excluyen `.git`, `node_modules`, `.next`, `*.log` y
**todos los `.env*`**. Por eso `backend/.env.local` (config local con `localhost`)
**nunca** entra en la imagen de producción.

## Comandos útiles

```bash
# Build + levantar TODO el stack del NAS (desde la raíz del repo, en el NAS):
docker compose -f deploy/nas/docker-compose.yml up -d --build

# Reconstruir solo un servicio (p. ej. tras cambiar la web):
docker compose -f deploy/nas/docker-compose.yml up -d --build web

# Ver estado / logs:
docker compose -f deploy/nas/docker-compose.yml ps
docker compose -f deploy/nas/docker-compose.yml logs -f backend

# Parar (sin borrar datos):
docker compose -f deploy/nas/docker-compose.yml down

# Limpiar imágenes viejas tras varios builds:
docker image prune -f
```

## Otros artefactos Docker en el repo

- `backend/docker-compose.yml`: stack **antiguo/alternativo** (api + db + redis)
  que construye la imagen del backend con `backend/Dockerfile`. Para desarrollo
  se recomienda `deploy/local` (solo datos) + backend nativo.
- `backend/Dockerfile`: variante pensada para PaaS (Railway/Render), normaliza el
  contexto de build. No se usa en el NAS (allí se usa `deploy/nas/Dockerfile.backend`).
