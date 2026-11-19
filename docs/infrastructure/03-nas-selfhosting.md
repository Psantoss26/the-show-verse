# 03 · NAS (autoalojado)

Stack de **producción** en el NAS (UGREEN DXP 4800 Plus, UGOS + Docker), definido en
`deploy/nas/docker-compose.yml` (proyecto Compose `theshowverse`).

## Servicios

| Servicio | Imagen | Expuesto | Función |
|---|---|---|---|
| `web` | build `Dockerfile.web` | `3000` (host) + túnel | Next.js (único servicio público). |
| `backend` | build `Dockerfile.backend` | interno `3001` | API Fastify. |
| `postgres` | `postgres:18` | interno | Datos (usuario `tsv`, BBDD `theshowverse`). El volumen se monta en `/var/lib/postgresql` (layout PG18+). |
| `redis` | `redis:7-alpine` | interno | Caché (persistencia ligera). |
| `cloudflared` | `cloudflare/cloudflared` | saliente | Túnel a Cloudflare. |
| `umami-db-init` | `postgres:18` | — | Crea (idempotente) el rol y la base `umami` en el mismo postgres y termina. |
| `umami` | `ghcr.io/umami-software/umami:postgresql-latest` | interno `3000` + túnel | Estadísticas de visitas. Ver [Estadísticas](#estadísticas). |
| `github-runner` | `myoung34/github-runner` | — | CI/CD self-hosted. |

La `web` tiene un **alias de red** `the-show-verse` para que una ruta de túnel
previa (`http://the-show-verse:3000`) siga resolviendo sin tocar el panel de
Cloudflare.

## Volúmenes

```
pgdata       (local)     → datos de Postgres
redisdata    (local)     → datos de Redis
runner-data  (EXTERNO)   → the-show-verse_runner-data   (registro del runner)
```

El volumen **externo** se reutiliza del stack anterior para no perder el
registro del runner. Debe existir antes del primer `up` (si vienes de otro stack
ya existe). Para crearlo manualmente:

```bash
docker volume create the-show-verse_runner-data
```

La IA ya no corre en el NAS (usa la API de NVIDIA). El volumen
`showverse-ollama-data` de la etapa con Ollama ya no lo usa nada; se puede borrar
con `docker volume rm showverse-ollama-data` cuando ya no haga falta.

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
| `deploy/nas/.env` | `${VARS}` que **interpola** el compose: `POSTGRES_PASSWORD`, `NEXT_PUBLIC_TMDB_API_KEY`, `CF_TUNNEL_TOKEN` y, opcionales, `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET`, `UMAMI_WEBSITE_ID`. |
| `deploy/nas/backend.env` | Entorno del `backend` (DATABASE_URL a `postgres:5432`, JWT, TMDB, `NVIDIA_API_KEY`…). |
| `deploy/nas/web.env` | Entorno de runtime de la `web` (`BACKEND_API_BASE_URL=http://backend:3001`, OAuth, `NVIDIA_API_KEY` para el asistente…). |
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
  postgres redis backend web cloudflared
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

## Estadísticas

Dos fuentes, las dos dentro del NAS (Vercel Analytics y Speed Insights se
retiraron):

- **Peticiones al backend** → tabla `request_log` (migración `0033`). Un hook de
  Fastify (`backend/src/plugins/requestLog.js`) guarda cada petición en lotes:
  método, ruta con plantilla (`/v1/items/:id`, sin query string), estado,
  duración, usuario, país (`CF-IPCountry`), IP recortada a /24 y navegador. La
  web reenvía el país y el navegador del visitante (`clientIpHeaders` en
  `src/lib/backend/server.js`). No se guardan `/health` ni las peticiones `OPTIONS`.
  Retención de 90 días (`REQUEST_LOG_RETENTION_DAYS`); `REQUEST_LOG_ENABLED=false`
  lo apaga. Se ve en **`/admin`** (sin enlace en la navegación), solo para los
  ids de `ADMIN_USER_IDS` en `backend.env`: totales, serie temporal, quién usa
  más la web y el detalle de cada usuario, países, clientes, rutas más pedidas,
  lentas y con errores, y las últimas peticiones. API: `GET /v1/admin/me`,
  `/v1/admin/stats?range=1h|24h|7d|30d` y `/v1/admin/stats/users/:id` (proxys en
  `/api/admin/*`). Las rutas `/api` de Next que llaman directamente a TMDb no
  pasan por el backend y no aparecen.

  Cómo se calcula: la ventana empieza al inicio de un tramo (minuto, hora o día
  en `STATS_TIME_ZONE`, `Europe/Madrid` por defecto), así que la serie suma lo
  mismo que los totales y solo el último tramo va en curso. `previous` trae los
  totales del periodo anterior del mismo largo; cada KPI enseña el cambio
  («+11 %», en verde o rojo según si subir es bueno) y una minigráfica. Los
  errores son tasas (5xx y 4xx por separado), la latencia es p50 y p95, y un
  tramo sin peticiones no tiene latencia (hueco en la gráfica, no 0 ms). La
  parte cliente está en `src/app/admin/`: `adminFormat.js` (cifras y fechas, con
  tests), `adminCharts.jsx` (recharts, cargado solo en esta página) y
  `AdminClient.jsx`.
- **Visitas** → Umami (páginas vistas, visitantes, países, dispositivos,
  referencias). El script y el envío salen por el propio dominio
  (`/u-stats/script.js`, `/u-stats/api/send`; rewrites de `next.config.ts` hacia
  `http://umami:3000`), así que los bloqueadores no lo cortan. Con sesión, la
  visita lleva el id y el usuario (`umami.identify`). Solo en builds de
  producción con `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.

Puesta en marcha de Umami (una vez):

1. En `deploy/nas/.env`, `UMAMI_DB_PASSWORD` (alfanumérica) y `UMAMI_APP_SECRET`.
2. `docker compose up -d umami` (arranca antes `umami-db-init`). No está en la
   lista de servicios del workflow de deploy; sigue vivo por su `restart`.
3. En Cloudflare Zero Trust, una ruta del túnel `stats.theshowverse.com →
   http://umami:3000` protegida con Cloudflare Access.
4. Entra (usuario `admin`, contraseña `umami`), **cambia la contraseña**, crea el
   sitio `theshowverse.com` y copia su id en `UMAMI_WEBSITE_ID`. El siguiente
   deploy de la web ya lleva el script.

## Seguridad

- Solo `web:3000` sale al exterior (y a través de Cloudflare). `postgres`, `redis`
  y `backend` quedan en la red interna del compose: **no** hagas port-forward de
  5432/6379/3001 en el router.
- El túnel de Cloudflare es **saliente**: no hay que abrir puertos de entrada.
