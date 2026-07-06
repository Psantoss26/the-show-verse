# 01 · Desarrollo local

Objetivo: ejecutar el **backend** y la **base de datos** en tu máquina para probar
cambios antes de desplegar al NAS, opcionalmente **con los datos de producción**.

Arquitectura local:

- **Postgres + Redis** → en Docker (`deploy/local/docker-compose.yml`).
- **Backend (Fastify)** → nativo con `node --watch` (recarga en caliente).
- **Web (Next.js)** → nativo con `next dev`, apuntando al backend local.

## 0. Requisitos

- **Node 22+** (ya instalado).
- **Docker Engine + plugin Compose**. En Ubuntu:

  ```bash
  # Docker oficial (recomendado)
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  # Usar docker sin sudo:
  sudo usermod -aG docker "$USER" && newgrp docker
  ```

  Verifica: `docker compose version`.

## 1. Configurar variables de entorno

```bash
# Backend: copia la plantilla y rellena las claves reales (TMDB, Trakt, JWT…).
cp backend/.env.example backend/.env
# El fichero backend/.env.local (ya creado) apunta la BBDD/Redis a local y
# NO se versiona; sobreescribe backend/.env solo para desarrollo.

# Web: copia la plantilla si aún no tienes .env; .env.local (ya creado) hace que
# la web hable con el backend local (http://localhost:3001).
cp .env.example .env   # (si no existe ya)
```

Cómo se resuelven las variables:

- **Backend** (`src/config/load-env.js`): carga `backend/.env` y luego
  `backend/.env.local` (con *override*). En producción `.env.local` no existe
  (está en `.dockerignore`), así que no afecta al NAS.
- **Web** (Next.js): carga `.env` y luego `.env.local` (prioridad). Para volver a
  apuntar al backend remoto, borra `.env.local`.

## 2. Levantar la base de datos

```bash
npm run db:up        # Postgres :5432 + Redis :6379 (solo 127.0.0.1)
npm run db:logs      # ver logs
npm run db:down      # parar
npm run db:reset     # parar + BORRAR datos + volver a levantar
```

## 3. Crear el esquema (migraciones)

```bash
npm run backend:migrate     # aplica backend/drizzle/*.sql a la BBDD local
```

## 4. (Opcional) Cargar los datos de producción

Para probar con datos reales sin tocar producción, se **vuelca** la BBDD del NAS y
se **restaura** en tu Postgres local. Ver [06 · Sync de datos](#datos-de-produccion).

```bash
# 1) En el NAS, genera el volcado (la BBDD de prod no se expone a Internet):
docker compose -f deploy/nas/docker-compose.yml exec -T postgres \
  pg_dump -U tsv -Fc theshowverse > theshowverse.dump
# 2) Copia theshowverse.dump a tu máquina (scp) y restaura en local:
npm run db:sync-prod -- theshowverse.dump
```

El script recrea la BBDD local, restaura el volcado y aplica migraciones pendientes.

## 5. Arrancar backend y web

```bash
# Terminal 1 — backend (recarga en caliente)
npm run backend:dev
# → http://localhost:3001/health

# Terminal 2 — web
npm run dev
# → http://localhost:3000  (sus /api/* llaman al backend local)
```

## 6. Tests del backend

```bash
npm --prefix backend test
```

## Flujo resumido

```bash
npm run db:up && npm run backend:migrate      # BBDD lista
npm run db:sync-prod -- theshowverse.dump     # (opcional) datos de prod
npm run backend:dev                           # API local
npm run dev                                    # web local
```

<a id="datos-de-produccion"></a>
## Datos de producción → local (detalle)

`scripts/sync-prod-db.sh` (envuelto por `npm run db:sync-prod`):

1. Requiere Docker y el compose local levantado (`npm run db:up`).
2. Origen del volcado:
   - un fichero `.dump` (formato custom `pg_dump -Fc`), pasado como argumento, **o**
   - `PROD_DATABASE_URL` (si la BBDD de prod es alcanzable): lo vuelca al vuelo.
3. Recrea `theshowverse` en local, restaura y aplica migraciones.

```bash
# Con fichero de volcado:
npm run db:sync-prod -- ruta/al/theshowverse.dump

# Desde una URL alcanzable (p. ej. túnel a la Postgres del NAS):
PROD_DATABASE_URL='postgresql://tsv:...@host:5432/theshowverse' npm run db:sync-prod
```

> ⚠️ **Nunca** apuntes el backend local directamente a la BBDD de producción para
> "probar": trabajarías sobre datos reales. Usa siempre una copia local.

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| `DATABASE_URL environment variable is required` | Falta `backend/.env` o `.env.local`. Copia la plantilla. |
| El backend no conecta a Postgres | ¿`npm run db:up` corriendo? Revisa `npm run db:logs`. |
| `self-signed certificate` / TLS al conectar en local | Usa `?sslmode=disable` en `DATABASE_URL` (ya está en `.env.local`). |
| La web no llega al backend | Comprueba `.env.local` (`BACKEND_API_BASE_URL=http://localhost:3001`) y que el backend esté arriba. |
| Puerto 5432/6379 ocupado | Ya tienes un Postgres/Redis local; párralo o cambia el puerto en `deploy/local/docker-compose.yml`. |
