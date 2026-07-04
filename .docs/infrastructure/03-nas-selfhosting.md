# 03 · NAS (autoalojado)

Stack de **producción** en el NAS (UGREEN DXP 4800 Plus, UGOS + Docker), definido en
`deploy/nas/docker-compose.yml` (proyecto Compose `theshowverse`).

## Servicios

| Servicio | Imagen | Expuesto | Función |
|---|---|---|---|
| `web` | build `Dockerfile.web` | `3000` (host) + túnel | Next.js (único servicio público). |
| `backend` | build `Dockerfile.backend` | interno `3001` | API Fastify. |
| `postgres` | `postgres:16` | interno | Datos (usuario `tsv`, BBDD `theshowverse`). |
| `redis` | `redis:7-alpine` | interno | Caché (persistencia ligera). |
| `cloudflared` | `cloudflare/cloudflared` | saliente | Túnel a Cloudflare. |
| `ollama` | `ollama/ollama` | `11434` | LLM local (IA). |
| `github-runner` | `myoung34/github-runner` | — | CI/CD self-hosted. |

La `web` tiene un **alias de red** `the-show-verse` para que una ruta de túnel
previa (`http://the-show-verse:3000`) siga resolviendo sin tocar el panel de
Cloudflare.

## Volúmenes

```
pgdata       (local)     → datos de Postgres
redisdata    (local)     → datos de Redis
ollama-data  (EXTERNO)   → showverse-ollama-data        (modelos ya descargados)
runner-data  (EXTERNO)   → the-show-verse_runner-data   (registro del runner)
```

Los volúmenes **externos** se reutilizan del stack anterior para no perder los
modelos de Ollama ni el registro del runner. Deben existir antes del primer `up`
(si vienes de otro stack ya existen). Para crearlos manualmente:

```bash
docker volume create showverse-ollama-data
docker volume create the-show-verse_runner-data
```

## Ficheros de entorno (en el NAS, NO en el repo)

Copia las plantillas y rellénalas **en el NAS**, junto al compose:

```bash
cd /volume4/docker/theshowverse            # carpeta de despliegue (/nas-deploy)
cp deploy/nas/.env.example         deploy/nas/.env
cp deploy/nas/backend.env.example  deploy/nas/backend.env
cp deploy/nas/web.env.example      deploy/nas/web.env
cp deploy/nas/runner.env.example   deploy/nas/runner.env
# …edita cada uno con los valores reales.
```

| Fichero | Para qué |
|---|---|
| `deploy/nas/.env` | `${VARS}` que **interpola** el compose: `POSTGRES_PASSWORD`, `NEXT_PUBLIC_TMDB_API_KEY`, `CF_TUNNEL_TOKEN`. |
| `deploy/nas/backend.env` | Entorno del `backend` (DATABASE_URL a `postgres:5432`, JWT, TMDB…). |
| `deploy/nas/web.env` | Entorno de runtime de la `web` (`BACKEND_API_BASE_URL=http://backend:3001`, OAuth…). |
| `deploy/nas/runner.env` | Registro del self-hosted runner (ver [05](./05-github-actions-cicd.md)). |

> ⚠️ La contraseña de Postgres debe coincidir entre `deploy/nas/.env`
> (`POSTGRES_PASSWORD`) y la `DATABASE_URL` de `deploy/nas/backend.env`.

## Primer arranque

```bash
cd /volume4/docker/theshowverse
docker compose -f deploy/nas/docker-compose.yml up -d --build
docker compose -f deploy/nas/docker-compose.yml ps
docker compose -f deploy/nas/docker-compose.yml logs -f backend
```

El backend aplica las migraciones al arrancar (`npm start`). La web queda accesible
en `http://<ip-del-nas>:3000` (LAN) y en `https://theshowverse.com` (vía Cloudflare,
ver [04](./04-cloudflare-tunnel.md)).

## Actualizar (deploy manual)

```bash
cd /volume4/docker/theshowverse
git pull            # o rsync del código (lo hace el CI, ver 05)
docker compose -f deploy/nas/docker-compose.yml up -d --build \
  postgres redis backend web cloudflared ollama
docker image prune -f
```

> Se listan los servicios explícitamente para **no** recrear `github-runner` si el
> comando lo lanza el propio runner (se mataría a sí mismo). En un `up` manual desde
> SSH puedes omitir la lista y levantar todo.

## Copias de seguridad de la BBDD

```bash
# Volcado (formato custom, comprimido):
docker compose -f deploy/nas/docker-compose.yml exec -T postgres \
  pg_dump -U tsv -Fc theshowverse > backup-$(date +%F).dump

# Restauración:
docker compose -f deploy/nas/docker-compose.yml exec -T postgres \
  pg_restore -U tsv -d theshowverse --clean --if-exists < backup-YYYY-MM-DD.dump
```

Este mismo volcado sirve para [cargar datos de prod en local](./01-local-development.md#datos-de-produccion).

## Seguridad

- Solo `web:3000` sale al exterior (y a través de Cloudflare). `postgres`, `redis`
  y `backend` quedan en la red interna del compose: **no** hagas port-forward de
  5432/6379/3001 en el router.
- El túnel de Cloudflare es **saliente**: no hay que abrir puertos de entrada.
