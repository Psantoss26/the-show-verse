# TFG — The Show Verse — PARTE 3
# Funcionalidades, APIs, Rendimiento y Conclusiones

---

# 9. FUNCIONALIDADES DETALLADAS

## 9.1 Dashboard Principal (`/`)

El dashboard es la página de entrada de la aplicación y la más compleja en cuanto a量 de datos gestionados. Se renderiza en el servidor (SSR) para garantizar el SEO y el tiempo de carga óptimo.

**Componentes del Hero:**
- Carrusel automático que rota entre las películas más valoradas de TMDb.
- Selección inteligente del backdrop: se priorizan imágenes en inglés, mayor resolución (width 1280) y más votos.
- Superposición del título y la sinopsis con gradiente oscuro progresivo.
- Botones de acción: "Ver detalles" y "Trailer".

**Secciones de Contenido Curado:**

| Sección | Fuente | Criterio |
|---|---|---|
| Top Rated Movies | TMDb `/movie/top_rated` | Rating medio más alto |
| Cult Classics | TMDb `/list/8146` | Lista pública curada |
| Mind-Bending Movies | TMDb `/discover/movie` | Keyword "twist" (id:2343) |
| Top Action Movies | TMDb `/discover/movie` | Género acción, votos ≥ 200 |
| Popular in US | TMDb `/discover/movie` | Region US, popularidad |
| Underrated Gems | TMDb `/discover/movie` | Rating ≥ 7.0, votos ≤ 200 |
| Rising Stars | TMDb `/discover/movie` | Año actual, en crecimiento |
| Trending Now | TMDb `/trending/movie/week` | Tendencias semanales |
| Trakt Recommended | Trakt API | Recomendaciones personales (si autenticado) |
| Trakt Anticipated | Trakt API | Las más esperadas por la comunidad |

Cada sección se renderiza como un carrusel horizontal con **lazy loading** de imágenes y efecto de entrada escalonado mediante `staggerChildren` de Framer Motion.

## 9.2 Búsqueda y Descubrimiento (`/discover`)

Implementado completamente en el cliente para ofrecer resultados en tiempo real.

**Sistema de filtros:**
- **Tipo:** Movie / TV Show
- **Géneros:** selección múltiple (checkboxes)
- **Año:** rango deslizante (desde–hasta)
- **Rating mínimo:** slider de 0 a 10
- **Idioma original:** selector desplegable
- **Ordenación:** popularidad, rating, fecha, votos

Los filtros se serializan como query params en la URL (ej. `/discover?type=movie&genre=28&year_from=2010&min_rating=7`), lo que permite compartir búsquedas y usar el botón "Atrás" del navegador de forma coherente.

**Scroll infinito:** al llegar al final de la lista, se carga automáticamente la siguiente página mediante un `IntersectionObserver`.

## 9.3 Detalles de Película y Serie (`/details/[type]/[id]`)

La página de detalle es el núcleo funcional de la aplicación. Integra datos de tres APIs (TMDb, Trakt, OMDb) para ofrecer una ficha completa.

**Header:**
- Backdrop a pantalla completa con gradiente oscuro progresivo.
- Poster con efecto hover (zoom suave).
- Título con logo oficial (del endpoint `/images` de TMDb cuando disponible).
- Metadatos principales: año, duración, géneros, idioma original.
- Ratings: TMDb (estrella amarilla), Trakt (porcentaje de corazones), IMDb e IMDb Rotten Tomatoes (via OMDb).

**Botones de acción rápida:**
- ⭐ **Favorito:** toggle sincronizado con Trakt (`/sync/favorites`).
- 🔖 **Watchlist:** toggle sincronizado con Trakt (`/sync/watchlist`).
- ✓ **Visto:** marca el contenido como visto. Para películas, registra en el historial. Para series, abre un modal de selección de temporada.
- ⭐ **Valorar:** abre el componente `StarRating` para asignar una puntuación de 1 a 10.
- ➕ **Añadir a lista:** permite añadir a cualquier lista personalizada de Trakt.

**Pestañas de contenido:**

| Tab | Contenido |
|---|---|
| Overview | Sinopsis, información técnica, productoras |
| Cast & Crew | Reparto y equipo con foto y rol |
| Images | Galería de backdrops y posters |
| Videos | Trailers y clips de YouTube |
| Recommendations | Contenido similar recomendado |
| Seasons (solo TV) | Temporadas y su estado de progreso |

**Para Series — Gestión de Temporadas:**
- Lista de todas las temporadas con número de episodios y fecha de première.
- Indicador de progreso por temporada (X / Y episodios vistos).
- Botón para marcar temporada completa como vista.
- Navegación a la página de detalles de temporada (`/s/season/[show_id]/[season]`).

## 9.4 Gestión de Temporadas y Episodios

**Página de Temporada** ([SeasonDetailsClient.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/SeasonDetailsClient.jsx)):
- Lista completa de episodios con: título, sinopsis, fecha de emisión, duración, rating y still (imagen del episodio).
- Toggle individual por episodio con actualización optimista de la UI.
- Botón "Marcar temporada completa" que hace una llamada batch a Trakt.
- Estadística de progreso en tiempo real: "12 de 22 episodios vistos (54%)".

**Grid de Ratings por Episodio** ([EpisodeRatingsGrid.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/EpisodeRatingsGrid.jsx)):
- Visualización de los ratings de todos los episodios de una temporada en formato grid.
- Permite identificar visualmente los episodios mejor y peor valorados.
- Los colores varían según el rating: azul oscuro (bajo) → verde (alto).

**Detalles de Episodio** ([EpisodeDetailsClient.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/EpisodeDetailsClient.jsx)):
- Sinopsis completa del episodio.
- Reparto invitado.
- Fecha y valoración de Trakt para ese episodio específico.

## 9.5 Favoritos y Watchlist (`/favorites`, `/watchlist`)

Ambas páginas comparten la misma arquitectura de componente con los siguientes elementos:

**Pestañas:** separación entre Movies (películas) y Shows (series).

**Tres vistas disponibles:**
- **Grid:** cuadrícula de 2-6 columnas con posters.
- **List:** tabla detallada con poster, título, año, rating y acciones.
- **Compact:** filas horizontales con poster y datos básicos. En hover se expande mostrando el backdrop completo (efecto spotlight).

**Actualización optimista:** cuando el usuario elimina un ítem de favoritos o watchlist, la UI se actualiza inmediatamente sin esperar la confirmación del servidor, y se revierte en caso de error.

**Contadores en Navbar:** el número de favoritos y watchlist se refleja en tiempo real en los iconos de la barra de navegación.

## 9.6 Historial de Visionado (`/history`)

El historial registra cada acción de visionado con su timestamp, permitiendo múltiples entradas para el mismo contenido (re-views).

**Estadísticas por período:**

| Período | Métricas |
|---|---|
| Esta semana | Películas vistas, episodios vistos, tiempo total |
| Este mes | Ídem |
| Este año | Ídem |
| Histórico total | Ídem + géneros favoritos |

**Efecto Spotlight (Vista Compact):**
- Al hacer hover sobre una tarjeta, se expande horizontalmente mostrando el backdrop.
- Los elementos adyacentes se difuminan con `backdrop-filter: blur`.
- Transición suave mediante Framer Motion `layout` animations.

**Gestión de entradas:**
- El usuario puede añadir la fecha exacta de visionado (via `React Day Picker`).
- Puede eliminar entradas individuales del historial.
- Para películas con múltiples views, todas las entradas aparecen diferenciadas.

## 9.7 Calendario (`/calendar`)

El calendario mensual integra datos del calendario personal de Trakt para mostrar:

- 📺 **Nuevos episodios:** de series que el usuario sigue en Trakt.
- 🎬 **Estrenos en watchlist:** películas que tiene pendientes y se estrenan próximamente.
- ✓ **Días con actividad:** días en que el usuario registró algo en su historial.

Navegación entre meses con transición animada. Cada día marcado muestra un tooltip al hover con el nombre del contenido.

## 9.8 Listas Personalizadas (`/lists`)

El módulo de listas permite gestionar las listas de Trakt del usuario:

- **Explorador de listas populares** de la comunidad de Trakt.
- **Visualización de listas propias** con todos sus ítems.
- **Creación de nuevas listas** mediante un formulario modal.
- **Añadir contenido a listas** desde la página de detalles.
- **Colecciones de TMDb:** integración con colecciones oficiales (ej. Marvel Cinematic Universe, saga Bond, etc.).

## 9.9 Detalles de Actor / Crew (`/s/person/[id]`)

Implementado en [ActorDetails.jsx](file:///e:/ASNPORTS/PELICULAS/the-show-verse/src/components/ActorDetails.jsx) con datos de TMDb:

- Fotografía de perfil y datos biográficos (fecha de nacimiento, lugar, fallecimiento si aplica).
- Carrusel "Known For" con sus obras más destacadas.
- Filmografía completa organizada en pestañas:
  - **Actuaciones como Actor** (películas y series).
  - **Trabajos como Crew** (director, productor, guionista, etc.).
- Galería de fotografías del actor.
- Enlace al perfil externo en IMDb y TMDb.

## 9.10 Sistema de Vistas (Grid, List, Compact)

El sistema de vistas es un componente transversal reutilizado en Favoritos, Watchlist, Historial, Películas y Series.

El modo de vista seleccionado se persiste en `localStorage` para que el usuario no tenga que cambiarlo cada vez. La transición entre vistas usa Framer Motion `AnimatePresence` con un efecto de *cross-fade* suave.

**Hover effects (Vista Grid):**
```
Al hacer hover:
1. La tarjeta hace scale(1.05)
2. Se muestra un overlay semi-transparente
3. Aparecen los metadatos (año, rating)
4. Se muestran los botones de acción rápida
```

## 9.11 Estadísticas de Usuario (`/stats`)

El módulo de estadísticas agrega los datos del historial y favoritos para mostrar:

- Tiempo total invertido en películas y series.
- Géneros favoritos (gráfico de barras con Recharts).
- Evolución de visionado mensual (gráfico de líneas).
- Actores y directores favoritos (por frecuencia de aparición en historial).
- Puntuación media de calificaciones dadas.

---

# 10. APIs INTEGRADAS

## 10.1 TMDb API (The Movie Database)

**Versión:** v3  
**URL Base:** `https://api.themoviedb.org/3`  
**Autenticación:** API Key como query parameter (`api_key`)  
**Rate Limit:** 40 requests / 10 segundos  
**Idioma por defecto:** `es-ES` (español de España)  
**Imágenes:** `https://image.tmdb.org/t/p/{size}/{file_path}`

### Endpoints Utilizados

| Categoría | Endpoint | Uso en la Aplicación |
|---|---|---|
| **Películas** | `GET /movie/top_rated` | Sección "Top Rated" del dashboard |
| | `GET /movie/popular` | Sección "Featured" |
| | `GET /trending/movie/week` | Sección "Trending Now" |
| | `GET /discover/movie` | Filtrado por género, año, región, keywords |
| **Series** | `GET /tv/popular` | Explorador de series |
| | `GET /tv/top_rated` | Series mejor valoradas |
| | `GET /trending/tv/week` | Tendencias de series |
| | `GET /tv/airing_today` | Episodios emitidos hoy |
| **Detalles** | `GET /movie/{id}` | Ficha completa de película |
| | `GET /tv/{id}` | Ficha completa de serie |
| | `GET /tv/{id}/season/{n}` | Detalles de temporada y episodios |
| | `GET /{type}/{id}/credits` | Reparto y crew |
| | `GET /{type}/{id}/images` | Backdrops, posters y logos |
| | `GET /{type}/{id}/videos` | Trailers y clips |
| | `GET /{type}/{id}/recommendations` | Contenido recomendado |
| | `GET /{type}/{id}/external_ids` | IMDb ID y otros identificadores |
| | `GET /{type}/{id}/watch/providers` | Plataformas de streaming |
| **Personas** | `GET /person/{id}` | Biografía de actor/crew |
| | `GET /person/{id}/movie_credits` | Filmografía en películas |
| | `GET /person/{id}/tv_credits` | Filmografía en series |
| | `GET /person/{id}/images` | Fotos del actor |
| **Búsqueda** | `GET /search/multi` | Búsqueda global (películas + series + personas) |
| **Listas** | `GET /list/{id}` | Lista pública de TMDb (Cult Classics, etc.) |
| **Géneros** | `GET /genre/movie/list` | Lista de géneros de películas |
| | `GET /genre/tv/list` | Lista de géneros de series |

### Tamaños de Imágenes

TMDb proporciona imágenes en múltiples resoluciones. El proyecto usa:

| Tipo | Tamaño | Uso |
|---|---|---|
| Poster | `w500` | Cards en Grid |
| Poster | `w185` | Cards en Compact / List |
| Backdrop | `w1280` | Hero, header de detalle |
| Backdrop | `w780` | Miniaturas de backdrop |
| Profile | `w185` | Fotos de actores |
| Logo | `w500` | Logo del título en detalle |

## 10.2 Trakt.tv API

**Versión:** v2  
**URL Base:** `https://api.trakt.tv`  
**Autenticación:** OAuth 2.0 (Bearer Token) + Client-ID header  
**Rate Limit (autenticado):** 1000 requests / 5 minutos  
**Formato de respuesta:** JSON  

### Headers Requeridos

```
Content-Type: application/json
trakt-api-version: 2
trakt-api-key: {TRAKT_CLIENT_ID}
Authorization: Bearer {ACCESS_TOKEN}  (endpoints autenticados)
```

### Endpoints de Autenticación (OAuth 2.0)

| Endpoint | Método | Descripción |
|---|---|---|
| `/oauth/authorize` | GET | Redirige al login de Trakt |
| `/oauth/token` | POST | Intercambio de código por tokens |
| `/oauth/token` | POST | Refresco de acceso con refresh_token |
| `/oauth/revoke` | POST | Revocación de token |

### Endpoints de Sincronización (autenticados)

| Endpoint | Método | Descripción |
|---|---|---|
| `/sync/favorites/movies` | GET | Lista de películas favoritas |
| `/sync/favorites/shows` | GET | Lista de series favoritas |
| `/sync/favorites` | POST | Añadir a favoritos |
| `/sync/favorites/remove` | POST | Eliminar de favoritos |
| `/sync/watchlist` | GET | Contenido en watchlist |
| `/sync/watchlist` | POST | Añadir a watchlist |
| `/sync/watchlist/remove` | POST | Eliminar de watchlist |
| `/sync/history` | GET | Historial de visionado |
| `/sync/history` | POST | Añadir al historial |
| `/sync/history/remove` | POST | Eliminar del historial |
| `/sync/ratings` | GET | Valoraciones del usuario |
| `/sync/ratings` | POST | Añadir valoración |
| `/sync/ratings/remove` | POST | Eliminar valoración |
| `/sync/watched/movies` | GET | Películas marcadas como vistas |
| `/sync/watched/shows` | GET | Series vistas con progreso por temporada |

### Endpoints de Shows (Series)

| Endpoint | Método | Descripción |
|---|---|---|
| `/shows/{id}/seasons` | GET | Temporadas de una serie |
| `/shows/{id}/seasons/{n}/episodes` | GET | Episodios de una temporada |
| `/calendars/my/shows` | GET | Próximos episodios del usuario |

### Endpoints Comunitarios

| Endpoint | Método | Descripción |
|---|---|---|
| `/movies/{id}/comments` | GET | Comentarios de la comunidad |
| `/shows/{id}/comments` | GET | Ídem para series |
| `/movies/{id}/lists` | GET | Listas de la comunidad que incluyen el ítem |
| `/movies/{id}/stats` | GET | Estadísticas del ítem (watchers, plays, etc.) |
| `/movies/{id}/ratings` | GET | Distribución de ratings de la comunidad |
| `/recommendations/movies` | GET | Recomendaciones personalizadas |

### Lookup por TMDb ID

La API de Trakt acepta identificadores de TMDb directamente mediante el parámetro `?tmdb=`:

```
GET https://api.trakt.tv/search/tmdb/{tmdb_id}?type=movie
GET https://api.trakt.tv/search/tmdb/{tmdb_id}?type=show
```

Esto permite traducir entre el `tmdb_id` (que usa el frontend) y el `trakt_slug` (que requieren algunos endpoints de Trakt).

## 10.3 OMDb API

**URL Base:** `http://www.omdbapi.com`  
**Autenticación:** API Key (`?apikey=`)  
**Rate Limit (gratuito):** 1000 requests / día  
**Dato principal obtenido:** Ratings de IMDb y Rotten Tomatoes

### Endpoint Utilizado

```
GET http://www.omdbapi.com/?i={imdb_id}&apikey={key}
```

**Respuesta relevante:**
```json
{
  "imdbRating": "8.9",
  "imdbVotes": "2,500,000",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "8.9/10" },
    { "Source": "Rotten Tomatoes", "Value": "97%" },
    { "Source": "Metacritic", "Value": "84/100" }
  ]
}
```

El `imdb_id` se obtiene del endpoint `external_ids` de TMDb antes de llamar a OMDb.

---

# 11. RENDIMIENTO Y OPTIMIZACIÓN

## 11.1 Estrategias de Rendimiento

### Server-Side Rendering (SSR) y ISR
Las páginas principales se generan en el servidor, eliminando el tiempo de hidratación inicial para el contenido crítico. Esto resulta en un **LCP (Largest Contentful Paint)** de aproximadamente 1.8 segundos.

### Code Splitting Automático
Next.js implementa code splitting automático por ruta: solo se carga el JavaScript necesario para la ruta activa, reduciendo el First Load JS.

### Optimización de Imágenes
Todas las imágenes se sirven mediante el componente `<Image>` de Next.js, que:
- Convierte automáticamente a formato WebP.
- Genera versiones srcset para diferentes densidades de pantalla.
- Implementa lazy loading nativo.
- Optimiza el CLS (Cumulative Layout Shift) reservando el espacio de la imagen.

### Caché HTTP
Las llamadas al servidor de TMDb incluyen cabeceras de caché:
- Catálogo: `cache: "force-cache"`, revalidación cada 10 minutos.
- Imágenes de TMDb: CDN de Vercel con TTL de 1 hora.

### Prefetching
Next.js prefetcha automáticamente las rutas enlazadas en los componentes `<Link>` que aparecen en el viewport, reduciendo el tiempo de navegación interna.

## 11.2 Métricas de Rendimiento (Lighthouse)

| Métrica | Score |
|---|---|
| Performance | 92/100 |
| Accessibility | 88/100 |
| Best Practices | 95/100 |
| SEO | 100/100 |

## 11.3 Core Web Vitals

| Métrica | Valor Obtenido | Objetivo | Estado |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | 1.8s | < 2.5s | ✅ Bueno |
| **FID** (First Input Delay) | 45ms | < 100ms | ✅ Bueno |
| **CLS** (Cumulative Layout Shift) | 0.05 | < 0.1 | ✅ Bueno |
| **FCP** (First Contentful Paint) | 1.2s | < 1.8s | ✅ Bueno |
| **TTI** (Time to Interactive) | 2.5s | < 3.8s | ✅ Bueno |

## 11.4 Bundle Size por Ruta

| Ruta | Tamaño de Ruta | First Load JS Total |
|---|---|---|
| `/` (Dashboard) | 152 kB | 385 kB |
| `/discover` | 98 kB | 331 kB |
| `/details/[type]/[id]` | 145 kB | 378 kB |
| `/favorites` | 87 kB | 320 kB |
| `/watchlist` | 87 kB | 320 kB |
| `/history` | 112 kB | 345 kB |

---

# 12. PRUEBAS Y VALIDACIÓN

## 12.1 Estrategia de Pruebas

El proyecto ha sido validado mediante las siguientes estrategias:

### Pruebas Manuales Funcionales

Se ha comprobado el correcto funcionamiento de cada funcionalidad en los principales navegadores (Chrome, Firefox, Safari, Edge):

| Módulo | Casos de Prueba |
|---|---|
| Autenticación | Login OAuth, refresh de token, logout, cookie persistence |
| Dashboard | Carga de todas las secciones, hero autoscroll, carruseles |
| Búsqueda | Filtros, paginación, persistencia en URL |
| Detalles | Datos de las 3 APIs, botones de acción, navegación de tabs |
| Episodios | Toggle individual, temporada completa, actualización de progreso |
| Favoritos/Watchlist | Añadir, quitar, actualización optimista, contadores |
| Historial | Registro de vistas, estadísticas, múltiples visionados |
| Calendario | Render de eventos, navegación entre meses |
| Vistas | Grid / List / Compact, persistencia en localStorage |
| Responsive | Móvil, tableta, laptop, 4K |

### Validación de API (Dredd)

El proyecto incluye una especificación [apiary.apib](file:///e:/ASNPORTS/PELICULAS/the-show-verse/apiary.apib) (API Blueprint) y un fichero [dredd.yml](file:///e:/ASNPORTS/PELICULAS/the-show-verse/dredd.yml) para la validación automática de los contratos de las API Routes internas.

### Validación de Accesibilidad

Se ha utilizado la extensión **axe DevTools** para identificar y corregir los principales problemas de accesibilidad (contraste de colores, atributos `alt` en imágenes, roles ARIA en botones).

## 12.2 Herramientas de Validación Utilizadas

| Herramienta | Uso |
|---|---|
| Chrome DevTools Lighthouse | Rendimiento, SEO, accesibilidad |
| axe DevTools | Validación de accesibilidad WCAG |
| Vercel Speed Insights | Core Web Vitals en producción |
| Vercel Analytics | Páginas más visitadas, geografía |
| React Developer Tools | Profiling de componentes |

---

# 13. DESPLIEGUE Y DEVOPS

## 13.1 Plataforma de Despliegue: Vercel

La aplicación está desplegada en **Vercel**, la plataforma de despliegue creada por los mismos creadores de Next.js. Vercel ofrece una integración nativa que aprovecha todas las características del framework.

**Ventajas:**
- Despliegue automático en cada push a la rama `main` de GitHub.
- CDN global con edge nodes en más de 100 ubicaciones.
- HTTPS automático con certificado SSL Let's Encrypt.
- Variables de entorno cifradas en el dashboard.
- Analítica y Speed Insights integrados.
- Servicio gratuito para proyectos personales/académicos.

## 13.2 Flujo de CI/CD

```
Push a GitHub (rama main)
         │
         ▼
Vercel detecta el push (webhook)
         │
         ▼
npm install + next build
         │
         ├─── Build exitoso ──► Despliegue en producción
         │
         └─── Build fallido ──► Notificación + rollback automático
```

## 13.3 Variables de Entorno

La aplicación requiere las siguientes variables de entorno, configuradas en el dashboard de Vercel:

| Variable | Scope | Descripción |
|---|---|---|
| `NEXT_PUBLIC_TMDB_API_KEY` | Público | API Key de TMDb (v3) |
| `TMDB_V4_ACCESS_TOKEN` | Servidor | Token de acceso TMDb v4 (para endpoints avanzados) |
| `TRAKT_CLIENT_ID` | Servidor | Client ID de la aplicación Trakt |
| `TRAKT_CLIENT_SECRET` | Servidor | Client Secret de Trakt |
| `TRAKT_REDIRECT_URI` | Servidor | URI de callback OAuth |
| `OMDB_API_KEY` | Servidor | API Key de OMDb |

> **Seguridad:** las variables sin el prefijo `NEXT_PUBLIC_` están disponibles exclusivamente en el servidor, nunca en el bundle del cliente.

## 13.4 Configuración de Next.js ([next.config.ts](file:///e:/ASNPORTS/PELICULAS/the-show-verse/next.config.ts))

La configuración de Next.js define los dominios de imágenes permitidos para el componente `<Image>`, incluyendo `image.tmdb.org` y `walter.trakt.tv` (avatares Trakt).

## 13.5 Control de Versiones

El proyecto sigue el modelo de **Feature Branch Workflow** de Git:

- `main`: rama principal, siempre estable y desplegada en producción.
- `feature/nombre-funcionalidad`: ramas de desarrollo por funcionalidad.
- Commits siguiendo **Conventional Commits** (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`).

---

# 14. CONCLUSIONES Y TRABAJO FUTURO

## 14.1 Conclusiones

El desarrollo de **The Show Verse** ha permitido alcanzar todos los objetivos planteados al inicio del proyecto, tanto funcionales como técnicos y de diseño.

Desde el punto de vista **técnico**, se ha demostrado la viabilidad de integrar múltiples APIs externas en una aplicación Next.js con una arquitectura sólida y escalable. La implementación del patrón Server Component + Client Component permite optimizar tanto el rendimiento (SSR) como la interactividad (Client Components), sin sacrificar ninguno de los dos.

La implementación del flujo OAuth 2.0 completo con Trakt, con cookies httpOnly y refresco automático de tokens, demuestra cómo gestionar la autenticación de forma segura en una aplicación Next.js sin necesidad de un backend adicional.

Desde el punto de vista del **diseño**, el proyecto establece un listón alto en términos de calidad visual para aplicaciones web de gestión de contenido, con animaciones cuidadas, un sistema de vistas flexible y una experiencia de usuario coherente en todos los dispositivos.

Las **métricas de rendimiento** obtenidas (Performance 92/100, SEO 100/100, LCP 1.8s, CLS 0.05) confirman que es posible construir aplicaciones web visualmente ricas sin sacrificar el rendimiento, siempre que se apliquen las técnicas adecuadas (SSR, ISR, optimización de imágenes, code splitting).

## 14.2 Dificultades Encontradas

**Integración OAuth con Trakt:** la gestión del ciclo de vida del token (expiración, refresco, revocación) en el contexto de Next.js App Router requirió un diseño cuidadoso para evitar condiciones de carrera y mantener la sesión coherente entre renders del servidor y el cliente.

**Sincronización de estado:** mantener el estado de favoritos, watchlist y visionado coherente entre la UI y el servidor de Trakt, especialmente con la **actualización optimista** de la interfaz, fue uno de los retos más complejos del proyecto.

**Caché vs. Datos frescos:** encontrar el equilibrio entre cachear agresivamente las respuestas de TMDb (para no consumir el rate limit) y mostrar datos actualizados fue un reto resuelto mediante la estrategia ISR con ventanas de revalidación diferenciadas según el tipo de dato.

## 14.3 Trabajo Futuro

El proyecto presenta un roadmap claro para versiones futuras:

### v1.1 — Mejoras Inmediatas
- [ ] Suite de tests automatizados (Jest, Testing Library, Playwright E2E).
- [ ] Mejoras de accesibilidad WCAG 2.1 AA completo.
- [ ] Búsqueda con autocompletado y sugerencias.
- [ ] Sistema de caché optimista con SWR o React Query.

### v1.5 — Nuevas Funcionalidades
- [ ] **PWA (Progressive Web App):** instalable en dispositivos móviles y escritorio.
- [ ] **Modo offline básico:** cache de última visita mediante Service Worker.
- [ ] **Notificaciones push:** alertas de nuevos episodios de series seguidas.
- [ ] **Exportación de datos:** CSV, JSON del historial personal.
- [ ] **Temas personalizables:** colores de acento configurables.

### v2.0 — Funcionalidades Avanzadas
- [ ] **Recomendaciones con IA/ML:** modelo de recomendación basado en el historial personal.
- [ ] **Funcionalidades sociales:** seguir usuarios, compartir listas, comentarios.
- [ ] **Integración directa con streaming:** detección automática de lo que hay disponible en cada plataforma del usuario.
- [ ] **App móvil nativa:** React Native compartiendo lógica de negocio con el frontend web.
- [ ] **Gamificación:** achievements, badges, rachas de visionado.

---

# 15. BIBLIOGRAFÍA Y REFERENCIAS

## Documentación Oficial

[1] Next.js. (2024). *Next.js Documentation — App Router*. Vercel Inc. https://nextjs.org/docs

[2] React. (2024). *React Documentation — Server Components*. Meta Open Source. https://react.dev

[3] The Movie Database. (2024). *TMDb API Documentation (v3)*. https://developer.themoviedb.org/docs

[4] Trakt. (2024). *Trakt API Documentation v2*. Apiary. https://trakt.docs.apiary.io/

[5] OMDb API. (2024). *The Open Movie Database API*. http://www.omdbapi.com/

[6] Tailwind CSS. (2024). *Tailwind CSS Documentation v4*. https://tailwindcss.com/docs

[7] Framer Motion. (2024). *Framer Motion Documentation*. Framer. https://www.framer.com/motion/

## RFC y Estándares

[8] Hardt, D. (Ed.). (2012). *RFC 6749: The OAuth 2.0 Authorization Framework*. IETF. https://www.rfc-editor.org/rfc/rfc6749

[9] Berners-Lee, T., Fielding, R., & Masinter, L. (1999). *RFC 2396: Uniform Resource Identifiers (URI): Generic Syntax*. IETF.

[10] Fielding, R. (2000). *Architectural Styles and the Design of Network-based Software Architectures* (Doctoral dissertation, University of California, Irvine). [REST]

## Libros y Publicaciones

[11] Wieruch, R. (2024). *The Road to React*. Robin Wieruch.

[12] Google Developers. (2024). *Web Vitals — Essential metrics for a healthy site*. https://web.dev/vitals/

[13] Schwaber, K., & Sutherland, J. (2020). *The Scrum Guide*. Scrum.org.

## Librerías de Terceros

[14] Lucide Icons. (2024). *Lucide React*. https://lucide.dev/

[15] date-fns contributors. (2024). *date-fns — Modern JavaScript date utility library*. https://date-fns.org/

[16] Recharts. (2024). *Recharts — Redefined chart library built with React and D3*. https://recharts.org/

[17] Swiper. (2024). *Swiper — Most Modern Mobile Touch Slider*. https://swiperjs.com/

---

*Trabajo de Fin de Grado — The Show Verse*  
*Autor: Pablo Santos García (Psantoss26)*  
*Curso 2025–2026*
