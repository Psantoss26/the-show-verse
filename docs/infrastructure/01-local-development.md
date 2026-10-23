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

## `fetch failed` con `ETIMEDOUT` hacia TMDb

Síntoma: en la consola de `next dev` aparece `TypeError: fetch failed` con un
`AggregateError` `ETIMEDOUT` de 12 errores, o `TmdbUnavailableError: TMDb
abort/timeout`, aunque `curl https://api.themoviedb.org` responda al momento.

Causa: TMDb resuelve a 12 direcciones (8 IPv6 y 4 IPv4) y Node prueba cada una
con «happy eyeballs» dándole solo 250 ms. En una red sin ruta IPv6 quedan las
IPv4, y si el event loop va cargado (compilación de Turbopack, máquina
saturada) esos 250 ms caducan antes de procesar la conexión.

Ajuste: el servidor de Next (`src/instrumentation.js` →
`src/lib/server/outboundNetwork.js`) y el backend
(`backend/src/config/outbound-network.js`, importado en `server.js`) piden IPv4
primero y dan 2,5 s a cada intento. Se aplica al arrancar: tras cambiarlo hay
que reiniciar `npm run dev`.
