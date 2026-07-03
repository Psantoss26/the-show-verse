# Postgres en el NAS (UGREEN DXP 4800 Plus) — base de datos de desarrollo

Base de datos **de desarrollo** (y stack local si Neon no está disponible).
El NAS (192.168.1.126) está en la LAN, así que **no** sirve para tu producción en
la nube (Vercel no puede llegar a tu red local). No expongas el 5432 a Internet.

## 1. Crear el contenedor en el NAS

**Opción A — App Docker de UGOS (interfaz):**
1. Copia esta carpeta (`deploy/nas-postgres/`) al NAS (p. ej. `/volume1/docker/tsv-postgres/`).
2. Crea un fichero `.env` junto al `docker-compose.yml` con una clave fuerte:
   ```
   POSTGRES_PASSWORD=una-clave-larga-y-segura
   ```
3. En UGOS → **Docker → Proyectos/Compose → Crear** apuntando a este `docker-compose.yml`, y arráncalo.

**Opción B — SSH (línea de comandos):**
```bash
ssh tu-usuario@192.168.1.126
cd /volume1/docker/tsv-postgres
echo "POSTGRES_PASSWORD=una-clave-larga-y-segura" > .env
docker compose up -d
docker compose ps          # debe verse "healthy"
```

## 2. Permitir el acceso desde la LAN
Si el NAS tiene cortafuegos activo (UGOS → Seguridad/Firewall), permite el puerto
**5432 solo para tu red local** (p. ej. 192.168.1.0/24). **No** hagas port-forward
del 5432 en el router.

## 3. Crear el esquema (desde tu PC)
```bash
cd backend
DATABASE_URL="postgresql://tsv:una-clave-larga-y-segura@192.168.1.126:5432/theshowverse" \
  npm run db:migrate
```
Esto crea todas las tablas (incluida la columna `confidence`). La BD queda vacía;
crea un usuario desde la web local o con `npm run db:seed` si aplica.

## 4. Usarla como BD de desarrollo
En `backend/.env`:
```
DATABASE_URL=postgresql://tsv:una-clave-larga-y-segura@192.168.1.126:5432/theshowverse
DASHBOARD_POOL_WARM_MS=0
DB_KEEPALIVE_MS=0
```
Los dos flags evitan gasto innecesario y, al no ser Neon, no hay cuota que agotar.

## 5. (Opcional) Cargar tus datos reales de producción
Solo cuando Neon vuelva a estar disponible (el `pg_dump` gasta egress de Neon).
Excluye los cachés grandes (se regeneran solos) para un dump minúsculo:
```bash
pg_dump "postgresql://USER:PASS@HOST-NEON/neondb?sslmode=require" \
  --no-owner --no-privileges -Fc \
  --exclude-table-data=tmdb_cache \
  --exclude-table-data=dashboard_pools \
  --exclude-table-data=user_recommendations \
  -f prod.dump

pg_restore --no-owner --no-privileges \
  -d "postgresql://tsv:una-clave-larga-y-segura@192.168.1.126:5432/theshowverse" prod.dump
```

## Failover de PRODUCCIÓN (no el NAS)
Para redundancia de la producción en la nube, usa **otra BD en la nube** (otro
proyecto Neon, Supabase, Railway, Render…). El cambio es solo poner ese
`DATABASE_URL` en el entorno de producción. Un NAS doméstico no es adecuado para
esto (IP privada, exposición insegura, uptime/ancho de banda de casa).
