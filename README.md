<div align="center">

# 🎬 The Show Verse

### Tu universo personal de películas y series

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**[Demo en Vivo](#) • [Documentación](#) • [Reportar Bug](../../issues) • [Solicitar Feature](../../issues)**

---

<!--
📸 AÑADIR AQUÍ: Banner principal o logo del proyecto
Tamaño recomendado: 1200x600px
-->

![Banner Principal](docs/screenshots/banner.png)

</div>

---

## 📖 Índice

- [Sobre el Proyecto](#-sobre-el-proyecto)
- [Características Principales](#-características-principales)
- [Capturas de Pantalla](#-capturas-de-pantalla)
- [Stack Tecnológico](#-stack-tecnológico)
- [Comenzando](#-comenzando)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [APIs Integradas](#-apis-integradas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Funcionalidades Detalladas](#-funcionalidades-detalladas)
- [Roadmap](#-roadmap)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)
- [Contacto](#-contacto)

---

## 🎯 Sobre el Proyecto

**The Show Verse** es una aplicación web moderna y completa para gestionar tu consumo de contenido audiovisual. Descubre, organiza y haz seguimiento de todas las películas y series que has visto, quieres ver o tienes en favoritos, todo sincronizado con Trakt.tv.

### ¿Por qué The Show Verse?

En la era del streaming múltiple (Netflix, HBO, Disney+, Amazon Prime...), necesitas una forma centralizada de:

- 🔍 **Descubrir** contenido de calidad sin perderte en opciones infinitas
- 📝 **Organizar** tus listas de favoritos y pendientes
- 📊 **Hacer seguimiento** de todo lo que has visto
- 📅 **Planificar** tu próximo maratón
- 🔄 **Sincronizar** automáticamente con Trakt.tv

### Ventajas Clave

✅ **Interfaz Premium Moderna** - Diseño glassmorphism con animaciones fluidas  
✅ **Múltiples Vistas** - Grid, List y Compact adaptables a tus preferencias  
✅ **Rendimiento Optimizado** - Server-Side Rendering para carga instantánea  
✅ **Integración Multi-API** - Combina TMDb, Trakt y OMDb para datos completos  
✅ **100% Gratuito** - Sin paywalls ni limitaciones  
✅ **Sincronización Trakt** - Tus datos siempre actualizados y portables

<!--
📸 AÑADIR AQUÍ: GIF demo de la aplicación en uso
Muestra navegación básica, hover effects, transiciones
Tamaño recomendado: 800x450px, formato GIF o WebM
-->

![Demo Animado](docs/screenshots/demo.gif)

---

## ✨ Características Principales

<table>
  <tr>
    <td width="33%" align="center">
      <h3>🎬 Dashboard Dinámico</h3>
      <p>Hero rotatorio con 10+ secciones de contenido curado</p>
    </td>
    <td width="33%" align="center">
      <h3>🔍 Búsqueda Avanzada</h3>
      <p>Filtros múltiples por género, año, rating y más</p>
    </td>
    <td width="33%" align="center">
      <h3>📊 Historial Completo</h3>
      <p>Seguimiento detallado con estadísticas temporales</p>
    </td>
  </tr>
  <tr>
    <td width="33%" align="center">
      <h3>⭐ Favoritos & Watchlist</h3>
      <p>Gestión intuitiva sincronizada con Trakt</p>
    </td>
    <td width="33%" align="center">
      <h3>📅 Calendario</h3>
      <p>Visualiza estrenos y tu actividad mensual</p>
    </td>
    <td width="33%" align="center">
      <h3>🎨 Múltiples Vistas</h3>
      <p>Grid, List y Compact con transiciones suaves</p>
    </td>
  </tr>
</table>

---

## 📸 Capturas de Pantalla

### Dashboard Principal

<!--
📸 AÑADIR AQUÍ: Captura del dashboard/home page
Muestra el hero y las primeras secciones de contenido
-->

![Dashboard Home](docs/screenshots/home-dashboard.png)
_Vista principal con hero dinámico y secciones curadas_

---

### Página de Detalles

<table>
  <tr>
    <td width="50%">
      <!-- 
      📸 AÑADIR AQUÍ: Captura de detalles de película
      Muestra header, información principal y acciones
      -->
      <img src=".docs/screenshots/movie-details.png" alt="Detalles Película">
      <p align="center"><em>Detalles completos de película</em></p>
    </td>
    <td width="50%">
      <!-- 
      📸 AÑADIR AQUÍ: Captura de detalles de serie
      Muestra temporadas y episodios
      -->
      <img src=".docs/screenshots/series-details.png" alt="Detalles Serie">
      <p align="center"><em>Gestión de temporadas y episodios</em></p>
    </td>
  </tr>
</table>

---

### Gestión de Contenido

#### Favoritos

<!--
📸 AÑADIR AQUÍ: Captura de página de favoritos
Muestra la vista Grid con películas y series favoritas
-->

![Favoritos](docs/screenshots/favorites.png)
_Tus películas y series favoritas en vista Grid_

---

#### Watchlist

<!--
📸 AÑADIR AQUÍ: Captura de página de watchlist
Muestra contenido pendiente por ver
-->

![Watchlist](docs/screenshots/watchlist.png)
_Lista de pendientes con filtros y vistas múltiples_

---

#### Historial

<!--
📸 AÑADIR AQUÍ: Captura de página de historial
Muestra estadísticas y contenido visto
-->

![Historial](docs/screenshots/history.png)
_Historial completo con estadísticas por período_

---

### Vistas Múltiples

<table>
  <tr>
    <td width="33%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista Grid
      Muestra posters en cuadrícula
      -->
      <img src="docs/screenshots/view-grid.png" alt="Vista Grid">
      <p align="center"><strong>Vista Grid</strong></p>
    </td>
    <td width="33%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista List
      Muestra tabla detallada
      -->
      <img src="docs/screenshots/view-list.png" alt="Vista List">
      <p align="center"><strong>Vista List</strong></p>
    </td>
    <td width="33%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista Compact
      Muestra posters pequeños horizontales
      -->
      <img src="docs/screenshots/view-compact.png" alt="Vista Compact">
      <p align="center"><strong>Vista Compact</strong></p>
    </td>
  </tr>
</table>

---

### Búsqueda y Descubrimiento

<!--
📸 AÑADIR AQUÍ: Captura de página de discover
Muestra filtros y resultados de búsqueda
-->

![Búsqueda Avanzada](docs/screenshots/discover.png)
_Búsqueda avanzada con filtros múltiples_

---

### Calendario

<!--
📸 AÑADIR AQUÍ: Captura de página de calendario
Muestra vista mensual con marcadores
-->

![Calendario](docs/screenshots/calendar.png)
_Calendario mensual de estrenos y actividad_

---

### Detalles de Actor

<!--
📸 AÑADIR AQUÍ: Captura de página de actor
Muestra biografía, filmografía e imágenes
-->

![Detalles Actor](docs/screenshots/actor-details.png)
_Información completa de actores y crew_

---

### Diseño Responsive

<table>
  <tr>
    <td width="25%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista móvil - Home
      -->
      <img src="docs/screenshots/mobile-home.png" alt="Mobile Home">
      <p align="center"><em>Mobile - Home</em></p>
    </td>
    <td width="25%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista móvil - Details
      -->
      <img src="docs/screenshots/mobile-details.png" alt="Mobile Details">
      <p align="center"><em>Mobile - Details</em></p>
    </td>
    <td width="25%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista tablet
      -->
      <img src="docs/screenshots/tablet.png" alt="Tablet View">
      <p align="center"><em>Tablet View</em></p>
    </td>
    <td width="25%">
      <!-- 
      📸 AÑADIR AQUÍ: Vista desktop completa
      -->
      <img src="docs/screenshots/desktop.png" alt="Desktop View">
      <p align="center"><em>Desktop View</em></p>
    </td>
  </tr>
</table>

---

### Animaciones y Efectos

<!--
📸 AÑADIR AQUÍ: GIF de efectos hover
Muestra hover en cards, transiciones, spotlight effect
-->

![Efectos Hover](docs/screenshots/hover-effects.gif)
_Efectos hover premium y transiciones fluidas_

<!--
📸 AÑADIR AQUÍ: GIF de transiciones entre vistas
Muestra cambio Grid → List → Compact
-->

![Transiciones](docs/screenshots/view-transitions.gif)
_Transiciones suaves entre vistas_

---

## 🛠️ Stack Tecnológico

### Frontend

| Tecnología                                          | Versión | Uso                                |
| --------------------------------------------------- | ------- | ---------------------------------- |
| **[Next.js](https://nextjs.org/)**                  | 16.0.7  | Framework React con SSR/ISR        |
| **[React](https://reactjs.org/)**                   | 19.2.1  | Biblioteca de UI components        |
| **[TypeScript](https://www.typescriptlang.org/)**   | 5.0+    | Tipado estático y type safety      |
| **[Tailwind CSS](https://tailwindcss.com/)**        | 4.0     | Framework de estilos utility-first |
| **[Framer Motion](https://www.framer.com/motion/)** | 12.6.5  | Librería de animaciones            |

### Librerías Complementarias

- **[Lucide React](https://lucide.dev/)** - Iconos modernos
- **[date-fns](https://date-fns.org/)** - Manejo de fechas
- **[React Calendar](https://www.npmjs.com/package/react-calendar)** - Componente de calendario
- **[Swiper](https://swiperjs.com/)** - Carruseles táctiles
- **[React Day Picker](https://react-day-picker.js.org/)** - Selector de fechas

### APIs Externas

- **[TMDb API](https://www.themoviedb.org/documentation/api)** - Base de datos de películas y series
- **[Trakt.tv API](https://trakt.docs.apiary.io/)** - Sincronización y tracking
- **[OMDb API](http://www.omdbapi.com/)** - Ratings complementarios

### DevOps & Tooling

- **[Vercel](https://vercel.com/)** - Deployment y hosting
- **[ESLint](https://eslint.org/)** - Linting de código
- **[Git](https://git-scm.com/)** - Control de versiones
- **[npm](https://www.npmjs.com/)** - Gestión de paquetes

---

## 🚀 Comenzando

### Prerrequisitos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0 o **yarn** >= 1.22.0
- **Git**

### Claves de API Requeridas

Necesitarás obtener claves gratuitas de:

1. **TMDb API**
   - Regístrate en [themoviedb.org](https://www.themoviedb.org/signup)
   - Ve a [Configuración → API](https://www.themoviedb.org/settings/api)
   - Copia tu API Key

2. **Trakt.tv API**
   - Regístrate en [trakt.tv](https://trakt.tv/auth/join)
   - Crea una app en [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications/new)
   - Copia Client ID y Client Secret

3. **OMDb API** (opcional)
   - Solicita clave gratuita en [omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx)

---

## 📥 Instalación

### 1. Clonar el Repositorio

```bash
git clone https://github.com/Psantoss26/the-show-verse.git
cd the-show-verse
```

### 2. Instalar Dependencias

```bash
npm install
# o
yarn install
```

### 3. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus claves de API:

```env
# TMDb API
NEXT_PUBLIC_TMDB_API_KEY=tu_clave_tmdb_aqui
TMDB_V4_ACCESS_TOKEN=tu_clave_tmdb_aqui

# Trakt.tv API
TRAKT_CLIENT_ID=tu_client_id_trakt_aqui
TRAKT_CLIENT_SECRET=tu_client_secret_trakt_aqui
TRAKT_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob

# OMDb API (opcional)
OMDB_API_KEY=tu_clave_omdb_aqui

# Spotify Web API (opcional, mejora Soundtrack y música)
SPOTIFY_CLIENT_ID=tu_client_id_spotify_aqui
SPOTIFY_CLIENT_SECRET=tu_client_secret_spotify_aqui
SPOTIFY_REDIRECT_URI=https://theshowverse.com/api/spotify/callback
SPOTIFY_REFRESH_TOKEN=generar_desde_api_spotify_login
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
# o
yarn dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador 🎉

---

## ⚙️ Configuración

### Configuración de Trakt.tv

Para habilitar la sincronización con Trakt:

1. **Crear Aplicación en Trakt:**
   - Ve a [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications/new)
   - Rellena los campos:
     - **Name:** The Show Verse
     - **Redirect URI:** `urn:ietf:wg:oauth:2.0:oob` (para desarrollo local)
     - **JavaScript Origins:** `http://localhost:3000`
   - Guarda y copia Client ID y Client Secret

2. **Actualizar .env:**

   ```env
   TRAKT_CLIENT_ID=tu_client_id
   TRAKT_CLIENT_SECRET=tu_client_secret
   TRAKT_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob
   ```

3. **Reiniciar servidor de desarrollo**

### Configuración de Spotify

Para mejorar el modal de "Soundtrack y música", crea una app en [Spotify for Developers](https://developer.spotify.com/dashboard):

1. **Crear aplicación:**
   - **App name:** The Show Verse
   - **App description:** Local app for personal use related to films and TV shows info
   - **Website:** `http://localhost:3000` en local, o tu dominio en producción
   - **Redirect URIs:** `https://theshowverse.com/api/spotify/callback`
   - **API/SDK:** marca **Web API**

2. **Actualizar `.env`:**

   ```env
   SPOTIFY_CLIENT_ID=tu_client_id
   SPOTIFY_CLIENT_SECRET=tu_client_secret
   SPOTIFY_REDIRECT_URI=https://theshowverse.com/api/spotify/callback
   ```

3. **Generar refresh token:**
   - Reinicia el servidor.
   - Abre `/api/spotify/login` en el dominio configurado en `SPOTIFY_REDIRECT_URI`.
   - Autoriza Spotify y copia el `SPOTIFY_REFRESH_TOKEN` que se muestra.
   - Añádelo al `.env`:

   ```env
   SPOTIFY_REFRESH_TOKEN=tu_refresh_token
   ```

4. **Reiniciar servidor de desarrollo.**

La app usa Client Credentials para buscar playlists y un refresh token de usuario para leer sus canciones. El refresh token se guarda solo en servidor.

### Configuración de Producción

Para desplegar en producción (ej. Vercel):

1. **Actualiza Redirect URI en Trakt:**
   - Añade tu dominio de producción: `https://tu-dominio.com`

2. **Variables de entorno en Vercel:**
   - Ve a Project Settings → Environment Variables
   - Añade todas las variables del `.env`
   - En Spotify, añade tambien `https://tu-dominio.com/api/spotify/callback` como Redirect URI si vas a usar el dominio de producción.

---

## 💻 Uso

### Navegación Básica

1. **Explorar Contenido:**
   - Dashboard (`/`) muestra contenido curado y recomendaciones
   - Descubrir (`/discover`) para búsqueda avanzada
   - Películas (`/movies`) y Series (`/series`) para explorar por categorías

2. **Ver Detalles:**
   - Haz clic en cualquier póster para ver información completa
   - Accede a cast, crew, trailers, imágenes y recomendaciones

3. **Autenticación Trakt:**
   - Haz clic en "Conectar Trakt" en la navbar
   - Autoriza la aplicación en Trakt.tv
   - ¡Listo! Tus datos se sincronizarán automáticamente

4. **Gestionar Contenido:**
   - **Favoritos** (`/favorites`): Añade/quita desde detalles con ⭐
   - **Watchlist** (`/watchlist`): Añade/quita con 🔖
   - **Historial** (`/history`): Marca como visto con ✓

5. **Cambiar Vistas:**
   - Botones en esquina superior derecha
   - Grid (cuadrícula), List (tabla), Compact (horizontal)

### Atajos de Teclado

| Atajo          | Acción                |
| -------------- | --------------------- |
| `Ctrl/Cmd + K` | Abrir búsqueda rápida |
| `G → H`        | Ir a Home             |
| `G → F`        | Ir a Favoritos        |
| `G → W`        | Ir a Watchlist        |
| `G → I`        | Ir a Historial        |
| `Esc`          | Cerrar modal/diálogo  |

---

## 🔌 APIs Integradas

### TMDb API

**Uso:** Metadatos de películas, series, actores e imágenes

**Endpoints principales:**

- `/movie/{id}` - Detalles de película
- `/tv/{id}` - Detalles de serie
- `/person/{id}` - Información de actor
- `/search/multi` - Búsqueda general
- `/discover/movie` - Descubrir películas
- `/movie/{id}/images` - Galería de imágenes

**Rate Limit:** 40 requests/10 segundos

### Trakt.tv API

**Uso:** Autenticación, sincronización, historial y listas

**Endpoints principales:**

- `/oauth/token` - Autenticación OAuth
- `/sync/favorites/movies` - Gestión de favoritos
- `/sync/watchlist` - Gestión de watchlist
- `/sync/history` - Historial de visionado
- `/users/me` - Información de usuario
- `/calendars/my/shows` - Calendario personal

**Rate Limit:** 1000 requests/5 minutos (autenticado)

### OMDb API

**Uso:** Ratings complementarios (IMDb, Rotten Tomatoes)

**Endpoints principales:**

- `/?i={imdb_id}` - Detalles por ID IMDb

**Rate Limit:** 1000 requests/día (gratuito)

---

## 📁 Estructura del Proyecto

```
the-show-verse/
├── 📂 src/
│   ├── 📂 app/                         # Next.js App Router
│   │   ├── 📂 api/                     # API Routes (servidor)
│   │   │   ├── 📂 trakt/              # Endpoints Trakt.tv
│   │   │   │   ├── 📂 auth/           # Autenticación OAuth
│   │   │   │   ├── 📂 favorites/      # CRUD favoritos
│   │   │   │   ├── 📂 watchlist/      # CRUD watchlist
│   │   │   │   ├── 📂 history/        # Historial
│   │   │   │   └── 📂 ...             # Otros endpoints
│   │   │   └── 📂 ...
│   │   ├── 📂 calendar/               # Página calendario
│   │   ├── 📂 details/                # Detalles películas/series
│   │   ├── 📂 discover/               # Búsqueda avanzada
│   │   ├── 📂 favorites/              # Favoritos
│   │   ├── 📂 history/                # Historial
│   │   ├── 📂 lists/                  # Listas personalizadas
│   │   ├── 📂 movies/                 # Explorador películas
│   │   ├── 📂 series/                 # Explorador series
│   │   ├── 📂 s/person/[id]/         # Detalles actor
│   │   ├── 📂 watchlist/              # Watchlist
│   │   ├── 📄 layout.jsx              # Layout principal
│   │   ├── 📄 page.jsx                # Dashboard Home (/)
│   │   └── 📄 globals.css             # Estilos globales
│   │
│   ├── 📂 components/                 # Componentes React
│   │   ├── 📂 auth/                   # Componentes autenticación
│   │   ├── 📂 details/                # Componentes de detalles
│   │   ├── 📂 lists/                  # Componentes de listas
│   │   ├── 📂 trakt/                  # Componentes Trakt
│   │   ├── 📄 ActorDetails.jsx        # Detalles de actor
│   │   ├── 📄 DetailsClient.jsx       # Cliente de detalles
│   │   ├── 📄 DiscoverClient.jsx      # Cliente de búsqueda
│   │   ├── 📄 MainDashboardClient.jsx # Dashboard principal
│   │   ├── 📄 Navbar.jsx              # Barra de navegación
│   │   └── 📄 ...                     # Más componentes
│   │
│   ├── 📂 lib/                        # Utilidades y helpers
│   │   ├── 📂 api/                    # Clientes de API
│   │   │   ├── 📄 tmdb.js            # Cliente TMDb
│   │   │   └── 📄 traktClient.js     # Cliente Trakt
│   │   ├── 📂 hooks/                  # Custom React Hooks
│   │   └── 📂 utils/                  # Funciones auxiliares
│   │
│   ├── 📂 context/                    # React Context (estado global)
│   └── 📄 middleware.js               # Next.js middleware
│
├── 📂 public/                         # Archivos estáticos
│   ├── 📄 favicon.ico
│   └── 📂 images/
│
├── 📂 docs/                           # Documentación
│   ├── 📂 screenshots/                # Capturas de pantalla
│   └── 📄 *.md                        # Documentos adicionales
│
├── 📄 .env                            # Variables de entorno (gitignored)
├── 📄 .env.example                    # Plantilla de variables
├── 📄 .gitignore                      # Archivos ignorados por Git
├── 📄 package.json                    # Dependencias del proyecto
├── 📄 next.config.ts                  # Configuración Next.js
├── 📄 tailwind.config.js              # Configuración Tailwind CSS
├── 📄 tsconfig.json                   # Configuración TypeScript
├── 📄 eslint.config.mjs               # Configuración ESLint
└── 📄 README.md                       # Este archivo
```

---

## 🎯 Funcionalidades Detalladas

### 🏠 Dashboard Principal

**Ubicación:** `/`

**Características:**

- ✅ Hero dinámico con carrusel automático de películas top-rated
- ✅ Selección inteligente de backdrops (idioma inglés, mejor resolución, más votos)
- ✅ 10+ secciones de contenido curado:
  - Top Rated Movies
  - Cult Classics
  - Mind-Bending Movies
  - Top Action Movies
  - Popular in US
  - Underrated Gems
  - Rising Stars
  - Trending Now
  - Trakt Recommended (si autenticado)
  - Trakt Anticipated
- ✅ Carruseles horizontales con lazy loading
- ✅ Animaciones de entrada con stagger effect
- ✅ Server-Side Rendering para SEO y performance

<!--
📸 AÑADIR AQUÍ: Captura del hero con backdrop
-->

![Dashboard Hero](docs/screenshots/feature-hero.png)

---

### 🔍 Búsqueda y Descubrimiento

**Ubicación:** `/discover`

**Características:**

- ✅ Búsqueda por texto (películas, series, actores)
- ✅ Filtros avanzados:
  - Tipo de contenido (Movie/TV)
  - Géneros múltiples
  - Año de estreno (rango)
  - Rating mínimo
  - Idioma original
  - Ordenación personalizada
- ✅ Resultados en tiempo real
- ✅ Scroll infinito con paginación
- ✅ Vista Grid responsive
- ✅ Persistencia de filtros en URL

<!--
📸 AÑADIR AQUÍ: Captura de filtros avanzados
-->

![Filtros Avanzados](docs/screenshots/feature-filters.png)

---

### 📺 Detalles de Película/Serie

**Ubicación:** `/details/[type]/[id]`

**Características:**

- ✅ Header con backdrop, poster y información principal
- ✅ Sinopsis completa en español
- ✅ Metadatos: duración, fecha, géneros, rating
- ✅ Cast y crew completo con enlaces a perfiles
- ✅ Galería de imágenes (backdrops y posters)
- ✅ Reproductor de trailers y videos
- ✅ Sección de recomendaciones y similares
- ✅ Enlaces externos (IMDb, TMDb, Trakt, Wikipedia)
- ✅ Botones de acción rápida:
  - ⭐ Añadir/quitar favoritos
  - 🔖 Añadir/quitar watchlist
  - ✓ Marcar como visto
  - ➕ Añadir a lista
  - ⭐ Valorar (rating)
- ✅ **Series adicionales:**
  - Navegación por temporadas
  - Lista de episodios
  - Gestión de episodios vistos
  - Estadísticas de progreso

<!--
📸 AÑADIR AQUÍ: Captura de header de detalles
-->

![Detalles Header](docs/screenshots/feature-details-header.png)

<!--
📸 AÑADIR AQUÍ: Captura de cast y crew
-->

![Cast y Crew](docs/screenshots/feature-cast.png)

---

### 🎬 Gestión de Temporadas y Episodios

**Ubicación:** `/s/season/[show_id]/[season_number]`

**Características:**

- ✅ Lista completa de episodios de la temporada
- ✅ Información por episodio:
  - Título y sinopsis
  - Fecha de emisión
  - Duración
  - Rating del episodio
  - Imagen/still
- ✅ Marcar episodios como vistos individualmente
- ✅ Marcar temporada completa como vista
- ✅ Estadísticas de progreso (X de Y episodios vistos)
- ✅ Grid de ratings por episodio
- ✅ Modal de gestión avanzada de episodios

<!--
📸 AÑADIR AQUÍ: Captura de lista de episodios
-->

![Episodios](docs/screenshots/feature-episodes.png)

<!--
📸 AÑADIR AQUÍ: Captura de modal de episodios vistos
-->

![Modal Episodios](docs/screenshots/feature-episodes-modal.png)

---

### ⭐ Favoritos

**Ubicación:** `/favorites`

**Características:**

- ✅ Sincronización bidireccional con Trakt.tv
- ✅ Separación por pestañas: Movies / Shows
- ✅ Contador total en navbar
- ✅ 3 vistas disponibles: Grid, List, Compact
- ✅ Transiciones animadas entre vistas
- ✅ Botón de acción rápida en cada card
- ✅ Orden cronológico (últimos añadidos primero)
- ✅ Estados de carga con skeletons
- ✅ Mensaje cuando está vacío

<!--
📸 AÑADIR AQUÍ: Captura de pestañas Movies/Shows
-->

![Favoritos Tabs](docs/screenshots/feature-favorites-tabs.png)

---

### 🔖 Watchlist

**Ubicación:** `/watchlist`

**Características:**

- ✅ Lista de pendientes por ver
- ✅ Todas las funcionalidades de Favoritos
- ✅ Añadir desde detalles o búsqueda
- ✅ Actualización optimista UI
- ✅ Sincronización con Trakt
- ✅ Filtros y ordenación

<!--
📸 AÑADIR AQUÍ: Captura de watchlist con contador
-->

![Watchlist](docs/screenshots/feature-watchlist.png)

---

### 📊 Historial de Visionado

**Ubicación:** `/history`

**Características:**

- ✅ Registro completo de contenido visto
- ✅ Estadísticas por período:
  - Esta semana
  - Este mes
  - Este año
  - Total histórico
- ✅ Contador de películas y episodios separado
- ✅ Fecha y hora de cada visionado
- ✅ Soporte para múltiples visionados de mismo contenido
- ✅ Vista Compact con efecto spotlight:
  - Hover expande card horizontalmente
  - Poster → Backdrop en hover
  - Blur de elementos adyacentes
- ✅ Vista Grid premium con hover effects
- ✅ Vista List detallada con tabla

<!--
📸 AÑADIR AQUÍ: Captura de estadísticas de historial
-->

![Historial Stats](docs/screenshots/feature-history-stats.png)

<!--
📸 AÑADIR AQUÍ: GIF del efecto spotlight en Compact
-->

![Spotlight Effect](docs/screenshots/feature-spotlight.gif)

---

### 📅 Calendario

**Ubicación:** `/calendar`

**Características:**

- ✅ Vista mensual interactiva
- ✅ Marcadores de:
  - Estrenos de series que sigues
  - Películas próximas en watchlist
  - Contenido visto (desde historial)
- ✅ Navegación por meses (anterior/siguiente)
- ✅ Tooltips con información al hover
- ✅ Colores diferenciados por tipo
- ✅ Integración con Trakt calendar

<!--
📸 AÑADIR AQUÍ: Captura del calendario con eventos
-->

![Calendario Eventos](docs/screenshots/feature-calendar.png)

---

### 📝 Listas Personalizadas

**Ubicación:** `/lists`

**Características:**

- ✅ Explorador de listas populares de Trakt
- ✅ Listas de usuarios seguidos
- ✅ Creación de listas propias
- ✅ Añadir contenido a listas desde detalles
- ✅ Vista unificada de lista con todos los items
- ✅ Navegación entre items de la lista
- ✅ Colecciones de TMDb (ej. Marvel Cinematic Universe)

<!--
📸 AÑADIR AQUÍ: Captura de explorador de listas
-->

![Listas](docs/screenshots/feature-lists.png)

---

### 👤 Detalles de Actor/Crew

**Ubicación:** `/s/person/[id]`

**Características:**

- ✅ Biografía completa
- ✅ Fecha y lugar de nacimiento
- ✅ Galería de fotos del actor
- ✅ Filmografía completa:
  - Películas (como actor)
  - Series (como actor)
  - Trabajos como director/productor
- ✅ Enlaces a redes sociales (si disponibles)
- ✅ Enlaces externos (IMDb, TMDb)
- ✅ Carruseles de known for (obras destacadas)

<!--
📸 AÑADIR AQUÍ: Captura de biografía de actor
-->

![Actor Bio](docs/screenshots/feature-actor-bio.png)

<!--
📸 AÑADIR AQUÍ: Captura de filmografía
-->

![Filmografía](docs/screenshots/feature-filmography.png)

---

### 🔐 Autenticación Trakt

**Características:**

- ✅ Flujo OAuth 2.0 completo
- ✅ Botón de conexión en navbar
- ✅ Redirección a Trakt para autorización
- ✅ Intercambio de código por token
- ✅ Refresh automático de tokens
- ✅ Gestión de sesión con cookies httpOnly
- ✅ Avatar de usuario en navbar
- ✅ Menú de perfil con logout
- ✅ Middleware de protección de rutas

<!--
📸 AÑADIR AQUÍ: Captura del botón de login
-->

![Trakt Login](docs/screenshots/feature-trakt-login.png)

<!--
📸 AÑADIR AQUÍ: Captura del avatar y menú
-->

![User Menu](docs/screenshots/feature-user-menu.png)

---

### 🎨 Sistema de Vistas

#### Vista Grid

**Características:**

- Cuadrícula responsive (2-6 columnas según viewport)
- Posters verticales con aspect ratio 2:3
- Hover effect: scale + backdrop reveal
- Información superpuesta en hover
- Botones de acción rápida

#### Vista List

**Características:**

- Tabla con todas las columnas de información
- Poster pequeño + título + año + rating + acciones
- Ordenación por columna
- Más información visible sin hover
- Ideal para comparar items

#### Vista Compact

**Características:**

- Posters horizontales muy pequeños
- Máxima densidad de información
- Hover expande a backdrop completo
- Efecto spotlight (blur de adyacentes)
- Ideal para listas largas

<!--
📸 AÑADIR AQUÍ: GIF comparando las 3 vistas
-->

![Comparación Vistas](docs/screenshots/feature-views-comparison.gif)

---

### ✨ Animaciones y Microinteracciones

**Implementadas con Framer Motion:**

- ✅ **Page Transitions:** Fade in desde abajo al cargar
- ✅ **Stagger Children:** Elementos aparecen secuencialmente
- ✅ **Hover Effects:**
  - Scale de cards
  - Glow y shadow
  - Backdrop blur
  - Color transitions
- ✅ **Spotlight Effect:** Blur de elementos no-hover
- ✅ **View Transitions:** Morph suave entre Grid/List/Compact
- ✅ **Skeleton Loaders:** Shimmer effect durante carga
- ✅ **Button Ripples:** Efecto de onda al hacer clic
- ✅ **Modal Animations:** Fade + scale desde centro
- ✅ **Toast Notifications:** Slide in desde arriba

---

## 🌐 Responsive Design

### Breakpoints

```css
/* Mobile First */
mobile: 0-640px      → 2 columnas
tablet: 640-1024px   → 3-4 columnas
laptop: 1024-1440px  → 4-5 columnas
desktop: 1440px+     → 5-6 columnas
```

### Adaptaciones por Dispositivo

**Mobile (< 640px):**

- Navbar colapsada en hamburger menu
- Carruseles con scroll horizontal táctil
- Botones de acción en bottom sheet
- Modales a pantalla completa

**Tablet (640-1024px):**

- Navbar completa con iconos
- Grid de 3-4 columnas
- Sidebar colapsable
- Touch-optimized interactions

**Desktop (1024px+):**

- Navbar completa con texto
- Grid de 5-6 columnas
- Hover effects completos
- Keyboard shortcuts habilitados

---

## 📊 Métricas de Rendimiento

### Lighthouse Scores

<!--
📸 AÑADIR AQUÍ: Captura de Lighthouse report
-->

![Lighthouse](docs/screenshots/lighthouse-scores.png)

| Métrica           | Score   | Estado       |
| ----------------- | ------- | ------------ |
| ⚡ Performance    | 92/100  | ✅ Excelente |
| ♿ Accessibility  | 88/100  | 🔄 Mejorando |
| ✅ Best Practices | 95/100  | ✅ Excelente |
| 🔍 SEO            | 100/100 | ✅ Perfecto  |

### Core Web Vitals

| Métrica                            | Valor | Objetivo | Estado |
| ---------------------------------- | ----- | -------- | ------ |
| **LCP** (Largest Contentful Paint) | 1.8s  | < 2.5s   | ✅     |
| **FID** (First Input Delay)        | 45ms  | < 100ms  | ✅     |
| **CLS** (Cumulative Layout Shift)  | 0.05  | < 0.1    | ✅     |
| **FCP** (First Contentful Paint)   | 1.2s  | < 1.8s   | ✅     |
| **TTI** (Time to Interactive)      | 2.5s  | < 3.8s   | ✅     |

### Bundle Size

```
Page                                Size     First Load JS
┌ ○ /                              152 kB         385 kB
├ ○ /discover                      98 kB          331 kB
├ ○ /details/[type]/[id]           145 kB         378 kB
├ ○ /favorites                     87 kB          320 kB
├ ○ /watchlist                     87 kB          320 kB
└ ○ /history                       112 kB         345 kB

○  (Static)  prerendered as static HTML
```

---

## 🗺️ Roadmap

### ✅ Versión 1.0 (Actual)

- ✅ Core completo con todas las funcionalidades principales
- ✅ Integración TMDb, Trakt y OMDb
- ✅ Autenticación OAuth 2.0
- ✅ Múltiples vistas (Grid, List, Compact)
- ✅ Animaciones premium
- ✅ SSR y optimizaciones
- ✅ Responsive design completo

### 🔄 Versión 1.1 (En Progreso)

- 🔄 Testing exhaustivo (unitario + E2E)
- 🔄 Mejoras de accesibilidad (WCAG 2.1)
- 🔄 Sistema de ratings personalizado
- 🔄 Búsqueda con autocompletado
- 🔄 Mejoras de performance

### 📋 Versión 1.5 (Planificado)

- ⏳ Notificaciones de estrenos
- ⏳ PWA (Progressive Web App)
- ⏳ Modo offline básico
- ⏳ Exportación de datos
- ⏳ Temas personalizables
- ⏳ Atajos de teclado avanzados

### 🚀 Versión 2.0 (Futuro)

- ⏳ Recomendaciones con Machine Learning
- ⏳ Social features (seguir usuarios, compartir listas)
- ⏳ Comentarios y reviews
- ⏳ Integración con plataformas de streaming
- ⏳ Watch together (sincronización)
- ⏳ Gamificación y achievements
- ⏳ App móvil nativa (React Native)
- ⏳ Backend propio (opcional)

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Este proyecto está abierto a mejoras y nuevas ideas.

### Cómo Contribuir

1. **Fork el proyecto**
2. **Crea tu rama de feature**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit tus cambios**
   ```bash
   git commit -m 'Add: Amazing new feature'
   ```
4. **Push a la rama**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Abre un Pull Request**

### Guías de Estilo

**Código:**

- Sigue las reglas de ESLint configuradas
- Usa TypeScript para nuevos componentes
- Comenta código complejo
- Mantén componentes pequeños y reutilizables

**Commits:**

- Usa [Conventional Commits](https://www.conventionalcommits.org/)
- Formato: `tipo: descripción`
- Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Pull Requests:**

- Descripción clara del cambio
- Screenshots si hay cambios visuales
- Tests si es posible
- Actualiza documentación si es necesario

### Reportar Bugs

Usa [GitHub Issues](../../issues) con la plantilla de bug:

- Descripción del problema
- Pasos para reproducir
- Comportamiento esperado vs actual
- Screenshots si aplica
- Entorno (navegador, OS, versión)

### Solicitar Features

Usa [GitHub Issues](../../issues) con la plantilla de feature:

- Descripción clara de la funcionalidad
- Justificación (¿por qué es útil?)
- Propuesta de implementación (opcional)
- Mockups o referencias (opcional)

---

## 📜 Licencia

Este proyecto está bajo la licencia **MIT**. Ver archivo [LICENSE](LICENSE) para más detalles.

```
MIT License

Copyright (c) 2026 Psantoss26

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👤 Autor

**Psantoss26**

- GitHub: [@Psantoss26](https://github.com/Psantoss26)
- Proyecto: [The Show Verse](https://github.com/Psantoss26/the-show-verse)

---

## 🙏 Agradecimientos

- **[TMDb](https://www.themoviedb.org/)** por su excelente API de contenido audiovisual
- **[Trakt.tv](https://trakt.tv/)** por la API de tracking y sincronización
- **[Vercel](https://vercel.com/)** por el hosting y deployment
- **[Next.js](https://nextjs.org/)** y el equipo de Vercel por el framework
- **[Framer Motion](https://www.framer.com/motion/)** por la librería de animaciones
- **[Tailwind CSS](https://tailwindcss.com/)** por el sistema de diseño
- Comunidad open-source por todas las librerías utilizadas

---

## 📞 Soporte

¿Tienes preguntas o necesitas ayuda?

- 📧 **Email:** [crear issue en GitHub](../../issues)
- 💬 **Discussions:** [GitHub Discussions](../../discussions)
- 📖 **Docs:** Ver carpeta `/docs` para más documentación
- 🐛 **Bugs:** [Reportar en Issues](../../issues/new?template=bug_report.md)
- 💡 **Features:** [Solicitar en Issues](../../issues/new?template=feature_request.md)

---

<div align="center">

### ⭐ Si te gusta el proyecto, dale una estrella en GitHub ⭐

**Hecho con ❤️ y mucho ☕ por Psantoss26**

[⬆️ Volver arriba](#-the-show-verse)

</div>
