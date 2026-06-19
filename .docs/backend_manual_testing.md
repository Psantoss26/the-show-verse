# Arranque y pruebas manuales del backend

Esta guia explica como levantar The Show Verse con el backend propio, PostgreSQL, Redis y el frontend para pruebas manuales.

## Mapa rapido

| Pieza | Ruta | Puerto |
| --- | --- | --- |
| Frontend Next.js | repo raiz | `3000` |
| Backend Fastify | `backend/` | `3001` |
| PostgreSQL | Neon remoto o Docker local | `5432` si Docker |
| Redis | Redis remoto o Docker local | `6379` si Docker |

La configuracion actual usa `backend/.env` con variables de Neon y Redis. No pegues valores reales en documentacion ni commits.

## Prerrequisitos

- Node.js 20 o superior.
- npm.
- Docker Desktop o Docker Engine, solo si quieres PostgreSQL/Redis locales.
- `backend/.env` ya configurado con:
  - `DATABASE_URL`
  - `DATABASE_URL_UNPOOLED`
  - `REDIS_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `FRONTEND_URL=http://localhost:3000`
  - `TMDB_API_KEY`

## Opcion recomendada ahora: Neon + Redis configurados en `.env`

### 1. Instala dependencias

Desde la raiz:

```bash
npm install
cd backend
npm install
```

### 2. Aplica migraciones de base de datos

```bash
cd backend
npm run db:migrate
```

Salida esperada:

```text
Running database migrations...
Migrations completed successfully
```

Si ves avisos como `schema "drizzle" already exists, skipping`, es normal cuando la base ya tenia migraciones aplicadas.

Antes de desplegar, ejecuta tambien:

```bash
npm run deploy:check
```

Debe comprobar entorno, DB, Redis y TMDb.

### 3. Arranca el backend

```bash
cd backend
npm run dev
```

Salida esperada:

```text
The Show Verse API running at http://0.0.0.0:3001
Health check: http://localhost:3001/health
Database: Connected
Redis: Configured
```

### 4. Verifica el backend

En otra terminal:

```bash
curl -sS http://localhost:3001/health
```

Debe devolver algo parecido a:

```json
{"status":"ok","version":"1.0.0","timestamp":"..."}
```

Readiness:

```bash
curl -sS http://localhost:3001/ready
```

Debe devolver `status: "ready"` y checks `database: "ok"`.

Prueba tambien TMDb:

```bash
curl -sS 'http://localhost:3001/v1/tmdb/trending?type=movie&window=day'
```

Debe devolver un objeto con `results`.

### 5. Arranca el frontend

En otra terminal, desde la raiz:

```bash
npm run dev
```

Abre:

```text
http://localhost:3000
```

Nota importante: el frontend actual todavia no consume el backend propio de forma general. Muchas pantallas siguen usando rutas Next.js en `/api/*`. Para probar el backend propio hoy, usa las pruebas curl/Postman de esta guia.

## Opcion local: PostgreSQL + Redis con Docker

Usa esta opcion si no quieres tocar Neon durante pruebas.

### 1. Prepara `.env`

En `backend/.env`, ajusta:

```env
DATABASE_URL=postgresql://tsv_user:<local_password>@localhost:5432/the_show_verse
DATABASE_URL_UNPOOLED=postgresql://tsv_user:<local_password>@localhost:5432/the_show_verse
REDIS_URL=redis://localhost:6379
POSTGRES_PASSWORD=<local_password>
```

### 2. Levanta PostgreSQL y Redis

```bash
cd backend
docker compose up db redis -d
```

Verifica:

```bash
docker compose ps
```

### 3. Migra y arranca

```bash
cd backend
npm run db:migrate
npm run dev
```

## Pruebas manuales de API

Estas pruebas crean un usuario temporal y validan el flujo core: auth, favoritos, watchlist, historial, ratings, listas, estado de item, TMDb y stats.

### 1. Crear usuario temporal

```bash
TS=$(date +%s)
curl -sS -X POST http://localhost:3001/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d "{
    \"email\":\"manual-$TS@example.com\",
    \"username\":\"manual_$TS\",
    \"password\":\"ManualTest123!\",
    \"displayName\":\"Manual Test $TS\"
  }" > /tmp/tsv-register.json

cat /tmp/tsv-register.json
```

Guarda el access token:

```bash
ACCESS_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/tsv-register.json','utf8')).accessToken)")
REFRESH_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/tsv-register.json','utf8')).refreshToken)")
```

### 2. Ver perfil autenticado

```bash
curl -sS http://localhost:3001/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe devolver `user`.

### 3. Favoritos

```bash
curl -sS -X POST http://localhost:3001/v1/favorites \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":550,"mediaType":"movie","title":"Fight Club","posterPath":"/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg"}'

curl -sS http://localhost:3001/v1/favorites \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe aparecer el item `tmdbId: 550`.

### 4. Watchlist

```bash
curl -sS -X POST http://localhost:3001/v1/watchlist \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":1396,"mediaType":"tv","title":"Breaking Bad","priority":10}'

curl -sS http://localhost:3001/v1/watchlist \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5. Historial de pelicula

```bash
curl -sS -X POST http://localhost:3001/v1/history \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":550,"mediaType":"movie","watchedAt":"2026-06-19T10:00:00.000Z","runtimeMins":139,"title":"Fight Club"}'

curl -sS http://localhost:3001/v1/history/movies/550 \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe devolver `watched: true` y `plays` mayor que `0`.

### 6. Episodio visto

```bash
curl -sS -X POST http://localhost:3001/v1/history/episodes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":1396,"season":1,"episode":1,"watched":true,"watchedAt":"2026-06-19"}'

curl -sS http://localhost:3001/v1/history/shows/1396 \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe devolver `watchedBySeason` con temporada `1` y episodio `1`.

### 7. Rating

```bash
curl -sS -X POST http://localhost:3001/v1/ratings \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":550,"mediaType":"movie","rating":9,"title":"Fight Club"}'

curl -sS http://localhost:3001/v1/ratings \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 8. Lista propia

```bash
curl -sS -X POST http://localhost:3001/v1/lists \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Manual QA","description":"Lista creada en prueba manual","isPublic":false}' > /tmp/tsv-list.json

LIST_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/tsv-list.json','utf8')).list.id)")

curl -sS -X POST "http://localhost:3001/v1/lists/$LIST_ID/items" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tmdbId":550,"mediaType":"movie","title":"Fight Club","position":1}'

curl -sS "http://localhost:3001/v1/lists/$LIST_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe devolver la lista y sus items.

### 9. Estado unificado de item

```bash
curl -sS http://localhost:3001/v1/items/550/movie/status \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Debe devolver `favorite`, `watchlist`, `watched`, `plays` y `rating`.

### 10. Stats

```bash
curl -sS http://localhost:3001/v1/stats \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -sS http://localhost:3001/v1/stats/calendar \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Verificar tablas en la base de datos

Desde `backend/`:

```bash
node --input-type=module -e "import 'dotenv/config'; import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, { ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }, max: 1 }); const rows = await sql\`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name\`; console.log(rows.map(r => r.table_name).join('\\n')); await sql.end();"
```

Tablas esperadas:

```text
connected_accounts
favorites
refresh_tokens
subscriptions
tmdb_cache
user_list_items
user_lists
user_preferences
user_ratings
users
watch_history
watchlist
```

## Probar importacion desde Trakt

La importacion requiere un access token de Trakt del usuario. En este momento el backend no inicia el OAuth de Trakt, solo acepta el token.

```bash
curl -sS -X POST http://localhost:3001/v1/import/trakt \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"accessToken":"<trakt_access_token_del_usuario>"}'
```

Consultar progreso:

```bash
curl -sS http://localhost:3001/v1/import/trakt/status \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Troubleshooting

### `connection is insecure (try using sslmode=require)`

Usa URLs Neon con `sslmode=require`. El cliente del backend activa SSL automaticamente para hosts remotos, pero la URL tambien puede llevarlo:

```env
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<database>?sslmode=require
```

### `DATABASE_URL environment variable is required`

Ejecuta comandos desde `backend/` o confirma que existe `backend/.env`.

### Redis no esta disponible

El backend puede arrancar sin cache, pero rate limit y cache seran en memoria o no persistentes. Revisa:

```bash
docker compose ps redis
```

o prueba la URL remota configurada en `REDIS_URL`.

### CORS al llamar desde el frontend

Confirma:

```env
FRONTEND_URL=http://localhost:3000
```

Despues reinicia el backend.

### `TMDB_API_KEY not configured`

Las rutas `/v1/tmdb/*` necesitan `TMDB_API_KEY` en `backend/.env`.

### 401 en endpoints protegidos

El token se manda asi:

```bash
Authorization: Bearer $ACCESS_TOKEN
```

Si ha expirado, refresca:

```bash
curl -sS -X POST http://localhost:3001/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

## Checklist manual antes de integrar con la UI

- [ ] `npm run db:migrate` termina correctamente.
- [ ] `GET /health` responde OK.
- [ ] `GET /ready` responde `ready`.
- [ ] `npm run deploy:check` termina con `OK`.
- [ ] Registro y login devuelven access/refresh token.
- [ ] CRUD de favoritos funciona.
- [ ] CRUD de watchlist funciona.
- [ ] Historial de pelicula devuelve plays.
- [ ] Episodio visto devuelve `watchedBySeason`.
- [ ] Ratings crean y actualizan sin duplicados.
- [ ] Listas propias crean items.
- [ ] Estado unificado refleja favorito, watchlist, visto y rating.
- [ ] `/v1/tmdb/trending` devuelve resultados.
- [ ] `/v1/stats` refleja los datos insertados.
- [ ] El frontend arranca en `http://localhost:3000`.
- [ ] Se recuerda que el frontend actual aun usa rutas `/api/*` de Next.js.
