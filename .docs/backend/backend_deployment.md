# Despliegue del backend propio

Esta guia recoge lo necesario para desplegar `backend/` como API separada.

## Estado actual

El backend ya esta preparado para desplegarse como servicio Node.js independiente:

- Arranca con `npm run start`.
- Ejecuta migraciones antes de iniciar el servidor.
- Expone `/health` para liveness.
- Expone `/ready` para readiness con comprobacion de PostgreSQL y Redis.
- Valida variables criticas en `NODE_ENV=production`.
- Soporta CORS con `FRONTEND_URL` y `FRONTEND_URLS`.
- Docker copia las migraciones de Drizzle.
- `npm run deploy:check` valida entorno, DB, Redis y TMDb.

## Variables de entorno de produccion

Configura estas variables en Railway, Render o el proveedor que uses:

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

DATABASE_URL=<neon pooled url>
DATABASE_URL_UNPOOLED=<neon direct url>
REDIS_URL=<redis url>

JWT_ACCESS_SECRET=<64+ random chars>
JWT_REFRESH_SECRET=<64+ random chars>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

FRONTEND_URL=https://<tu-frontend-vercel>
FRONTEND_URLS=https://<tu-frontend-vercel>,https://<dominio-final>

TMDB_API_KEY=<tmdb api key>

TRAKT_CLIENT_ID=<opcional para importacion>
TRAKT_CLIENT_SECRET=<opcional para importacion>
```

Genera secretos JWT asi:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Railway

Usa `backend/` como root del servicio o despliega desde ese directorio. El archivo `backend/railway.toml` define:

```toml
startCommand = "npm run start"
healthcheckPath = "/ready"
```

Pasos:

1. Crea un servicio Node.js en Railway apuntando a `backend/`.
2. Configura las variables de entorno.
3. Asegurate de usar la URL pooled de Neon en `DATABASE_URL`.
4. Usa la URL directa de Neon en `DATABASE_URL_UNPOOLED`.
5. Despliega.
6. Abre `https://<backend-url>/ready`.

Respuesta esperada:

```json
{"status":"ready","checks":{"database":"ok","redis":"ok"}}
```

## Render

El archivo `backend/render.yaml` esta configurado con:

- `rootDir: backend`
- `buildCommand: npm ci`
- `startCommand: npm run start`
- `healthCheckPath: /ready`

Pasos:

1. Crea un Blueprint o Web Service desde el repo.
2. Usa `backend` como root si no usas Blueprint.
3. Configura las variables marcadas como `sync: false`.
4. Despliega.
5. Comprueba `/health` y `/ready`.

## Docker

El Dockerfile esta en `backend/Dockerfile`.

Build:

```bash
cd backend
docker build -t the-show-verse-api .
```

Run:

```bash
docker run --rm -p 3001:3001 --env-file .env the-show-verse-api
```

Nota: el entorno actual de Codex no tiene `docker` disponible, asi que este build no se pudo validar localmente en esta sesion.

## Comprobacion previa al deploy

Desde `backend/`:

```bash
npm run deploy:check
```

Salida esperada:

```text
OK environment: origins=https://...
OK database: select 1
OK redis: ping
OK tmdb: configuration
```

Si falla `environment`, revisa variables faltantes. Si falla `database`, revisa Neon y `sslmode=require`. Si falla `redis`, revisa `REDIS_URL`.

## Comprobacion post-deploy

```bash
curl -sS https://<backend-url>/health
curl -sS https://<backend-url>/ready
curl -sS 'https://<backend-url>/v1/tmdb/trending?type=movie&window=day'
```

La tercera llamada debe devolver `results`.

## Integracion con Vercel

El backend desplegado no reemplaza automaticamente las rutas actuales de Vercel.

Para integrarlo con el frontend hacen falta dos cambios posteriores:

1. Anadir en Vercel:

   ```env
   BACKEND_API_URL=https://<backend-url>
   ```

2. Convertir rutas actuales como `/api/trakt/item/status`, `/api/trakt/history`, `/api/tmdb/account/favorite` y `/api/tmdb/account/watchlist` en proxies compatibles hacia `/v1/*`.

Hasta que esa fase este hecha, Vercel seguira usando las API Routes actuales con Trakt/TMDb.

