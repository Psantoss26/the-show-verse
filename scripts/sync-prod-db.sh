#!/usr/bin/env bash
# Snapshot de producción -> PostgreSQL LOCAL. Nunca restaura en una URL remota.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
cd "$ROOT"
COMPOSE=(docker compose -f "$ROOT/deploy/local/docker-compose.yml")
YES=false
if [[ "${1:-}" == '--yes' ]]; then YES=true; shift; fi
DUMP="${1:-${PROD_DUMP_FILE:-}}"
[[ -z "$DUMP" || "$DUMP" == /* ]] || DUMP="$CALLER_DIR/$DUMP"
mkdir -p .local/backups

# Evita que un contexto Docker remoto convierta el destino en producción.
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
else
  ENDPOINT="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
fi
if [[ "$ENDPOINT" != unix://* ]]; then
  echo 'Se requiere un Docker local (socket Unix), no un contexto remoto.' >&2
  exit 1
fi
"${COMPOSE[@]}" up -d --wait --wait-timeout 90
node scripts/setup-local.mjs

TEMP_DUMP=''
trap 'if [[ -n "$TEMP_DUMP" ]]; then rm -f "$TEMP_DUMP"; fi' EXIT
if [[ -z "$DUMP" ]]; then
  DUMP="$ROOT/.local/backups/production-$(date +%Y%m%d-%H%M%S).dump"
  TEMP_DUMP="$(mktemp "$ROOT/.local/backups/incoming-XXXXXX")"
  if [[ -n "${PROD_SSH_HOST:-}" ]]; then
    CONTAINER="${PROD_PG_CONTAINER:-theshowverse-postgres-1}"
    [[ "$CONTAINER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Contenedor no válido' >&2; exit 1; }
    echo 'Obteniendo snapshot del NAS (pg_dump de solo lectura)…'
    ssh -p "${PROD_SSH_PORT:-22}" "$PROD_SSH_HOST" \
      "docker exec $CONTAINER pg_dump -U tsv -Fc --no-owner --no-acl theshowverse" > "$TEMP_DUMP"
  elif [[ -n "${PROD_DATABASE_URL:-}" ]]; then
    echo 'Obteniendo snapshot de PROD_DATABASE_URL…'
    # La credencial no aparece en argumentos de procesos ni en los logs.
    export PGDATABASE="$PROD_DATABASE_URL"
    docker run --rm --network host --env PGDATABASE --env PGOPTIONS='-c default_transaction_read_only=on' \
      postgres:18 pg_dump -Fc --no-owner --no-acl > "$TEMP_DUMP"
    unset PGDATABASE
  else
    echo 'Indica un fichero .dump, PROD_SSH_HOST=usuario@nas o PROD_DATABASE_URL.' >&2
    exit 1
  fi
  "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$TEMP_DUMP" > /dev/null
  mv "$TEMP_DUMP" "$DUMP"
  TEMP_DUMP=''
fi
[[ -s "$DUMP" ]] || { echo "Volcado inexistente o vacío: $DUMP" >&2; exit 1; }
"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$DUMP" > /dev/null

if [[ "$YES" != true ]]; then
  echo 'Se sustituirán los datos LOCALES. Para evitar escrituras concurrentes, para el backend.'
  read -r -p '¿Continuar? [y/N] ' reply
  [[ "$reply" =~ ^[Yy]$ ]] || exit 0
fi
# Conserva los datos locales anteriores incluso si falla restore o migrate.
BACKUP="$ROOT/.local/backups/local-before-sync-$(date +%Y%m%d-%H%M%S).dump"
"${COMPOSE[@]}" exec -T postgres pg_dump -U tsv -Fc theshowverse > "$BACKUP"
echo "Copia de seguridad local: $BACKUP"
"${COMPOSE[@]}" exec -T postgres psql -U tsv -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DROP DATABASE theshowverse WITH (FORCE);
CREATE DATABASE theshowverse OWNER tsv;
SQL
"${COMPOSE[@]}" exec -T postgres pg_restore -U tsv -d theshowverse \
  --no-owner --no-acl --single-transaction --exit-on-error < "$DUMP"
NODE_ENV=development SHOWVERSE_LOCAL_DEV=1 npm --prefix backend run db:migrate
"${COMPOSE[@]}" exec -T redis redis-cli FLUSHDB > /dev/null
"${COMPOSE[@]}" exec -T postgres psql -U tsv -d theshowverse -v ON_ERROR_STOP=1 \
  -c 'SELECT count(*) AS users FROM users;' \
  -c 'SELECT count(*) AS watch_history FROM watch_history;'
echo "Copia restaurada y migrada: $DUMP"
