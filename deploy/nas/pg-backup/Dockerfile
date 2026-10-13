# Copias diarias del Postgres de producción (ver deploy/nas/BACKUPS.md). La
# misma versión mayor que el servicio postgres: pg_dump debe ser >= servidor.
FROM postgres:18
COPY pg-backup.sh /usr/local/bin/pg-backup
RUN chmod +x /usr/local/bin/pg-backup
ENTRYPOINT []
CMD ["pg-backup"]
