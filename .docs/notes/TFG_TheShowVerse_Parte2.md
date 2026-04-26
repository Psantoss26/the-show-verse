# TFG — The Show Verse — PARTE 2
# Análisis de Requisitos, Arquitectura e Implementación

---

# 5. ANÁLISIS DE REQUISITOS

## 5.1 Requisitos Funcionales

A continuación se listan los requisitos funcionales del sistema, agrupados por módulo:

### RF-01: Autenticación y Autorización
| ID | Descripción | Prioridad |
|---|---|---|
| RF-01.1 | El sistema debe permitir al usuario autenticarse con Trakt.tv mediante OAuth 2.0 | Alta |
| RF-01.2 | El sistema debe gestionar el refresco automático de tokens de acceso | Alta |
| RF-01.3 | El sistema debe almacenar tokens de forma segura en cookies httpOnly | Alta |
| RF-01.4 | El usuario debe poder desconectar su cuenta Trakt | Media |
| RF-01.5 | Los endpoints de usuario deben estar protegidos por middleware | Alta |

### RF-02: Descubrimiento y Búsqueda
| ID | Descripción | Prioridad |
|---|---|---|
| RF-02.1 | El sistema debe permitir buscar películas, series y actores por texto | Alta |
| RF-02.2 | El sistema debe ofrecer filtros por tipo de contenido, género, año y rating | Alta |
| RF-02.3 | Los resultados deben mostrarse en tiempo real con scroll infinito | Media |
| RF-02.4 | Los filtros deben persistir en los parámetros de la URL | Media |
| RF-02.5 | El dashboard debe mostrar secciones curadas de contenido | Alta |

### RF-03: Detalles de Contenido
| ID | Descripción | Prioridad |
|---|---|---|
| RF-03.1 | El sistema debe mostrar información completa de películas (sinopsis, rating, reparto, trailers) | Alta |
| RF-03.2 | El sistema debe mostrar información completa de series incluyendo temporadas y episodios | Alta |
| RF-03.3 | El sistema debe mostrar el estado de visionado por episodio y temporada | Alta |
| RF-03.4 | El sistema debe mostrar recomendaciones y contenido similar | Media |
| RF-03.5 | El sistema debe obtener ratings de múltiples fuentes (TMDb, Trakt, IMDb) | Media |
| RF-03.6 | El sistema debe mostrar los proveedores de streaming disponibles | Media |

### RF-04: Gestión Personal
| ID | Descripción | Prioridad |
|---|---|---|
| RF-04.1 | El usuario debe poder añadir/quitar contenido de Favoritos | Alta |
| RF-04.2 | El usuario debe poder añadir/quitar contenido de Watchlist (pendientes) | Alta |
| RF-04.3 | El usuario debe poder marcar películas y episodios como vistos | Alta |
| RF-04.4 | El usuario debe poder registrar la fecha de visionado | Media |
| RF-04.5 | El usuario debe poder valorar contenido con una puntuación | Media |
| RF-04.6 | El usuario debe poder crear y gestionar listas personalizadas | Media |

### RF-05: Historial y Estadísticas
| ID | Descripción | Prioridad |
|---|---|---|
| RF-05.1 | El sistema debe mostrar el historial completo de visionado del usuario | Alta |
| RF-05.2 | El sistema debe mostrar estadísticas agrupadas por período (semana, mes, año) | Media |
| RF-05.3 | El historial debe soportar múltiples visionados del mismo contenido | Media |

### RF-06: Calendario
| ID | Descripción | Prioridad |
|---|---|---|
| RF-06.1 | El sistema debe mostrar un calendario mensual con estrenos y actividad | Media |
| RF-06.2 | El calendario debe integrar datos del calendario personal de Trakt | Media |

## 5.2 Requisitos No Funcionales

| ID | Categoría | Descripción |
|---|---|---|
| RNF-01 | Rendimiento | LCP < 2.5s, FCP < 1.8s, TTI < 3.8s |
| RNF-02 | SEO | Score Lighthouse SEO = 100/100 |
| RNF-03 | Responsividad | Soporte completo para móvil (≥320px), tableta y escritorio |
| RNF-04 | Seguridad | Tokens en cookies httpOnly; no exponer claves de API en cliente |
| RNF-05 | Disponibilidad | Despliegue en Vercel con SLA del 99.9% |
| RNF-06 | Mantenibilidad | Código modular, comentado, siguiendo estándares ESLint |
| RNF-07 | Usabilidad | Interfaz intuitiva sin curva de aprendizaje para usuarios habituados al streaming |
| RNF-08 | Compatibilidad | Chrome, Firefox, Safari, Edge — últimas 2 versiones |

---

# 6. DISEÑO DE LA ARQUITECTURA

## 6.1 Arquitectura General

**The Show Verse** sigue una arquitectura **cliente-servidor híbrida** implementada sobre Next.js:

```
                  ┌─────────────────────────────────────────┐
                  │          USUARIO (NAVEGADOR)             │
                  └───────────────────┬─────────────────────┘
                                      │ HTTP/HTTPS
                  ┌───────────────────▼─────────────────────┐
                  │         VERCEL EDGE NETWORK              │
                  │    (CDN + Edge Functions + Middleware)   │
                  └───────────────────┬─────────────────────┘
                                      │
                  ┌───────────────────▼─────────────────────┐
                  │          NEXT.JS SERVER (SSR/ISR)        │
                  │  ┌──────────────┐  ┌───────────────────┐│
                  │  │ React Server │  │  API Routes        ││
                  │  │ Components   │  │  (Next.js Routes)  ││
                  │  └──────┬───────┘  └────────┬──────────┘│
                  └─────────│───────────────────│───────────┘
                            │                   │
           ┌────────────────▼───┐   ┌───────────▼───────────────┐
           │   TMDb API          │   │      Trakt.tv API          │
           │  api.themoviedb.org │   │      api.trakt.tv          │
           └────────────────────┘   └───────────────────────────┘
                                                │
                                    ┌───────────▼──────────┐
                                    │      OMDb API         │
                                    │   www.omdbapi.com     │
                                    └──────────────────────┘
```

**Capas principales:**

1. **Presentación (React Components):** componentes del cliente responsables de la UI y la interactividad.
2. **Servidor Next.js:** React Server Components para SSR/ISR, API Routes para los proxies de API.
3. **Servicios externos:** TMDb, Trakt.tv y OMDb como fuentes de datos.

## 6.2 Patrón de Diseño: Server Components + Client Components

Next.js 16 con App Router divide los componentes en dos categorías:

- **React Server Components (RSC):** se renderizan exclusivamente en el servidor. No tienen estado ni efectos secundarios. Ideales para fetching de datos inicial. No aumentan el bundle de JavaScript del cliente.
- **Client Components (`"use client"`):** se hidratan en el navegador. Necesarios para interactividad, hooks de React y gestión de estado local.

En el proyecto, las páginas ([page.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/app/page.jsx)) son mayoritariamente componentes de servidor que obtienen los datos necesarios y los pasan a componentes de cliente (`*Client.jsx`) para la renderización interactiva.

## 6.3 Sistema de Caché y Revalidación

Para optimizar el número de llamadas a las APIs externas, se implementa una estrategia de caché en dos niveles:

**Nivel 1 — Servidor (Next.js ISR):**
- Los endpoints de catálogo (listas, géneros, populares) se cachean con revalidación cada **10 minutos** (`next: { revalidate: 600 }`).
- Los endpoints de detalle de contenido se cachean con revalidación cada **1 hora**.

**Nivel 2 — API Routes (proxy interno):**
- Las rutas `/api/*` actúan como proxy entre el cliente y las APIs externas, evitando exponer claves de API en el *bundle* del cliente.

---

# 7. STACK TECNOLÓGICO

## 7.1 Frontend

| Tecnología | Versión | Rol en el Proyecto |
|---|---|---|
| **Next.js** | 16.0.7 | Framework principal (SSR, ISR, App Router, API Routes) [1] |
| **React** | 19.2.1 | Biblioteca de componentes de UI [2] |
| **TypeScript** | 5.x | Tipado estático (configuración tsconfig) |
| **Tailwind CSS** | 4.0 | Sistema de estilos utility-first [6] |
| **Framer Motion** | 12.6.5 | Animaciones y transiciones [7] |

## 7.2 Librerías Complementarias

| Librería | Versión | Uso |
|---|---|---|
| **Lucide React** | 0.487.0 | Iconos SVG modernos |
| **date-fns** | 2.30.0 | Manipulación y formateo de fechas |
| **React Calendar** | 5.1.0 | Componente de calendario interactivo |
| **React Day Picker** | 9.11.1 | Selector de fechas para el historial |
| **Swiper** | 8.4.7 | Carruseles táctiles optimizados |
| **React Slick** | 0.30.3 | Carruseles adicionales |
| **Recharts** | 3.7.0 | Gráficas y estadísticas de usuario |
| **Vercel Analytics** | 1.5.0 | Analítica web integrada |
| **Vercel Speed Insights** | 1.2.0 | Monitorización de Core Web Vitals |

## 7.3 APIs Externas

| API | Rol | Autenticación |
|---|---|---|
| **TMDb API v3** | Metadatos de películas, series y personas [3] | API Key (query param) |
| **Trakt.tv API v2** | Autenticación, historial, listas, sincronización [4] | OAuth 2.0 [8] + Bearer Token |
| **OMDb API** | Ratings complementarios (IMDb, RT) [5] | API Key (query param) |

## 7.4 Tipografía

La aplicación utiliza la fuente **PT Sans** de Google Fonts, con pesos 400 (regular) y 700 (negrita). Se carga mediante el sistema nativo `next/font/google` [1], optimizando el rendimiento y eliminando el riesgo de FOUT (*Flash of Unstyled Text*).

## 7.5 DevOps y Tooling

| Herramienta | Uso |
|---|---|
| **Vercel** | Hosting, CDN, despliegue automático |
| **GitHub** | Control de versiones, colaboración |
| **ESLint 9** | Linting estático de código |
| **npm** | Gestión de paquetes y scripts |
| **Git** | Control de versiones local |

---

# 8. IMPLEMENTACIÓN DEL SISTEMA

## 8.1 Estructura del Proyecto

La organización del proyecto sigue las convenciones del App Router de Next.js:

```
the-show-verse/
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── api/                     # API Routes (servidor)
│   │   │   ├── trakt/               # Proxy para endpoints de Trakt.tv
│   │   │   │   ├── auth/            # OAuth: status, login, callback, disconnect
│   │   │   │   ├── community/       # Comments, listas, temporadas
│   │   │   │   ├── episode/         # Toggle episodios vistos, plays
│   │   │   │   ├── history/         # Historial de visionado
│   │   │   │   ├── item/            # Estado, watched, history op
│   │   │   │   ├── lists/           # CRUD de listas personalizadas
│   │   │   │   ├── ratings/         # Valoraciones de usuario
│   │   │   │   ├── related/         # Contenido relacionado
│   │   │   │   ├── show/            # Progreso de series
│   │   │   │   ├── stats/           # Estadísticas de contenido
│   │   │   │   └── sync/            # Favoritos y watchlist
│   │   │   ├── imdb/                # Proxy para top rated de IMDb
│   │   │   ├── omdb/                # Proxy para OMDb
│   │   │   └── tv/                  # Ratings por episodio
│   │   │
│   │   ├── calendar/                # Página: /calendar
│   │   ├── details/[type]/[id]/     # Página: /details/movie|tv/:id
│   │   ├── discover/                # Página: /discover
│   │   ├── favorites/               # Página: /favorites
│   │   ├── history/                 # Página: /history
│   │   ├── in-progress/             # Página: /in-progress
│   │   ├── lists/                   # Página: /lists
│   │   ├── movies/                  # Página: /movies
│   │   ├── s/                       # Rutas SEO-friendly para bots
│   │   │   ├── movie/[id]/          # Open Graph para películas
│   │   │   ├── tv/[id]/             # Open Graph para series
│   │   │   └── person/[id]/         # Detalles de actor (URL canónica)
│   │   ├── series/                  # Página: /series
│   │   ├── stats/                   # Página: /stats
│   │   ├── watchlist/               # Página: /watchlist
│   │   ├── globals.css              # Estilos globales y variables CSS
│   │   ├── layout.jsx               # Layout raíz: Navbar, AuthProvider, fuentes
│   │   └── page.jsx                 # Dashboard principal (/)
│   │
│   ├── components/                  # Componentes React
│   │   ├── auth/                    # Componentes de autenticación
│   │   ├── details/                 # Sub-componentes de la página de detalles
│   │   ├── lists/                   # Componentes de listas personalizadas
│   │   ├── trakt/                   # Componentes específicos de Trakt
│   │   ├── ActorDetails.jsx         # Página de detalle de actor/crew
│   │   ├── DetailsClient.jsx        # Cliente de detalles (película/serie)
│   │   ├── DiscoverClient.jsx       # Cliente de búsqueda y descubrimiento
│   │   ├── EpisodeDetailsClient.jsx # Cliente de detalles de episodio
│   │   ├── EpisodeRatingsGrid.jsx   # Grid de ratings por episodio
│   │   ├── MainDashboardClient.jsx  # Dashboard principal del cliente
│   │   ├── Navbar.jsx               # Barra de navegación principal
│   │   ├── SeasonDetailsClient.jsx  # Cliente de detalles de temporada
│   │   └── StarRating.jsx           # Componente de valoración con estrellas
│   │
│   ├── lib/                         # Utilidades y clientes de API
│   │   ├── api/
│   │   │   ├── tmdb.js              # Cliente de la API de TMDb
│   │   │   ├── traktClient.js       # Cliente del proxy interno de Trakt
│   │   │   ├── traktHelpers.js      # Helpers de transformación de datos Trakt
│   │   │   ├── auth.js              # Helpers de autenticación OAuth
│   │   │   ├── omdb.js              # Cliente de OMDb API
│   │   │   ├── calendar.js          # Helpers del calendario
│   │   │   └── justwatch.js         # Integración de JustWatch
│   │   ├── hooks/                   # Custom React Hooks
│   │   └── utils/                   # Funciones auxiliares generales
│   │
│   └── context/
│       └── AuthContext.jsx          # Contexto global de autenticación
│
├── middleware.js                    # Middleware de Next.js (redirección de bots)
├── next.config.ts                   # Configuración de Next.js
├── package.json                     # Dependencias y scripts
├── tailwind.config.js               # Configuración de Tailwind CSS
└── tsconfig.json                    # Configuración de TypeScript
```

## 8.2 Arquitectura App Router y Server Components

### Layout Global ([src/app/layout.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/app/layout.jsx))

El layout raíz envuelve toda la aplicación y tiene tres responsabilidades principales:

1. **Carga de fuentes:** integra PT Sans mediante `next/font/google` [1], garantizando una carga optimizada sin bloqueo de renderizado.
2. **Proveedor de autenticación:** envuelve la aplicación con `AuthProvider` (Context API [2]) para distribuir el estado de autenticación a todos los componentes.
3. **Componentes de layout global:** renderiza la `Navbar` y los proveedores de analítica de Vercel.

```jsx
// src/app/layout.jsx
const ptSans = PT_Sans({ subsets: ['latin'], weight: ['400', '700'] });

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${ptSans.className} bg-black text-white antialiased`}>
        <AuthProvider>
          <Navbar />
          <div className="pb-16 lg:pb-0">{children}</div>
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  );
}
```

### Patrón Server → Client

Las páginas se estructuran siguiendo el patrón **Server Component → Client Component** [1] [2]:

```jsx
// src/app/details/[type]/[id]/page.jsx  (Server Component)
export default async function DetailsPage({ params }) {
  const { type, id } = params;
  // Fetching en servidor: sin coste para el cliente, con caché ISR
  const details = await getDetails(type, id);
  const credits = await getCredits(type, id);

  return <DetailsClient details={details} credits={credits} />;
}

// src/components/DetailsClient.jsx  (Client Component)
"use client";
export default function DetailsClient({ details, credits }) {
  const [activeTab, setActiveTab] = useState("overview");
  // ... lógica interactiva
}
```

## 8.3 Sistema de Autenticación (OAuth 2.0 con Trakt.tv)

El sistema de autenticación implementa el flujo **OAuth 2.0 Authorization Code** [8] con Trakt.tv [4]. La gestión de tokens se realiza íntegramente en el servidor mediante **API Routes** de Next.js [1] para garantizar la seguridad.

### Flujo Completo de Autenticación

```
Usuario                 The Show Verse              Trakt.tv
  │                           │                        │
  │──── Clic "Conectar" ─────►│                        │
  │                           │── redirect /oauth/authorize ──►│
  │◄───────────────── redirect a Trakt ────────────────────────│
  │                           │                        │
  │──── Autoriza en Trakt ──────────────────────────────────►│
  │                           │◄── redirect con código ────────│
  │                           │                        │
  │             /api/trakt/auth/callback               │
  │                           │── POST /oauth/token ──►│
  │                           │◄── access_token + refresh_token │
  │                           │                        │
  │                           │ (guarda en cookie httpOnly)    │
  │◄─── redirect a home ─────│                        │
```

### API Routes de Autenticación

El sistema expone los siguientes endpoints internos:

| Ruta | Método | Descripción |
|---|---|---|
| `/api/trakt/auth/status` | GET | Devuelve si el usuario está conectado y su perfil |
| `/api/trakt/oauth` | GET | Inicia el flujo OAuth redirigiendo a Trakt |
| `/api/trakt/auth/callback` | GET | Callback que intercambia el código por tokens |
| `/api/trakt/auth/disconnect` | POST | Revoca tokens y elimina cookies |

### Seguridad de Tokens

Los tokens de acceso y refresco se almacenan en **cookies httpOnly**, lo que impide su acceso desde JavaScript del navegador (protección XSS). El token de acceso tiene una vida útil de 3 meses en Trakt; el refresh token tiene duración indefinida. La aplicación implementa refresco automático transparente para el usuario.

## 8.4 Integración con APIs Externas

### 8.4.1 Cliente TMDb ([src/lib/api/tmdb.js](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js))

El cliente TMDb [3] encapsula todas las llamadas a la API v3 de The Movie Database. Sus características técnicas más relevantes son:

**URL Builder unificado:**
```javascript
function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY);
  if (!("language" in params)) url.searchParams.set("language", "es-ES");
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  return url.toString();
}
```

**Fetcher con timeout y caché diferenciada:**
```javascript
async function tmdb(path, params = {}, options = {}) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const baseInit = IS_SERVER
    ? { cache: "force-cache", next: { revalidate: 600 } }  // 10 min en servidor
    : { cache: "no-store" };  // sin caché en cliente

  const res = await fetch(buildUrl(path, params), {
    ...baseInit, ...fetchOptions, signal: controller.signal,
  });
  // ...
}
```

**Funciones de acceso a datos principales:**

| Función | Endpoint TMDb | Descripción |
|---|---|---|
| [fetchTopRatedMovies()](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#105-110) | `/movie/top_rated` | Películas mejor valoradas |
| [fetchTrendingMovies()](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#111-115) | `/trending/movie/week` | Tendencias semanales |
| [fetchPopularTV()](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#225-230) | `/tv/popular` | Series populares |
| [getDetails(type, id)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#314-324) | `/{type}/{id}` | Detalles de película o serie |
| [getCredits(type, id)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#349-353) | `/{type}/{id}/credits` | Reparto y equipo |
| [getRecommendations(type, id)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#344-348) | `/{type}/{id}/recommendations` | Contenido recomendado |
| [getActorDetails(id)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#378-383) | `/person/{id}` | Información de actor |
| [getWatchProviders(type, id)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#260-313) | `/{type}/{id}/watch/providers` | Plataformas de streaming |
| `searchMulti(query)` | `/search/multi` | Búsqueda general |
| [fetchMediaByGenre({type, genreId})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/tmdb.js#751-775) | `/discover/{type}` | Filtrado por género |

### 8.4.2 Cliente Trakt ([src/lib/api/traktClient.js](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js))

El cliente Trakt actúa como una capa de abstracción sobre las **API Routes internas** (`/api/trakt/*`), que a su vez actúan como proxy hacia la API de Trakt.tv. Este doble nivel permite:

1. Mantener los tokens de autenticación exclusivamente en el servidor.
2. Enriquecer las respuestas de Trakt con datos de TMDb (URLs de imágenes, etc.).
3. Transformar los datos al formato que consume el frontend.

**Funciones principales:**

| Función | Ruta interna | Descripción |
|---|---|---|
| [traktAuthStatus()](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#79-84) | `GET /api/trakt/auth/status` | Estado de conexión |
| [traktGetItemStatus({type, tmdbId})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#92-100) | `GET /api/trakt/item/status` | Estado del ítem (fav, watchlist, visto) |
| [traktSetWatched({type, tmdbId, watched})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#101-118) | `POST /api/trakt/item/watched` | Marcar como visto |
| [traktHistoryOp({op, type, tmdbId})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#119-145) | `POST /api/trakt/item/history` | Añadir/eliminar entrada del historial |
| [traktGetHistory({type, from, to, page})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#163-190) | `GET /api/trakt/history` | Historial paginado con fechas |
| [traktGetShowWatched({tmdbId})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#191-204) | `GET /api/trakt/show/watched` | Episodios vistos por temporada |
| [traktSetEpisodeWatched({tmdbId, season, episode})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#205-229) | `POST /api/trakt/episode/watched` | Toggle de episodio visto |
| [traktSetRating({type, tmdbId, rating})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#314-348) | `POST /api/trakt/ratings` | Valorar contenido (1-10) |
| [traktGetComments({type, tmdbId})](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#230-252) | `GET /api/trakt/community/comments` | Comentarios de la comunidad |
| [traktGetInProgress()](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#396-406) | `GET /api/trakt/show/in-progress` | Series en progreso del usuario |

**Normalización de fechas:**

El cliente incluye funciones de normalización de fechas para garantizar la compatibilidad con los distintos endpoints de la API de Trakt:

- [normalizeWatchedAtForApi(input)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#10-40): devuelve formato `YYYY-MM-DD` (para favoritos/watchlist).
- [normalizeWatchedAtForHistoryApi(input)](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/lib/api/traktClient.js#41-78): devuelve ISO completo `2026-01-14T12:34:56.000Z` (para el historial de plays).

### 8.4.3 OMDb API

OMDb se utiliza para complementar los ratings de TMDb con los datos de **IMDb** y **Rotten Tomatoes**. La llamada se realiza por `imdb_id`, que se obtiene previamente del endpoint `external_ids` de TMDb.

## 8.5 Componentes Principales

### 8.5.1 [MainDashboardClient.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/MainDashboardClient.jsx) (101 KB)

Es el componente más extenso del proyecto. Gestiona el dashboard principal con:
- Hero rotatorio con backdrop de alta resolución
- Más de 10 carruseles de contenido curado
- Lógica de selección de imágenes (preferencia por inglés, mayor resolución, más votos)
- Integración con contenido personalizado de Trakt cuando el usuario está autenticado

### 8.5.2 [DetailsClient.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/DetailsClient.jsx) (331 KB)

El componente más grande del proyecto, responsable de toda la página de detalle de película o serie. Incluye:
- Header con backdrop y poster con efecto parallax
- Gestor de tabs (Overview, Cast, Images, Videos, Recommendations, Season)
- Acciones rápidas (favorito, watchlist, visto, rating)
- Integración con Trakt para estado real del usuario
- Para series: navegación por temporadas, lista de episodios y progreso

### 8.5.3 [Navbar.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/Navbar.jsx) (30 KB)

La barra de navegación principal con las siguientes funcionalidades:
- Menú principal con rutas a todas las secciones
- Indicadores de contadores (favoritos, watchlist) en tiempo real
- Búsqueda rápida integrada con `Ctrl/Cmd + K`
- Atajos de teclado (`G → H`, `G → F`, `G → W`, `G → I`)
- Botón de conexión/desconexión de Trakt con avatar del usuario
- Diseño responsive con menú hamburguesa en móvil

### 8.5.4 [DiscoverClient.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/DiscoverClient.jsx) (48 KB)

Cliente del módulo de búsqueda y descubrimiento:
- Búsqueda en tiempo real por texto
- Panel de filtros con géneros, año (rango), rating mínimo, idioma y ordenación
- Paginación con scroll infinito
- Persistencia de filtros en la URL

## 8.6 Gestión del Estado Global (`AuthContext`)

El estado de autenticación se gestiona mediante la **Context API** de React, implementado en [src/context/AuthContext.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/context/AuthContext.jsx). El contexto expone:

- `isAuthenticated`: booleano que indica si el usuario tiene sesión activa con Trakt.
- `user`: datos del perfil del usuario (avatar, nombre, etc.).
- `login()` / `logout()`: funciones para iniciar/cerrar sesión.
- `checkAuth()`: función para refrescar el estado de autenticación.

Este contexto se inicializa en el layout raíz y está disponible en todos los componentes de la aplicación.

## 8.7 Sistema de Rutas y Middleware

### Estructura de Rutas

| Ruta | Tipo | Descripción |
|---|---|---|
| `/` | Server Component | Dashboard principal |
| `/discover` | Client Component | Búsqueda y descubrimiento |
| `/details/[type]/[id]` | Server + Client | Detalles de película o serie |
| `/favorites` | Client Component | Favoritos del usuario |
| `/watchlist` | Client Component | Lista de pendientes |
| `/history` | Client Component | Historial de visionado |
| `/calendar` | Client Component | Calendario de estrenos |
| `/stats` | Client Component | Estadísticas del usuario |
| `/lists` | Client Component | Listas personalizadas |
| `/movies` | Server + Client | Explorador de películas |
| `/series` | Server + Client | Explorador de series |
| `/in-progress` | Client Component | Series en progreso |
| `/s/person/[id]` | Server + Client | Detalles de actor |

### Middleware de Next.js ([middleware.js](file:///e:/ASNPORTS/PELICULAS/the-show-verse/middleware.js))

El middleware intercepta las peticiones de bots de redes sociales (WhatsApp, Facebook, Twitter, Discord, Telegram, etc.) y las redirige a rutas especiales que generan las **Open Graph meta tags** correctas para las previsualizaciones de enlaces compartidos en redes sociales.

```javascript
const BOT_UA = /WhatsApp|facebookexternalhit|Twitterbot|Slackbot|Discordbot.../i;

export function middleware(req) {
  if (!BOT_UA.test(req.headers.get('user-agent'))) return NextResponse.next();
  // Redirige /details/movie/:id → /s/movie/:id (con OG tags)
  // Redirige /details/tv/:id → /s/tv/:id
  // Redirige /details/person/:id → /s/person/:id
}
```

## 8.8 Diseño de la Interfaz de Usuario

### Sistema de Diseño

La interfaz sigue un sistema de diseño coherente basado en los siguientes principios:

**Paleta de colores:**
- Fondo base: `#000000` (negro puro)
- Superficies: `rgba(255,255,255,0.05)` a `rgba(255,255,255,0.1)` (glassmorphism)
- Acentos: gradientes oscuros con toques de azul/violeta
- Texto: blanco (`#ffffff`) con opacidades para jerarquía

**Tipografía:**
- Familia: PT Sans (Google Fonts)
- Pesos: 400 (cuerpo), 700 (titulares)
- Renderizado: `antialiased` para máxima nitidez

**Animaciones (Framer Motion):**
- `fadeIn` / `fadeInUp`: entrada suave de elementos
- `staggerChildren`: aparición secuencial de listas
- `hover scale`: escala de tarjetas al hover
- `spotlight effect`: desenfoque de elementos no hovereados
- `view transitions`: morfing suave entre vistas Grid/List/Compact

### Sistema de Vistas Múltiples

El sistema ofrece tres modos de visualización para las listas de contenido:

| Vista | Layout | Uso Óptimo |
|---|---|---|
| **Grid** | Cuadrícula de 2-6 columnas | Exploración visual, posters |
| **List** | Tabla con columnas de información | Comparación y análisis |
| **Compact** | Filas horizontales pequeñas | Listas largas, máxima densidad |

### Diseño Responsivo

La aplicación implementa un diseño *mobile-first* con los siguientes breakpoints de Tailwind CSS:

| Dispositivo | Ancho | Columnas (Grid) |
|---|---|---|
| Mobile | 0–639px | 2 columnas |
| Tablet | 640–1023px | 3–4 columnas |
| Laptop | 1024–1439px | 4–5 columnas |
| Desktop | 1440px+ | 5–6 columnas |

En **móvil**, la Navbar se convierte en una barra inferior de navegación fija, los carruseles permiten scroll horizontal táctil y los modales ocupan pantalla completa.
