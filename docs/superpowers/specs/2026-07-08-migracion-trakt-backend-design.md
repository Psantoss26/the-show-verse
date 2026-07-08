# Diseño — Migración del contenido de Trakt a backend + BBDD propios (comentarios, sentimientos IA, listas de comunidad, calendario)

- **Fecha:** 2026-07-08
- **Ámbito:** Backend Fastify (`backend/src/`), BBDD PostgreSQL (Drizzle), rutas Next `src/app/api/*`, página de detalle (`DetailsClient`) y página `/calendar`.
- **Estado:** Diseño aprobado. Pendiente de plan de implementación.

## 1. Objetivo

Dejar de depender de la API de Trakt para servir contenido comunitario, moviéndolo a
backend + BBDD propios y usando TMDb donde haga falta, **sin que las páginas queden
vacías**. Para ello, la **primera vez que se accede a los detalles de un título**, se
**copia desde Trakt** el contenido comunitario relevante (comentarios y listas), se
**genera un análisis de sentimiento IA** a partir de esos comentarios, y a partir de
ahí ese título **funciona 100% con el backend y la BBDD propios** (crece con los
usuarios nativos), **sin volver a llamar a Trakt**.

Cuatro funciones de **contenido** entran en alcance:

1. **Comentarios** del título.
2. **Sentimientos IA** ("Análisis de sentimientos" / "Opiniones de la comunidad").
3. **Listas de comunidad** — sección "Listas" del título (Surface B) y página
   "Descubrir" listas (Surface A).
4. **Calendario de episodios** ("Episodios de tus series" de `/calendar`).

## 2. Alcance

**En alcance (las 4 funciones de contenido):** comentarios, sentimientos, listas de
comunidad (ambas superficies), calendario de episodios.

**Fuera de alcance (se mantienen tal cual con Trakt):** login OAuth con Trakt,
importación de historial/valoraciones/vistos, scoreboard, estadísticas y demás
funciones **personales** de Trakt. Son ortogonales y se abordarán —si acaso— en un
trabajo aparte.

**Regla de dependencia:** tras sembrar un título (`status = ready`), **nunca** se
vuelve a consultar Trakt para él. La única llamada a Trakt es el sembrado inicial
(una vez por título) y, en caso de fallo puntual, un reintento con backoff. El
sembrado usa **solo `TRAKT_CLIENT_ID`** (endpoints públicos), por lo que funciona
también para visitantes anónimos.

## 3. Contexto actual (lo que ya existe)

- **Backend:** Fastify + PostgreSQL (Drizzle ORM) + Redis, proceso largo (NAS).
  Rutas montadas bajo `/v1` (`backend/src/server.js`). Ya existen `user_lists` /
  `user_list_items`, `favorites`, `watchlist`, `watch_history`, `tmdb_cache`,
  `dashboard_pools`. Patrón de caché/warm en `backend/src/dashboard/pools.js`.
- **Identidad de título:** TMDb id + `media_type`. La resolución TMDb→Trakt se hace
  con `GET /search/tmdb/{tmdbId}?type={movie|show}` → `json[0][type].ids.trakt`
  (`src/app/api/trakt/community/_utils.js`).
- **Comentarios (hoy):** `src/app/api/trakt/community/comments/route.js` →
  `GET /{movies|shows}/{traktId}/comments/{likes|newest}`. UI en `DetailsClient.jsx`
  con pestañas Top 30 Días / Top Histórico / Recientes. Escritura vía OAuth de Trakt
  (`TraktCommentModal.jsx`). Campos usados por la UI: `id`, `user.{name,username,
  images.avatar,vip}`, `comment`, `created_at`, `likes`, `spoiler`.
- **Sentimientos (hoy):** `src/app/api/trakt/community/sentiments/route.js` →
  endpoint oficial `GET /{movies|shows}/{traktId}/sentiments` (campos `good`/`bad`
  ya precomputados por Trakt), traducidos EN→ES (`src/lib/server/translateText.js`).
  **No es IA propia.** Contrato UI: `{ good:[{sentiment_es}], bad:[{sentiment_es}],
  comment_count }`, máx 4 por lado. Existe un generador heurístico por palabras clave
  **sin usar** en `src/lib/details/sentiment.js` (`buildSentimentFromComments`).
- **Listas (hoy):**
  - Surface A: página `/lists` con selector FUENTE (`tmdb|trakt|collections`), MODO
    (`popular|trending`), ORDENAR. Rama Trakt → `src/app/api/trakt/lists/route.js`
    (`/lists/popular`, `/lists/trending`, …). Detalle en
    `/lists/trakt/[username]/[listId]`.
  - Surface B: sección "Listas" de `DetailsClient.jsx` →
    `src/app/api/trakt/community/lists/route.js` →
    `GET /{movies|shows}/{traktId}/lists/{popular|trending}`. Previews de pósters
    rehidratadas desde TMDb.
  - Backend propio: `backend/src/routes/lists.js` (`/v1/lists`) para listas de usuario
    (sin likes / owner / descubrimiento público).
- **Calendario (hoy):**
  - Películas: ya 100% TMDb (`src/lib/api/calendar.js`, `discover/movie`).
  - "Episodios de tus series" (`/calendar`): Trakt personalizado
    (`src/app/api/trakt/calendar/episodes/route.js`, `/calendars/my/shows` cruzado con
    watchlist/favoritos de Trakt). **Ya existe** el equivalente TMDb+Postgres para el
    carrusel del home: `backend/src/routes/calendar.js` (`/v1/calendar/episodes`) +
    `backend/src/dashboard/pools.js` (`getCalendarShowDetails`,
    `buildUpcomingEpisodeEntries`, usa `next_episode_to_air` y `air_date` de la
    temporada, personaliza con favoritos/watchlist/historial de Postgres).
- **IA (hoy):** patrón multi-proveedor OpenAI→Gemini→**Ollama local** en
  `src/app/api/ai/watch-next/route.js` (env `OLLAMA_BASE_URL`, `OLLAMA_MODEL`; cadena
  vía `WATCH_NEXT_AI_PROVIDER`). En **producción solo hay Ollama** (sin claves cloud).

## 4. Arquitectura

**El contenido comunitario lo posee el backend Fastify + Postgres.** El código Trakt
que hoy vive en Next se traslada (versión mínima) al backend, y Next queda como
**proxy fino** hacia `/v1/community/*` (mismo patrón que
`src/app/api/calendar/upcoming-episodes/route.js` → backend).

Nuevo módulo `backend/src/community/`:

- **`trakt.js`** — cliente Trakt mínimo con **solo `TRAKT_CLIENT_ID`**. Métodos:
  `resolveTraktId({type, tmdbId})`, `getComments({base, traktId, sort, page, limit})`,
  `getListsContaining({base, traktId, tab, page, limit})`,
  `getListItems({listRef, page, limit})`. Porta el caché en memoria + backoff + lock
  de 429 de `src/lib/trakt/fetchWithCache.js`.
- **`tmdb.js`** — reutiliza `backend/src/dashboard/tmdb.js` (`tmdbDetails`, `tmdbGet`,
  `toCard`) para hidratar pósters/títulos de ítems de listas.
- **`sentiment.js`** — generador de sentimiento: heurístico + cadena multi-proveedor
  (OpenAI/Gemini si hay clave; si no **Ollama**). Porta y adelgaza el patrón de
  `watch-next`.
- **`seed.js`** — orquestador del sembrado por `(type, tmdbId)`: copia comentarios +
  copia listas + genera sentimiento; escribe en Postgres; gestiona estado/lock.
- **`store.js`** (o queries en las rutas) — lecturas para servir comentarios,
  sentimiento y listas desde Postgres.

Nuevas rutas `backend/src/routes/community.js` montadas en `/v1/community` (ver §8).

**Alternativa descartada:** dejar el sembrado en Next (donde ya está el código
Trakt/IA) escribiendo a Postgres. Rechazada: parte la propiedad de los datos y los
jobs en background son incómodos en Next serverless. El backend Fastify es un proceso
largo, ideal para background.

## 5. Modelo de datos (nuevas tablas Drizzle)

Migración nueva en `backend/drizzle/` (generada con `drizzle-kit`), definidas en
`backend/src/db/schema.js`.

```
title_community_state          -- una fila por (tmdbId, mediaType)
  tmdbId int, mediaType text,   -- 'movie' | 'tv'
  traktId int,                  -- resuelto en el sembrado; null si no existe en Trakt
  status text,                  -- 'pending' | 'seeding' | 'ready' | 'failed'
  commentCount int default 0,
  seededAt timestamptz,
  sentimentBuiltAt timestamptz,
  sentimentProvider text,       -- 'heuristic' | 'ollama' | 'openai' | 'gemini'
  attempts int default 0,
  nextRetryAt timestamptz,      -- solo para 'failed' (backoff ~6 h)
  error text,
  createdAt, updatedAt
  -- PK (tmdbId, mediaType)

title_comments
  id uuid PK,
  tmdbId int, mediaType text,
  source text,                  -- 'trakt' | 'native'
  externalId bigint,            -- id del comentario en Trakt (dedup); null si nativo
  userId uuid FK users(cascade),-- null si copiado de Trakt
  authorName text, authorUsername text, authorAvatarUrl text, authorIsVip boolean,
  body text, likes int default 0, spoiler boolean default false,
  createdAt timestamptz,        -- fecha original (Trakt) o de creación (nativo)
  importedAt timestamptz default now()
  -- unique(externalId) where externalId is not null
  -- idx (tmdbId, mediaType, likes desc)
  -- idx (tmdbId, mediaType, createdAt desc)

title_sentiment
  tmdbId int, mediaType text,
  good jsonb default '[]',      -- [{ text_es }]
  bad  jsonb default '[]',
  provider text, model text,
  sourceCommentCount int,
  isProvisional boolean default false,  -- true = heurístico provisional; false = final
  builtAt timestamptz
  -- PK (tmdbId, mediaType)

community_lists                 -- listas copiadas de Trakt (solo lectura) + puntero a user_lists
  id uuid PK,
  source text,                  -- 'trakt' | 'user'
  externalId bigint,            -- id de la lista en Trakt; null si 'user'
  userListId uuid,              -- FK user_lists si source='user' (para el UNION de Descubrir)
  slug text, name text, description text,
  ownerName text, ownerUsername text, ownerAvatarUrl text,
  itemCount int,                -- item_count REAL de Trakt (p.ej. 1520)
  copiedItemCount int,          -- ítems realmente copiados (<= 150)
  likes int default 0, privacy text, traktUrl text,
  previewPosters jsonb default '[]',
  importedAt timestamptz default now()
  -- unique(source, externalId) where source='trakt'

community_list_items            -- membresías copiadas (cap 150 por lista)
  id uuid PK,
  listId uuid FK community_lists(cascade),
  tmdbId int, mediaType text, title text, posterPath text,
  position int default 0, addedAt timestamptz
  -- unique(listId, tmdbId, mediaType)
  -- idx (tmdbId, mediaType)   -- Surface B: ¿qué listas contienen este título?
  -- idx (listId, position)
```

`user_lists` / `user_list_items` **no se tocan**. La página "Descubrir" (Surface A)
hace `UNION` de `community_lists` (source='trakt') + `user_lists` públicas
(expuestas vía filas `community_lists` con source='user' o vía query directa — ver §7).

**Cap de listas grandes:** al copiar, `community_list_items` guarda **como máximo 150
ítems** por lista (`copiedItemCount`); `itemCount` conserva el total real de Trakt para
mostrar "mostrando 150 de N".

## 6. Pipeline de sembrado (una vez, sin refresco)

### 6.1 Estados y disparo

`title_community_state.status`: `pending` → `seeding` → `ready` | `failed`.

- El primer `GET /v1/community/:type/:tmdbId/{comments|lists|sentiment}` consulta el
  estado:
  - `ready` → sirve desde Postgres (aunque el contenido esté vacío). **No toca Trakt.**
  - `pending` (o `failed` con `nextRetryAt` vencido) → **dispara el sembrado** y sirve
    lo que haya (posiblemente vacío en la toma cero).
  - `seeding` → sirve lo que haya y responde con marca de "en curso" para que el
    cliente reintente.
- Un título que simplemente **no existe en Trakt** (resolución sin resultado) queda
  `ready` con contenido vacío — **no** `failed`. Así funciona con nativos desde ya.
- `failed` (error de red/Trakt) → reintenta con backoff: `nextRetryAt = now()+6h`,
  `attempts++`. No reintenta en cada visita.

### 6.2 Concurrencia / lock

Para que dos visitantes simultáneos no siembren dos veces:

```sql
UPDATE title_community_state
   SET status='seeding', updatedAt=now()
 WHERE tmdbId=$1 AND mediaType=$2
   AND status IN ('pending','failed')
   AND (nextRetryAt IS NULL OR nextRetryAt < now())
RETURNING *;
```

El proceso que obtiene la fila siembra; los demás sirven lo que haya. La fase de
escritura se envuelve además en `pg_advisory_xact_lock(hashtext(key))`.

### 6.3 Fases y presupuestos de tiempo

1. **Resolución** — `resolveTraktId`. Si no hay match → `ready` vacío, fin.
2. **Fase rápida (comentarios + listas)** — ~3–5 llamadas Trakt+TMDb (~1–2 s):
   - Copia **10 comentarios** top-likes (`sort=likes`, `limit=10`) → `title_comments`
     (source='trakt', con `externalId`, autor, likes, spoiler, fecha).
   - Copia **3 listas** que contienen el título (`tab=popular`, `limit=3`) →
     `community_lists` + registra la membresía del título en `community_list_items`;
     copia hasta 150 ítems por lista (para el detalle) con hidratación TMDb.
3. **Fase de análisis (sentimiento)** — trae hasta **~50 comentarios** top-likes
   (2–3 páginas) **solo como entrada** del análisis (los 40 extra **no** se guardan):
   - **Provisional inmediato:** en cuanto hay comentarios (paso 2), calcula el
     heurístico (`buildSentimentFromComments`) y lo persiste con
     `isProvisional=true`, `provider='heuristic'`.
   - **Upgrade IA en background:** genera con la cadena (Ollama en prod) y **sustituye**
     el sentimiento con `isProvisional=false`, `provider='ollama'`. Si el LLM falla, se
     queda el heurístico como definitivo.
4. **Cierre** — `status='ready'`, `seededAt=now()`, `commentCount` fijado.

**Presupuesto en el primer acceso:** el `GET` inicial de comentarios/listas espera la
fase rápida hasta ~5 s; si termina, el primer visitante ya ve comentarios/listas. El
sentimiento **nunca** bloquea: aparece el heurístico casi al instante y el upgrade IA
llega en segundos vía re-fetch.

### 6.4 Sin refresco

**No hay cron de refresco.** Una vez `ready`, el contenido se congela respecto a Trakt
y solo crece con comentarios/listas **nativos**. (Se descarta la opción de refresco
periódico evaluada inicialmente.)

## 7. Comportamiento por función

### 7.1 Comentarios

- **Copiados:** atribuidos al autor original de Trakt (`authorName`, `authorUsername`,
  `authorAvatarUrl`, `authorIsVip`), **solo lectura**. Se **elimina** el botón
  "Responder en Trakt".
- **Nativos:** los usuarios de la app crean/editan/borran comentarios propios →
  `POST/PATCH/DELETE /v1/community/:type/:tmdbId/comments` (`requireAuth`). Reemplazan
  el path OAuth de Trakt (`TraktCommentModal.jsx` apunta al backend).
- **Pestañas** (computadas sobre la unión copiados+nativos en Postgres):
  - **Top Histórico** → `ORDER BY likes DESC, createdAt DESC`.
  - **Top 30 Días** → `WHERE createdAt > now()-30d ORDER BY likes DESC` (se llena sobre
    todo con nativos nuevos).
  - **Recientes** → `ORDER BY createdAt DESC`.
- **Contrato UI:** la respuesta mantiene los campos que consume `DetailsClient.jsx`
  (`id`, `user.{name,username,images.avatar,vip}`, `comment`, `created_at`, `likes`,
  `spoiler`) — se mapean los campos de Postgres a esa forma en el proxy/backend para no
  reescribir el render. `pagination.{itemCount,pageCount,page,limit}` se calcula en SQL.

### 7.2 Sentimientos IA

- **Render en SSR:** `src/app/details/[type]/[id]/page.jsx` pide el contenido
  comunitario ya sembrado al backend (timeout corto) y lo pasa como `initialSentiment`
  (y `initialComments`, `initialLists`) a `DetailsClient`. Para títulos ya sembrados,
  **el sentimiento viene en el primer HTML** y se ve al abrir, sin `useEffect` tardío.
  Si no está listo, el cliente hace re-fetch (~3 s / ~8 s / al foco) hasta `ready`.
- **Generación:** heurístico provisional inmediato + upgrade Ollama (§6.3). Modelo
  local del sentimiento configurable e independiente del de watch-next:
  `OLLAMA_SENTIMENT_MODEL` (default sugerido `llama3.1:8b`).
- **Prompt (es):** a partir de ~50 comentarios, extraer **3–5 temas positivos** y
  **3–5 negativos** recurrentes, en frases cortas estilo Trakt (p.ej. "La actuación del
  Joker de Heath Ledger es legendaria e icónica"). Salida validada a
  `{ good:[{text_es}], bad:[{text_es}] }`.
- **Contrato UI intacto:** el proxy responde
  `{ good:[{sentiment_es}], bad:[{sentiment_es}], comment_count }`, máx 4 por lado —
  `DetailsClient.jsx` (`formatTraktSentimentList`) no cambia.

### 7.3 Listas de comunidad

- **Surface B (sección "Listas" del título):**
  `GET /v1/community/:type/:tmdbId/lists` → listas de `community_lists` cuyo id aparece
  en `community_list_items` para ese `tmdbId`. Campos consumidos por la UI: `name`,
  `item_count`, `likes`, `user.{username,name,images.avatar}`, `ids.{slug,trakt}` (para
  el enlace interno `/lists/trakt/...`), `description`, `previewPosters`. Se mapean
  desde Postgres a esa forma.
- **Surface A (página "Descubrir"):** `GET /v1/community/lists/discover?sort=&page=` →
  `UNION` de `community_lists` (source='trakt') + `user_lists` públicas, con ORDENAR
  (`item_count`/`likes`/`name`) sobre columnas ya guardadas. La FUENTE "Trakt en vivo"
  desaparece del selector (o se reetiqueta). Empieza escasa y crece con el uso
  (pool emergente).
- **Detalle de lista copiada:** `GET /v1/community/lists/:id` sirve hasta 150 ítems
  desde `community_list_items` + metadatos; muestra "mostrando N de itemCount".

### 7.4 Calendario de episodios

- "Episodios de tus series" de `src/app/calendar/page.jsx` se reconecta a
  `/v1/calendar/episodes`, **extendido con rango de fechas** (`start=YYYY-MM-DD`,
  `days=N`) para las vistas Día/Semana/Mes. Se adapta la forma de respuesta del backend
  (camelCase, `sources` plural) al componente `EpisodeCard` (o se ajusta el mapeo en el
  proxy). Desaparece la tarjeta "Conecta Trakt para ver tus episodios".
- **Películas:** sin cambios (ya TMDb).
- Se retira la ruta `src/app/api/trakt/calendar/episodes/route.js`.

## 8. Contratos de API

**Backend `/v1/community`** (Next proxya bajo `src/app/api/community/*` o reusa
`/api/backend/*`):

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/v1/community/:type/:tmdbId/comments?tab=&page=&limit=` | pública | Comentarios (dispara seed si `pending`). `tab` ∈ `top\|recent\|top30`. |
| POST | `/v1/community/:type/:tmdbId/comments` | requireAuth | Crear comentario nativo. |
| PATCH | `/v1/community/:type/:tmdbId/comments/:id` | requireAuth (dueño) | Editar. |
| DELETE | `/v1/community/:type/:tmdbId/comments/:id` | requireAuth (dueño) | Borrar. |
| GET | `/v1/community/:type/:tmdbId/sentiment` | pública | Sentimiento (dispara seed). |
| GET | `/v1/community/:type/:tmdbId/lists?page=&limit=` | pública | Listas que contienen el título (Surface B). |
| GET | `/v1/community/:type/:tmdbId/summary` | pública | Comentarios(1ª pág)+sentimiento+listas en una llamada, para SSR. |
| GET | `/v1/community/lists/discover?sort=&page=&limit=` | pública | Descubrir (Surface A). |
| GET | `/v1/community/lists/:id?page=&limit=` | pública | Detalle de lista copiada. |

Zod valida params/body (patrón de `backend/src/routes/lists.js`). Cache-Control:
`public, s-maxage` en lecturas públicas; `no-store` en escrituras.

**Rutas Next retiradas/reemplazadas:** `src/app/api/trakt/community/{comments,
sentiments,lists,seasons}/route.js` y `src/app/api/trakt/calendar/episodes/route.js`
pasan a proxyear al backend o se eliminan. `src/app/api/trakt/lists/*` (Surface A/B
discovery/detail) se reapunta al backend. El helper `src/lib/api/traktClient.js`
(`traktGetComments/Sentiments/Lists`, `traktAdd/Update/DeleteComment`) se reapunta a
las nuevas rutas manteniendo su firma para no tocar los componentes.

## 9. Integración de UI (cambios mínimos)

- `src/app/details/[type]/[id]/page.jsx`: añade fetch SSR a
  `/v1/community/:type/:tmdbId/summary` (timeout corto, tolerante a fallo) → props
  `initialSentiment`, `initialComments`, `initialLists`.
- `src/components/DetailsClient.jsx`: consume esas props como estado inicial (igual que
  `initialReviews`/`initialCastData`); mantiene el SWR/localStorage pero con re-fetch a
  las nuevas rutas; si la respuesta trae estado `seeding`, reintenta. Se retira el
  botón "Responder en Trakt" y el enlace a Trakt de comentarios.
- `src/components/details/TraktCommentModal.jsx`: escritura contra el backend.
- `src/app/lists/page.jsx` + `src/lib/hooks/useTraktLists.js`: FUENTE "Trakt" pasa a
  "Comunidad" servida por `/v1/community/lists/discover`.
- `src/components/lists/TraktListDetailsClient.jsx`: detalle desde
  `/v1/community/lists/:id`.
- `src/app/calendar/page.jsx` + `src/lib/api/calendar.js`
  (`getTrackedEpisodesByDateRange`): episodios desde `/v1/calendar/episodes` con rango.

## 10. Configuración / entorno

- Backend `.env`: `TRAKT_CLIENT_ID` (ya existe), `OLLAMA_BASE_URL` / `OLLAMA_MODEL`
  (nuevos en backend, reutilizando los valores del web), `OLLAMA_SENTIMENT_MODEL`
  (default `llama3.1:8b`), `TMDB_API_KEY` (ya existe). Opcionales cloud
  (`OPENAI_API_KEY` / `GEMINI_API_KEY`) para acelerar/mejorar el sentimiento si algún
  día se configuran.
- Timeouts/budgets configurables: presupuesto de fase rápida (`~5 s`), timeout SSR
  (`~1.2 s`), timeout Ollama sentimiento (`~30 s`).

## 11. Pruebas

- **Unitarias (backend, `node --test`):** parser/normalizador de comentarios de Trakt →
  fila `title_comments`; construcción de pestañas (SQL o post-proceso); heurístico de
  sentimiento; validación del schema de salida del LLM; lock de sembrado
  (`pending→seeding` una sola vez); mapeo Postgres→contrato UI de comentarios/listas.
- **Integración:** sembrado de un título con fixture de respuestas Trakt (mock del
  cliente) → estado `ready`, N comentarios, 3 listas, sentimiento provisional→final.
  Título sin match Trakt → `ready` vacío. Fallo Trakt → `failed` + `nextRetryAt`.
- **Manual (checklist en `docs/backend/backend_manual_testing.md`):** abrir un título
  nuevo y verificar que comentarios/listas/sentimiento aparecen; recargar y verificar
  que **no** hay llamadas a Trakt (log del cliente); crear un comentario nativo y verlo
  en Recientes/Top; calendario Día/Semana/Mes con episodios de series propias.

## 12. Secuencia de implementación (cada fase es entregable)

1. **Núcleo:** tablas Drizzle + migración + `title_community_state` + esqueleto
   `backend/src/community/` (`trakt.js`, `seed.js`, `store.js`) + lock + proxies Next.
2. **Comentarios:** lectura sembrada + pestañas + escritura nativa + reapuntar
   `traktClient.js` + modal.
3. **Sentimiento IA:** `sentiment.js` (heurístico + Ollama) + upgrade en background +
   SSR `initialSentiment`.
4. **Listas:** Surface B → Surface A (`discover`) → detalle de lista.
5. **Calendario:** extender `/v1/calendar/episodes` con rango + reconectar
   `/calendar` (paralelizable con 2–4).

## 13. Riesgos / consideraciones

- **Calidad del sentimiento con Ollama en CPU:** el heurístico provisional garantiza
  contenido inmediato; el upgrade IA puede tardar ~10–20 s pero solo lo paga el primer
  visitante. Si el modelo local diera baja calidad, basta configurar una clave cloud
  (la cadena ya la soporta) sin cambios de código.
- **Rate-limit de Trakt en sembrado:** el cliente hereda backoff + lock 429; el sembrado
  es 1 vez por título y con pocas llamadas. Sin cron de refresco, la presión es baja.
- **Listas grandes:** cap 150 ítems evita decenas de páginas de llamadas por lista.
- **"Recientes"/"Top 30 días" iniciales:** al copiar solo top-likes (comentarios
  antiguos), estas pestañas se llenan sobre todo con nativos; es el comportamiento
  esperado (contenido vivo de tus usuarios).
- **Atribución de terceros:** los comentarios copiados muestran usuarios de Trakt en
  solo lectura; decisión de producto aceptada.
