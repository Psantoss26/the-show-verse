# 01 · Desarrollo local

La guía mantenida para instalar, arrancar y copiar la base de datos de producción
está en [Arranque local](./ARRANQUE-LOCAL.md).

Cada día basta con ejecutar `npm run dev` en la raíz y `npm run dev` en `backend/`.
El backend prepara automáticamente PostgreSQL y Redis mediante Docker Compose.

Para actualizar la copia local del NAS, con el backend parado:

```bash
PROD_SSH_HOST=pablo@192.168.1.126 npm run db:sync-prod
```

Para una fuente PostgreSQL accesible directamente, el script admite
`PROD_DATABASE_URL` como variable de entorno. No toma implícitamente la URL de
`backend/.env`: el origen debe elegirse de forma explícita. El destino siempre
es el PostgreSQL del Compose local y nunca se obtiene de esa URL.
