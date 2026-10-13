# Copias de seguridad de la base de datos (NAS)

El servicio `pg-backup` de `docker-compose.yml` hace cada día una copia del
Postgres de producción. Se despliega solo con el resto del stack (workflow
`deploy-nas.yml`).

## Qué hace

- **Cuándo:** cada día a las **04:30** (hora de Madrid). Al arrancar —tras un
  despliegue o un reinicio del NAS— hace una al momento si la última tiene más
  de un día.
- **Qué:** `pg_dump` en formato custom de toda la base (se restaura con
  `pg_restore`). Las cachés que se regeneran solas (`tmdb_cache`,
  `dashboard_pools`, `user_recommendations`) van sin datos para que la copia
  sea pequeña; su estructura sí se guarda.
- **Comprobación:** cada copia se lee con `pg_restore --list` antes de darla por
  buena. Si falla, se borra y se reintenta en la siguiente ejecución.
- **Dónde:** en el NAS, en `/volume4/docker/theshowverse-backups/postgres/`, FUERA
  de la carpeta del código (el despliegue la sincroniza con `rsync --delete` y
  las borraría).
- **Cuántas:** las 14 últimas diarias (`daily/`), 8 semanales (`weekly/`, la del
  domingo) y 12 mensuales (`monthly/`, la del día 1). Las semanales y mensuales
  son enlaces duros a la diaria: no ocupan espacio extra.
- **Salud:** el contenedor está `unhealthy` si la última copia buena tiene más de
  26 horas (`docker compose ps pg-backup`).

Se puede ajustar en `deploy/nas/.env` (opcional):

```
PG_BACKUP_DIR=/volume4/docker/theshowverse-backups/postgres
PG_BACKUP_TIME=04:30
PG_BACKUP_KEEP_DAILY=14
PG_BACKUP_KEEP_WEEKLY=8
PG_BACKUP_KEEP_MONTHLY=12
TZ=Europe/Madrid
```

> Las copias viven en el mismo NAS que la base: protegen de errores (una
> importación que estropea datos, un borrado) pero no de que el NAS falle.
> Conviene llevar `PG_BACKUP_DIR` también a otro sitio (otro disco, Hyper
> Backup/sincronización de UGOS a la nube…).

## Uso

Desde `/volume4/docker/theshowverse/deploy/nas` en el NAS:

```bash
docker compose logs pg-backup            # qué ha hecho y cuándo toca la próxima
docker compose exec pg-backup pg-backup now   # una copia ahora mismo
ls -lh /volume4/docker/theshowverse-backups/postgres/daily
```

## Recuperar los datos de UN usuario

Para deshacer algo que afectó a una cuenta (p. ej. una importación que cambió
sus notas) sin tocar al resto. Usa `backend/src/scripts/restore-user-data.js`,
que compara la copia con la base actual SOLO para ese usuario (notas,
favoritas, pendientes, visionados, reseñas y listas).

```bash
# 1) Un Postgres temporal con la copia elegida, en la red del stack.
docker run -d --name tsv-restore --network theshowverse_default \
  -e POSTGRES_PASSWORD=restore \
  -v /volume4/docker/theshowverse-backups/postgres:/backups:ro postgres:18
until docker exec tsv-restore pg_isready -U postgres; do sleep 1; done
docker exec tsv-restore createdb -U postgres snapshot
docker exec tsv-restore pg_restore --no-owner -U postgres -d snapshot \
  /backups/daily/theshowverse_AAAA-MM-DD_HHMMSS.dump

# 2) Vista previa: no cambia nada, enseña qué cambiaría.
docker compose exec \
  -e SOURCE_DATABASE_URL=postgres://postgres:restore@tsv-restore:5432/snapshot \
  backend npm run user:restore -- --username <usuario>

# 3) Si es lo esperado, aplicarlo (una sola transacción).
docker compose exec \
  -e SOURCE_DATABASE_URL=postgres://postgres:restore@tsv-restore:5432/snapshot \
  backend npm run user:restore -- --username <usuario> --apply

# 4) Quitar el Postgres temporal.
docker rm -f tsv-restore
```

`--tables user_ratings,favorites` limita la recuperación a esas tablas.

## Restaurar la base ENTERA (desastre)

Sustituye todos los datos por los de la copia: se pierde lo posterior a ella.

```bash
docker compose stop backend web
docker compose exec postgres dropdb -U tsv theshowverse
docker compose exec postgres createdb -U tsv theshowverse
docker compose exec -T postgres pg_restore --no-owner -U tsv -d theshowverse \
  < /volume4/docker/theshowverse-backups/postgres/daily/theshowverse_AAAA-MM-DD_HHMMSS.dump
docker compose start backend web
```
