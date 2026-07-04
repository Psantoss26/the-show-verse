#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-prod-db.sh — Trae los datos de PRODUCCIÓN a tu Postgres LOCAL para poder
# probar con datos reales SIN tocar producción.
#
# Dos modos:
#   1) Restaurar un fichero de volcado ya existente (lo normal):
#        ./scripts/sync-prod-db.sh ruta/al/theshowverse.dump
#   2) Volcar directamente desde una BBDD de prod ALCANZABLE (define PROD_DATABASE_URL):
#        PROD_DATABASE_URL='postgresql://tsv:...@host:5432/theshowverse' ./scripts/sync-prod-db.sh
#
# Cómo generar el volcado EN EL NAS (recomendado; la BBDD de prod no se expone):
#   docker compose -f deploy/nas/docker-compose.yml exec -T postgres \
#     pg_dump -U tsv -Fc theshowverse > theshowverse.dump
#   # …luego copia theshowverse.dump a esta máquina (scp) y ejecútame con esa ruta.
#
# Requisitos: Docker y el compose local levantado (npm run db:up).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER="tsv-local-db"
LOCAL_USER="tsv"
LOCAL_DB="theshowverse"
PG_IMAGE="postgres:18"   # prod (NAS) y Neon corren PG18; el cliente debe ser >= servidor
DUMP="${1:-${PROD_DUMP_FILE:-theshowverse.dump}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no está instalado. Instálalo y ejecuta 'npm run db:up' primero." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "❌ El contenedor '$CONTAINER' no está en marcha. Ejecuta: npm run db:up" >&2
  exit 1
fi

# ── Obtener el volcado ───────────────────────────────────────────────────────
if [ ! -f "$DUMP" ]; then
  if [ -n "${PROD_DATABASE_URL:-}" ]; then
    echo "📥 Volcando desde PROD_DATABASE_URL a $DUMP (formato custom)…"
    docker run --rm "$PG_IMAGE" pg_dump -Fc "$PROD_DATABASE_URL" > "$DUMP"
  else
    echo "❌ No existe el volcado '$DUMP' ni está definida PROD_DATABASE_URL." >&2
    echo "   Genera el volcado en el NAS (ver cabecera del script) o pásame su ruta." >&2
    exit 1
  fi
fi

echo "⚠️  Se BORRARÁ y recreará la BBDD local '$LOCAL_DB' y se restaurará '$DUMP'."
read -r -p "¿Continuar? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Cancelado."; exit 0; }

# ── Recrear la BBDD local ────────────────────────────────────────────────────
echo "🧹 Recreando '$LOCAL_DB'…"
docker exec -i "$CONTAINER" psql -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $LOCAL_DB;
CREATE DATABASE $LOCAL_DB OWNER $LOCAL_USER;
SQL

# ── Restaurar (volcado en formato custom -Fc) ────────────────────────────────
echo "📦 Restaurando datos…"
docker exec -i "$CONTAINER" pg_restore -U "$LOCAL_USER" -d "$LOCAL_DB" --no-owner --clean --if-exists < "$DUMP"

echo "🔄 Aplicando migraciones pendientes (por si el esquema local es más nuevo)…"
npm --prefix backend run db:migrate || true

echo "✅ Listo. Tu Postgres local tiene ahora los datos de producción."
