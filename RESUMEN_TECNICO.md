# 📋 THE SHOW VERSE - Resumen Técnico/Funcional

> **Última actualización:** Enero 2026  
> **Versión:** 0.1.0  
> **Enfoque:** Arquitectura, código y aspectos funcionales

---

## 🎯 Descripción General

**The Show Verse** es una aplicación web moderna construida con Next.js 16 que permite descubrir, organizar y hacer seguimiento de películas y series. La aplicación integra múltiples APIs externas (TMDb, Trakt.tv, OMDb) y ofrece sincronización completa con Trakt.tv para mantener listas, historial y ratings persistentes.

---

## 🏗️ Stack Tecnológico Core

### Framework y Runtime

- **Next.js 16.0.7** - App Router con Server/Client Components
- **React 19.2.1** - Biblioteca UI con nuevas características de Server Components
- **Turbopack** - Bundler de desarrollo ultra-rápido
- **Node.js Runtime** - Ejecución servidor para API Routes

### Estilos y Animaciones

- **Tailwind CSS 4.0** - Framework CSS utility-first
- **Framer Motion 12.6.5** - Animaciones declarativas y gestos
- **Lucide React** - Iconos modernos y optimizados
- **tailwind-scrollbar** - Scrollbars personalizados

### Carruseles y UI

- **Swiper 8.4.7** - Carruseles táctiles avanzados
- **React Calendar 5.1.0** - Selector de fechas
- **React Day Picker 9.11.1** - Calendario de eventos

### Utilidades

- **date-fns 2.30.0** - Manipulación de fechas
- **@vercel/analytics** - Métricas y análisis
- **@vercel/speed-insights** - Monitorización de rendimiento

---

## 🌐 Arquitectura de APIs (Multi-fuente)

### 1. TMDb API (The Movie Database)

**Ubicación:** [`src/lib/api/tmdb.js`](src/lib/api/tmdb.js)

#### Características Principales

- **Cliente unificado** con función `buildUrl()` y `tmdb()`
- **Timeout inteligente:** 4s en servidor, 8s en cliente
- **Caching ISR automático:**
  - Servidor: `cache: 'force-cache'` + `revalidate: 600` (10 minutos)
  - Cliente: `cache: 'no-store'` (control browser nativo)
- **Gestión de errores:** detecta 404/status_code 34 sin ruido en logs
- **AbortController:** cancela requests en timeout sin errores en consola

#### Endpoints Principales

```javascript
// Ejemplos de uso:
tmdb("/movie/popular", { page: 1 });
tmdb("/tv/top_rated", { language: "es-ES" });
tmdb("/search/multi", { query: "matrix" });
tmdb("/person/{id}", {}, { cache: "no-store" }); // Override cache
```

#### Módulos Especializados

- **movies.js** - Películas populares, trending, detalles
- **tv.js** - Series, temporadas, episodios
- **people.js** - Actores, directores, biografías
- **tmdbLists.js** - Listas de TMDb, favoritos, watchlist

---

### 2. Trakt.tv API (Sincronización y Social)

**Ubicación:** [`src/lib/api/traktClient.js`](src/lib/api/traktClient.js) + [`src/lib/trakt/`](src/lib/trakt/)

#### Sistema de Autenticación OAuth 2.0

**Hook del Cliente:** [`useTraktAuth.js`](src/lib/trakt/useTraktAuth.js)

```javascript
// Características:
- Storage key versionado: 'trakt.auth.v1'
- Detección de expiración: 60s skew antes de expirar
- Refresh automático con tokensRef (useRef para última versión)
- Hidratación diferida: evita mismatch SSR/Client
```

**API del Servidor:** [`src/lib/trakt/server.js`](src/lib/trakt/server.js)

```javascript
// Funciones principales:
- getValidTraktToken(cookieStore) → valida y refresca tokens
- setTraktCookies(response, tokens) → persiste en HttpOnly cookies
- clearTraktCookies(response) → limpia sesión
- traktApi(endpoint, options) → cliente autenticado
```

**Endpoint de Estado:** [`src/app/api/trakt/auth/status/route.js`](src/app/api/trakt/auth/status/route.js)

```javascript
GET /api/trakt/auth/status
→ { connected: true/false, user: {...} }
```

#### Normalización de Fechas

```javascript
// Para watchlist/visto (YYYY-MM-DD)
normalizeWatchedAtForApi(input) → "2026-01-28" | null

// Para historial (ISO completo)
normalizeWatchedAtForHistoryApi(input) → "2026-01-28T12:34:56.000Z" | null
```

#### Endpoints Críticos de Trakt

**Estados y Acciones:**

```javascript
POST / api / trakt / item / watched; // Marcar visto/no visto
POST / api / trakt / item / watchlist; // Añadir/quitar de watchlist
POST / api / trakt / item / rating; // Puntuar contenido (1-10)
GET / api / trakt / item / status; // Estado del item (visto/rating/watchlist)
```

**Historial:**

```javascript
POST / api / trakt / item / history; // Legacy endpoint
POST / api / trakt / item / history / add; // Añadir al historial con fecha
POST / api / trakt / item / history / remove; // Eliminar del historial
POST / api / trakt / item / history / update; // Actualizar fecha de visionado
```

**Series (Episodios):**

```javascript
POST / api / trakt / show / [tmdbId] / episode; // Marcar episodio específico
GET / api / trakt / show / [tmdbId] / watched - episodes; // Episodios vistos de serie
GET / api / trakt / show / watched; // Todas las series vistas
GET / api / trakt / show / plays; // Historial de reproducciones
POST / api / trakt / show / plays; // Añadir reproducción
```

**Estadísticas:**

```javascript
GET / api / trakt / stats; // Estadísticas del usuario
GET / api / trakt / scoreboard; // Scoreboard agregado (películas/series)
GET / api / trakt / ratings; // Todos los ratings del usuario
POST / api / trakt / ratings; // Batch rating update
```

**Listas:**

```javascript
GET / api / trakt / lists; // Listas personales
GET / api / trakt / lists / [username] / [listId]; // Detalle de lista específica
GET / api / trakt / list - items; // Items de una lista
```

**Sync y Playback:**

```javascript
GET / api / trakt / sync / playback; // Contenido en progreso (continue watching)
```

---

### 3. OMDb API

**Propósito:** Obtener ratings externos agregados (IMDb, Rotten Tomatoes, Metacritic)

**Ubicación:** [`src/lib/api/omdb.js`](src/lib/api/omdb.js)

---

### 4. APIs Auxiliares

#### Artwork Override

**Endpoint:** [`src/lib/artworkApi.js`](src/lib/artworkApi.js)

- Sobrescribe artwork de TMDb con versiones custom de `artwork-overrides.json`

#### Enlaces Externos

```javascript
GET / api / links / justwatch; // Dónde ver (streaming disponible)
GET / api / links / letterboxd; // Perfil Letterboxd
GET / api / links / imdb; // Enlace IMDb
GET / api / trakt / official - site; // Sitio oficial
```

#### TV Ratings

```javascript
GET / api / tv / [id] / ratings; // Ratings por episodio/temporada
```

---

## 🔐 Sistema de Autenticación Dual

### 1. Autenticación TMDb

**Context Global:** [`src/context/AuthContext.jsx`](src/context/AuthContext.jsx)

```javascript
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)      // session_id de TMDb
  const [account, setAccount] = useState(null)      // Datos de usuario
  const [hydrated, setHydrated] = useState(false)   // SSR safety flag

  // Persistencia: localStorage + document.cookie
  const login = ({ session_id, account }) => {...}
  const logout = () => {...}
}
```

#### Hook de Uso

```javascript
const { session, account, login, logout, hydrated } = useAuth();

// Esperar hidratación antes de renderizar contenido dependiente:
if (!hydrated) return <Loading />;
```

#### Propósito

- Favoritos de TMDb
- Watchlist de TMDb
- Ratings en TMDb
- Listas personales de TMDb

---

### 2. Autenticación Trakt OAuth 2.0

**Hook del Cliente:** [`src/lib/trakt/useTraktAuth.js`](src/lib/trakt/useTraktAuth.js)

```javascript
export function useTraktAuth() {
  const [tokens, setTokens] = useState(null);
  const [ready, setReady] = useState(false);

  // Lee localStorage SOLO tras montar (evita hydration mismatch)
  useEffect(() => {
    const stored = safeReadStored();
    if (stored?.access_token) setTokens(stored);
    setReady(true);
  }, []);

  const getValidAccessToken = async () => {
    if (isExpired(tokensRef.current)) {
      const refreshed = await refresh();
      return refreshed?.access_token;
    }
    return tokensRef.current?.access_token;
  };

  return {
    isConnected,
    ready,
    tokens,
    setTokens,
    getValidAccessToken,
    disconnect,
    refresh,
  };
}
```

#### Flujo de Autenticación

1. **Inicio:** Usuario hace clic en "Conectar con Trakt"
2. **Redirect:** `/api/trakt/oauth/authorize` → Trakt.tv
3. **Callback:** Trakt redirige a `/api/trakt/oauth/callback?code=...`
4. **Exchange:** Backend intercambia code por access_token + refresh_token
5. **Persistencia:** Tokens en localStorage (cliente) + HttpOnly cookies (servidor)
6. **Refresh:** Automático 60s antes de expiración

#### Validación Server-Side

[`src/lib/trakt/server.js`](src/lib/trakt/server.js) - función `getValidTraktToken()`

```javascript
export async function getValidTraktToken(cookieStore) {
  const stored = readTokensFromCookies(cookieStore);

  if (!stored?.access_token) {
    return { token: null, shouldClear: true };
  }

  if (isExpired(stored)) {
    const refreshed = await refreshTokens(stored.refresh_token);
    if (!refreshed) return { token: null, shouldClear: true };
    return { token: refreshed.access_token, refreshedTokens: refreshed };
  }

  return { token: stored.access_token };
}
```

---

## 🛣️ Middleware de SEO

**Ubicación:** [`src/middleware.js`](src/middleware.js)

### Propósito

Generar metadata server-rendered para bots de redes sociales (WhatsApp, Facebook, Twitter, Discord, etc.)

### Funcionamiento

```javascript
const BOT_UA =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|.../i;

export function middleware(req) {
  const ua = req.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) return NextResponse.next();

  // Rewrite interno: /details/movie/123 → /s/movie/123
  // La ruta /s/* tiene metadata pre-renderizada para bots
}
```

### Rutas Afectadas

- `/details/movie/{id}` → `/s/movie/{id}`
- `/details/tv/{id}` → `/s/tv/{id}`
- `/details/person/{id}` → `/s/person/{id}`

### Beneficios

✅ Previews enriquecidos al compartir enlaces  
✅ Open Graph tags correctos  
✅ Twitter Cards funcionales  
✅ Sin impacto en usuarios normales

---

## 📁 Estructura del Proyecto

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (Backend)
│   │   ├── trakt/               # 20+ endpoints Trakt
│   │   ├── tmdb/                # Proxy TMDb
│   │   ├── links/               # Enlaces externos
│   │   ├── tv/                  # TV ratings
│   │   └── ...
│   ├── auth/                     # Callbacks OAuth
│   ├── calendar/                 # Vista calendario
│   ├── details/[type]/[id]/     # Páginas de detalles
│   ├── discover/                 # Explorar contenido
│   ├── favorites/                # Favoritos TMDb
│   ├── history/                  # Historial Trakt
│   ├── lists/                    # Listas (TMDb + Trakt)
│   ├── movies/                   # Catálogo películas
│   ├── series/                   # Catálogo series
│   ├── s/                        # SEO-optimized routes (bots)
│   ├── watchlist/                # Watchlist TMDb
│   └── ...
│
├── components/                   # Componentes React
│   ├── auth/                    # Login, Avatar
│   ├── details/                 # Componentes de detalles
│   ├── lists/                   # Componentes de listas
│   ├── trakt/                   # Integración Trakt
│   ├── DetailsClient.jsx        # Cliente principal detalles
│   ├── LiquidButton.jsx         # Botón animado custom
│   ├── Navbar.jsx               # Navegación principal
│   └── ...
│
├── context/
│   └── AuthContext.jsx          # Context global TMDb auth
│
├── lib/                         # Lógica de negocio
│   ├── api/                     # Clientes API
│   │   ├── tmdb.js             # Cliente TMDb
│   │   ├── traktClient.js      # Cliente Trakt (browser)
│   │   ├── movies.js           # Helpers movies
│   │   ├── tv.js               # Helpers TV
│   │   └── ...
│   ├── trakt/                   # Lógica Trakt
│   │   ├── useTraktAuth.js     # Hook autenticación
│   │   └── server.js           # Utils server-side
│   ├── details/                 # Utilidades detalles
│   ├── hooks/                   # Custom hooks
│   └── utils/                   # Utilidades generales
│
└── middleware.js                # Middleware Next.js (SEO)
```

---

## ⚙️ Componentes Funcionales Clave

### 🎬 Detalles de Contenido

#### `DetailsClient.jsx`

**Página universal** para mostrar detalles de películas, series y personas.

**Características:**

- Fetching paralelo: TMDb + Trakt + OMDb + enlaces externos
- Tabs dinámicos: Overview, Cast, Videos, Similar, Seasons (TV)
- Integración completa con Trakt (visto, rating, watchlist)
- Animaciones scroll-triggered con Intersection Observer

#### `AnimatedSection.jsx`

**Secciones con animaciones** basadas en scroll.

```javascript
// Uso:
<AnimatedSection variant="fade-up" delay={0.2}>
  <Content />
</AnimatedSection>
```

#### `ScoreboardBar.jsx`

**Agregación de ratings** de múltiples fuentes:

- TMDb (vote_average)
- Trakt (user rating)
- IMDb (vía OMDb)
- Rotten Tomatoes (vía OMDb)
- Metacritic (vía OMDb)

#### `VideoModal.jsx`

**Modal de video** para trailers/clips con iframe YouTube.

#### `DetailHeaderBits.jsx`

**Header dinámico** con:

- Poster + backdrop con gradiente
- Título + año + géneros
- Runtime + certification
- Tagline + overview
- Botones de acción (favoritos, watchlist, rating)

---

### 📋 Listas y Colecciones

#### `UnifiedListDetailsLayout.jsx`

**Wrapper genérico** para todas las listas (TMDb collections + Trakt lists).

**Props:**

```javascript
{
  title: string,
  description: string,
  items: Array,
  totalItems: number,
  isLoading: boolean,
  error: string | null
}
```

#### `TraktListDetailsClient.jsx`

**Renderizador** de listas personalizadas de Trakt.

**Funcionalidades:**

- Paginación infinita
- Filtros por tipo (movies/shows)
- Ordenación configurable

#### `CollectionDetailsClient.jsx`

**Renderizador** de colecciones de TMDb (ej: Marvel Cinematic Universe).

---

### 🔗 Integración Trakt

#### `TraktConnectButton.jsx`

**Botón de conexión** con Trakt.tv.

```javascript
const { isConnected, ready, setTokens, disconnect } = useTraktAuth();

const handleConnect = async () => {
  const authUrl = await fetch("/api/trakt/oauth/authorize").then((r) =>
    r.text(),
  );
  window.location.href = authUrl;
};
```

#### `TraktActions.jsx`

**Botones de acción** principales:

- 👁️ Marcar como visto/no visto
- ⭐ Puntuar (1-10)
- 📚 Añadir/quitar de watchlist

**Actualización optimista:**

```javascript
const handleWatched = async () => {
  setLocalState(true); // UI instantánea
  const result = await markAsWatched(id, type);
  if (!result.ok) setLocalState(false); // Rollback si falla
};
```

#### `TraktWatchedModal.jsx`

**Modal para series:** seleccionar episodios vistos por temporada.

**Características:**

- Grid visual de episodios
- Marcar temporada completa
- Desmarcar episodios individuales
- Sincronización inmediata con Trakt

#### `TraktEpisodesWatchedModal.jsx`

**Modal de historial** de reproducciones de episodios con fechas.

#### `TraktContinueWatching.jsx`

**Carrusel "Continuar viendo"** basado en `/sync/playback` de Trakt.

```javascript
const { isConnected, getValidAccessToken } = useTraktAuth();

useEffect(() => {
  if (!isConnected) return;
  fetch("/api/trakt/sync/playback").then((items) => setPlayback(items));
}, [isConnected]);
```

#### `TraktHistoryNavButton.jsx`

**Botón navbar** que verifica autenticación server-side antes de navegar.

---

### 🎨 UI Components

#### `LiquidButton.jsx`

**Botón con efecto líquido** animado (Framer Motion).

**Variantes:**

- `default` - Azul estándar
- `success` - Verde
- `danger` - Rojo
- `ghost` - Transparente

```javascript
<LiquidButton onClick={handleClick} variant="success" icon={<CheckIcon />}>
  Guardar
</LiquidButton>
```

#### `StarRating.jsx`

**Selector de rating** interactivo (1-10 estrellas).

#### `FavoriteWatchlistButtons.jsx`

**Botones TMDb** para favoritos y watchlist.

#### `Navbar.jsx`

**Navegación principal** con:

- Links a secciones (Movies, Series, Discover, etc.)
- Buscador global
- Botones de autenticación (TMDb + Trakt)
- Avatar de usuario

#### `CarruselIndividual.jsx`

**Carrusel horizontal** con Swiper.

**Configuración:**

```javascript
{
  slidesPerView: 'auto',
  spaceBetween: 16,
  breakpoints: {
    640: { slidesPerView: 2 },
    1024: { slidesPerView: 4 },
    1536: { slidesPerView: 6 }
  }
}
```

---

## 🔄 Gestión de Estado

### 1. **React Context API**

- `AuthContext` - Sesión TMDb global
- Provider en [`src/app/layout.jsx`](src/app/layout.jsx)

### 2. **localStorage**

- Tokens Trakt: `trakt.auth.v1`
- Sesión TMDb: `tmdb_session`, `tmdb_account`
- Preferencias UI (opcional)

### 3. **URL State (Query Params)**

- Filtros discover: `/discover?genre=28&year=2024`
- Búsqueda: `/search?q=matrix`
- Paginación: `/movies?page=2`

### 4. **React State (Local)**

- Modals (open/close)
- Formularios
- UI temporal (loaders, errors)
- Carruseles (slide activo)

### 5. **Server State (Cookies)**

- TMDb session_id (HttpOnly)
- Trakt tokens (HttpOnly, seguro)

---

## ⚡ Optimizaciones Críticas

### 1. **ISR (Incremental Static Regeneration)**

```javascript
// En servidor (TMDb client):
{
  cache: 'force-cache',
  next: { revalidate: 600 }  // 10 minutos
}
```

**Beneficios:**

- Primera carga instantánea (cache CDN)
- Revalidación background cada 10 min
- Reduce carga en API de TMDb

### 2. **Fetching Paralelo**

```javascript
useEffect(() => {
  Promise.all([
    fetchTMDbDetails(id),
    fetchTraktStatus(id),
    fetchOMDbRatings(imdbId),
    fetchExternalLinks(id),
  ]).then(([tmdb, trakt, omdb, links]) => {
    // Render todo junto
  });
}, [id]);
```

### 3. **Lazy Hydration**

```javascript
const { hydrated } = useAuth();
if (!hydrated) return null; // Evita mismatch SSR

return <UserContent account={account} />;
```

### 4. **AbortController (Timeouts)**

```javascript
const controller = new AbortController();
setTimeout(() => controller.abort(), 4000);

fetch(url, { signal: controller.signal }).catch((e) => {
  if (e.name === "AbortError") {
    // Silencioso, no logueamos
    return null;
  }
  throw e;
});
```

### 5. **Image Optimization (Next.js)**

```javascript
import Image from "next/image";

<Image
  src={posterPath}
  width={300}
  height={450}
  loading="lazy"
  placeholder="blur"
  blurDataURL={blurhash}
/>;
```

### 6. **Code Splitting**

- Next.js automático por rutas
- Dynamic imports para modals pesados:

```javascript
const VideoModal = dynamic(() => import("./VideoModal"), {
  loading: () => <Spinner />,
});
```

---

## 🚀 Features Funcionales Destacables

### ✅ Sincronización Bi-direccional Trakt

**Flujo:**

1. Usuario marca película como vista en The Show Verse
2. `POST /api/trakt/item/watched` → API Trakt
3. Trakt actualiza su base de datos
4. Cambio reflejado en todas las plataformas conectadas a Trakt
5. UI actualizada con estado confirmado

### ✅ Ratings Agregados Multi-fuente

**Combina:**

- TMDb: vote_average (0-10) + vote_count
- Trakt: user rating (1-10) personal
- IMDb: rating (0-10) + votos (vía OMDb)
- Rotten Tomatoes: Tomatometer % + audiencia % (vía OMDb)
- Metacritic: Metascore (0-100, vía OMDb)

**Renderizado:**

```javascript
<ScoreboardBar
  tmdb={{ score: 8.5, votes: 12000 }}
  imdb={{ score: 8.8, votes: 500000 }}
  rt={{ critics: 95, audience: 89 }}
  metacritic={82}
  userRating={9} // Trakt personal
/>
```

### ✅ Continue Watching (Playback Progress)

**Endpoint Trakt:** `/sync/playback`

**Datos devueltos:**

```javascript
{
  progress: 65,        // Porcentaje visto
  paused_at: "2026-01-28T10:30:00Z",
  type: "episode",
  episode: { season: 2, number: 5 },
  show: { title: "Breaking Bad", ... }
}
```

**Renderizado:**

- Carrusel "Continuar viendo" en dashboard
- Barra de progreso visual
- Click → redirige a página de episodio

### ✅ Historial con Fechas (Timestamp Tracking)

**Permite:**

- Marcar cuándo viste algo específicamente
- Re-watch tracking (múltiples visionados)
- Exportar historial completo

**Normalización:**

```javascript
// Input: "28/01/2026" o Date object o ISO string
// Output API: "2026-01-28T00:00:00.000Z"
normalizeWatchedAtForHistoryApi(input);
```

### ✅ Watchlist Compartida (Cross-device)

**Sincronización:**

- Añadir en web → ver en mobile app (Trakt oficial)
- Añadir en app externa → ver en The Show Verse
- Tiempo real (refresco al montar página)

### ✅ SEO Dinámico para Redes Sociales

**Metadata generada:**

```html
<!-- Cuando bot detectado en /details/movie/550 -->
<meta property="og:title" content="Fight Club (1999)" />
<meta property="og:description" content="An insomniac..." />
<meta property="og:image" content="https://image.tmdb.org/.../poster.jpg" />
<meta property="og:type" content="video.movie" />
<meta name="twitter:card" content="summary_large_image" />
```

### ✅ Multi-idioma (Preparado)

```javascript
// Por defecto español:
tmdb("/movie/550", { language: "es-ES" });

// Fácil expandir:
const locale = useLocale(); // Hook futuro
tmdb("/movie/550", { language: locale });
```

---

## 🔐 Seguridad

### Tokens y Secretos

- **API Keys:** Variables de entorno (`NEXT_PUBLIC_TMDB_API_KEY`, etc.)
- **Trakt Secrets:** Solo server-side (`TRAKT_CLIENT_SECRET`)
- **Cookies HttpOnly:** Tokens Trakt no accesibles desde JS

### CORS y Proxy

- Todas las llamadas API desde servidor (API Routes)
- Cliente solo llama a endpoints internos `/api/*`
- Evita exponer API keys en bundle cliente

### Validación Server-Side

```javascript
// Ejemplo: validar sesión TMDb antes de modificar favoritos
export async function POST(request) {
  const session_id = request.cookies.get("tmdb_session");
  if (!session_id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Proceder con lógica...
}
```

---

## 📊 Flujo de Trabajo Típico

### Caso de Uso: Ver detalles de película y marcar como vista

1. **Usuario navega:** `/details/movie/550` (Fight Club)

2. **Servidor (SSR):**

   ```javascript
   // page.jsx Server Component
   const details = await tmdb(`/movie/550`); // Cache hit si <10min
   return <DetailsClient initialData={details} />;
   ```

3. **Cliente (Hidratación):**

   ```javascript
   // DetailsClient.jsx
   useEffect(() => {
     // Fetches paralelos en cliente:
     Promise.all([
       fetchTraktStatus(550), // ¿Ya vista?
       fetchOMDbRatings(imdbId), // Ratings externos
       fetchExternalLinks(550), // JustWatch, etc.
     ]);
   }, []);
   ```

4. **Usuario hace clic "Marcar como vista":**

   ```javascript
   // TraktActions.jsx
   const handleWatched = async () => {
     setOptimisticState(true); // UI instantánea

     const res = await fetch("/api/trakt/item/watched", {
       method: "POST",
       body: JSON.stringify({
         type: "movie",
         tmdbId: 550,
         watched: true,
       }),
     });

     if (!res.ok) {
       setOptimisticState(false); // Rollback
       showError("Error al sincronizar");
     }
   };
   ```

5. **Backend procesa:**

   ```javascript
   // /api/trakt/item/watched/route.js
   export async function POST(request) {
     const { token } = await getValidTraktToken(request.cookies);
     const body = await request.json();

     // Traducir TMDb ID → Trakt slug
     const traktSlug = await tmdbToTraktSlug(body.tmdbId, body.type);

     // Llamar API Trakt
     const result = await traktApi("/sync/history", {
       method: "POST",
       token,
       body: { movies: [{ ids: { slug: traktSlug } }] },
     });

     return NextResponse.json(result);
   }
   ```

6. **Confirmación:**
   - UI muestra checkmark verde
   - Badge "Visto" aparece
   - Contador stats de usuario +1

---

## 🛠️ Scripts Disponibles

```json
{
  "dev": "next dev --turbopack", // Desarrollo con Turbopack
  "build": "next build", // Build producción
  "start": "next start", // Servidor producción
  "lint": "next lint" // Linting ESLint
}
```

---

## 📦 Configuración del Proyecto

### Variables de Entorno (.env.local)

```bash
# TMDb
NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key

# Trakt
TRAKT_CLIENT_ID=your_trakt_client_id
TRAKT_CLIENT_SECRET=your_trakt_client_secret
TRAKT_REDIRECT_URI=http://localhost:3000/api/trakt/oauth/callback

# OMDb (opcional)
OMDB_API_KEY=your_omdb_api_key

# Base URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### next.config.ts

```typescript
const nextConfig = {
  images: {
    domains: [
      "image.tmdb.org", // Posters/backdrops TMDb
      "i.imgur.com", // Custom artwork
      "www.themoviedb.org", // Avatares TMDb
    ],
  },
  experimental: {
    serverActions: true,
  },
};
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"] // Alias imports
    }
  }
}
```

---

## 🎯 Conclusión

**The Show Verse** es una aplicación full-stack moderna que demuestra:

✅ **Integración multi-API** compleja y bien estructurada  
✅ **Autenticación dual** (TMDb + Trakt OAuth)  
✅ **Optimizaciones de rendimiento** (ISR, caching, fetching paralelo)  
✅ **Experiencia de usuario fluida** (actualizaciones optimistas, animaciones)  
✅ **Sincronización robusta** con plataforma externa (Trakt)  
✅ **SEO avanzado** para bots de redes sociales  
✅ **Arquitectura escalable** con separation of concerns clara

---

**Documento generado:** Enero 2026  
**Versión del proyecto:** 0.1.0  
**Mantenedor:** [Tu nombre/equipo]
