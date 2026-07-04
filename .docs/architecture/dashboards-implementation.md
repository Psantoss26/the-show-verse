# Dashboards — Implementación completa

> Documentación de referencia del motor de dashboards (Inicio / Películas / Series):
> arquitectura, cómo se **obtienen** los datos y cómo se **almacenan**.
>
> **Regla de oro del proyecto:** el motor de dashboards **no usa Trakt en ningún
> momento**. Toda la obtención de datos del motor es contra **TMDB** + la
> biblioteca del usuario en nuestra propia base de datos (Postgres/Neon).

---

## 1. Visión general

El sistema sirve filas de tarjetas (carruseles) para tres "superficies":

| Superficie | Ruta UI            | `mediaTypes`      | Personalizable |
| ---------- | ------------------ | ----------------- | -------------- |
| `home`     | `/` (Inicio)       | `['movie','tv']`  | Sí (si login)  |
| `movies`   | `/movies`          | `['movie']`       | Sí (si login)  |
| `series`   | `/series`          | `['tv']`          | Sí (si login)  |

Cada superficie se compone de **dos tipos de filas**:

1. **Filas genéricas** (iguales para todos): Tendencias, Populares, Mejor
   valoradas, Estrenos, Joyas ocultas, por género, por décadas… Se construyen a
   partir de **pools** cacheados en BBDD.
2. **Filas personalizadas** (solo usuario autenticado): "Para ti", "Porque
   viste X", "Más para ti". Se construyen a partir de las **recomendaciones**
   del usuario, derivadas de su biblioteca (favoritos, valoraciones, historial,
   pendientes).

El backend ensambla ambos tipos, **deduplica entre filas**, **rota** el
contenido a diario y **exige un mínimo de 15 elementos por fila**.

```
                          ┌──────────────────────────────────────────────┐
                          │  Backend Fastify  GET /v1/dashboard/:surface  │
                          └──────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
  GENÉRICAS                           PERSONALIZADAS                       ROTACIÓN + ENSAMBLAJE
  pools.js                            recommendations.js                  rotation.js + assemble.js
  (cache dashboard_pools)             (cache user_recommendations)        - dedup entre filas
        │                                   │                              - rotateWindow (semilla diaria)
        ▼                                   ▼                              - minItems = 15
  TMDB (discover/list)               biblioteca (BBDD) + TMDB             - perRow = 20
                                     (recommendations / similar)
```

---

## 2. Origen de los datos (cómo se obtienen)

### 2.1 TMDB — única fuente externa del motor

Toda la obtención externa pasa por [`backend/src/dashboard/tmdb.js`](../backend/src/dashboard/tmdb.js):

- `tmdbGet(path, params)` — wrapper de `fetch` contra `https://api.themoviedb.org/3`.
  Inyecta `api_key` (`process.env.TMDB_API_KEY`) y `language=es-ES` por defecto.
- `tmdbDiscover({ mediaType, params })` — `GET /discover/{movie|tv}` con
  `include_adult=false`. Se usa para filtros finos (género, década, votos…).
- `tmdbList({ path, mediaType, pages })` — pagina endpoints de lista
  (`/trending/...`, `/movie/popular`, `/movie/top_rated`, `/movie/upcoming`,
  `/tv/on_the_air`, `/{type}/{id}/recommendations`, `/{type}/{id}/similar`).
- `toCard(raw, mediaType)` — normaliza cada resultado de TMDB a la **forma "card"**
  interna y descarta lo que no tiene ni póster ni backdrop.

**Forma `card` (objeto canónico que viaja por todo el motor):**

```js
{
  tmdbId,        // Number
  mediaType,     // 'movie' | 'tv'
  title,         // title || name || original_*
  posterPath,    // string | null
  backdropPath,  // string | null
  voteAverage,   // number (0 si falta)
  voteCount,     // number (0 si falta)  ← usado para filtrar calidad
  originalLanguage, // string | null (p. ej. 'es','en','ja') ← usado para limitar el asiático
  year,          // number | null (del release_date / first_air_date)
  genreIds,      // number[]
  popularity,    // number
}
```

Géneros soportados: `MOVIE_GENRES` (13, sin "Familia") y `TV_GENRES` (9),
definidos en `tmdb.js` con su etiqueta en español.

### 2.2 Biblioteca del usuario — fuente interna (BBDD)

[`backend/src/dashboard/library.js`](../backend/src/dashboard/library.js) ·
`loadLibrary(userId)` lee de Postgres (Drizzle) cuatro tablas del usuario:

| Fuente              | Tabla            | Detalle                                            |
| ------------------- | ---------------- | -------------------------------------------------- |
| Favoritos           | `favorites`      | todas las filas del usuario                        |
| Valoraciones        | `user_ratings`   | solo `mediaType ∈ ('movie','tv')`                  |
| Historial           | `watch_history`  | últimas 100 por `watchedAt`, distintas por id+tipo |
| Pendientes          | `watchlist`      | todas las filas del usuario                        |

Esta biblioteca **nunca** se obtiene de Trakt: es el estado guardado en nuestra
propia base de datos.

---

## 3. Almacenamiento de los datos (cómo se guardan)

El motor usa **dos tablas de caché** en Postgres
([`backend/src/db/schema.js`](../backend/src/db/schema.js)). Ambas son
**cachés con TTL**: si la fila existe y no ha expirado, se sirve tal cual; si no,
se reconstruye desde TMDB y se hace `upsert`.

### 3.1 `dashboard_pools` — contenido genérico cacheado

```sql
dashboard_pools (
  id          uuid pk default random,
  pool_key    text not null,   -- 'trending','popular','top_rated','acclaimed',
                               --  'blockbusters','hidden_gems','new_releases',
                               --  'region_top','genre:28','decade:1990', …
  media_type  text not null,   -- 'movie' | 'tv'
  items       jsonb not null default [],   -- card[]
  built_at    timestamptz not null default now(),
  expires_at  timestamptz not null,
  unique (pool_key, media_type),           -- uq_dashboard_pools_key_type
  index (expires_at)                       -- idx_dashboard_pools_expires
)
```

Clave: **un pool = `(pool_key, media_type)`**. El `mixed` no se guarda; se obtiene
mezclando en tiempo de petición el pool `movie` y el `tv` (ver §6).

### 3.2 `user_recommendations` — recomendaciones por usuario

```sql
user_recommendations (
  id          uuid pk default random,
  user_id     uuid not null references users(id) on delete cascade,
  media_type  text not null,   -- 'movie' | 'tv'
  items       jsonb not null default [],   -- recItem[]  (card + score + reasons)
  basis_hash  text not null default '',     -- huella de la biblioteca
  built_at    timestamptz not null default now(),
  expires_at  timestamptz not null,
  unique (user_id, media_type),             -- uq_user_rec_user_type
  index (user_id)                           -- idx_user_rec_user
)
```

`recItem` = `card` + `{ score: number, reasons: [{ type, seedTmdbId?, seedTitle? }] }`.

### 3.3 TTLs y política de caché

| Pool / dato                   | TTL    | Por qué                                          |
| ----------------------------- | ------ | ------------------------------------------------ |
| `trending`                    | 12 h   | cambia a menudo                                  |
| `popular`, `new_releases`, `region_top` | 24 h | actualidad diaria                       |
| `top_rated`, `acclaimed`, `blockbusters`, `hidden_gems`, `genre:*` | 7 días | estable |
| `decade:*`                    | 30 días | catálogo histórico, casi inmutable              |
| `user_recommendations`        | 24 h **y** `basis_hash` coincide | recalcular si cambia la biblioteca |

**Invalidación de recomendaciones:** una fila se considera fresca solo si
`expires_at` está en el futuro **y** `basis_hash === hash actual de la
biblioteca`. El hash (`libraryBasisHash`, FNV-1a de tokens ordenados) cambia en
cuanto el usuario añade/quita un favorito, valoración, historial o pendiente →
la próxima carga recalcula.

**Construcción perezosa (lazy):** no hay cron. `getPool()` reconstruye un pool
solo cuando se pide y está ausente/expirado (la primera petición tras la
expiración paga el coste). Existe `refreshAllPools()` para precalentar todos los
pools, pero **actualmente no está programado** por ningún job.

**Resiliencia:** si la reconstrucción contra TMDB falla, `getPool` devuelve los
`items` rancios si los hay, o `[]`; `getUserRecommendations` devuelve la caché
rancia o `[]`. Una superficie nunca rompe por un fallo puntual de TMDB.

---

## 4. Filas genéricas y filtros de calidad (pools)

Definidas en [`backend/src/dashboard/pools.js`](../backend/src/dashboard/pools.js).
Cada `addPool(poolKey, mediaType, ttl, build)` registra un `build()` que llama a
TMDB y aplica, en este orden: **reglas de contenido** (§4.1) → **piso de votos**
(§4.2) → **límite de contenido asiático** (§4.3). La idea "Netflix/Prime":
mostrar contenido conocido y acorde al catálogo.

### 4.1 Reglas de contenido: sin infantil ni reality

Centralizadas en [`backend/src/dashboard/filters.js`](../backend/src/dashboard/filters.js).
La plataforma es de **cine/series general**, así que se excluye el contenido
infantil y de tipo reality/talk/news (géneros de TV de TMDB):

```js
EXCLUDED_TV_GENRES = { 10762 Kids, 10764 Reality, 10767 Talk, 10763 News }
```

- `excludeKidsReality(cards)` descarta toda card cuyo `genreIds` toque esos IDs.
  Se aplica en **todos** los pools (listas y discover) y también en las
  recomendaciones personalizadas — un usuario nunca recibe infantil/reality.
- En las peticiones `discover` de **TV** se añade además
  `without_genres = "10762,10764,10767,10763"` (`TV_WITHOUT_GENRES`) para no
  malgastar resultados del pool.
- El género **"Familia" (10751) se elimina de `MOVIE_GENRES`**: no hay una fila
  dedicada a contenido familiar/infantil. Las películas familiares de gran éxito
  (p. ej. *El rey león*) **siguen apareciendo** en Tendencias/Populares/décadas
  por su popularidad; lo que se quita es la fila dedicada.

> Estos IDs son géneros **de TV**; el cine no los usa, así que el filtro de
> género no afecta a películas (salvo la retirada de la fila "Familia").

### 4.2 Pisos de votos (`vote_count`)

```js
const MIN_VOTES       = { movie: 80,   tv: 40 };   // listas amplias: solo quita lo MUY desconocido
const GENRE_VOTES     = { movie: 500,  tv: 150 };
const DECADE_VOTES    = { movie: 800,  tv: 150 };
const ACCLAIMED_VOTES = { movie: 3000, tv: 400 };
const BLOCKBUSTER_VOTES = { movie: 5000, tv: 800 };
const GEM_VOTES = { movie: { gte: 800, lte: 6000 }, tv: { gte: 300, lte: 2500 } };
```

- `refine(cards, mediaType, floor)` = `dedupeCards` → `excludeKidsReality` →
  filtro `voteCount >= floor` → `capAsian` (floor por defecto =
  `MIN_VOTES[mediaType]`).
- TV acumula menos votos que cine → umbrales más bajos en TV.
- Las listas amplias usan piso bajo (`MIN_VOTES`); las filas curadas
  (aclamadas, taquillazos, géneros, décadas) usan pisos altos.

### 4.3 España primero: anime/asiático no predominante

Para que la plataforma se centre en España y el contenido general (sin que el
anime y el contenido asiático dominen), se **limita su proporción** por pool
(sin eliminarlo). En [`filters.js`](../backend/src/dashboard/filters.js):

```js
DEMOTE_LANGS   = { ja, ko, zh, cn, th, hi, ta, te, ml, vi, id, tl }  // idiomas a despriorizar
ASIAN_MAX_RATIO = 0.4   // como mucho ≈ 28 % del pool en idioma asiático
ASIAN_MIN_KEEP  = 3     // se conservan al menos los 3 más conocidos
```

- `capAsian(cards)` conserva **todos** los títulos no asiáticos y, como mucho,
  `round(nº_no_asiáticos · 0.4)` asiáticos (mínimo 3). El orden interno da igual
  (la rotación diaria lo baraja); lo que importa es la **composición**.
- Se apoya en `originalLanguage` (añadido a la `card`). Mantiene los grandes
  títulos asiáticos (*Attack on Titan*, *Squid Game*, *El viaje de Chihiro*…) sin
  que copen filas como Animación, Tendencias o las décadas recientes.
- **España como mercado principal:** la fila "Top 10 hoy en España" usa
  `region=ES`; el resto del catálogo es internacional (Hollywood/Europa) con el
  asiático ya acotado.
- **No se aplica a las filas personalizadas:** si el usuario ve anime, su "Para
  ti" lo refleja (respeto al gusto propio). La exclusión de infantil/reality sí
  se aplica también allí.

> Medición real tras estos cambios (composición de idioma asiático): Inicio
> ≈ 20 %, Películas ≈ 10 %, Series ≈ 18 % — de predominante a clara minoría.

### 4.4 Definición de cada pool

| `pool_key`     | Origen TMDB                              | Páginas | Filtro                                  |
| -------------- | ---------------------------------------- | ------- | --------------------------------------- |
| `trending`     | `/trending/{type}/week`                  | **5**   | `MIN_VOTES` (pool profundo, ver nota)   |
| `popular`      | `/{type}/popular`                        | **7**   | `MIN_VOTES` (pool profundo, ver nota)   |
| `top_rated`    | `/{type}/top_rated`                      | 3       | `MIN_VOTES`                             |
| `acclaimed`    | discover `vote_average.desc`, `>=7.5`    | 3       | `ACCLAIMED_VOTES`                       |
| `blockbusters` | discover `popularity.desc`               | 3       | `BLOCKBUSTER_VOTES`                     |
| `hidden_gems`  | discover `vote_average.desc`, `>=7.5`    | 3       | `GEM_VOTES` (banda `gte`..`lte`)        |
| `new_releases` | `/movie/upcoming` · `/tv/on_the_air`     | 3       | **sin piso de votos** (contenido nuevo), pero sí reglas de contenido + cap asiático |
| `region_top`   | discover `region=ES`, `popularity.desc`  | 4       | `vote_count.gte = MIN_VOTES`            |
| `genre:{id}`   | discover `with_genres`, `popularity.desc`| **4**   | `GENRE_VOTES`                           |
| `decade:{año}` | discover por rango de fechas de la década| **5**   | `DECADE_VOTES`                          |

> Todos los pools pasan por las reglas de contenido (§4.1) y el cap asiático
> (§4.3). Las peticiones `discover` de **TV** llevan además `without_genres` con
> los géneros excluidos.
>
> **Nota — pools profundos:** `trending` (5), `popular` (7), `genre:*` (4) y
> `decade:*` (5) se obtienen "de más" porque, tras quitar infantil/reality,
> acotar el asiático y aplicar la **deduplicación cruzada** (§7), deben conservar
> ≥ 15 elementos por fila.

**Décadas:** `1980, 1990, 2000, 2010, 2020`. Para cine se filtra por
`primary_release_date`, para TV por `first_air_date`, con rango `[año-01-01,
(año+9)-12-31]`.

---

## 5. Filas personalizadas (recomendaciones)

Pipeline en [`backend/src/dashboard/recommendations.js`](../backend/src/dashboard/recommendations.js)
+ utilidades puras en [`score.js`](../backend/src/dashboard/score.js) y
[`library.js`](../backend/src/dashboard/library.js).

### 5.1 De biblioteca a "seeds"

`buildSeeds(lib)` convierte la biblioteca en semillas ponderadas (peso sumado si
un título aparece en varias fuentes), descarta las de peso 0, ordena por peso y
corta a 25. **Las valoraciones altas son la señal principal** y pesan por encima
de favoritos, historial y pendientes:

| Señal                                | Peso | `strongPositive` |
| ------------------------------------ | ---- | ---------------- |
| Valoración ≥ 9 (señal principal)     | 10   | sí               |
| Valoración = 8 (señal positiva)      | 7    | sí               |
| Favorito                             | 6    | sí               |
| Valoración = 7 (señal secundaria)    | 4    | no               |
| Historial (cada id+tipo distinto)    | 2    | no               |
| Pendiente (watchlist)                | 1    | no               |
| Valoración < 7                       | 0    | (no genera seed) |

`strongPositive` = el usuario realmente disfrutó el título (rating ≥ 8 o
favorito). **Solo estas semillas habilitan filas "Porque viste…"** — un visionado
casual o un pendiente nunca crean esas filas.

### 5.2 De seeds a candidatos puntuados

1. Para cada seed (filtradas al `mediaType` de la tanda, top 20), se piden a TMDB
   `…/recommendations` y `…/similar`.
2. `aggregateCandidates` acumula puntuación por candidato:
   `score += seed.weight · sourceWeight · positionDecay`
   donde `sourceWeight` = 1.0 (recommendations) / 0.6 (similar) y
   `positionDecay = 1/(1+index·0.15)`. La razón `because` solo se adjunta si la
   seed es `strongPositive` (los candidatos puntúan igual, pero solo los de
   semillas que gustaron pueden formar "Porque viste…").
3. **No se excluye la biblioteca entera.** Los títulos ya vistos **se conservan**
   como candidatos: el límite de vistos se aplica por fila en el ensamblaje
   (§7.2). Solo se evita que una semilla se recomiende a sí misma.
4. **Sin infantil/reality:** `excludeKidsReality` (el cap asiático NO se aplica
   aquí, se respeta el gusto del usuario).
5. **Filtro de votos** de recomendaciones: `REC_MIN_VOTES = { movie: 150, tv: 60 }`.
6. **Relleno por afinidad de género:** se cuentan los géneros más frecuentes del
   top 30, se hace discover de los 2 géneros top con
   `GENRE_FILL_VOTES = { movie: 1000, tv: 300 }` (en TV con `without_genres`),
   se filtra con `excludeKidsReality` (evitando semillas) y se fusiona con
   `mergeGenreFill` (peso 0.5, `reason: 'based_on_genres'`).
7. Se cortan a 80 y se guardan en `user_recommendations`.

### 5.3 De recomendaciones a filas

`personalizedRowDefs(recsByType, surface)`
([`surfaces.js`](../backend/src/dashboard/surfaces.js)) fusiona los `recItem` de
los `mediaTypes` de la superficie (ordenados por `score`) y produce filas con un
**pool amplio + `rotate: true`** (la rotación con semilla por superficie evita que
se repita el mismo set entre Inicio/Películas/Series) y un **límite de vistos**:

| Fila                | Pool | `seenRatioLimit` | Notas                                            |
| ------------------- | ---- | ---------------- | ------------------------------------------------ |
| **Para ti**         | 40   | 0.30             | En Inicio intercala pelis y series (mezcla real) |
| **Porque viste {X}**| 30   | 0.15             | Máx 2 grupos, solo seeds `strongPositive`, ≥ 15  |
| **Más para ti**     | 40   | 0.30             | `based_on_genres`, solo si ≥ 15                   |

En `home` el `mediaType` de estas filas es `mixed`; en `movies`/`series` es el
único tipo de la superficie. Como Películas solo usa recs `movie` y Series solo
`tv`, sus "Para ti" ya difieren entre sí; el desfase de semilla diferencia además
el de Inicio.

---

## 6. Resolución de pools `mixed`

[`backend/src/routes/dashboard.js`](../backend/src/routes/dashboard.js) ·
`resolvePoolItems(poolKey, mediaType)`:

- Si `mediaType !== 'mixed'` → `getPool(poolKey, mediaType)`.
- Si `mediaType === 'mixed'` → obtiene los pools `movie` y `tv` en paralelo y los
  **intercala** (`interleave`: una de cine, una de TV, …) y deduplica.

Las filas rotativas de género/década en `mixed` combinan `genre:{id}`/`decade:{d}`
de cine y TV.

---

## 7. Rotación diaria, ensamblaje y dedupe

### 7.1 Rotación ([`rotation.js`](../backend/src/dashboard/rotation.js))

- `dayNumber()` = días epoch → **semilla estable durante todo el día**.
- `seededShuffle(array, seed)` = Fisher–Yates determinista (PRNG `mulberry32`).
- `rotateWindow(items, seed, size)` y `pickRotating(list, seed, count)` = barajado
  reproducible. Mismo día ⇒ mismo orden; cambia de día ⇒ rota.

Así, qué géneros/décadas se muestran (`pickRotating`) y el orden dentro de cada
fila cambian cada día sin aleatoriedad inestable entre peticiones. Las décadas se
muestran además **en orden cronológico** tras elegirlas.

**Desfase de semilla por superficie** (`SURFACE_SEED_OFFSET` en
[`routes/dashboard.js`](../backend/src/routes/dashboard.js)): `home` 0, `movies`
1009, `series` 2017. La rotación sigue cambiando cada día, pero con una fase
distinta por superficie, de modo que "Para ti" y las filas rotativas **no
muestran el mismo set** entre Inicio/Películas/Series.

### 7.2 Ensamblaje ([`assemble.js`](../backend/src/dashboard/assemble.js))

`assembleRows({ rowSpecs, rotationSeed, perRow = 20, minItems = 15, seenIds })`:

1. Recorre las filas en orden (**personalizadas primero**, luego genéricas).
2. Para cada fila rotable, baraja con la semilla (de la superficie/día).
3. Toma hasta `perRow` (20) tarjetas **saltando las ya usadas** (`used`) →
   **deduplicación entre filas**: un título no se repite en dos carruseles.
4. **Política de "ya visto"** (`seenIds` = historial ∪ favoritos ∪ valorados):
   - Filas **genéricas** (sin `seenRatioLimit`): permiten vistos **sin límite**
     (tendencias, populares, mejor valoradas, Top 10, géneros, décadas, estrenos,
     joyas ocultas). Un título que ya viste **sí** aparece en Populares.
   - Filas **personalizadas** (`seenRatioLimit`): limitan los vistos a esa
     proporción de la fila (Para ti/Más para ti 30 %, Porque viste 15 %), para
     que no estén dominadas por lo ya visto.
5. **Si la fila queda con < `minItems` (15) se descarta** y **no** marca sus
   títulos como usados (quedan disponibles para filas posteriores).

> `excludeIds` sigue existiendo como exclusión dura opcional, pero la ruta ya no
> lo usa: la política pasó de "siempre excluir biblioteca" a este control por fila.

### 7.3 Respuesta de la ruta

`GET /v1/dashboard/:surface` (montada con prefijo `/v1/dashboard`) devuelve:

```jsonc
{
  "surface": "home",
  "personalized": true,            // hubo filas personalizadas
  "generatedAt": "2026-06-25T…Z",
  "rows": [
    { "key": "for_you", "title": "Para ti", "reason": null,
      "mediaType": "mixed", "items": [ /* card[] */ ] },
    …
  ]
}
```

Cabecera `Cache-Control: private, max-age=300`. La autenticación es **opcional**:
el plugin global de auth puebla `req.user` si hay Bearer válido; sin token, la
ruta sirve solo filas genéricas.

---

## 8. Frontend

### 8.1 Proxy Next.js

[`src/app/api/dashboard/[surface]/route.js`](../src/app/api/dashboard/%5Bsurface%5D/route.js):

- Reenvía la petición al backend (`/v1/dashboard/:surface`) con la auth del
  usuario (maneja refresh de token y re-set de cookies) → recomendaciones
  personalizadas.
- Si el usuario es anónimo (sin token), llama al backend **sin** auth para
  obtener el contenido genérico.
- `no-store`; ante cualquier fallo devuelve `{ rows: [] }` (la UI degrada sin
  romper).

### 8.2 Hook compartido

[`src/components/dashboard/useEngineRows.js`](../src/components/dashboard/useEngineRows.js):

- `useEngineRows(surface)` hace `fetch('/api/dashboard/:surface')` en cliente
  (`credentials: 'include'`, `no-store`) y expone `{ rows, loading, personalized }`.
- `toTmdbShape(card)` convierte cada `card` del motor a la forma TMDb que esperan
  las tarjetas (`id`, `media_type`, `poster_path`, `vote_average`, …).
- `mapRows` descarta filas vacías.

Lo usan los tres clientes: `MainDashboardClient.jsx` (`home`),
`MoviesPageClient.jsx` (`movies`), `SeriesPageClient.jsx` (`series`).

### 8.3 Render: componente `Row` (vista previa + flechas)

En `MainDashboardClient.jsx`, las filas del motor se pintan con el componente
**`Row`** (no con una fila simple), que aporta:

- **Vista previa al hover** (`InlinePreviewCard`): al pasar el ratón sobre una
  tarjeta se expande con backdrop, info y acciones ("Ver trailer", "Añadir a
  favoritos", "Añadir a pendientes" — estado leído de nuestro backend/BBDD).
- **Flechas de desplazamiento** (`showPrev`/`showNext`): aparecen al hacer hover
  sobre la fila cuando hay más contenido (`canPrev`/`canNext`).
- Swiper con 20 tarjetas por fila, lazy de imágenes y overrides de póster/backdrop.

**Interacción inmediata:** los carruseles se pueden deslizar nada más pintarse.
La `key` del `Swiper` **no incluye `hydrated`** (incluirlo lo remontaba al
hidratar) y **no** se envuelve en `pointer-events-none/touch-none`. Solo la vista
previa al hover espera a la hidratación; el desliz funciona desde el primer
render. (Las filas de Películas/Series ya eran interactivas: sus `Swiper` no
llevan `key` ni bloqueo.)

El título de algunas filas (Tendencias, Populares, Recomendados, Más esperadas)
se renderiza como **enlace** (`ExpandableSectionTitle` → `EXPANDABLE_SECTION_HREFS`)
hacia su página "ver todo"; el resto como `<h3>`.

---

## 9. Páginas "ver todo" de secciones (estado actual / deuda técnica)

Las páginas `/dashboard/{tendencias|populares|recomendados|mas-esperadas}` se
sirven por [`src/app/api/dashboard/sections/[section]/route.js`](../src/app/api/dashboard/sections/%5Bsection%5D/route.js).

> ⚠️ **Importante:** esta ruta de secciones **todavía usa Trakt** (`traktHelpers`)
> combinado con TMDB. Es código **previo** al motor y **contradice** la regla de
> "no usar Trakt en ningún momento". Queda pendiente migrarla para que el "ver
> todo" se nutra también de pools del motor (TMDB) en lugar de Trakt. El **motor
> de dashboards en sí (todo lo descrito arriba) no usa Trakt**.

---

## 10. Mapa de archivos

**Backend (`backend/src/`):**

| Archivo                       | Responsabilidad                                            |
| ----------------------------- | ---------------------------------------------------------- |
| `dashboard/tmdb.js`           | Cliente TMDB + `toCard` + géneros (sin "Familia")          |
| `dashboard/filters.js`        | Reglas de contenido: excluir infantil/reality + acotar asiático |
| `dashboard/pools.js`          | Definición/recálculo de pools genéricos + filtros de votos + caché `dashboard_pools` |
| `dashboard/library.js`        | `loadLibrary`, `buildSeeds`, `libraryBasisHash`            |
| `dashboard/score.js`          | `aggregateCandidates`, `excludeSeen`, `mergeGenreFill`     |
| `dashboard/recommendations.js`| Pipeline de recomendación + caché `user_recommendations`   |
| `dashboard/surfaces.js`       | `SURFACES` (filas por superficie) + `personalizedRowDefs`  |
| `dashboard/rotation.js`       | Semilla diaria + barajado determinista                     |
| `dashboard/assemble.js`       | Dedup entre filas + `minItems` + ventana por fila          |
| `routes/dashboard.js`         | `GET /v1/dashboard/:surface` (orquesta todo)               |
| `db/schema.js`                | Tablas `dashboard_pools` y `user_recommendations`          |

**Frontend (`src/`):**

| Archivo                                       | Responsabilidad                          |
| --------------------------------------------- | ---------------------------------------- |
| `app/api/dashboard/[surface]/route.js`        | Proxy al backend (auth opcional)         |
| `components/dashboard/useEngineRows.js`       | Hook + `toTmdbShape`                      |
| `components/MainDashboardClient.jsx`          | Inicio + componente `Row` (hover+flechas)|
| `app/movies/MoviesPageClient.jsx`             | Superficie `movies`                      |
| `app/series/SeriesPageClient.jsx`             | Superficie `series`                      |
| `app/api/dashboard/sections/[section]/route.js`| "Ver todo" (⚠️ aún con Trakt)           |

**Tests:** `backend/src/dashboard/*.test.js` (`node --test`).

---

## 11. Operaciones habituales

**Forzar reconstrucción de pools** (tras cambiar criterios en `pools.js`), vaciando
la tabla de caché:

```bash
cd backend
node -e "import('./src/db/client.js').then(async ({db})=>{ \
  const s=await import('./src/db/schema.js'); \
  await db.delete(s.dashboardPools); process.exit(0); })"
```

La siguiente petición a cada superficie reconstruye los pools con los nuevos
criterios (TTL nuevo).

**Recalcular recomendaciones de un usuario:** sucede solo al cambiar su biblioteca
(cambia `basis_hash`) o al expirar (24 h). Para forzarlo, borrar sus filas en
`user_recommendations`.

**Tests del motor:**

```bash
cd backend && node --test 'src/dashboard/*.test.js'
```

---

## 12. Garantías de diseño (resumen)

- ✅ **Sin Trakt** en el motor (solo TMDB + biblioteca propia en BBDD).
- ✅ **Sin contenido infantil ni reality** (`excludeKidsReality`, géneros de TV
  Kids/Reality/Talk/News; sin fila "Familia"). Verificado: 0 en las 3 superficies.
- ✅ **España primero / anime no predominante:** cap de idioma asiático
  (`capAsian`, ≤ ~28 % por pool). Medido: Inicio 20 %, Películas 10 %, Series 18 %.
- ✅ **Mínimo 15** elementos por fila (`minItems = 15`); filas que no llegan se
  descartan sin bloquear sus títulos.
- ✅ **Sin duplicados** entre filas (dedup cruzada en `assemble.js`).
- ✅ **Calidad de contenido** vía pisos de `vote_count` por tipo y categoría.
- ✅ **Décadas** 1980–2020 en orden cronológico.
- ✅ **Recomendaciones por valoración:** rating ≥ 9/8 pesan por encima de
  favoritos, historial y pendientes; "Porque viste…" solo desde títulos que
  gustaron (rating ≥ 8 o favorito).
- ✅ **Política de "ya visto" por fila:** genéricas muestran vistos sin límite;
  personalizadas los acotan (Para ti 30 %, Porque viste 15 %).
- ✅ **Variedad entre dashboards:** Inicio mezcla pelis y series; Películas/Series
  priorizan su tipo; desfase de semilla por superficie evita repetir "Para ti".
- ✅ **Interacción inmediata:** los carruseles se deslizan al pintarse (sin
  remount ni bloqueo por `hydrated`).
- ✅ **Rotación diaria** estable (misma semilla durante el día).
- ✅ **Caché con TTL** en dos tablas; reconstrucción perezosa y tolerante a fallos.
- ✅ **Personalización opcional**: genérico para anónimos, "Para ti" para
  usuarios con biblioteca.
