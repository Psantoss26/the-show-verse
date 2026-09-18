# Desarrollo local con copia de producción

La web se ejecuta en http://localhost:3000 y la API en http://localhost:3001.
PostgreSQL 18 y Redis 7 viven en Docker, con puertos publicados solo en loopback.
Los datos persisten al cerrar las terminales y al ejecutar `npm run db:down`.

## Arranque diario: dos terminales

Desde la raíz del repositorio:

```bash
npm run dev
```

Desde `backend/`, en otra terminal:

```bash
npm run dev
```

El backend arranca automáticamente los contenedores, espera a que estén sanos,
aplica las migraciones y se inicia con recarga automática. La web puede arrancarse
antes, pero las rutas de datos necesitan que la API esté lista. Usa `Ctrl+C` para
parar cada proceso; los contenedores conservan los datos.

## Primera instalación

Necesitas Node.js 22+, Docker Engine y Docker Compose v2, accesibles con `docker ps`.
En Ubuntu puedes instalarlos con:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Tras añadirte al grupo, cierra sesión y vuelve a entrar para activar los permisos.
Instala las dependencias de ambos proyectos:

```bash
npm ci
npm --prefix backend ci
npm run local:setup
```

Conserva tus archivos `.env` con las claves de TMDb y Google. Si no existen, copia
las plantillas `.env.example` y `backend/.env.example` y rellena las claves necesarias.
Las integraciones externas requieren sus propias credenciales y conectividad.
Google necesita autorizar `http://localhost:3000/api/auth/google/callback`.

`local:setup` y ambos comandos `dev` generan/actualizan los valores administrados en:

- `.env.development.local`: API y callbacks locales, sin puerta de acceso privada.
- `backend/.env.local`: Postgres/Redis locales, CORS local y JWT propios persistentes.
  Las claves de Stripe y Resend se vacían para desarrollo.

Se conservan las demás variables y los `.env` originales. Los archivos locales y
volcados no se versionan. El backend no carga `.env.local` en producción ni en tests.
El arranque local rechaza URLs remotas de PostgreSQL/Redis antes de abrir conexiones.

## Copiar producción del NAS

Para el backend antes de sustituir su base de datos. Desde la raíz:

```bash
PROD_SSH_HOST=pablo@192.168.1.126 npm run db:sync-prod
```

SSH solicita la contraseña si no tienes una clave configurada. No se guardan
contraseñas SSH. Por defecto usa el puerto 22 y el contenedor
`theshowverse-postgres-1`; puedes cambiarlos con `PROD_SSH_PORT` y `PROD_PG_CONTAINER`.
La única operación sobre producción es `pg_dump`.

También puedes restaurar un volcado existente en formato custom (`pg_dump -Fc`):

```bash
npm run db:sync-prod -- /ruta/a/produccion.dump
```

El script arranca los servicios locales, comprueba el volcado, pide confirmación,
guarda la base local anterior en `.local/backups/`, recrea **solo** la base local,
restaura en una transacción, aplica migraciones y vacía la caché Redis local.
Cualquier error interrumpe el proceso; no se anuncia éxito si fallan las migraciones.
Para automatizar una sustitución ya autorizada: `npm run db:sync-prod -- --yes fichero.dump`.
Si falla, puedes restaurar el archivo `local-before-sync-*.dump` con el mismo comando.

Los snapshots contienen datos privados: se crean con permisos restringidos y se
excluyen de Git. Es una copia puntual; los cambios locales no se replican al NAS.
Inicia sesión de nuevo en localhost: los JWT locales son distintos de producción.

## Comprobaciones

```bash
docker compose -f deploy/local/docker-compose.yml ps
curl --fail http://localhost:3001/health
curl --fail http://localhost:3001/ready
curl --fail -o /dev/null -w '%{http_code}\n' http://localhost:3000
```

`/ready` comprueba las conexiones a Postgres y Redis. Para las pruebas automatizadas:

```bash
node --test scripts/local-env.test.mjs
npm --prefix backend test
```

## Comandos auxiliares

| Comando en la raíz | Acción |
| --- | --- |
| `npm run local:setup` | Prepara la configuración local sin arrancar servicios. |
| `npm run db:up` | Arranca Postgres/Redis y espera a que estén sanos. |
| `npm run db:down` | Para los contenedores, conservando datos. |
| `npm run db:logs` | Consulta logs de Postgres/Redis. |
| `npm run db:reset` | **Elimina** los volúmenes locales y vuelve a arrancar. |
| `npm run backend:dev` | Equivale a `npm run dev` desde `backend/`. |

Si los puertos 3000, 3001, 5432 o 6379 están ocupados, cierra el servicio que los
ocupe antes de arrancar. Si Docker muestra `permission denied`, comprueba la
pertenencia al grupo `docker` en una nueva sesión.
