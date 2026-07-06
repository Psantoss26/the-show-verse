# 🎬 The Show Verse - Documentación Profunda de Módulos Funcionales

> **Nivel de detalle:** Profundo (arquitectura, implementación y funcionalidades completas)  
> **Fecha de documentación:** Marzo 2026  
> **Versión del proyecto:** 0.1.0  
> **Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4

---

## 📑 Tabla de Contenidos

1. [1. Dashboard Principal (`/`)](#1-dashboard-principal)
2. [2. Página de Detalle (`/details/[type]/[id]`)](#2-página-de-detalle)
3. [3. Seguimiento por Episodio (Series)](#3-seguimiento-por-episodio)
4. [4. Módulo de Favoritos (`/favorites`)](#4-módulo-de-favoritos)
5. [5. Módulo de Pendientes/Watchlist (`/watchlist`)](#5-módulo-de-pendientesuwatchlist)
6. [6. Historial de Visionado (`/history`)](#6-historial-de-visionado)
7. [7. En Progreso (`/in-progress`)](#7-en-progreso)
8. [8. Estadísticas del Usuario (`/stats`)](#8-estadísticas-del-usuario)
9. [9. Calendario de Estrenos (`/calendar`)](#9-calendario-de-estrenos)
10. [10. Biblioteca Personal (`/biblioteca`)](#10-biblioteca-personal)
11. [11. Descubrir Contenido (`/discover`)](#11-descubrir-contenido)
12. [12. Gestión de Listas (`/lists`)](#12-gestión-de-listas)
13. [13. Secciones Películas y Series (`/movies`, `/series`)](#13-secciones-películas-y-series)
14. [14. Búsqueda de Personas (`/details/person/[id]`)](#14-búsqueda-de-personas)
15. [15. Barra de Navegación (Navbar)](#15-barra-de-navegación)
16. [Arquitectura de Datos Transversal](#arquitectura-de-datos-transversal)

---

## 1. Dashboard Principal

### 📍 Ubicación y archivos implicados

```
src/app/page.jsx                      # Server Component
src/components/MainDashboardClient.jsx # Client Component (~102 KB)
```

### 🎯 Propósito

El dashboard es la puerta de entrada de la aplicación. Muestra un compendio curado de contenido audiovisual en múltiples secciones temáticas. Es el primer punto de contacto donde el usuario descubre contenido sin necesidad de búsqueda activa.

### 🏗️ Arquitectura

#### **Server Component: `src/app/page.jsx`**

El Server Component implementa uno de los patrones más eficientes de Next.js 13+: la **carga paralela de datos**.

```javascript
// Pseudo-código ilustrativo de la arquitectura

export default async function DashboardPage() {
  // Promise.all ejecuta 12 peticiones a TMDb EN PARALELO
  // La latencia total = la petición más lenta (típicamente 400-600ms)
  // En lugar de: petición 1 + petición 2 + ... + petición 12 (4-8s)
  
  const sectionsData = await Promise.all([
    fetchTrendingMovies(),           // GET /trending/movie/week
    fetchTopRatedMovies(),           // GET /movie/top_rated  
    fetchPopularMovies(),            // GET /movie/popular
    fetchActionMovies(),             // GET /discover/movie?with_genres=28
    fetchDramaMovies(),              // GET /discover/movie?with_genres=18
    fetchComedyMovies(),             // GET /discover/movie?with_genres=35
    fetchTrendingTV(),               // GET /trending/tv/week
    fetchTopRatedTV(),               // GET /tv/top_rated
    fetchPopularTV(),                // GET /tv/popular
    fetchAiringTodayTV(),            // GET /tv/airing_today
    fetchOnTheAirTV(),               // GET /tv/on_the_air
    getUserFavorites(),              // GET /account/{id}/favorite/movies (si autenticado)
  ])
  
  return <MainDashboardClient {...sectionsData} />
}
```

**Ventajas de este enfoque:**
- ⚡ Velocidad: Una sola round-trip de red en lugar de 12
- 🔢 Exactitud: Datos consistentes (todos del mismo momento)
- 🎯 UX: Pantalla completa visible antes de la hidratación de React

**Caché inteligente:**
```javascript
// Para cada endpoint, Next.js cachea:
export const revalidate = 1800  // 30 minutos de ISR (Incremental Static Regeneration)

// Si viene un usuario a las 10:00am y pide /
// - La página se cachea 30 minutos
// - A las 10:15am: otro usuario ve la versión cacheada (instantáneo)
// - A las 10:31am: se regenera en background, próximos usuarios ven versión fresca
```

#### **Secciones del Dashboard**

| Sección | Fuente | Endpoint | Uso | Casos especiales |
|---------|--------|----------|-----|-----------------|
| **Hero** | TMDb | `/trending/movie/week` | Carrusel principal con 10 películas | Se selecciona logo de mayor calidad |
| **Top Películas** | TMDb | `/movie/top_rated` | Películas mejor valoradas de todos los tiempos | Filtro por calificación mín. |
| **Tendencias** | TMDb | `/trending/movie/week` | Películas trending esta semana | Excluir de Hero |
| **Populares** | TMDb | `/movie/popular` | Momentum actual | Puede solaparse con Trending |
| **Acción** | TMDb | `/discover/movie?with_genres=28` | Películas de acción clásicas | 1 endpoint + 1 logo fetch |
| **Dramas** | TMDb | `/discover/movie?with_genres=18` | Películas dramáticas imprescindibles | Similar a Acción |
| **Comedia** | TMDb | `/discover/movie?with_genres=35` | Películas de comedia trending | Similar a Acción |
| **Series Populares** | TMDb | `/tv/popular` | Series trending del momento | Sin lag en estrenos |
| **Series Top Rated** | TMDb | `/tv/top_rated` | Series mejor valoradas (clásicas) | Incluye series antiguas |
| **Series Trending** | TMDb | `/trending/tv/week` | Series esta semana | Nuevos estrenos |
| **Emitiéndose Hoy** | TMDb | `/tv/airing_today` | Episodios con emisión hoy | Real-time engagement |
| **En Emisión** | TMDb | `/tv/on_the_air` | Series activas en temporada | Similar a Airing Today |

#### **Selección de Logotipos y Backdrops**

La selección visual es crucial para una interfaz moderna. El dashboard implementa lógica inteligente de selección:

**Para logotipos:**
```javascript
// getLogos() realiza: GET /{type}/{id}/images?language=es,en,null

// Estrategia de prioridad:
// 1. Preferencia por idioma local (es → en → sin idioma)
// 2. Dentro de cada idioma: logos con mayor número de votos
// 3. Dimensiones: aspect_ratio cercano a 2.0 (ancho/alto típico de logos)

// Ejemplo de respuesta de TMDb:
{
  "logos": [
    {
      "file_path": "/xyz.png",
      "iso_639_1": "es",           // Español
      "vote_count": 12,
      "aspect_ratio": 2.04
    },
    {
      "file_path": "/abc.png", 
      "iso_639_1": "en",           // Inglés
      "vote_count": 8,
      "aspect_ratio": 1.97
    },
    ...
  ]
}

// Se selecciona el de mayor vote_count dentro del idioma preferido
```

**Para backdrops:**
```javascript
// Estrategia similar pero con preferencia por resolución
// GET /{type}/{id}?append_to_response=images

// Preferencias:
// 1. Resolución (w1280 > w780 > w...
// 2. Dentro de resolución: mayor vote_count
// 3. Aspect ratio cercano a 1.78 (16:9 estándar)
```

### 🎨 Client Component: `MainDashboardClient.jsx`

Una vez los datos llegan del servidor, el Client Component gestiona toda la interactividad:

#### **Estructura interna**

```jsx
MainDashboardClient
├── Animación de fondo (gradientes flotantes)
├── Hero Carrusel (Swiper)
│   ├── Autoplay (intervalo 6s, pausa en hover)
│   ├── Botones de navegación (siguiente/anterior)
│   ├── Indicadores visuales (pie de página)
│   ├── Overlay con metadatos (título, año, género, rating)
│   └── Botones de acción (Detalles, Favorito, Watchlist)
├── Sticky Navbar (efecto glassmorphism en scroll)
└── Secciones (CarruselIndividual x 11)
    ├── Imágenes lazy cargadas
    ├── AnimatePresence + motion divs (entrada escalonada)
    ├── Transiciones suaves
    └── Meta información al hover
```

#### **Animaciones**

**Framer Motion variants:**
```javascript
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,      // Delay entre hijos de 100ms
      delayChildren: 0.1         // Inicio delay de 100ms
    }
  }
}

// Uso:
// - Hero fade-in-up al cargar
// - Cada sección entrada escalonada (10ms * n_sección)
// - Efecto cascada visual muy pulido
```

#### **Gestión de Estado**

```javascript
// Estado de interactividad
const [heroIndex, setHeroIndex] = useState(0)           // Índice carrusel
const [loadingFavorites, setLoadingFavorites] = useState({})  // Loading por ID
const [activeFavorites, setActiveFavorites] = useState({})     // Favoritos checked
const [activeWatchlist, setActiveWatchlist] = useState({})     // Watchlist checked

// Métodos optimistas:
// 1. Click en corazón → actualizar estado local INSTANTÁNEAMENTE
// 2. En paralelo: enviar request a TMDb en background
// 3. Si falla: revertir estado local
// 4. Si éxito: estado ya correcto (optimismo confirmado)

const handleFavoriteToggle = async (tmdbId, isFavorite) => {
  setActiveFavorites(prev => ({
    ...prev,
    [tmdbId]: !prev[tmdbId]
  }))
  
  try {
    await markAsFavorite({
      mediaType: 'movie',
      mediaId: tmdbId,
      favorite: !isFavorite
    })
  } catch (err) {
    // Revertir en caso de error
    setActiveFavorites(prev => ({
      ...prev,
      [tmdbId]: isFavorite
    }))
  }
}
```

#### **Responsive Design**

```javascript
// Hook personalizado: useIsMobileLayout
// Detecta anchura de viewport mediante CSS media queries
// NO se basa en user agent (es decir, funciona en desktop redimensionado)

const isMobile = useIsMobileLayout(768)

// Adaptaciones según breakpoint:
// - Desktop (1024px+): 6 items por slide en carruseles
// - Tablet (768px): 4 items por slide
// - Mobile (640px): 2 items por slide
// - Small mobile (< 640px): 1 item visible + parte del siguiente
```

### ✨ Características Especiales

**1. Efecto sticky de la navbar**
```javascript
// Al scroll >100px: cambiar de transparente a glassmorphism
// - background: rgba(15, 15, 15, 0.7)
// - backdrop-filter: blur(12px) para efecto cristal
// - border-bottom: 1px solid rgba(255, 255, 255, 0.05)

// Smooth transition en CSS (no intervención JS)
```

**2. Secciones condicionales por autenticación**
```javascript
// Si user NO autenticado:
// - Ocultar sección "Tus Favoritos"
// - Ocultar sección "En Progreso"
// - Mostrar CTA a login

// Si user autenticado:
// - Mostrar todas las secciones
// - Incluir datos personales fetch en Promise.all
```

**3. Preload de imágenes**
```javascript
// CarruselIndividual envuelve cada poster en <Image />
// con loading="lazy" + placeholder="blur"
// - Blur: 10xp versión del poster como placeholder
// - Lazy: carga solo si el item entra en viewport
// - Result: UX fluido sin "saltos" visuales
```

---

## 2. Página de Detalle

### 📍 Ubicación y archivos implicados

```
src/app/details/[type]/[id]/page.jsx  # Server Component (~50-100 líneas)
src/components/DetailsClient.jsx       # Client Component (~331 KB, MAYOR del proyecto)
src/components/details/*.jsx           # Subcomponentes:
  ├── DetailsSectionMenu.jsx           # Menú de pestañas
  ├── DetailAtoms.jsx                  # Bloques de info
  ├── DetailHeaderBits.jsx             # Header + poster + acciones
  ├── ScoreboardBar.jsx                # Puntuaciones 3 fuentes
  ├── VideoModal.jsx                   # Modal de videos
  ├── PosterStack.jsx                  # Stack parallax de posters
  ├── LoadingSkeleton.jsx              # Skeletons de carga
  └── AnimatedSection.jsx              # Wrapper de animaciones
```

### 🎯 Propósito

La página de detalle es el corazón de la aplicación. Centraliza toda la información de una película o serie:
- Metadatos completos (sinopsis, reparto, críticas)
- Control de estado personal (favorito, watchlist, visionado)
- Integración multi-API (TMDb, Trakt, IMDb, Plex)
- Seguimiento episódico (solo series)

### 🏗️ Arquitectura

#### **Server Component: `src/app/details/[type]/[id]/page.jsx`**

```javascript
// Estrategia: fetch TODO lo necesario EN PARALELO antes de renderizar

async function DetailsPage({ params: { type, id } }) {
  // 1. Validar entrada
  const mediaType = type === 'tv' ? 'tv' : 'movie'
  
  // 2. Ejecutar fetches en paralelo (Promise.all)
  const [details, logos, credits, recommendations, providers, videos, reviews] = 
    await Promise.all([
      getDetails(mediaType, id),                   // Metadatos + external_ids
      getLogos(mediaType, id),                     // Logos oficiales
      getCredits(mediaType, id),                   // Cast + crew
      getRecommendations(mediaType, id),           // Títulos similares
      getWatchProviders(mediaType, id),            // Plataformas streaming
      getVideos(mediaType, id),                    // Trailers + teasers
      getReviews(mediaType, id),                   // Reseñas comunidad
    ])
  
  // 3. Si usuario autenticado (cookie session_id en header):
  let accountStates = {}
  if (hasUserSession) {
    accountStates = await getMediaAccountStates(mediaType, id, sessionId)
    // accountStates = { favorite, watchlist, rated: { value } }
  }
  
  // 4. Pasar TODO al componente cliente
  return <DetailsClient 
    mediaType={mediaType}
    id={id}
    details={details}
    logos={logos}
    credits={credits}
    recommendations={recommendations}
    providers={providers}
    videos={videos}
    reviews={reviews}
    accountStates={accountStates}
  />
}
```

**Ventajas:**
- Cache de 10 minutos en servidor (ISR)
- Hydration instantánea (React recibe datos cacheados)
- Zero waterfalls (sin peticiones secuenciales)

#### **Client Component: `DetailsClient.jsx`**

**Tamaño:** ~331 KB (el mayor del proyecto)  
**Líneas:** ~6000+  
**Complejidad:** Alta (múltiples sistemas interconectados)

**Secciones principales:**
```jsx
DetailsClient
├── Estado & Contexto
│   ├── Autenticación (user, Trakt, Plex)
│   ├── Pestañas activa (info/episodes/videos/reviews)
│   ├── Modal abierto (videos/enlaces/etc)
│   ├── Cache de datos (OMDb, Trakt)
│   └── Loading states (multiple)
│
├── Header Principal
│   ├── Fondo con backdrop (parallax effect)
│   ├── Poster (con PosterStack.jsx)
│   ├── Meta "en una línea" (año/duración/géneros)
│   ├── Sinopsis expandible
│   └── Botones de acción (3 filas: Favorito/Watchlist, Trakt, Plex)
│
├── Puntuaciones (ScoreboardBar.jsx)
│   ├── TMDb (% de puntuación)
│   ├── IMDb (vía OMDb)
│   ├── Trakt (puntuación comunidad + voto personal)
│   └── Rotten Tomatoes / Metacritic (si disponible)
│
├── Menú de Pestañas (DetailsSectionMenu.jsx)
│   ├── Información General
│   ├── Temporadas & Episodios (solo series)
│   ├── Multimedia (trailers)
│   ├── Recomendaciones
│   ├── Reseñas
│   └── Estadísticas (especial para series)
│
├── Contenido por Pestaña
│   ├── Información: reparto, género, duración, etc
│   ├── Episodios: grid/lista de episodios con estado visto
│   ├── Multimedia: modal con videos embebidos
│   ├── Recomendaciones: carrusel de títulos similares
│   ├── Reseñas: comentarios de comunidad TMDb
│   └── Stats: gráficos de rating por episodio (series)
│
└── Modales Flotantes
    ├── VideoModal: reproducción de trailers
    ├── ExternalLinksModal: enlaces IMDb, Trakt, etc
    ├── TraktWatchedModal: historial de visionados Trakt
    └── AddToListModal: agregar a listas personalizadas
```

### 📊 Flujos de Datos Principales

#### **1. Sistema de Puntuaciones (ScoreboardBar.jsx)**

Uno de los sistemas más interesantes: centraliza rating de 4 fuentes distintas.

```javascript
// Arquitectura de puntuaciones

const scoreboardBar = {
  tmdb: {
    // Viene del Server (details.vote_average)
    // NO requiere fetch adicional
    score: 7.8,
    voteCount: 14500,
    icon: "star",
    color: "text-yellow-400"
  },
  
  imdb: {
    // Viene de OMDb (REQUIERE fetch en Cliente)
    // Implementado con caché en sessionStorage
    // Lazy loading: solo si usuario expande sección de detalles
    score: 8.2,
    voteCount: 245000,
    source: "IMDb",
    icon: "film"
  },
  
  trakt: {
    // Viene de /api/trakt/scoreboard/{type}/{id}
    // Puntuación comunitaria (promedio votos Trakt)
    // TAMBIÉN gestiona voto personal del usuario (1-10 estrellas)
    score: 81,
    voteCount: 32000,
    userRating: 9,  // Si autenticado
    icon: "trending-up",
    color: "text-purple-400"
  },
  
  rottenTomatoes: {
    // Opcional: de OMDb (si disponible)
    score: "91%",
    icon: "tomato"
  }
}
```

**Flujo de carga:**
```
1. Initial render (Server Component data)
   └─ TMDb visible INMEDIATAMENTE

2. User expand "Detalles" tab
   └─ useEffect dispara:
      ├─ Fetch OMDb (si caché vacío)
      └─ Fetch Trakt scoreboard

3. Cached respuesta
   └─ No fetch repetidas si user navega / vuelve

4. User authentication → Trakt connect
   └─ Enabled "Mi valoración" con estrellas
   └─ Permite actualizar voto 1-10
```

#### **2. Gestión de Estado de Usuario (Favorito/Watchlist)**

**Problema:** TMDb requiere API session para favoritos, pero el flujo es lento.

**Solución:** Actualización optimista.

```javascript
// Componente: DetailHeaderBits.jsx → FavoriteWatchlistButtons.jsx

const handleToggleFavorite = async () => {
  // 1. INSTANTÁNEAMENTE actualizar UI
  setActiveFavorites(prev => ({
    ...prev,
    [id]: !prev[id]
  }))
  setLoadingState(prev => ({
    ...prev,
    [id]: true  // mostrar spinner
  }))
  
  // 2. En background: enviar a servidor
  try {
    const result = await markAsFavorite({
      mediaType: 'movie',
      mediaId: id,
      favorite: !activeFavorites[id]
    })
    
    // 3. Confirmación recibida: mantener estado (ya correcto)
    // 4. Si falla: revertir
  } catch (err) {
    setActiveFavorites(prev => ({
      ...prev,  
      [id]: !prev[id]  // revertir
    }))
  } finally {
    setLoadingState(prev => ({
      ...prev,
      [id]: false
    }))
  }
}

// Para el usuario: latencia CERO (actualización visual inmediata)
// Para servidor: petición llega cuando pueda (no bloquea UI)
```

#### **3. Integración Trakt (Watchlist Episódica)**

**Para películas:** simple (marcar película entera)

**Para series:** complejo (estado POR episodio)

```javascript
// Estructura de datos: watchedBySeason

const watchedBySeason = {
  "1": {
    "1": true,      // Temporada 1, Episodio 1: VISTO
    "2": true,      // Temporada 1, Episodio 2: VISTO
    "3": false,     // Temporada 1, Episodio 3: NO visto
    "4": false
  },
  "2": {
    "1": true,
    "2": false,
    ...
  }
}

// Origen: /api/trakt/show/watched (internamente llama a /sync/watched/shows)
// Transformación: respuesta plana de Trakt → indexación season/episode

// Interfaz de usuario:
// - Cada episodio: botón toggle visto/no visto
// - Botón "Marcar temporada entera": construye lista y envía lote
// - Indicador visual: fila de cuadraditos coloreados (visto = verde)
```

#### **4. Sistema de Caché OMDb**

**Challenge:** OMDb tiene límite de 1000 peticiones/día (plan free)

**Solución:** Caché multinivel

```javascript
// Nivel 1: sessionStorage (navegador)
// Clave: `omdb_${imdbId}`
// TTL: 24 horas
// Ventaja: sin servidor, sin petición de red

// Nivel 2: globalThis (proceso Node.js servidor)
// Caché en memoria en /api/omdb
// TTL: 24 horas (éxit) o 60s (fallo)
// Ventaja: reduce llamadas a OMDb de múltiples usuarios

// Nivel 3: Deduplicación en vuelo
// Objeto globalThis.__omdbInflight rastreia peticiones pendientes
// Si 5 usuarios solicitan imdbId=tt1234567 simultáneamente:
// - 1ª petición : realiza HTTP a OMDb
// - 2-5ª peticiones: espera resultado de 1ª
// - Todos reciben mismo resultado de UNA sola llamada HTTP

// Índice por imdbId (no tmdbId):
// ¿Por qué? Porque OMDb solo funciona con IMDb IDs
// Traducción: TMDb details incluyen external_ids.imdb_id
```

**Código:**
```javascript
// src/lib/details/omdbCache.js

const readOmdbCache = (imdbId) => {
  const cache = JSON.parse(sessionStorage.getItem('omdb_cache') || '{}')
  const entry = cache[imdbId]
  
  if (!entry) return null
  if (Date.now() - entry.timestamp > 86400000) {
    // Expirado (24h)
    delete cache[imdbId]
    sessionStorage.setItem('omdb_cache', JSON.stringify(cache))
    return null
  }
  
  return entry.data
}

const writeOmdbCache = (imdbId, data) => {
  const cache = JSON.parse(sessionStorage.getItem('omdb_cache') || '{}')
  cache[imdbId] = {
    data,
    timestamp: Date.now()
  }
  sessionStorage.setItem('omdb_cache', JSON.stringify(cache))
}

// Fetch con caché:
const fetchOmdbWithCache = async (imdbId) => {
  // 1. Intentar leer de sesión
  const cached = readOmdbCache(imdbId)
  if (cached) return cached
  
  // 2. Si no hay en caché: cargar en background (runIdle)
  runIdle(async () => {
    const data = await fetchOmdbByImdb(imdbId)
    if (data) writeOmdbCache(imdbId, data)
  })
  
  return null  // Retorna null, pero data llegará cuando esté lista
}
```

### 🎬 Seguimiento de Series (EpisodeDetailsClient.jsx)

**Para series:** la complejidad se multiplica por el número de episodios.

```javascript
// Ejemplo: Breaking Bad
// - 5 temporadas
// - 62 episodios totales
// - Cada episodio: checkbox visto/no visto
// - Cada episodio: rating 1-10
// - Cada episodio: puntuación comunidad TMDb

// Datos necesarios:
const seriesData = {
  seasons: [
    {
      seasonNumber: 1,
      episodeCount: 7,
      episodes: [
        { episodeNumber: 1, name: "...", rating: 8.7, overview: "...", },
        { episodeNumber: 2, name: "...", rating: 8.9, overview: "...", },
        ...
      ]
    },
    ...
  ]
}

// Estado en cliente:
const [watchedBySeason, setWatchedBySeason] = useState({
  "1": { "1": true, "2": true, "3": false, ... },
  "2": { "1": true, "2": false, ... },
  ...
})

// Interacción:
const markEpisodeWatched = async (seasonNum, episodeNum, watched) => {
  // 1. Actualizar UI optimista
  setWatchedBySeason(prev => ({
    ...prev,
    [seasonNum]: {
      ...prev[seasonNum],
      [episodeNum]: watched
    }
  }))
  
  // 2. Llamar a Trakt en background
  await traktSetEpisodeWatched(id, seasonNum, episodeNum, watched)
}

// Botón "Marcar temporada completa":
const markSeasonComplete = async (seasonNum) => {
  // Construir lista de episodios no marcados
  const toMark = Object.entries(watchedBySeason[seasonNum])
    .filter(([_, w]) => !w)
    .map(([epNum]) => epNum)
  
  // Enviar lote a Trakt (1 petición en lugar de N)
  // POST /sync/history con array de episodios
  await traktSetBatchEpisodesWatched(id, seasonNum, toMark)
}
```

### 🎨 Componente PosterStack.jsx

**Efecto visual especial:** stack de posters con efecto parallax al scroll

```javascript
// Implementación: 3D transforms + framer-motion

const PosterStack = ({ images, onImageSelect }) => {
  // images = array de URLs de posters
  // Rendizar: 5-7 posters "apilados"
  // Posicionamiento: cada uno ligeramente rotado y escalado
  
  // Efecto: al scroll, posters se "despliegan" visualmente
  // Usando: transform: translateZ, perspective, rotateY
  
  return (
    <div className="relative w-32 h-48 perspective">
      {images.map((img, idx) => (
        <motion.img
          key={idx}
          src={img}
          style={{
            position: 'absolute',
            top: idx * 16,
            left: idx * 8,
            rotate: -15 + idx * 3,  // Rotación progresiva
            zIndex: -idx,
          }}
          whileHover={{
            rotate: 0,
            scale: 1.1,
            zIndex: images.length,
          }}
          onClick={() => onImageSelect(img)}
        />
      ))}
    </div>
  )
}
```

### ✨ Características Avanzadas

**1. Enlace Plex local**
```javascript
// Si usuario configuró servidor Plex:
// - Detectar si contenido está en biblioteca
// - Botón "Ver en Plex" con enlace directo
// - Autenticación JWT con firma asimétrica

const handlePlexOpen = () => {
  // Construir URL Plex: plex://play?item={plexId}
  // O: abrir en web: https://localhost:32400/web
}
```

**2. Modal de videos (VideoModal.jsx)**
```javascript
// Muestra trailers / teasers en modal embebido YouTube
// Origen: TMDb /videos endpoint
// Filtrado por idioma (español preferentemente)

const videos = [
  { name: "Tráiler Oficial", key: "dQw4w9WgXcQ", type: "Trailer" },
  { name: "Clip Exclusivo", key: "...", type: "Clip" },
]

// Modal: iframe YouTube con aspect ratio 16:9
// Controles: reproducción, volumen, pantalla completa
```

---

## 3. Seguimiento por Episodio

### 📍 Ubicación

```
src/components/SeasonDetailsClient.jsx    # Detalle de temporada
src/components/EpisodeDetailsClient.jsx   # Detalle individual
src/components/EpisodeRatingsGrid.jsx     # Grid visual de ratings
src/app/details/tv/[id]/page.jsx          # Server component
```

### 🎯 Propósito

Para series, el seguimiento episódico es crítico. Un usuario puede haber visto 30 episodios de una serie de 100. El módulo gestiona:
- Estado de visionado (visto/no visto) POR EPISODIO
- Valoración PERSONAL (1-10) por episodio
- Valoración COMUNITARIA (TMDb) por episodio
- Visualización de progreso (grid de cuadraditos)
- Acciones por lote (marcar temporada entera)

### 🏗️ Arquitectura

#### **Flujo de datos**

```
Server Component: src/app/details/tv/[id]/page.jsx
│
└─ getSeriesDetails(id)
   ├─ GET /tv/{id} (metadatos serie)
   └─ GET /tv/{id}/credits (cast)
│
└─ getSeasonDetails(id, seasonNumber) x N temporadas
   ├─ GET /tv/{id}/season/{seasonNumber}
   │  └─ Array de episodios con metadatos
   │
   └─ getEpisodeRatings(id, seasonNumber, episodeNumber) x M episodios
      └─ GET /tv/{id}/season/{seasonNumber}/episode/{episodeNumber}
         └─ vote_average (TMDb)
│
└─ traktGetShowWatched(id) [IF AUTHENTICATED]
   └─ GET /sync/watched/shows/{id}
   └─ Transformar a: { season: { episode: true/false } }

Client Component: SeasonDetailsClient
├─ Recibir: seriesDetails, seasonDetails, watchedBySeason[], episodeRatings[]
├─ Renderizar: grid/lista de episodios
└─ Interacción: toggle watched, actualizar Trakt
```

#### **Estructura de datos**

```javascript
// watchedBySeason: Cómo se representa el estado de visionado

const watchedBySeason = {
  "1": {
    "1": false,     // S01E01: NO visto
    "2": true,      // S01E02: visto
    "3": true,      // S01E03: visto
    ...
  },
  "2": {
    "1": true,
    "2": false,
    ...
  },
  ...
}

// episodeRatings: Ratings de TMDb por episodio

const episodeRatings = {
  1: {              // Temporada 1
    1: 8.9,         // Episodio 1: 8.9/10
    2: 8.7,
    3: 8.5,
    ...
  },
  ...
}

// userRatings: Valoraciones personales del usuario (Trakt)

const userRatings = {
  "1": {
    "1": 9,         // Usuario votó 9/10 para S01E01
    ...
  },
  ...
}
```

#### **Interfaz de Usuario**

**Vista por temporada (SeasonDetailsClient.jsx):**
```jsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {episodes.map(ep => (
    <div 
      key={ep.id}
      className={`border rounded p-3 cursor-pointer transition ${
        watched[ep.episode_number] 
          ? 'bg-green-500/10 border-green-500' 
          : 'bg-gray-800 border-gray-700'
      }`}
      onClick={() => toggleEpisodeWatched(ep.episode_number)}
    >
      <div className="text-sm font-bold">EP {ep.episode_number}</div>
      <div className="text-xs text-gray-400">{ep.name}</div>
      <div className="text-xs mt-2">
        <StarIcon className="inline mr-1" />
        {episodeRatings[ep.episode_number].toFixed(1)}
      </div>
    </div>
  ))}
</div>

{/* Botón de acción de lote */}
<button onClick={() => markSeasonComplete(seasonNum)}>
  Marcar temporada completa como vista
</button>
```

**Grid visual de ratings (EpisodeRatingsGrid.jsx):**
```jsx
// Vista "mapa de calor" de toda la serie

<svg width="500" height="200">
  {/* Grid de cuadraditos */}
  {seasons.map((season, sIdx) => (
    seasonEpisodes.map((ep, eIdx) => (
      <rect
        key={`${sIdx}-${eIdx}`}
        x={eIdx * 12}
        y={sIdx * 12}
        width="10"
        height="10"
        fill={getColorByRating(episodeRatings[sIdx][eIdx])}
        // Verde (>8) → Amarillo (6-8) → Rojo (<6)
        onClick={() => handleEpisodeClick(sIdx, eIdx)}
      />
    ))
  ))}
</svg>

// Leyenda:
// Verde: rating ≥ 8.0
// Amarillo: 6.0-7.9
// Rojo: < 6.0
// Gris: sin datos
// Negro: visto (user remark)
```

#### **Carga de datos en paralelo**

```javascript
// Challenge: una serie puede tener 100+ episodios
// Naive: loadRatings para cada episodio secuencialmente = 100+ peticiones

// Optimización: Batch loading en paralelo

const loadAllEpisodeRatingsForSeries = async (seriesId) => {
  const seasonCount = series.number_of_seasons
  
  // Crear array de promesas (una por temporada)
  const seasonPromises = Array.from(
    { length: seasonCount },
    (_, sIdx) => 
      getSeasonDetails(seriesId, sIdx + 1)  // Retorna todos los episodios
  )
  
  // Ejecutar en paralelo (Promise.all)
  const seasons = await Promise.all(seasonPromises)
  
  // Resultado: todos los ratings en CASI el mismo tiempo que 1 petición
  // (latencia = petición más lenta, típicamente 300-400ms)
  
  // Transformar a estructura indexada
  const ratings = {}
  seasons.forEach((season, sIdx) => {
    ratings[sIdx + 1] = {}
    season.episodes.forEach(ep => {
      ratings[sIdx + 1][ep.episode_number] = ep.vote_average
    })
  })
  
  return ratings
}
```

### 🎯 Interactividad

#### **Toggle individual de episodio**

```javascript
const toggleEpisodeWatched = async (seasonNum, episodeNum) => {
  const currentState = watchedBySeason[seasonNum]?.[episodeNum] ?? false
  const newState = !currentState
  
  // 1. Actualizar UI INSTANTÁNEAMENTE
  setWatchedBySeason(prev => ({
    ...prev,
    [seasonNum]: {
      ...prev[seasonNum],
      [episodeNum]: newState
    }
  }))
  
  // 2. Enviar a Trakt en background
  try {
    await traktSetEpisodeWatched(
      seriesId,
      seasonNum,
      episodeNum,
      newState
    )
  } catch (err) {
    // Revertir si falla
    setWatchedBySeason(prev => ({
      ...prev,
      [seasonNum]: {
        ...prev[seasonNum],
        [episodeNum]: currentState
      }
    }))
    toast.error('Error al actualizar en Trakt')
  }
}
```

#### **Marcar temporada completa**

```javascript
const markSeasonComplete = async (seasonNum) => {
  // Construir lista de episodios NO marcados
  const toMark = Object.entries(watchedBySeason[seasonNum] || {})
    .filter(([_, watched]) => !watched)
    .map(([episodeNum]) => parseInt(episodeNum))
  
  if (toMark.length === 0) {
    toast.info('Todos los episodios ya están marcados')
    return
  }
  
  // Actualizar UI para todos los episodios
  setWatchedBySeason(prev => ({
    ...prev,
    [seasonNum]: {
      ...prev[seasonNum],
      ...toMark.reduce((acc, epNum) => {
        acc[epNum] = true
        return acc
      }, {})
    }
  }))
  
  // Enviar lote a Trakt (1 petición, no N)
  try {
    const episodesData = toMark.map(epNum => ({
      number: epNum,
      watched_at: new Date().toISOString()
    }))
    
    await traktSetBatchEpisodesWatched(
      seriesId,
      seasonNum,
      episodesData
    )
  } catch (err) {
    toast.error('Error al marcar temporada')
    // Revertir...
  }
}
```

---

## 4. Módulo de Favoritos

### 📍 Ubicación

```
src/app/favorites/page.jsx
src/components/lists/FavoritesClient.jsx  (~50-70 KB)
```

### 🎯 Propósito

Mostrar todas las películas y series que el usuario ha marcado como "favoritas" en su cuenta TMDb. Es la galería personal curada por el usuario.

### 🏗️ Arquitectura

#### **Flujo de datos**

```
Server Component: src/app/favorites/page.jsx
├─ Validar cookie session_id
└─ GET /account/{account_id}/favorite/movies + /favorite/tv
   ├─ Respuesta: { results: [], total_pages: 5, total_results: 127 }
   └─ Paginar: obtener TODAS las páginas en paralelo (máx 5 para rate-limit)

Client Component: FavoritesClient.jsx
├─ Recibir: array de favoritos (películas + series)
├─ Cache de puntuaciones (OMDb, Trakt): solo al hovear
├─ 3 vistas: Grid, List, Compact
├─ Ordenación: por fecha, título, año, rating
├─ Filtro: películas / series
└─ Acción: remover de favoritos (con modal confirmación)
```

#### **Paginación paralela**

```javascript
// Challenge: usuario tiene 200 favoritos, 20 por página = 10 páginas

const fetchAllFavoritesInParallel = async (sessionId) => {
  // 1. Fetch página 1 → conocer total_pages
  const page1 = await fetch(
    `/api?page=1`
  )
  const totalPages = page1.total_pages
  
  // 2. Si totalPages > 1: fetch páginas 2..N en paralelo
  const remainingPromises = Array.from(
    { length: totalPages - 1 },
    (_, i) => fetch(`/api?page=${i + 2}`)
  )
  
  const remainingPages = await Promise.all(remainingPromises)
  
  // 3. Combinar resultados
  const allFavorites = [
    ...page1.results,
    ...remainingPages.flatMap(p => p.results)
  ]
  
  return allFavorites
}
```

**Ventaja:** 10 páginas se obtienen en el tiempo de ~2-3 peticiones (paralelo)  
**Desventaja:** Rate-limiting de TMDb (40 peticiones/10s)  
**Solución:** Limitar a max 5 peticiones paralelas

```javascript
// Limitar concurrencia: runPool con máximo de workers

const runPool = (items, limit, worker) => {
  return new Promise((resolve, reject) => {
    let index = 0, active = 0, results = []
    
    const run = async () => {
      while (index < items.length && active < limit) {
        active++
        const i = index++
        try {
          results[i] = await worker(items[i], i)
        } catch (err) {
          return reject(err)
        } finally {
          active--
          if (index < items.length) run()
          else if (active === 0) resolve(results)
        }
      }
    }
    
    run()
  })
}

// Uso:
const favorites = await runPool(items, 5, async (item) => {
  return {
    ...item,
    omdbData: await fetchOmdbByImdb(item.imdbId),
    traktScore: await fetchTraktScore(item.traktId)
  }
})
```

#### **3 Vistas**

**1. Grid (por defecto)**
```jsx
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
  {favorites.map(fav => (
    <Card
      poster={fav.poster_path}
      title={fav.title}
      year={fav.year}
      rating={fav.vote_average}
    />
  ))}
</div>
```

**2. List** (vista horizontal)
```jsx
<div className="space-y-2">
  {favorites.map(fav => (
    <div className="flex gap-4 p-3 bg-gray-800 rounded">
      <img src={fav.poster} className="w-20 h-32" />
      <div className="flex-1">
        <div className="font-bold">{fav.title}</div>
        <div className="text-sm text-gray-400">{fav.overview}</div>
        <div className="flex gap-2 mt-2">
          <Badge>{fav.year}</Badge>
          <Badge>{fav.genres.join(', ')}</Badge>
        </div>
      </div>
    </div>
  ))}
</div>
```

**3. Compact** (lista densa)
```jsx
<div className="space-y-1">
  {favorites.map(fav => (
    <div className="flex items-center justify-between px-2 py-1 text-sm hover:bg-gray-800">
      <span>{fav.title}</span>
      <span className="text-gray-500">{fav.year}</span>
    </div>
  ))}
</div>
```

**Persistencia de selección:**
```javascript
// Guardar en localStorage
useEffect(() => {
  localStorage.setItem(
    'showverse:view:favorites',
    viewMode  // 'grid' | 'list' | 'compact'
  )
}, [viewMode])

// Recuperar al montar
useEffect(() => {
  const saved = localStorage.getItem('showverse:view:favorites')
  if (saved) setViewMode(saved)
}, [])
```

#### **Caché de Puntuaciones**

**Challenge:** cargar OMDb y Trakt para 200 favoritos = 400 peticiones

**Solución:** Lazy loading al hovear

```javascript
// scoreCache.js: múltiples niveles

const [scoreCache, setScoreCache] = useState({})

const ensureScoreLoaded = async (tmdbId, traktId, imdbId) => {
  const cacheKey = `${tmdbId}`
  
  // Ya cacheado: retorna inmediatamente
  if (scoreCache[cacheKey]) return scoreCache[cacheKey]
  
  // Marcar como "loading"
  setScoreCache(prev => ({
    ...prev,
    [cacheKey]: { loading: true }
  }))
  
  // Fetch en paralelo
  const [omdbData, traktScore] = await Promise.all([
    fetchOmdbByImdb(imdbId),
    fetchTraktScoreboard(traktId),
  ])
  
  // Cachear resultado
  setScoreCache(prev => ({
    ...prev,
    [cacheKey]: {
      omdb: omdbData,
      trakt: traktScore,
      loading: false,
      timestamp: Date.now()
    }
  }))
}

// En componente:
const handleCardHover = (tmdbId) => {
  ensureScoreLoaded(tmdbId)  // Disparar carga
}
```

#### **Eliminar de Favoritos**

```javascript
const handleRemoveFavorite = async (tmdbId) => {
  // Mostrar confirmación
  if (!confirm('¿Eliminar de favoritos?')) return
  
  try {
    await markAsFavorite({
      mediaType: 'movie',  // o 'tv'
      mediaId: tmdbId,
      favorite: false
    })
    
    // Actualizar lista local
    setFavorites(prev => 
      prev.filter(f => f.id !== tmdbId)
    )
  } catch (err) {
    toast.error('Error al eliminar')
  }
}
```

---

## 5. Módulo de Pendientes (Watchlist)

### 📍 Ubicación

```
src/app/watchlist/page.jsx
src/components/lists/WatchlistClient.jsx  (~50-70 KB)
```

### 🎯 Propósito

Análogo a Favoritos, pero para contenido "pendiente por ver". Es la lista de deseos del usuario en TMDb.

### 🏗️ Arquitectura

**Prácticamente idéntica a Favoritos:**
- Misma estructura de 3 vistas (Grid, List, Compact)
- Mismo sistema de caché de puntuaciones
- Mismo flujo de paginación paralela
- Único cambio: endpoint `/account/{id}/watchlist/movies|tv`

**Difference clave:**
```javascript
// Favoritos: películas/series que YA has disfrutado
// Watchlist: películas/series que QUIERES ver

// API Endpoints:
endpoint.favorites = '/account/{id}/favorite/movies'    // Has visto
endpoint.watchlist = '/account/{id}/watchlist/movies'   // Quiero ver

// Ordenación adicional en Watchlist: por prioridad (custom sorting)
// Los usuarios suelen ordenar watchlist por "qué veo primero"
```

---

## 6. Historial de Visionado

### 📍 Ubicación

```
src/app/history/page.jsx
src/components/HistoryClient.jsx  (~60 KB)
```

### 🎯 Propósito

Mostrar todas las películas y series que el usuario ha marcado como "visto" en Trakt, con fecha y hora de visionado.

### 🏗️ Arquitectura

**Diferencia fundamental vs Favoritos/Watchlist:**
- Favoritos: datos de TMDb (favoritos TMDb)
- Historial: datos de Trakt (visionados Trakt)

**Ventaja de Trakt:**
```javascript
// Trakt proporciona:
// - Fecha exacta de visionado (ISO 8601)
// - Hora del visionado
// - Para series: episodio exacto

// TMDb NO proporciona todo esto (solo "favorito" sí/no)
```

#### **Flujo de datos**

```
Server Component:
├─ Validar autenticación Trakt
└─ GET /sync/history (endpoint Trakt)
   └─ Respuesta: array de visionados con timestamps

Client Component:
├─ Recibir: historial completo
├─ Transformar IDs Trakt → TMDb IDs (para posters, etc)
├─ Enriquecer con datos TMDb en paralelo
└─ 3 vistas: Grid, List, Compact
   └─ Mostrar: fecha de visionado, título, etc
```

#### **Enriquecimiento de datos**

```javascript
// Trakt solo devuelve IDs de Trakt
// Necesitamos: poster, backdrop, sinopsis de TMDb

const enrichHistoryWithTmdb = async (traktItems) => {
  // Extraer TMDb IDs de los visionados Trakt
  const tmdbIds = traktItems.map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb)
  
  // Fetch TMDb en paralelo (max 5 concurrent)
  const enriched = await runPool(
    tmdbIds,
    5,
    async (tmdbId) => {
      const tmdbData = await getDetails('movie', tmdbId)
      return {
        ...traktItem,
        tmdbData,  // poster, backdrop, etc
      }
    }
  )
  
  return enriched
}
```

#### **Ordenación por fecha**

```javascript
// Trakt devuelve en orden ↓ fecha (más reciente primero)

const sortHistoryByDate = (items, direction = 'desc') => {
  return items.sort((a, b) => {
    const dateA = new Date(a.watched_at)
    const dateB = new Date(b.watched_at)
    
    return direction === 'desc' 
      ? dateB - dateA  // Más reciente primero
      : dateA - dateB  // Más antiguo primero
  })
}
```

---

## Continuará en próximos módulos...

*Esta documentación está dividida en partes para mayor claridad. Los módulos 7-15 se documentarán con el mismo nivel de profundidad en la continuación.*

---

## Arquitectura de Datos Transversal

### 🔄 Flujo de datos global

La aplicación sigue una arquitectura clásica de tres capas:

```
┌─────────────────────────────────────────────┐
│          CAPA DE PRESENTACIÓN               │
│  (React Components + Tailwind CSS)          │
│  ├─ Pages (page.jsx)                        │
│  ├─ Client Components (*Client.jsx)         │
│  └─ UI Components (Button, Card, etc)       │
└─────────────────────────────────────────────┘
                      ↑↓
┌─────────────────────────────────────────────┐
│     CAPA DE LÓGICA DE NEGOCIO               │
│  (Hooks, Context, Utilidades)               │
│  ├─ src/lib/api/*.js (clientes API)         │
│  ├─ src/lib/hooks/*.js (custom hooks)       │
│  ├─ src/lib/utils/*.js (funciones utiles)   │
│  └─ src/context/*.jsx (contextos React)     │
└─────────────────────────────────────────────┘
                      ↑↓
┌─────────────────────────────────────────────┐
│    CAPA DE DATOS (APIs Externas)            │
│  TMDb, Trakt, OMDb, Plex, JustWatch        │
│  └─ Acceso mediante API Routes (/api/*)    │
└─────────────────────────────────────────────┘
```

### 🔌 Integraciones de APIs

**TMDb (The Movie Database)**
- Base de datos de películas/series
- Puntuaciones comunitarias
- Posters y backdrops de alta calidad
- Información técnica (directores, guionistas, presupuestos)

**Trakt.tv**
- Historial personal de visionado
- Favoritos y watchlists del usuario
- Estadísticas personalizadas
- Puntuaciones comunitarias
- Valoraciones personales

**OMDb (Open Movie Database)**
- Rating de IMDb (TMDb no lo proporciona)
- Información adicional (premios, duraciones)
- Ratings de Rotten Tomatoes y Metacritic

**Plex**
- Biblioteca de contenido local del usuario
- Autenticación JWT
- Links directos a contenido en servidor

**JustWatch (no oficial)**
- Disponibilidad en plataformas de streaming
- Enlaces a plataformas (Netflix, HBO, etc)

### 📊 Patrones de caché

**Nivel 1: Next.js DSR (Data Stale-While-Revalidate)**
```javascript
export const revalidate = 3600  // 1 hora
// Datos "estables" (trending, top rated) se cachean en servidor
// Reducen peticiones a APIs externas
```

**Nivel 2: SessionStorage (Navegador)**
```javascript
// Datos de sesión del usuario: favoritos, watchlist, ratings
// TTL: 24 horas
// Reducen peticiones entre páginas
```

**Nivel 3: Deduplicación en vuelo**
```javascript
// Si 5 usuarios solicitan ítem X simultáneamente:
// globalThis.__inflightRequests[key]
// - 1ª: realiza fetch
// - 2-5: espera resultado de 1ª
// - Todos reciben resultado en 1 petición
```

---

**Fin de la documentación (Parte 1de 2)**

*Continuar para módulos 7-15: En Progreso, Estadísticas, Calendario, Biblioteca, Descubrir, Listas, y Navegación*
