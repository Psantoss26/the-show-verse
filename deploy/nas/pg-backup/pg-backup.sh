#!/usr/bin/env bash
# Copia de seguridad diaria del Postgres de producción (servicio pg-backup de
# deploy/nas/docker-compose.yml). Ver deploy/nas/BACKUPS.md.
#
#   pg-backup         bucle: una copia al arrancar si la última tiene más de un
#                     día y después una cada día a las $BACKUP_TIME.
#   pg-backup now     una copia ahora mismo y termina.
#
# Cada copia es un pg_dump en formato custom (-Fc, se restaura con pg_restore)
# que se comprueba con `pg_restore --list` antes de darla por buena. Se guarda
# en daily/; la del domingo también en weekly/ y la del día 1 en monthly/
# (enlaces duros: no ocupan el doble). Se conservan las últimas $KEEP_DAILY,
# $KEEP_WEEKLY y $KEEP_MONTHLY de cada carpeta.
set -euo pipefail

export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-tsv}"
export PGDATABASE="${PGDATABASE:-theshowverse}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_TIME="${BACKUP_TIME:-04:30}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
# Cachés que se regeneran solas: sin sus datos la copia es mucho más pequeña
# (la estructura de las tablas sí se guarda).
EXCLUDE_TABLE_DATA="${EXCLUDE_TABLE_DATA:-tmdb_cache dashboard_pools user_recommendations}"

log() { echo "[pg-backup $(date '+%Y-%m-%d %H:%M:%S %Z')] $*"; }

prune() {
  local dir="$1" keep="$2"
  # Los más recientes primero; se borra lo que pase de $keep.
  find "$dir" -maxdepth 1 -name '*.dump' -printf '%T@ %p\n' | sort -rn | tail -n "+$((keep + 1))" | cut -d' ' -f2- |
    while IFS= read -r old; do
      rm -f -- "$old"
      log "borrada copia antigua: $old"
    done
}

backup() {
  mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"
  local name="theshowverse_$(date +%Y-%m-%d_%H%M%S).dump"
  local final="$BACKUP_DIR/daily/$name"
  local partial="$BACKUP_DIR/daily/.$name.partial"
  local excludes=()
  for table in $EXCLUDE_TABLE_DATA; do excludes+=("--exclude-table-data=$table"); done

  log "copiando $PGDATABASE@$PGHOST…"
  rm -f -- "$partial"
  if ! pg_dump -Fc --no-owner --no-privileges "${excludes[@]}" -f "$partial"; then
    rm -f -- "$partial"
    log "ERROR: pg_dump ha fallado"
    return 1
  fi
  # Una copia que no se puede leer no vale: se comprueba antes de guardarla.
  if ! pg_restore --list "$partial" >/dev/null; then
    rm -f -- "$partial"
    log "ERROR: la copia no es legible"
    return 1
  fi
  mv -- "$partial" "$final"
  [ "$(date +%u)" = "7" ] && ln -f -- "$final" "$BACKUP_DIR/weekly/$name"
  [ "$(date +%d)" = "01" ] && ln -f -- "$final" "$BACKUP_DIR/monthly/$name"

  prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
  prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
  prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"
  date -Iseconds > "$BACKUP_DIR/.last-success"
  log "copia guardada: $final ($(du -h "$final" | cut -f1))"
}

seconds_until_next_run() {
  local now next
  now=$(date +%s)
  next=$(date -d "today $BACKUP_TIME" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow $BACKUP_TIME" +%s)
  echo $((next - now))
}

if [ "${1:-}" = "now" ]; then
  backup
  exit $?
fi

log "programado cada día a las $BACKUP_TIME (TZ=${TZ:-UTC}); guarda $KEEP_DAILY diarias, $KEEP_WEEKLY semanales y $KEEP_MONTHLY mensuales en $BACKUP_DIR"
# Al arrancar (p. ej. tras un despliegue o un reinicio del NAS), si la última
# copia buena tiene más de un día, se hace una ya.
if [ -z "$(find "$BACKUP_DIR/.last-success" -mmin -1440 2>/dev/null)" ]; then
  backup || log "se reintentará en la próxima ejecución"
fi
while true; do
  wait_for=$(seconds_until_next_run)
  log "próxima copia en $((wait_for / 3600))h $(((wait_for % 3600) / 60))min"
  sleep "$wait_for"
  backup || log "se reintentará en la próxima ejecución"
done
