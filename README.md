<div align="center">

<a href="https://theshowverse.com">
  <img src="docs/assets/readme/banner.jpg" alt="The Show Verse: tu universo personal de cine y series" width="100%">
</a>

<br>
<br>

[English](README.en.md) · **Español**

<br>

**Descubre, sigue y comparte todo lo que ves.**<br>
Películas, series, temporadas y episodios en un solo sitio, con tus listas, tu historial, tu comunidad y tus plataformas de streaming sincronizadas.

<br>

[![Web](https://img.shields.io/badge/🌐_theshowverse.com-Abrir_la_app-e8b64a?style=for-the-badge&labelColor=111111)](https://theshowverse.com)
[![Docs](https://img.shields.io/badge/📚_Documentación-docs/-1f6feb?style=for-the-badge&labelColor=111111)](docs/README.md)
[![Changelog](https://img.shields.io/badge/📝_Changelog-novedades-2ea043?style=for-the-badge&labelColor=111111)](CHANGELOG.md)
[![Licencia](https://img.shields.io/badge/Licencia-AGPL--3.0-a855f7?style=for-the-badge&labelColor=111111)](LICENSE)

<br>

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-0b1120?style=flat-square&logo=tailwindcss&logoColor=38bdf8)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-111111?style=flat-square&logo=framer&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify_5-000000?style=flat-square&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-1a1a1a?style=flat-square&logo=drizzle&logoColor=c5f74f)
![Redis](https://img.shields.io/badge/Redis-dc382d?style=flat-square&logo=redis&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5a0fc8?style=flat-square&logo=pwa&logoColor=white)
![Android](https://img.shields.io/badge/Android-3ddc84?style=flat-square&logo=android&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ed?style=flat-square&logo=docker&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

<br>

[Tour visual](#-tour-visual) ·
[Funcionalidades](#-funcionalidades) ·
[Ecosistema](#-ecosistema) ·
[Arquitectura](#%EF%B8%8F-arquitectura) ·
[Puesta en marcha](#-puesta-en-marcha) ·
[Documentación](#-documentación) ·
[Roadmap](#%EF%B8%8F-roadmap)

</div>

---

## 🎯 Qué es The Show Verse

En plena era del streaming lo que ves está repartido entre Netflix, Max, Disney+, Prime Video, Crunchyroll… **The Show Verse** lo junta todo en una experiencia cuidada al detalle:

<table>
<tr>
<td width="25%" align="center">🔍<br><b>Descubre</b><br><sub>Dashboards curados, recomendaciones propias y búsqueda con filtros</sub></td>
<td width="25%" align="center">📺<br><b>Sigue</b><br><sub>Historial, progreso por episodio, «continuar viendo» y calendario</sub></td>
<td width="25%" align="center">🗂️<br><b>Organiza</b><br><sub>Favoritos, pendientes, listas propias y colecciones</sub></td>
<td width="25%" align="center">💬<br><b>Comparte</b><br><sub>Perfiles públicos, reseñas, historias diarias y recap anual</sub></td>
</tr>
</table>

---

## 🎬 Tour visual

> Capturas reales de la app con mi cuenta y la sesión iniciada: mis notas, favoritos, listas y la vista que tengo elegida en cada página. Se regeneran con [`scripts/capture-readme-screenshots.mjs`](scripts/capture-readme-screenshots.mjs).

### 🏠 Inicio

Un hero a pantalla completa con tráiler, logo del título y acciones rápidas, seguido de tus filas personales («Continuar viendo», recomendaciones…) y de contenido curado.

<img src="docs/assets/readme/home.jpg" alt="Inicio con hero a pantalla completa" width="100%">

<img src="docs/assets/readme/home-rows.jpg" alt="Filas del dashboard con Continuar viendo" width="100%">
<p align="center"><sub><b>Filas del dashboard</b>: mejor valoradas, continuar viendo, populares, próximos episodios…</sub></p>

### 🎞️ Fichas de películas y series

Todo sobre un título en una sola página: portada y fondo elegidos por ti, premios, plataformas donde verlo (con Plex), la fila de **botones de acción**, el **marcador** de puntuaciones (TMDb, Trakt, IMDb, Rotten Tomatoes, Letterboxd…) con las estadísticas de la comunidad, y debajo un menú de secciones fijo: reparto, temporadas, recomendaciones, premios, media, sentimientos, comentarios y listas que lo incluyen.

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/details-movie.jpg" alt="Ficha de la película Origen en escritorio">
<p align="center"><sub><b>Película</b>: tu nota, visto y favorito ya marcados en los botones</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/details-tv.jpg" alt="Ficha de la serie Breaking Bad en escritorio">
<p align="center"><sub><b>Serie</b>: progreso de episodios vistos en el botón de Trakt</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/readme/details-movie-scroll.jpg" alt="Ficha de película al desplazar, con el menú de secciones">
<p align="center"><sub><b>Al desplazar</b>: menú de secciones fijo y flechas al título anterior y siguiente</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/details-tv-scroll.jpg" alt="Ficha de serie al desplazar, con temporadas">
<p align="center"><sub><b>Temporadas y reparto</b> de la serie</sub></p>
</td>
</tr>
</table>

<img src="docs/assets/readme/movie-scroll2.jpg" alt="Colección, premios y galería de portadas" width="100%">
<p align="center"><sub><b>Colección, premios y galería de arte</b>: elige portada, fondo y logo por idioma</sub></p>

#### En el móvil

La ficha móvil no es la de escritorio encogida: cabecera inmersiva con el póster a pantalla completa y el logo del título, botones de acción en una fila, marcador compacto con las notas que elijas en Ajustes y barra inferior con tus páginas.

<img src="docs/assets/readme/mobile-details.jpg" alt="Fichas de Origen, Breaking Bad e Interstellar en el móvil, y la ficha desplazada" width="100%">
<p align="center"><sub><b>Origen</b>, <b>Breaking Bad</b>, <b>Interstellar</b> y la ficha de Origen al desplazar</sub></p>

### 🎛️ Botones de acción y sus modales

Cada botón de la ficha abre su propio modal de cristal, que nace del botón y vuelve a él al cerrarse. Favorito y pendiente se marcan con un toque, sin modal.

| Botón | Qué hace |
| --- | --- |
| ▶️ **Tráiler** | Reproduce el tráiler oficial (o eliges otro vídeo del título) |
| 🎵 **Banda sonora** | Escucha la banda sonora, con reproducción automática opcional y 👍 / 👎 por canción |
| 👁️ **Vistos (Trakt)** | Historial de visionados; en series, el progreso por temporada y episodio |
| ⭐ **Puntuación** | Tu nota de 1 a 10 y el reparto de votos de la comunidad |
| ❤️ / 🔖 **Favorito y pendiente** | Añadir o quitar con un toque |
| 📃 **Listas** | Añade el título a tus listas o crea una nueva |
| 💬 **Reseñas** | Reseñas de la comunidad y la tuya |
| 👥 **Actividad** | Qué han hecho con el título las personas que sigues |
| 🔗 **Enlaces** | TMDb, Trakt, IMDb, Rotten Tomatoes, Letterboxd, JustWatch, Wikipedia… |
| 📤 **Compartir** | Tarjeta del título lista para compartir, como imagen o vídeo |

<table>
<tr>
<td width="33%">
<img src="docs/assets/readme/action-trailer.jpg" alt="Modal del tráiler">
<p align="center"><sub><b>Tráiler</b></sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-soundtrack.jpg" alt="Modal de la banda sonora">
<p align="center"><sub><b>Banda sonora</b></sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-rating.jpg" alt="Modal de puntuación">
<p align="center"><sub><b>Puntuación</b></sub></p>
</td>
</tr>
<tr>
<td width="33%">
<img src="docs/assets/readme/action-trakt.jpg" alt="Modal de visionados de Trakt en una película">
<p align="center"><sub><b>Vistos</b> en una película</sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-trakt-tv.jpg" alt="Modal de episodios vistos de una serie">
<p align="center"><sub><b>Vistos</b> en una serie, por episodio</sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-lists.jpg" alt="Modal de listas">
<p align="center"><sub><b>Listas</b></sub></p>
</td>
</tr>
<tr>
<td width="33%">
<img src="docs/assets/readme/action-reviews.jpg" alt="Modal de reseñas">
<p align="center"><sub><b>Reseñas</b></sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-activity.jpg" alt="Modal de actividad de quienes sigues">
<p align="center"><sub><b>Actividad</b> de quienes sigues</sub></p>
</td>
<td width="33%">
<img src="docs/assets/readme/action-links.jpg" alt="Modal de enlaces externos">
<p align="center"><sub><b>Enlaces</b> externos</sub></p>
</td>
</tr>
<tr>
<td width="33%" colspan="3" align="center">
<img src="docs/assets/readme/action-share.jpg" alt="Modal de compartir" width="66%">
<p align="center"><sub><b>Compartir</b></sub></p>
</td>
</tr>
</table>

### 📺 Temporadas y episodios

Cada temporada y cada episodio tiene su propia ficha, con el mismo diseño que la de la serie: nota y visto por episodio, reparto e invitados, imágenes y paso al anterior o siguiente con flechas (o deslizando en el móvil).

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/season.jpg" alt="Ficha de la temporada 5 de Breaking Bad">
<p align="center"><sub><b>Temporada</b>: episodios con nota y visto</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/episode.jpg" alt="Ficha del episodio Ozymandias de Breaking Bad">
<p align="center"><sub><b>Episodio</b>: puntuaciones, reparto invitado y fotogramas</sub></p>
</td>
</tr>
</table>

<p align="center">
<img src="docs/assets/readme/mobile-season-episode.jpg" alt="Temporada y episodio en el móvil" width="60%">
<br>
<sub><b>En el móvil</b>: la temporada con su póster y el episodio con dos fotogramas apilados</sub>
</p>

### 📚 Tu biblioteca

Cada página personal con la vista que tengas elegida, buscador, filtros, orden, agrupación y contadores.

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/favorites.jpg" alt="Favoritos">
<p align="center"><sub><b>Favoritos</b></sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/watchlist.jpg" alt="Pendientes">
<p align="center"><sub><b>Pendientes</b></sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/readme/history.jpg" alt="Historial">
<p align="center"><sub><b>Historial</b> agrupado por mes, con calendario</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/continue.jpg" alt="Continuar viendo">
<p align="center"><sub><b>Continuar viendo</b>: lo detectado en tus plataformas y lo añadido a mano</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/readme/inprogress.jpg" alt="En progreso">
<p align="center"><sub><b>En progreso</b>: avance por temporada y episodio</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/completed.jpg" alt="Completadas">
<p align="center"><sub><b>Completadas</b></sub></p>
</td>
</tr>
<tr>
<td width="50%" colspan="2">
<img src="docs/assets/readme/biblio.jpg" alt="Biblioteca de Plex">
<p align="center"><sub><b>Biblioteca</b>: tu servidor Plex</sub></p>
</td>
</tr>
</table>

### 📲 Ficha rápida lateral en vista teléfono

Desde cualquier página personal, pulsar un título abre su ficha en un **panel lateral acoplado** sin salir de la página: la cuadrícula se recoloca a su lado. En **vista teléfono** el panel reproduce la ficha móvil (portada con logo, botones, marcador y todas las secciones al desplazar) y se puede pasar de un título a otro sin cerrarlo. Cómo se abren las fichas (panel centrado o lateral, superpuesto o acoplado, vista de escritorio o de teléfono, o página completa) se elige en Ajustes.

<img src="docs/assets/readme/drawer-favorites.jpg" alt="Favoritos con la ficha de Origen abierta en el panel lateral" width="100%">
<p align="center"><sub><b>Abierto desde Favoritos</b></sub></p>

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/drawer-watchlist.jpg" alt="Pendientes con la ficha de Breaking Bad en el panel lateral">
<p align="center"><sub><b>Abierto desde Pendientes</b></sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/drawer-watchlist-scroll.jpg" alt="Panel lateral desplazado con marcador y detalles">
<p align="center"><sub><b>Al desplazar</b>: marcador, estadísticas y secciones</sub></p>
</td>
</tr>
</table>

### 👤 Perfil

Perfil público en `/u/[usuario]` con pestañas para nivel, estadísticas, vista neuronal, actividad, diario, reseñas, favoritos, pendientes, puntuaciones, listas y social.

<img src="docs/assets/readme/profile.jpg" alt="Perfil con películas y series favoritas, nivel y actividad" width="100%">
<p align="center"><sub><b>Perfil</b>: películas y series favoritas, nivel, resumen del año y actividad</sub></p>

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/stats.jpg" alt="Estadísticas">
<p align="center"><sub><b>Estadísticas</b>: actividad mensual, horas vistas, rachas, hora y día favoritos</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/level.jpg" alt="Nivel">
<p align="center"><sub><b>Nivel</b>: rango, XP, logros y de dónde sale la experiencia</sub></p>
</td>
</tr>
</table>

<img src="docs/assets/readme/neuronal.jpg" alt="Vista neuronal" width="100%">
<p align="center"><sub><b>Vista neuronal</b>: grafo de todo lo que has visto, unido por géneros y sagas</sub></p>

### 💬 Social · Hoy

Lo más destacado de lo que han visto, puntuado y reseñado la gente que sigues (o toda la comunidad) hoy, ayer o esta semana.

<img src="docs/assets/readme/social.jpg" alt="Social, vista Hoy" width="100%">
<p align="center"><sub><b>Hoy</b>: historia destacada, lo que ha visto la gente que sigues y los más activos</sub></p>

<p align="center">
<img src="docs/assets/readme/stories-hover.jpg" alt="Historias de Hoy con la ficha del título" width="60%">
<br>
<sub><b>Historias</b> por título; al pasar el ratón, la portada se gira y muestra la ficha</sub>
</p>

### 🧭 Explorar

<table>
<tr>
<td width="50%">
<img src="docs/assets/readme/movies.jpg" alt="Películas">
<p align="center"><sub><b>Películas</b></sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/series.jpg" alt="Series">
<p align="center"><sub><b>Series</b></sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/readme/discover.jpg" alt="Descubrir">
<p align="center"><sub><b>Descubrir</b>: buscador, tipo, orden, filtros avanzados y varias vistas</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/calendar.jpg" alt="Calendario">
<p align="center"><sub><b>Calendario</b> de estrenos y de tus episodios</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/readme/lists.jpg" alt="Listas de la comunidad">
<p align="center"><sub><b>Listas y colecciones</b> de la comunidad</sub></p>
</td>
<td width="50%">
<img src="docs/assets/readme/person.jpg" alt="Ficha de persona">
<p align="center"><sub><b>Personas</b>: biografía, filmografía, premios y fotos</sub></p>
</td>
</tr>
</table>

### 📱 En el móvil

Diseño propio para móvil (no una versión encogida): cabeceras inmersivas, barra inferior configurable, gestos para pasar de título, vista previa al mantener pulsada una tarjeta y PWA instalable.

<img src="docs/assets/readme/mobile-showcase.jpg" alt="Inicio, ficha, Favoritos, En progreso, Perfil y Social en móvil" width="100%">

---

## ✨ Funcionalidades

<table>
<tr>
<td width="33%" valign="top">

### 🎬 Catálogo
- Dashboards curados y recomendaciones propias
- Fichas de películas, series, temporadas, episodios y personas
- Marcador de notas de 8+ fuentes
- Tráileres, bandas sonoras y dónde verlo
- Arte por idioma (en → es → original)

</td>
<td width="33%" valign="top">

### 📊 Seguimiento
- Historial y progreso por episodio
- Continuar viendo, completadas y en curso
- Puntuaciones propias de 0 a 10
- Calendario de estrenos personal
- Estadísticas de visionado

</td>
<td width="33%" valign="top">

### 🗂️ Biblioteca
- Favoritos y pendientes con varias vistas
- Listas propias y colecciones
- Importación desde Trakt, TMDb, IMDb y Letterboxd
- Exportación de tus datos
- Integración con Plex

</td>
</tr>
<tr>
<td width="33%" valign="top">

### 👥 Social
- Perfiles públicos y seguidores
- Vista **Hoy** con historias diarias
- Reseñas, sentimiento y «me gusta»
- «Tus amigos» en cada ficha
- Compartir fichas y listas como imagen

</td>
<td width="33%" valign="top">

### 🏆 Gamificación
- Niveles, XP y 8 rangos
- Rachas de visionado
- 38 logros
- Recap anual compartible

</td>
<td width="33%" valign="top">

### ⚡ Experiencia
- PWA con modo sin conexión
- Notificaciones push (web y Android)
- Transiciones y cristal líquido
- Vuelta atrás instantánea con pantallas vivas
- Sincronización automática de streaming

</td>
</tr>
</table>

<details>
<summary><b>📖 Ver el detalle de cada área</b></summary>
<br>

| Área | Qué incluye | Documento |
|---|---|---|
| Hoy | Historias a pantalla completa, destacada, «Para ti», feed por título/persona/hora y más activos | [hoy.md](docs/features/hoy.md) |
| Social y perfiles | `/u/[username]`, seguir, Miembros, vista neuronal | [social-y-perfiles.md](docs/features/social-y-perfiles.md) |
| Comunidad | Comentarios, reseñas, sentimiento, listas de la comunidad | [comunidad.md](docs/features/comunidad.md) |
| Niveles y logros | XP, rangos, rachas y logros | [niveles-y-logros.md](docs/features/niveles-y-logros.md) |
| Recap anual | «Tu año en The Show Verse» | [recap-anual.md](docs/features/recap-anual.md) |
| Páginas de usuario | Continuar viendo, completadas, recomendaciones, importaciones | [paginas-de-usuario.md](docs/features/paginas-de-usuario.md) |
| Vista previa móvil | Mantener pulsada una tarjeta abre su vista previa | [vista-previa-movil.md](docs/features/vista-previa-movil.md) |
| Detecciones de streaming | Extensión y app Android: qué se detecta y cómo se corrige | [detecciones-streaming.md](docs/features/detecciones-streaming.md) |
| Notificaciones | Push y avisos en la app | [push-notifications.md](docs/push-notifications.md) |

</details>

---

## 🔌 Integraciones

<img src="docs/assets/readme/integrations.jpg" alt="Servicios integrados" width="100%">

| Servicio | Para qué |
|---|---|
| **TMDb** | Metadatos, imágenes, reparto y búsqueda |
| **Trakt** | Estadísticas, listas e importación de historial |
| **IMDb · Rotten Tomatoes · Metacritic · FilmAffinity** | Marcador de puntuaciones (vía OMDb y fuentes propias) |
| **Letterboxd · IMDb** | Importación por exportación y RSS |
| **Plex** | Tu biblioteca y reproducción |
| **JustWatch** | Dónde ver cada título |
| **Spotify** | Banda sonora de cada título |
| **Wikipedia · SeriesGraph** | Enlaces y gráficas de episodios |

---

## 🌌 Ecosistema

```mermaid
flowchart LR
    subgraph Clientes
        W["🌐 Web / PWA<br/>Next.js 16"]
        E["🧩 Extensión de navegador<br/>netflix-extension/"]
        A["🤖 App Android<br/>android-companion/"]
    end
    subgraph Servidor
        API["⚡ API /v1<br/>Fastify 5"]
        DB[("🐘 PostgreSQL<br/>Drizzle ORM")]
        R[("🟥 Redis<br/>caché")]
    end
    X["🎬 TMDb · Trakt · OMDb<br/>Plex · Spotify · JustWatch"]

    W -- "rutas /api (BFF)" --> API
    E -- "detecciones de streaming" --> API
    A -- "detecciones + push FCM" --> API
    W --> X
    API --> DB
    API --> R
    API --> X
```

| Pieza | Qué hace | Dónde |
|---|---|---|
| 🌐 **Web y PWA** | La app completa, instalable y con modo sin conexión | [`src/`](src) |
| ⚡ **Backend** | API propia: cuentas, biblioteca, comunidad, niveles, recap, push | [`backend/`](backend) · [referencia](docs/backend/backend_api_reference.md) |
| 🧩 **Extensión** | Detecta lo que ves en Netflix, Prime Video, Max, Disney+, Crunchyroll… | [`netflix-extension/`](netflix-extension) |
| 🤖 **App Android** | Detección de reproducción en el móvil y notificaciones | [`android-companion/`](android-companion) · [guía](docs/Companion-Apps.md) |

---

## 🏗️ Arquitectura

<table>
<tr>
<td width="50%" valign="top">

#### Frontend
| | |
|---|---|
| Framework | **Next.js 16** (App Router, RSC) |
| UI | **React 19**, Tailwind CSS 4 |
| Animación | Framer Motion 12, WAAPI, scroll-driven animations |
| Carruseles | Swiper |
| Gráficas | Recharts, d3-force |
| Iconos | Lucide |
| Offline | Service worker propio + cola de acciones |

</td>
<td width="50%" valign="top">

#### Backend e infraestructura
| | |
|---|---|
| API | **Fastify 5** + Zod + Swagger |
| Datos | **PostgreSQL** + Drizzle ORM |
| Caché | Redis (ioredis) |
| Auth | JWT propios (jose), Google OAuth |
| Push | web-push + FCM |
| Despliegue | Vercel · Docker en NAS + Cloudflare Tunnel |
| CI/CD | GitHub Actions |

</td>
</tr>
</table>

Más detalle en [`docs/architecture/`](docs/architecture/Architecture.md) e [`docs/infrastructure/`](docs/infrastructure/README.md).

---

## 🚀 Puesta en marcha

### Requisitos

- **Node.js 22+**
- **Docker Engine** y **Docker Compose v2** (PostgreSQL 18 y Redis 7 corren en contenedores)
- Claves de **TMDb** (obligatoria) y, opcionalmente, Google, Trakt, OMDb y Spotify

### Instalación

```bash
git clone https://github.com/Psantoss26/the-show-verse.git
cd the-show-verse
npm ci
npm --prefix backend ci
cp .env.example .env
cp backend/.env.example backend/.env
npm run local:setup
```

Rellena las claves en `.env` y `backend/.env`. `local:setup` genera la configuración local (`.env.development.local` y `backend/.env.local`) sin tocar tus `.env`.

### Arranque diario

En dos terminales:

```bash
npm run dev
```

```bash
npm --prefix backend run dev
```

| Servicio | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |

El backend levanta los contenedores, espera a que estén sanos y aplica las migraciones. Guía completa: [ARRANQUE-LOCAL.md](docs/infrastructure/ARRANQUE-LOCAL.md).

<details>
<summary><b>🧰 Scripts útiles</b></summary>
<br>

| Script | Qué hace |
|---|---|
| `npm run dev` | Web en modo desarrollo |
| `npm run backend:dev` | API en modo desarrollo |
| `npm run db:up` / `db:down` | Arranca o para PostgreSQL y Redis |
| `npm run db:reset` | Borra y recrea la base local |
| `npm run db:sync-prod` | Copia la base de producción a local |
| `npm run backend:migrate` | Aplica las migraciones |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |

</details>

<details>
<summary><b>🔑 Configurar Trakt y Spotify (opcional)</b></summary>
<br>

**Trakt**
1. Crea una aplicación en [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications/new).
2. Añade como Redirect URI `http://localhost:3000/api/trakt/auth/callback` (y tu dominio en producción).
3. Copia `TRAKT_CLIENT_ID` y `TRAKT_CLIENT_SECRET` en `.env`.

**Spotify** (mejora el modal de banda sonora)
1. Crea una app en [Spotify for Developers](https://developer.spotify.com/dashboard) con **Web API** y la Redirect URI `https://<tu-dominio>/api/spotify/callback`.
2. Copia `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` y `SPOTIFY_REDIRECT_URI` en `.env`.
3. Abre `/api/spotify/login`, autoriza y guarda el `SPOTIFY_REFRESH_TOKEN` que se muestra.

**Google**: autoriza `http://localhost:3000/api/auth/google/callback` ([guía](docs/backend/google_auth_setup.md)).

</details>

<details>
<summary><b>📸 Regenerar las capturas del README</b></summary>
<br>

Con la web y la API en marcha y la base local, el script entra con un usuario real de esa base (por defecto `pablosantos`, cámbialo con `README_USERNAME`) mediante un token firmado en un navegador aislado: no toca la sesión de tu navegador ni escribe nada en la cuenta. Falla si la sesión no está iniciada.

```bash
PLAYWRIGHT_MODULE=/ruta/a/playwright-core/index.mjs CHROME_PATH=/usr/bin/google-chrome node scripts/capture-readme-screenshots.mjs
```

Pasa nombres de captura (`details-movie action-share …`) para rehacer solo esas, y `README_STORAGE=vistas.json` para fijar la vista de cada página (las claves `showverse:*` de `localStorage`).

</details>

---

## 📁 Estructura

```
the-show-verse/
├── src/
│   ├── app/               # Páginas (App Router) y rutas /api (BFF hacia el backend)
│   ├── components/        # Componentes de UI (fichas, dashboards, social, perfil…)
│   └── context/           # Estado global (sesión, preferencias)
├── backend/               # API Fastify + Drizzle + migraciones
├── netflix-extension/     # Extensión de navegador para detectar lo que ves
├── android-companion/     # App Android complementaria
├── deploy/                # Docker local, NAS y Postgres
├── scripts/               # Arranque local, sincronización de datos, grabaciones
├── docs/                  # Documentación (vault de Obsidian)
└── public/                # Logos, iconos de la PWA y recursos estáticos
```

---

## 📚 Documentación

La carpeta [`docs/`](docs/README.md) es un vault de Obsidian; empieza por [Home.md](docs/Home.md).

| | |
|---|---|
| ✨ [Funcionalidades](docs/features/Features.md) | Qué ve el usuario en cada área |
| 🖥️ [Frontend](docs/frontend/Frontend.md) | Páginas, componentes y rutas de API de Next |
| ⚡ [Backend](docs/backend/Backend.md) | Endpoints, despliegue y pruebas |
| 🏗️ [Arquitectura](docs/architecture/Architecture.md) | Visión técnica del sistema |
| 🐳 [Infraestructura](docs/infrastructure/README.md) | Local, Docker, NAS, Cloudflare y CI/CD |
| 📘 [Guías](docs/guides/Guides.md) | Caché, Plex, JustWatch, botones de cristal… |
| 📝 [Changelog](CHANGELOG.md) | Cambios recientes |

---

## 🗺️ Roadmap

El estado al día está en [`docs/ROADMAP.md`](docs/ROADMAP.md).

<table>
<tr>
<td width="50%" valign="top">

#### ✅ Hecho
- Backend propio (Fastify + PostgreSQL + Redis)
- Cuenta propia, TMDb y Google
- Puntuaciones de películas, series, temporadas y episodios
- PWA con modo sin conexión y push
- Importación y exportación de datos
- Social, comunidad y vista Hoy
- Sincronización de streaming (extensión + Android)
- Niveles, rangos y logros
- Motor de recomendaciones y recap anual

</td>
<td width="50%" valign="top">

#### ⏳ Pendiente
- Terminar de retirar Trakt del frontend
- Publicar la app en Google Play
- Más tests E2E y accesibilidad (WCAG 2.1)
- Temas personalizables
- Watch together

</td>
</tr>
</table>

---

## 🤝 Contribuir

Las contribuciones son bienvenidas, en castellano o en inglés. La guía completa (instalación, comprobaciones y qué documentar) está en [CONTRIBUTING.md](CONTRIBUTING.md). En resumen:

1. Haz un fork y crea una rama desde `develop`: `git checkout -b feature/mi-mejora`.
2. Sigue ESLint y el estilo del código que tocas.
3. Si cambias algo visible, añade una línea al [`CHANGELOG.md`](CHANGELOG.md) y actualiza su documento de `docs/` en el mismo PR (ver [`AGENTS.md`](AGENTS.md)).
4. Abre un Pull Request contra `develop` con capturas si hay cambios visuales.

¿Un fallo o una idea? Abre un [issue](../../issues/new/choose). Para empezar, busca los marcados como [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Todo el que participa sigue el [código de conducta](CODE_OF_CONDUCT.md), y los fallos de seguridad se comunican en privado según [SECURITY.md](SECURITY.md).

---

## 📄 Licencia

El código se publica bajo la [GNU Affero General Public License v3.0 o posterior](LICENSE). Puedes usarlo, estudiarlo, modificarlo y compartirlo; si ofreces una versión modificada como servicio público, debes publicar tus cambios con la misma licencia.

Los logos, nombres y datos de servicios de terceros (TMDb, Trakt, IMDb, plataformas de streaming…) pertenecen a sus dueños y no entran en esta licencia.

---

## 🙏 Agradecimientos

Datos de películas y series por [TMDb](https://www.themoviedb.org/) (este producto usa la API de TMDb pero no está respaldado ni certificado por TMDb) y [Trakt](https://trakt.tv/). Gracias también a todo el ecosistema open source sobre el que está construido.

---

<div align="center">

<img src="public/logo-final-titulo-sinFondo.png" alt="The Show Verse" width="260">

**Hecho con ❤️ y mucho ☕ por [Psantoss26](https://github.com/Psantoss26)**

⭐ Si te gusta el proyecto, dale una estrella ⭐

[⬆️ Volver arriba](#)

</div>
