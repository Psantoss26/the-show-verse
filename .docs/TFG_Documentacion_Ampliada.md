# The Show Verse — Documentación Ampliada

> Complemento técnico a TFG_Plantilla_Parte1.md y TFG_Plantilla_Parte2.md  
> Cubre: arquitectura de carpetas, módulos funcionales, flujos de datos y documentación detallada de APIs

---

## A. ESTRUCTURA DE CARPETAS DEL PROYECTO

El proyecto sigue la convención del **App Router** de Next.js 13+. La estructura principal se organiza en cuatro directorios bajo `src/`:

```
src/
├── app/                    # Rutas, páginas y API Routes (Next.js App Router)
│   ├── api/                # Endpoints del servidor (proxy hacia APIs externas)
│   │   ├── omdb/           # Proxy OMDb con caché en memoria
│   │   ├── plex/           # Integración servidor Plex local
│   │   ├── tmdb/           # Endpoints auxiliares TMDb (listas de cuenta, etc.)
│   │   ├── trakt/          # Conjunto completo de endpoints Trakt
│   │   │   ├── auth/       # OAuth 2.0 (start, callback, status, disconnect)
│   │   │   ├── history/    # Historial de visionado
│   │   │   ├── show/       # Series: progreso, episodios vistos
│   │   │   ├── sync/       # Sincronización favoritos y watchlist
│   │   │   ├── ratings/    # Valoraciones personales
│   │   │   ├── stats/      # Estadísticas del usuario
│   │   │   ├── scoreboard/ # Puntuaciones de comunidad
│   │   │   └── lists/      # Listas públicas de Trakt
│   │   ├── streaming/      # Disponibilidad en plataformas (JustWatch)
│   │   ├── imdb/           # Top rated IMDb scraping
│   │   └── tv/             # Ratings por episodio
│   │
│   ├── page.jsx            # Dashboard principal (/)
│   ├── layout.jsx          # Layout raíz — Navbar, contexto global
│   ├── details/            # Página de detalle (/details/[type]/[id])
│   │   ├── [type]/[id]/    # Detalle película o serie
│   │   ├── tv/             # Detalles de temporada y episodio individuales
│   │   └── person/         # Ficha de actor/actriz
│   ├── favorites/          # Lista de favoritos del usuario
│   ├── watchlist/          # Lista de pendientes del usuario
│   ├── history/            # Historial de visionado (Trakt)
│   ├── in-progress/        # Series en progreso (Trakt)
│   ├── lists/              # Listas de TMDb y Trakt
│   │   ├── page.jsx        # Hub de listas
│   │   ├── [listId]/       # Lista pública de TMDb
│   │   ├── collection/     # Colecciones de saga (ej. Marvel, Matrix)
│   │   └── trakt/          # Listas públicas de Trakt
│   ├── discover/           # Búsqueda y exploración de contenido
│   ├── movies/             # Sección de películas
│   ├── series/             # Sección de series
│   ├── stats/              # Estadísticas del usuario (Trakt)
│   ├── calendar/           # Calendario de estrenos y próximos episodios
│   ├── biblioteca/         # Librería personal (historial + en progreso)
│   ├── auth/               # Páginas de autenticación TMDb (login OAuth)
│   ├── login/              # Página de inicio de sesión / bienvenida
│   └── demo/               # Página demo para usuarios no autenticados
│
├── components/             # Componentes React reutilizables
│   ├── MainDashboardClient.jsx     # Dashboard completo (Client Component)
│   ├── DetailsClient.jsx           # Página de detalle película/serie
│   ├── DiscoverClient.jsx          # Módulo de búsqueda y filtrado
│   ├── Navbar.jsx                  # Barra de navegación principal
│   ├── ActorDetails.jsx            # Ficha de actor
│   ├── EpisodeDetailsClient.jsx    # Detalle de episodio individual
│   ├── SeasonDetailsClient.jsx     # Detalle de temporada completa
│   ├── EpisodeRatingsGrid.jsx      # Grid de valoraciones por episodio
│   ├── StarRating.jsx              # Componente de valoración (1-10 estrellas)
│   ├── LiquidButton.jsx            # Botón con efecto visual animado
│   ├── FavoriteWatchlistButtons.jsx # Botones acción rápida en tarjetas
│   ├── DetailsSectionMenu.jsx      # Menú de pestañas en detalle
│   ├── CarruselIndividual.jsx      # Carrusel de contenido genérico
│   ├── NoPageScroll.jsx            # Bloqueo de scroll para modales
│   ├── auth/                       # Componentes de autenticación
│   ├── details/                    # Sub-componentes de la página de detalle
│   ├── lists/                      # Componentes de listas (FavoritesClient, etc.)
│   └── trakt/                      # Componentes específicos de Trakt
│
├── lib/                    # Lógica de negocio, clientes de API y utilidades
│   ├── api/
│   │   ├── tmdb.js         # Cliente TMDb (+40 funciones exportadas)
│   │   ├── tmdbLists.js    # Funciones de listas de TMDb
│   │   ├── traktClient.js  # Cliente Trakt para el frontend
│   │   ├── traktHelpers.js # Helpers y normalizadores de Trakt
│   │   ├── justwatch.js    # Cliente GraphQL JustWatch (no oficial)
│   │   ├── omdb.js         # Cliente OMDb (proxy hacia /api/omdb)
│   │   ├── auth.js         # Helpers de autenticación TMDb
│   │   └── calendar.js     # Lógica del calendario de estrenos
│   ├── plex/
│   │   └── auth.js         # Autenticación JWT con firma asimétrica (Plex)
│   ├── trakt/
│   │   ├── server.js       # Funciones Trakt para Server Components
│   │   └── useTraktAuth.js # Hook de autenticación Trakt
│   ├── details/            # Lógica específica de la página de detalle
│   ├── hooks/              # Custom hooks de React
│   └── utils/              # Utilidades generales
│
└── context/                # Contextos globales de React
```

---

## B. MÓDULOS FUNCIONALES PRINCIPALES

### B.1 Dashboard Principal (`/`)

**Archivos implicados:** `src/app/page.jsx`, `src/components/MainDashboardClient.jsx`

El dashboard es el punto de entrada de la aplicación. La `page.jsx` es un **Server Component** que ejecuta en paralelo hasta 12 peticiones a TMDb mediante `Promise.all`, obteniendo todas las secciones del dashboard en un único ciclo de red cuya latencia total equivale a la de la petición más lenta (en lugar de la suma de todas).

Las secciones que componen el dashboard son:

| Sección | Fuente | Endpoint TMDb |
|---|---|---|
| Hero (carrusel principal) | TMDb | `/trending/movie/week` |
| Películas más valoradas | TMDb | `/movie/top_rated` |
| En tendencia esta semana | TMDb | `/trending/movie/week` |
| Populares ahora | TMDb | `/movie/popular` |
| Top de acción | TMDb | `/discover/movie?with_genres=28` |
| Dramas imprescindibles | TMDb | `/discover/movie?with_genres=18` |
| Series populares | TMDb | `/tv/popular` |
| Series más valoradas | TMDb | `/tv/top_rated` |
| Series en tendencia | TMDb | `/trending/tv/week` |
| Emitiéndose hoy | TMDb | `/tv/airing_today` |
| En emisión | TMDb | `/tv/on_the_air` |

**Selección del backdrop del hero:** para cada película del carrusel, la función `getLogos` realiza una llamada al endpoint `/images` de TMDb solicitando imágenes en español, inglés y sin idioma (`include_image_language=es,en,null`). El logo con mayor número de votos dentro del grupo de mayor prioridad de idioma se selecciona como título visual del hero. A nivel de backdrop, se priorizan las imágenes de resolución 1280px con mayor número de votos.

`MainDashboardClient.jsx` es el componente cliente de mayor envergadura del proyecto (~102 KB). Recibe todos los datos ya preparados del servidor y gestiona:
- **Carrusel del hero** con reproducción automática (intervalo de 6 s) y pausa en hover.
- **Sticky scroll de la Navbar:** al superar cierto umbral de desplazamiento, la barra de navegación cambia de transparente a la superficie semi-transparente de cristal.
- **Animaciones de entrada escalonada** de cada sección mediante `staggerChildren` de Framer Motion.
- **Secciones condicionales** que sólo se muestran cuando el usuario está autenticado (acceso a favoritos, en progreso).

---

### B.2 Página de Detalle (`/details/[type]/[id]`)

**Archivos implicados:** `src/app/details/[type]/[id]/page.jsx`, `src/components/DetailsClient.jsx` (~331 KB)

La página de detalle es el componente más extenso del proyecto. El Server Component obtiene en paralelo todos los datos necesarios:

- Metadatos completos del título (con `external_ids` en el mismo request mediante `append_to_response`)
- Logo oficial (`getLogos`)
- Créditos — reparto y equipo técnico (`/credits`)
- Recomendaciones (`/recommendations`)
- Proveedores de streaming TMDb (`/watch/providers`)
- Videos disponibles — trailers, teasers (`/videos`)
- Reseñas de la comunidad (`/reviews`)
- Estado de la cuenta TMDb (favorito, pendiente, valorado) si el usuario está autenticado

El componente cliente `DetailsClient.jsx` gestiona la mayor parte de la lógica interactiva:

**Sistema de pestañas (`DetailsSectionMenu`):**
- **Información general:** sinopsis, reparto principal, datos técnicos (duración, idioma, presupuesto/recaudación para películas)
- **Temporadas/Episodios** (solo series): lista de temporadas con episodios individuales y su estado de visionado
- **Multimedia:** trailers, teasers y clips obtenidos de YouTube vía TMDb
- **Recomendaciones:** títulos similares sugeridos por TMDb
- **Reseñas:** críticas de la comunidad TMDb

**Barra de puntuaciones (`ScoreboardBar.jsx`):**
Centraliza las puntuaciones de tres fuentes distintas en una única barra visual:
- **TMDb** (procedente del Server Component, sin petición adicional en cliente)
- **IMDb** (obtenida de OMDb a través de `omdbCache`)
- **Trakt** (obtenida de `/api/trakt/scoreboard`)

El usuario autenticado en Trakt puede además ver y modificar su valoración personal (1–10 estrellas) con actualización optimista del estado local.

**Disponibilidad en streaming:**
Se muestran simultáneamente los proveedores de dos fuentes:
1. **TMDb** (`getWatchProviders`): fuente principal, cacheada en servidor 1 hora
2. **JustWatch** (`/api/streaming`): complemento con enlace directo a la plataforma y URLs de búsqueda específicas para el contenido

Adicionalmente, si el usuario tiene configurado un servidor **Plex**, se muestra un botón de acceso que enlaza directamente al contenido en su biblioteca local.

---

### B.3 Seguimiento por Episodio (`/details/tv/[id]` — Temporadas y Episodios)

**Archivos implicados:** `src/components/SeasonDetailsClient.jsx`, `src/components/EpisodeDetailsClient.jsx`, `src/components/EpisodeRatingsGrid.jsx`

El módulo de seguimiento por episodio es funcionalmente el más complejo. El estado de visionado se representa mediante el objeto `watchedBySeason`:

```js
{
  "1": {               // número de temporada
    "1": true,         // episodio 1 visto
    "2": true,         // episodio 2 visto
    "3": false         // episodio 3 no visto
  },
  "2": { ... }
}
```

Este objeto se obtiene del endpoint `/api/trakt/show/watched`, que internamente llama a `/sync/watched/shows` de Trakt y transforma la respuesta para indexarla por temporada y número de episodio.

**Interacción dentro de la temporada (`SeasonDetailsClient.jsx`):**
- Cada episodio de la lista tiene un toggle de visto/no visto que actualiza el estado optimistamente y lanza la petición a Trakt en segundo plano.
- El botón **«Marcar temporada completa»** construye la lista de todos los episodios no marcados de la temporada y los envía en una única petición a Trakt, reduciendo el número de peticiones de N a 1.
- El progreso de visionado de la temporada (fracción de episodios vistos) se calcula localmente a partir del objeto `watchedBySeason`.

**Grid de valoraciones por episodio (`EpisodeRatingsGrid.jsx`):**
Muestra un mapa visual de todos los episodios de la serie con sus puntuaciones de TMDb. Las celdas se colorean con un gradiente de calor según la valoración: verde para episodios bien valorados, rojo para los peor puntuados, gris para los sin valoración. Este componente carga las valoraciones de todos los episodios en paralelo paginado para respetar los límites de TMDb.

---

### B.4 Favoritos (`/favorites`)

**Archivos implicados:** `src/components/lists/FavoritesClient.jsx`

La página de favoritos muestra todas las películas y series que el usuario ha marcado como favoritas en TMDb. Los datos se obtienen del endpoint de la cuenta TMDb (`/account/{id}/favorite/movies` y `/account/{id}/favorite/tv`) con paginación completa: se solicita la primera página para conocer `total_pages` y las páginas restantes se obtienen en paralelo en lotes de 5 para respetar los rate limits.

**Sistema de caché de puntuaciones en tres niveles** (detallado en la sección de caché):
- Carga diferida (lazy) de puntuaciones IMDb y Trakt al primer hover sobre cada tarjeta.
- `runPool(items, limit, worker)` controla la concurrencia máxima (4 peticiones simultáneas) al cargar múltiples ítems.

**Sistema de tres vistas:**
- **Grid:** tarjetas con poster, título y puntuaciones. Diseño estándar de cuadrícula.
- **List:** vista horizontal con más información visible (sinopsis, año, géneros).
- **Compact:** vista de lista densa con información mínima, optimizada para listas largas.

La selección de vista se persiste en `localStorage` bajo la clave `showverse:view:favorites`.

**Ordenación y filtrado:** los ítems se pueden ordenar por fecha de adición, título alfabético, año de lanzamiento o puntuación TMDb. El filtro permite separar películas de series.

---

### B.5 Pendientes (`/watchlist`)

**Archivos implicados:** `src/components/lists/WatchlistClient.jsx`

Funcionalmente muy similar a Favoritos, con la misma arquitectura de tres vistas, caché de puntuaciones y paginación. La diferencia principal es que consume el endpoint `/account/{id}/watchlist/movies` y `/account/{id}/watchlist/tv` de TMDb.

La lógica de caché compartida entre Favoritos y Pendientes está centralizada en el módulo `scoreCache.js`, que evita peticiones duplicadas cuando el usuario navega entre las dos secciones durante la misma sesión.

---

### B.6 Historial de Visionado (`/history`)

**Archivos implicados:** `src/app/history/page.jsx` o componente cliente asociado

El historial de visionado se obtiene de Trakt a través del endpoint `/sync/history`. Muestra todos los contenidos marcados como vistos, con fecha y hora de visionado. A diferencia de Favoritos y Pendientes (que provienen de TMDb), este módulo consume exclusivamente datos de Trakt, lo que supone una traducción de identificadores: Trakt devuelve sus propios IDs, y la API Route interna realiza peticiones paralelas a TMDb para enriquecer cada ítem con poster y backdrop antes de enviar la respuesta al cliente.

Se presentan con el mismo sistema de tres vistas y las mismas opciones de filtrado (películas/series) y ordenación por fecha.

---

### B.7 En Progreso (`/in-progress`)

**Archivos implicados:** `src/app/in-progress/page.jsx`

Muestra las series que el usuario ha empezado a ver pero no ha completado. Se calculan a partir del endpoint `/sync/watched/shows` de Trakt: una serie está «en progreso» si tiene al menos un episodio marcado como visto pero no tiene marcados todos los episodios disponibles. Para cada serie en progreso se muestra el porcentaje de avance y el siguiente episodio pendiente.

---

### B.8 Estadísticas (`/stats`)

**Archivos implicados:** `src/app/stats/StatsClient.jsx` (~50 KB)

La página de estadísticas obtiene datos de Trakt a través del endpoint `/users/me/stats` y los presenta en multiple visualizaciones:

- **Resumen global:** total de películas vistas, tiempo invertido, número de series seguidas, episodios vistos.
- **Distribución por géneros:** gráfico de los géneros más consumidos.
- **Historial de actividad:** gráfico de calor del tipo GitHub que muestra la actividad de visionado por día a lo largo del último año.
- **Comparativa películas/series:** proporción de cada tipo de contenido en el historial.
- **Valoraciones:** distribución de las puntuaciones que el usuario ha dado (histograma 1–10).

---

### B.9 Calendario de Estrenos (`/calendar`)

**Archivos implicados:** `src/app/calendar/page.jsx` (~27 KB)

El calendario muestra los próximos estrenos de películas y series en los próximos días. Combina dos fuentes:
- **TMDb** para estrenos generales (endpoint `/movie/upcoming` y `/tv/on_the_air`)
- **Trakt** para los próximos episodios de las series que el usuario está siguiendo, mediante el endpoint `/calendars/my/shows` (requiere autenticación)

La vista de calendario organiza los títulos por fecha y permite filtrar por tipo de contenido. Para cada ítem se muestra el poster, el título y la plataforma de streaming donde está disponible.

---

### B.10 Biblioteca Personal (`/biblioteca`)

**Archivos implicados:** `src/app/biblioteca/BibliotecaClient.jsx` (~72 KB)

La biblioteca es una vista unificada del contenido personal del usuario que combina el historial de visionado y las series en progreso. Es la vista más completa para el usuario autenticado, con:
- Resumen visual del historial
- Series en progreso con acceso rápido al siguiente episodio
- Filtros avanzados y opciones de ordenación

---

### B.11 Descubrir (`/discover`)

**Archivos implicados:** `src/components/DiscoverClient.jsx` (~48 KB)

El módulo de descubrimiento permite al usuario buscar y filtrar contenido mediante:
- **Búsqueda en tiempo real** con debounce de 400ms para no saturar la API de TMDb (`/search/multi`)
- **Filtros avanzados:** género, año de lanzamiento, puntuación mínima, tipo de contenido (película/serie), streaming disponible
- **Ordenación** por popularidad, puntuación, año o alfabético
- **Paginación** infinita con carga de más resultados al llegar al final

Los resultados se muestran con el sistema de tres vistas compartido con Favoritos y Pendientes.

---

### B.12 Listas (`/lists`)

**Archivos implicados:** `src/app/lists/page.jsx` (~77 KB)

El módulo de listas permite acceder a:
- **Listas propias del usuario en TMDb:** creadas o seguidas
- **Listas curadas de TMDb:** listas públicas de la comunidad
- **Colecciones de saga:** franquicias como el Universo Cinematográfico de Marvel, la saga Matrix, etc. (endpoint `/collection/{id}` de TMDb)
- **Listas de Trakt:** listas populares y personalizadas de la comunidad Trakt

Cada lista tiene su propia página (`/lists/[listId]`) con el mismo sistema de vistas y paginación.

---

### B.13 Secciones Películas y Series (`/movies`, `/series`)

Páginas independientes para explorar exclusivamente el catálogo de películas o series. Organizan el contenido en secciones temáticas similares al dashboard pero filtradas por tipo. Las secciones incluyen tendencias, más valoradas, por género y estrenos recientes.

---

### B.14 Búsqueda de Personas (`/details/person/[id]`)

**Archivos implicados:** `src/components/ActorDetails.jsx` (~44 KB)

La ficha de actor/actriz obtiene de TMDb:
- Biografía y datos personales (`/person/{id}`)
- Filmografía completa como actor y como miembro del equipo técnico (`/person/{id}/movie_credits`, `/person/{id}/tv_credits`)

La filmografía se presenta ordenada por popularidad y filtrable por tipo de participación (actor, director, guionista). Para cada título se muestra el cartel, la puntuación y si está disponible en el servidor Plex del usuario.

---

### B.15 Navbar (`Navbar.jsx`)

**Archivo implicado:** `src/components/Navbar.jsx` (~30 KB)

La barra de navegación es un componente cliente que gestiona:
- **Estado de autenticación:** muestra el avatar y nombre del usuario si está conectado con Trakt y/o TMDb
- **Contadores de listas:** número de ítems en favoritos y pendientes (obtenidos de las APIs y actualizados optimistamente)
- **Efecto cristal en scroll:** en la posición 0 la barra es completamente transparente; al hacer scroll pasa a tener un fondo semi-transparente con `backdrop-filter: blur(12px)`
- **Búsqueda rápida integrada:** campo de búsqueda que redirige a `/discover` con el término introducido
- **Menú de navegación:** links a todas las secciones principales de la app, con indicador visual de la sección activa

---

## C. DOCUMENTACIÓN DETALLADA DE LAS APIs

### C.1 The Movie Database API (TMDb) v3

**URL base:** `https://api.themoviedb.org/3`  
**Autenticación:** API Key en parámetro de query (`?api_key=...`)  
**Límite de peticiones:** 40 peticiones / 10 segundos (cuenta gratuita)  
**Documentación oficial:** https://developer.themoviedb.org/docs

#### Implementación en el proyecto

El cliente TMDb centraliza toda la lógica de acceso en `src/lib/api/tmdb.js`. La función base `tmdb(path, params, options)` implementa:

1. **Constructor de URL unificado:** añade automáticamente la API Key y el idioma por defecto (`es-ES`). Si el caller necesita un idioma específico, puede sobreescribirlo pasando `language` en `params`.

2. **Timeout con AbortController:** cada petición tiene un timeout de 8 segundos (ajustable por opción). Los errores de tipo `AbortError` se silencian en consola para no generar ruido durante la navegación normal (que puede abortar peticiones en vuelo al cambiar de página).

3. **Caché diferenciada por entorno:**
   - En servidor (`IS_SERVER = true`): `cache: "force-cache"` con `next.revalidate: 600` (10 minutos). Next.js gestiona la caché ISR en el Data Cache.
   - En cliente (`IS_SERVER = false`): `cache: "no-store"`, delegando el control de caché al navegador.

4. **Gestión de errores granular:** los errores 404 devuelven `null` silenciosamente (recurso no encontrado es un caso esperado en este dominio); otros errores HTTP se logean y también devuelven `null` para que el componente gestione el estado de error sin lanzar excepciones.

#### Endpoints principales utilizados

| Función exportada | Endpoint TMDb | Descripción |
|---|---|---|
| `fetchTopRatedMovies()` | `GET /movie/top_rated` | Películas más valoradas de todos los tiempos |
| `fetchTrendingMovies()` | `GET /trending/movie/week` | Tendencias semanales de películas |
| `fetchPopularMovies()` | `GET /movie/popular` | Películas populares ahora |
| `fetchTopRatedTV()` | `GET /tv/top_rated` | Series más valoradas |
| `fetchTrendingTV()` | `GET /trending/tv/week` | Tendencias semanales de series |
| `fetchAiringTodayTV()` | `GET /tv/airing_today` | Series con episodios hoy |
| `getDetails(type, id)` | `GET /{type}/{id}?append_to_response=external_ids` | Metadatos completos con IDs externos |
| `getLogos(type, id)` | `GET /{type}/{id}/images` | Logos oficiales del título |
| `getCredits(type, id)` | `GET /{type}/{id}/credits` | Reparto y equipo técnico |
| `getWatchProviders(type, id)` | `GET /{type}/{id}/watch/providers` | Plataformas de streaming por país |
| `getRecommendations(type, id)` | `GET /{type}/{id}/recommendations` | Títulos similares recomendados |
| `getActorDetails(id)` | `GET /person/{id}` | Datos biográficos del actor |
| `getActorMovies(id)` | `GET /person/{id}/movie_credits` | Filmografía del actor |
| `markAsFavorite({...})` | `POST /account/{id}/favorite` | Marcar/desmarcar favorito |
| `markInWatchlist({...})` | `POST /account/{id}/watchlist` | Añadir/quitar de pendientes |
| `fetchFavoritesForUser(...)` | `GET /account/{id}/favorite/movies|tv` | Lista completa de favoritos |
| `fetchWatchlistForUser(...)` | `GET /account/{id}/watchlist/movies|tv` | Lista completa de pendientes |
| `fetchRatedForUser(...)` | `GET /account/{id}/rated/movies|tv` | Lista de items con valoración |
| `getMediaAccountStates(...)` | `GET /{type}/{id}/account_states` | Estado del ítem para el usuario |

#### Autenticación de cuenta TMDb (OAuth de sesión)

Además de la API Key pública, TMDb permite autenticar usuarios con un flujo propio (no estándar OAuth 2.0) basado en «tokens de sesión»:
1. Se genera un `request_token` en `/authentication/token/new`
2. El usuario lo aprueba en `https://www.themoviedb.org/authenticate/{request_token}`
3. Se intercambia por un `session_id` permanente en `/authentication/session/new`

Este `session_id` habilita los endpoints de cuenta (`/account/{id}/favorite`, `/account/{id}/watchlist`, etc.) y los `account_states` de cada contenido.

---

### C.2 OMDb API (Open Movie Database)

**URL base:** `https://www.omdbapi.com`  
**Autenticación:** API Key en parámetro de query (`?apikey=...`)  
**Límite de peticiones:** 1.000 peticiones diarias (plan gratuito)  
**Documentación oficial:** https://www.omdbapi.com/

#### Por qué se usa OMDb

TMDb v3 no expone directamente la puntuación de IMDb. OMDb es la única fuente pública que permite obtener el rating de IMDb, el número de votos en IMDb y las puntuaciones de Rotten Tomatoes y Metacritic por `imdbId`.

#### Implementación en el proyecto

**Proxy de servidor** (`src/app/api/omdb/route.js`):  
Para proteger la API Key, todas las peticiones a OMDb pasan por la API Route interna `/api/omdb`. El proxy implementa:

- **Caché en memoria de proceso** (`globalThis.__omdbCache`, `globalThis.__omdbInflight`): las respuestas exitosas se cachean 24 horas en el proceso de Node.js; las fallidas, 60 segundos para reintentar pronto. El objeto `inflight` deduplica las peticiones concurrentes al mismo `imdbId`, garantizando que aunque múltiples tarjetas soliciten el mismo título simultáneamente, sólo se realiza una petición real a OMDb.

- **Timeout configurable:** por defecto 2.500 ms (optimizado para las listas donde se cargan muchos ítems). Configurable mediante el parámetro `?timeoutMs=` para los detalles donde hay más margen de espera.

- **Cabecera `Cache-Control`:** la respuesta incluye `public, s-maxage=86400, stale-while-revalidate=604800` para que la CDN de Vercel también cachee las respuestas 24 horas, reduciendo la carga sobre el proceso de Next.js.

**Cliente del frontend** (`src/lib/api/omdb.js`):  
Wrapper sencillo que llama a `/api/omdb?i={imdbId}`. Los componentes consumen este cliente y gestionan el resultado mediante el módulo `omdbCache.js` (caché en `sessionStorage` con TTL de 24 horas).

#### Datos obtenidos de OMDb

Para cada título (identificado por `imdbId`):
- `imdbRating` — Puntuación IMDb (ej. `"8.8"`)
- `imdbVotes` — Número de votos en IMDb (ej. `"2,345,678"`)
- `Ratings` — Array de objetos `{ Source, Value }` que puede incluir Rotten Tomatoes y Metacritic
- `Awards` — Descripción textual de premios (ej. `"Won 6 Oscars. 171 wins & 200 nominations total"`)
- `Runtime` — Duración (ej. `"152 min"`)

---

### C.3 Trakt.tv API v2

**URL base:** `https://api.trakt.tv`  
**Autenticación:**  
- API Key (`trakt-api-key` header) para endpoints públicos  
- OAuth 2.0 Bearer Token (`Authorization: Bearer {access_token}`) para endpoints de usuario  
**Versión API:** header `trakt-api-version: 2` obligatorio  
**Límite de peticiones:** 1.000 peticiones / 5 minutos (usuarios autenticados); 1.000 / día (no autenticados)  
**Documentación oficial:** https://trakt.docs.apiary.io/

#### Flujo OAuth 2.0 en el proyecto

La implementación del flujo Authorization Code de Trakt es el componente técnico más delicado del proyecto. Se articula en cuatro API Routes de Next.js:

**1. Inicio del flujo** (`GET /api/trakt/oauth`):
```
Genera state aleatorio → almacena en cookie httpOnly (10 min) →
construye URL de autorización Trakt → redirige al usuario
```

**2. Callback** (`GET /api/trakt/auth/callback`):
```
Recibe code + state → valida state contra cookie →
POST a https://api.trakt.tv/oauth/token (servidor-a-servidor) →
almacena access_token y refresh_token en cookies httpOnly →
redirige al dashboard
```

La petición de intercambio del código incluye los parámetros:
- `code`: el código de un solo uso recibido de Trakt
- `client_id`: identificador público de la aplicación
- `client_secret`: secreto de la aplicación (nunca expuesto al cliente)
- `redirect_uri`: debe coincidir exactamente con el registrado en Trakt
- `grant_type: "authorization_code"`

**3. Estado** (`GET /api/trakt/auth/status`):
```
Lee cookie access_token → si válido: GET /users/me → devuelve perfil
Si expirado: usa refresh_token → POST /oauth/token → actualiza cookies → devuelve perfil
Si no hay token: devuelve { authenticated: false }
```

**4. Desconexión** (`GET/POST /api/trakt/auth/disconnect`):
```
POST a /oauth/revoke → elimina cookies de sesión → redirige al login
```

#### Problema de identificadores y su solución

El frontend trabaja exclusivamente con `tmdbId` (los identificadores de TMDb), mientras que muchos endpoints de Trakt requieren sus propios identificadores (`traktId`, `slug`). Las API Routes de Trakt resuelven esta traducción internamente mediante el endpoint de búsqueda por ID externo:

```
GET /search/tmdb/{tmdbId}?type=movie|show
```

Este endpoint devuelve el objeto de Trakt con todos sus identificadores (`trakt`, `slug`, `imdb`, `tmdb`, `tvdb`), permitiendo al proxy realizar la llamada real al endpoint requerido.

#### Endpoints de Trakt utilizados por módulo

**Historial y seguimiento:**
| Endpoint | Descripción |
|---|---|
| `GET /sync/history` | Historial completo de películas y episodios vistos |
| `POST /sync/history` | Registrar película/episodio como visto |
| `DELETE /sync/history` | Desmarcar como visto |
| `GET /sync/watched/shows` | Estado de visionado de todas las series (temporadas + episodios) |
| `GET /sync/watched/movies` | Estado de películas vistas |

**Listas personales:**
| Endpoint | Descripción |
|---|---|
| `GET /sync/watchlist` | Lista de pendientes del usuario |
| `POST /sync/watchlist` | Añadir a pendientes |
| `DELETE /sync/watchlist` | Quitar de pendientes |

**Valoraciones:**
| Endpoint | Descripción |
|---|---|
| `GET /sync/ratings` | Todas las valoraciones del usuario |
| `POST /sync/ratings` | Añadir valoración (1–10) |
| `DELETE /sync/ratings` | Eliminar valoración |
| `GET /movies/{id}/ratings` (o `/shows`) | Distribución de valoraciones de comunidad |

**Estadísticas:**
| Endpoint | Descripción |
|---|---|
| `GET /users/me/stats` | Estadísticas globales del usuario (films, shows, episodes, runtime) |
| `GET /users/me/history` | Historial paginado del usuario |

**Contenido:**
| Endpoint | Descripción |
|---|---|
| `GET /movies/{id}/related` | Películas relacionadas |
| `GET /shows/{id}/seasons?extended=episodes` | Temporadas con episodios |
| `GET /movies/trending` | Películas en tendencia en Trakt |
| `GET /movies/popular` | Películas populares en Trakt |
| `GET /calendars/my/shows` | Próximos episodios de series seguidas por el usuario |

**Listas públicas:**
| Endpoint | Descripción |
|---|---|
| `GET /lists/{id}/items` | Ítems de una lista pública de Trakt |
| `GET /movies/trending` y `/shows/trending` | Listas de tendencias públicas |

#### Normalización de fechas en Trakt

Trakt acepta formatos de fecha distintos según el endpoint:
- **Historial (`/sync/history`):** formato ISO 8601 completo con zona horaria (`2024-01-15T20:30:00.000Z`)
- **Watchlist y otros (`/sync/watchlist`):** formato `YYYY-MM-DD`

El módulo `traktHelpers.js` incluye las funciones `normalizeWatchedAtForHistoryApi` y `normalizeWatchedAtForApi` que normalizan cualquier entrada (objeto `Date`, string en varios formatos) al formato correcto para cada caso, evitando errores de validación de la API.

---

### C.4 JustWatch (API GraphQL no oficial)

**URL base:** `https://apis.justwatch.com/graphql`  
**Autenticación:** ninguna (no requiere API Key)  
**Naturaleza:** API GraphQL no documentada públicamente. JustWatch no tiene una API oficial pública; el cliente utiliza los mismos endpoints GraphQL que usa la web de JustWatch.  
**Nota importante:** al ser una API no oficial, puede cambiar sin previo aviso y sin soporte oficial.

#### Por qué se usa JustWatch

TMDb proporciona información de proveedores de streaming (`/watch/providers`), pero sólo indica en qué plataformas está disponible el contenido, sin proporcionar un enlace directo al título en cada plataforma. JustWatch sí proporciona URLs directas que llevan al usuario directamente a la página del título en cada plataforma de streaming.

#### Implementación en el proyecto

El cliente JustWatch (`src/lib/api/justwatch.js`) utiliza únicamente dos queries GraphQL:

**Query 1: Búsqueda de título** (`GetSearchTitles`)
```graphql
query GetSearchTitles($searchTitlesFilter: TitleFilter!, $country: Country!, 
                       $language: Language!, $first: Int!, $searchAfterCursor: String) {
  popularTitles(filter: $searchTitlesFilter, country: $country, first: $first) {
    edges {
      node {
        id objectId objectType
        content(country: $country, language: $language) {
          title fullPath originalReleaseYear posterUrl
          externalIds { imdbId tmdbId }
          scoring { imdbScore tmdbScore }
        }
      }
    }
  }
}
```

Se envía con variables:
- `searchTitlesFilter`: `{ searchQuery: title, objectTypes: ["MOVIE"|"SHOW"] }`
- `country: "ES"` (España)
- `language: "es"`
- `first: 5` (primeros 5 resultados)

**Query 2: Detalles con ofertas** (`GetTitleDetails`)
```graphql
query GetTitleDetails($nodeId: ID!, $country: Country!, $language: Language!, $platform: Platform!) {
  node(id: $nodeId) {
    ... on MovieOrShowOrSeason {
      offers(country: $country, platform: $platform) {
        id monetizationType presentationType standardWebURL
        package { id packageId clearName shortName technicalName }
      }
    }
  }
}
```

Se envía con variables:
- `nodeId`: el ID de JustWatch del título (obtenido de la búsqueda)
- `platform: "WEB"`

#### Mapeo de proveedores a TMDb para logos

JustWatch utiliza sus propios identificadores de proveedor. Para mostrar los logos de las plataformas se mantiene un mapeo estático (`JUSTWATCH_TO_TMDB_PROVIDER`) que traduce los IDs de JustWatch a los IDs y rutas de logo de TMDb:

```js
{
  8:    { tmdb_id: 8,    logo_path: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" }, // Netflix
  119:  { tmdb_id: 119,  logo_path: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg"  }, // Amazon Prime
  337:  { tmdb_id: 337,  logo_path: "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg"  }, // Disney+
  1899: { tmdb_id: 1899, logo_path: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg"  }, // HBO Max ES
  350:  { tmdb_id: 350,  logo_path: "/6uhKBfmtzFqOcLousHwZuzcrScK.jpg"  }, // Apple TV+
  2241: { tmdb_id: 2241, logo_path: "/jse4MOi92Jgetym7nbXFZZBI6LK.jpg"  }, // Movistar+
  // ...
}
```

#### Función principal exportada: `getStreamingProviders(title, type, year)`

Flujo interno:
1. Búsqueda del título en JustWatch para obtener su `nodeId` interno
2. Obtención de detalles completos con las ofertas de cada plataforma
3. Construcción de la URL de JustWatch del título (`https://www.justwatch.com{fullPath}`)
4. Procesado de las ofertas: se agrupa por proveedor, se filtra solo las de tipo `FLATRATE` (suscripción, no alquiler ni compra) y se enriquece con el logo de TMDb

La función devuelve `{ providers: [...], justwatchUrl }` donde cada provider incluye la URL directa al título en la plataforma (`standardWebURL`) cuando JustWatch la proporciona, o una URL de búsqueda generada automáticamente como fallback.

---

### C.5 Plex Media Server

**URL base:** configurable (`PLEX_URL` / `PLEX_URLS` en variables de entorno)  
**Autenticación:** Token de aplicación en query param (`?X-Plex-Token=...`) o en header (`X-Plex-Token`)  
**Naturaleza:** API XML/JSON privada del servidor Plex del usuario. No es una API pública de cloud.  
**Documentación de referencia:** https://www.plexopine.com/plex-api

#### Por qué se integra Plex

La integración con Plex permite a los usuarios que tienen una biblioteca local de contenido (un servidor Plex doméstico) abrir directamente cualquier película o serie en su servidor de Plex desde la interfaz de *The Show Verse*, sin tener que buscar el contenido manualmente en la aplicación de Plex.

#### Autenticación: dos modos

**Modo simple (token estático):**
Se configura `PLEX_TOKEN` en variables de entorno. La aplicación usa este token directamente en cada petición. Esta es la configuración más sencilla pero el token no expira.

**Modo JWT (token rotativo):**
Se configuran `PLEX_JWT_PRIVATE_KEY` (clave privada RSA o Ed25519) y `PLEX_CLIENT_IDENTIFIER`. El módulo `src/lib/plex/auth.js` implementa un sistema de autenticación con renovación automática de token:

1. **Registro de la clave pública (JWK):** en el primer uso, la clave pública derivada de la clave privada se registra en `https://clients.plex.tv/api/v2/auth/jwk` para identificar la aplicación.

2. **Obtención de nonce:** petición `GET https://clients.plex.tv/api/v2/auth/nonce` para obtener un código temporal único.

3. **Firma del JWT de dispositivo (`signDeviceJwt`):** se construye un JWT firmado con la clave privada que contiene el `nonce`, el `scope` y los datos de la aplicación.

4. **Intercambio por token Plex:** `POST https://clients.plex.tv/api/v2/auth/token` con el JWT firmado. Plex devuelve un `auth_token` de vida limitada.

5. **Uso del token:** todas las peticiones al servidor Plex usan este `auth_token`. Cuando está próximo a expirar (dentro del margen de 2 minutos, `TOKEN_REFRESH_SKEW_MS`), se inicia automáticamente un refresh.

6. **Deduplicación de refrescos:** si ya hay un refresh en curso (`state.refreshPromise`), las peticiones concurrentes esperan al mismo Promise en lugar de lanzar múltiples refrescos paralelos.

#### API Route interna (`GET /api/plex`)

Parámetros de query:
- `title` (requerido): título de la película o serie
- `type` (requerido): `"movie"` o `"tv"`
- `year` (opcional): año de lanzamiento
- `imdbId` (opcional): identificador IMDb del título
- `tmdbId` (opcional): identificador TMDb del título

Flujo de la API Route:

```
1. Obtener token Plex (estático o JWT renovado)
2. Para cada URL de servidor Plex configurada:
   a. GET {plexUrl}/search?query={title}&X-Plex-Token={token}
   b. pickBestMatch(): filtrar candidatos por tipo, título y año
   c. Si hay match: obtener machineIdentifier del servidor
   d. break
3. Si no hay match: { available: false, plexUrl: null }
4. Si hay match: construir URLs de acceso:
   - plexWebUrl: https://app.plex.tv/desktop/#!/server/{machineId}/details?key={metadataKey}
   - plexMobileUrl: plex://preplay/?metadataKey={key}&metadataType={type}&server={machineId}
   - plexUniversalUrl: https://watch.plex.tv/{movie|show}/{slug} (si slug disponible)
   - plexSlugUrl: plex://{movie|show}/{slug} (deep link nativo)
   - plexAndroidSlugIntentUrl: intent:// para Chrome en Android
5. Responde con { available: true, plexUrl, plexMobileUrl, plexUniversalUrl, ... }
```

**Resolución de slug para URLs universales:** si se proporciona `imdbId` o `tmdbId`, la Route intenta obtener el `slug` del título desde `https://metadata.provider.plex.tv/library/metadata/matches?guid=imdb://{imdbId}`. El slug permite construir URLs del tipo `https://watch.plex.tv/movie/the-dark-knight` que funcionan como Universal Links (iOS/Android abren la app Plex directamente en el contenido correcto).

#### Detección de servidores locales

El módulo detecta automáticamente si la URL del servidor Plex es una dirección privada o localhost (`10.x`, `192.168.x`, `127.x`, `localhost`, `.local`). En ese caso, si la URL configurada es `https://`, también prueba con `http://` como fallback, ya que los servidores locales de Plex frecuentemente no tienen certificado TLS válido.

#### Cabeceras de caché

Las respuestas exitosas de la API de Plex se cachean con `s-maxage=3600, stale-while-revalidate=7200` para reducir la carga sobre el servidor Plex local del usuario.

---

## D. VARIABLES DE ENTORNO REQUERIDAS

| Variable | API | Descripción | Requerida |
|---|---|---|---|
| `NEXT_PUBLIC_TMDB_API_KEY` | TMDb | API Key de TMDb v3 | Sí |
| `TMDB_SESSION_ID` | TMDb | Session ID para operaciones de cuenta | Para funciones de cuenta |
| `NEXT_PUBLIC_TRAKT_CLIENT_ID` | Trakt | Client ID de la aplicación Trakt | Sí |
| `TRAKT_CLIENT_SECRET` | Trakt | Client Secret de Trakt | Sí |
| `TRAKT_REDIRECT_URI` | Trakt | URI de callback OAuth | Sí |
| `OMDB_API_KEY` | OMDb | API Key de OMDb | Para puntuaciones IMDb/RT |
| `PLEX_URL` | Plex | URL del servidor Plex | Para integración Plex |
| `PLEX_URLS` | Plex | URLs adicionales de Plex (separadas por coma) | Opcional |
| `PLEX_TOKEN` | Plex | Token de autenticación Plex (modo simple) | Para modo simple |
| `PLEX_JWT_PRIVATE_KEY` | Plex | Clave privada RSA/Ed25519 (modo JWT) | Para modo JWT |
| `PLEX_JWT_KID` | Plex | Key ID del JWK (modo JWT) | Para modo JWT |
| `PLEX_CLIENT_IDENTIFIER` | Plex | Identificador único de la app en Plex | Para modo JWT |
| `PLEX_MACHINE_IDENTIFIER` | Plex | Machine ID del servidor Plex (fallback) | Opcional |

---

## E. FLUJO DE DATOS ENTRE CAPAS

El siguiente diagrama muestra el flujo de datos para la carga de la página de detalle de una película/serie:

```
Usuario navega a /details/movie/550
       │
       ▼
page.jsx (Server Component)
       │  Promise.all([
       │    getDetails("movie", 550),        → TMDb /movie/550?append_to_response=external_ids
       │    getLogos("movie", 550),           → TMDb /movie/550/images
       │    getCredits("movie", 550),         → TMDb /movie/550/credits
       │    getRecommendations("movie", 550), → TMDb /movie/550/recommendations
       │    getWatchProviders("movie", 550),  → TMDb /movie/550/watch/providers
       │    getMediaAccountStates(...)        → TMDb /movie/550/account_states
       │  ])
       │
       ▼ Props al componente cliente
DetailsClient.jsx (Client Component)
       │
       ├── Al montar → /api/trakt/scoreboard?type=movie&id=550
       │                    └──→ Trakt /search/tmdb/550?type=movie → /movies/{slug}/ratings
       │
       ├── Al montar → /api/omdb?i=tt0137523 (via omdbCache)
       │                    └──→ OMDb API (o caché sessionStorage)
       │
       ├── Al montar → /api/plex?title=Fight+Club&type=movie&year=1999&imdbId=tt0137523
       │                    └──→ Servidor Plex local del usuario
       │
       └── Al montar → /api/streaming?title=Fight+Club&type=movie&year=1999
                            └──→ JustWatch GraphQL API
```

---

## F. SISTEMA DE CACHÉ MULTICAPA

El proyecto implementa cinco niveles de caché independientes para distintos tipos de datos:

| Nivel | Almacenamiento | TTL | Datos almacenados |
|---|---|---|---|
| 1 — ISR servidor | Data Cache de Next.js | 10 min (catálogo) / 1 h (detalles) | Respuestas de TMDb al catálogo general |
| 2 — CDN Vercel | CDN Edge | 1–24 h | Imágenes TMDb, respuestas de /api/omdb |
| 3 — Memoria proceso | `Map` en `globalThis` | 24 h (éxito) / 60 s (fallo) | Respuestas OMDb en el proxy servidor |
| 4 — `sessionStorage` | Navegador (sesión) | 24 h | Datos de OMDb consultados en detalle y listas |
| 5 — `localStorage` | Navegador (persistente) | 30 días | Puntuaciones IMDb y Trakt en listas |
| 6 — `Map` en módulo | Memoria del cliente (tab) | 10 min / 45 s | Rating personal Trakt del usuario |

Los niveles 4, 5 y 6 están implementados en el módulo `scoreCache.js` y en `omdbCache.js`, y permiten reducir hasta en un 80% el número de peticiones a APIs externas durante el uso normal de las listas de Favoritos y Pendientes.
