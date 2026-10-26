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

## Usuarios de demostración para Social

La copia local apenas tiene actividad reciente, así que «Hoy» suele salir vacía.
Para probarla, `backend/src/scripts/seed-social-demo.js` crea seis cuentas
`demo_*` (correo `demo+…@theshowverse.test`) con actividad de hoy, ayer y la
semana: visionados de películas y episodios, maratones, puntuaciones de
película, serie, temporada y episodio, reseñas, listas, pendientes y favoritos.
Desde `backend/`:

```bash
npm run demo:social -- --viewer <tu_usuario>
```

`--viewer` hace que esa cuenta siga a cuatro de ellas. Para quitarlas con todo lo
suyo:

```bash
npm run demo:social -- --remove
```

Las fechas son relativas al momento de lanzarlo; otro día hay que volver a
ejecutarlo (rehace las cuentas). Se niega a escribir si `DATABASE_URL` no apunta
a `localhost`. Qué comprueba cada cuenta: ver [Hoy](../features/hoy.md#datos-de-prueba).

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

## Grafo de código con graphify

[graphify](https://github.com/Graphify-Labs/graphify) mapea el repositorio en un
grafo de conocimiento (tree-sitter, local, sin LLM) que los agentes consultan en
lugar de recorrer ficheros con grep. El resultado vive en `graphify-out/`
(ignorado por git: `graph.json`, `graph.html` y `GRAPH_REPORT.md`).

Instalación, una vez por máquina (Python 3.10+ y `uv`):

```bash
uv tool install "graphifyy[leiden,sql]"
graphify install --project
graphify claude install
```

- `graphify install --project` deja la skill `/graphify` en `.claude/skills/graphify/`.
- `graphify claude install` añade la sección *graphify* de `CLAUDE.md` y los hooks
  `PreToolUse` de `.claude/settings.json` que recuerdan a Claude Code consultar el
  grafo antes de buscar o leer código. `.claude/` es local (no se versiona).

Uso:

```bash
graphify update .                      # reconstruye el grafo de código (~15 s)
graphify query "cómo abre DetailModal el panel lateral"
graphify path "MobileTitlePeek()" "src_context_authcontext_useauth"   # nombre ambiguo → usa el id
graphify explain "MobileTitlePeek()"
```

Para que el grafo se reconstruya solo, instala los hooks de git (locales, en
`.git/hooks/`): `post-commit`, `post-checkout`, `post-merge` (cubre `git pull`)
y `post-rewrite`. No se ejecutan en worktrees ni durante un rebase o merge.

```bash
graphify hook install
graphify hook status
```

`hook install` también crea un `.gitattributes` con el driver de merge de
`graph.json`; como `graphify-out/` no se versiona, pasa esa línea a
`.git/info/attributes` y borra el fichero (`hook status` dirá entonces
«partially registered», es esperado). Para saltar la reconstrucción en un commit
concreto: `GRAPHIFY_SKIP_HOOK=1 git commit …`. Para nombrar las comunidades del informe con un LLM:
`graphify label .` (usa el backend configurado; con `GRAPHIFY_BACKEND=none` se
queda con los nombres derivados del nodo central).
