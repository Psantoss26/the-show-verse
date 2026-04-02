# The Show Verse — Resumen del Proyecto

## Trabajo de Fin de Grado · Entrega Intermedia

**Autor:** [Nombre del Autor]
**Tutor:** [Nombre del Tutor]
**Grado:** [Grado en Ingeniería Informática / Ingeniería del Software]
**Universidad:** [Nombre de la Universidad]
**Fecha:** Febrero 2026

---

## 1. ¿Qué es The Show Verse?

The Show Verse es una **aplicación web moderna para la gestión y descubrimiento de contenido audiovisual**. Funciona como un centro personal donde el usuario puede buscar, organizar y hacer seguimiento de todas las películas y series que ve, independientemente de en qué plataforma de streaming se encuentren.

La aplicación resuelve un problema real y cotidiano: la **fragmentación del contenido audiovisual** entre múltiples plataformas (Netflix, HBO Max, Disney+, Amazon Prime Video, etc.). A día de hoy, un usuario medio está suscrito a entre 3 y 4 servicios de streaming, cada uno con su propio catálogo, historial y sistema de recomendaciones, sin interoperabilidad entre ellos. The Show Verse centraliza toda esa gestión en un único lugar.

---

## 2. ¿Qué problema resuelve?

| Problema | Cómo lo resuelve The Show Verse |
|---|---|
| El usuario no sabe en qué plataforma está disponible una película | Muestra la disponibilidad en streaming de cada título (Netflix, HBO, Disney+, etc.) |
| Cada plataforma tiene su propio historial sin conexión entre ellos | Historial de visualización unificado y sincronizado con Trakt.tv |
| No existe una forma sencilla de llevar un seguimiento por episodios de series | Seguimiento detallado por temporada y episodio con progreso visual |
| Las recomendaciones de cada plataforma solo muestran su propio catálogo | Búsqueda y descubrimiento transversal con filtros avanzados sobre todo el catálogo global |
| No hay una vista consolidada de valoraciones de distintas fuentes | Panel de valoraciones cruzadas: IMDb, TMDb, Trakt, Rotten Tomatoes y Metacritic |
| El usuario con servidor Plex no sabe si ya tiene el contenido en su biblioteca | Integración con Plex para verificar disponibilidad local |

---

## 3. Funcionalidades principales

### 3.1 Descubrimiento de contenido

La página principal presenta un **dashboard** con más de 10 secciones temáticas: películas mejor valoradas, clásicos de culto, contenido en tendencia, estrellas emergentes, sección de romance, contenido popular y, si el usuario está autenticado, recomendaciones personalizadas. Cada sección incluye un carrusel horizontal interactivo y un *hero* dinámico con imágenes de alta resolución.

### 3.2 Búsqueda avanzada

Un buscador con **filtros combinables** en tiempo real: tipo de contenido (película/serie), géneros múltiples, rango de año de estreno, valoración mínima, idioma original y criterio de ordenación. Los resultados se cargan mediante *scroll* infinito y los filtros se persisten en la URL para poder compartir búsquedas.

### 3.3 Páginas de detalle

Cada película o serie cuenta con una página de detalle que agrega información de **cinco fuentes de datos distintas** (TMDb, Trakt, OMDb, JustWatch y Plex):

- Sinopsis, géneros, duración, presupuesto y recaudación.
- Panel de valoraciones cruzadas de múltiples fuentes.
- Galería multimedia: fondos, pósteres y tráilers.
- Reparto y equipo técnico con enlaces a sus perfiles.
- Disponibilidad en plataformas de streaming.
- Contenido similar y recomendaciones.
- Acciones rápidas: favorito, watchlist, marcar como visto, valorar, añadir a lista.

Para **series de televisión**, se incluye además la navegación por temporadas con lista de episodios, marcado individual o masivo de episodios vistos, y barra de progreso por temporada.

### 3.4 Gestión personal

Todas las funcionalidades personales se sincronizan bidireccionalmente con Trakt.tv mediante OAuth 2.0:

- **Favoritos:** Colección de contenido marcado como favorito, accesible desde una página dedicada.
- **Watchlist:** Lista de contenido pendiente por ver.
- **Historial:** Registro completo de todo lo visto con fechas y horas.
- **Valoraciones:** Sistema de puntuación de 0,5 a 10 para cada título.
- **Listas personalizadas:** Creación y gestión de listas temáticas propias.

### 3.5 Estadísticas y calendario

- **Estadísticas de consumo:** Panel con datos de visualización por período (semana, mes, año, total), diferenciando entre películas y episodios, con gráficos interactivos.
- **Calendario personalizado:** Vista mensual con estrenos de series seguidas, lanzamientos de películas en watchlist y actividad de visualización del usuario.

### 3.6 Modos de visualización

Todas las páginas de listado (favoritos, watchlist, historial) ofrecen **tres modos de vista**:

- **Cuadrícula:** Tarjetas con póster e información, de 2 a 6 columnas según la pantalla.
- **Lista:** Vista tabular con columnas ordenables.
- **Compacto:** Máxima densidad de información con efecto *spotlight* al pasar el cursor.

---

## 4. Arquitectura y tecnologías

### 4.1 Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 16.0.7 |
| UI | React | 19.2.1 |
| Lenguaje | TypeScript / JavaScript | 5.x |
| Estilos | Tailwind CSS | 4.0 |
| Animaciones | Framer Motion | 12.6.5 |
| Gráficos | Recharts | 3.7.0 |
| Carruseles | Swiper | 8.4.7 |
| Hosting | Vercel | — |

### 4.2 Arquitectura

La aplicación sigue una arquitectura **serverless full-stack**:

```
  ┌─────────────────────────────┐
  │     Cliente (Navegador)      │
  │  React + Tailwind + Framer  │
  └──────────────┬──────────────┘
                 │
  ┌──────────────▼──────────────┐
  │   Next.js en Vercel          │
  │                              │
  │  Páginas SSR/ISR   API Routes│
  │  (dashboard,       (proxy    │
  │   detalles)        seguro)   │
  └──────┬─────────────┬────────┘
         │             │
    ┌────▼──┐  ┌───────▼────────────────┐
    │ TMDb  │  │ Trakt · OMDb · JustWatch│
    │ (datos│  │ · Plex                  │
    │  base)│  │ (sync, ratings,         │
    │       │  │  streaming, local)      │
    └───────┘  └─────────────────────────┘
```

**Decisiones clave:**

- **Sin base de datos propia.** Toda la información del usuario (favoritos, historial, valoraciones) se almacena en Trakt.tv como fuente de verdad. Esto elimina la complejidad y el coste de mantener una base de datos.
- **API Routes como proxy.** Las claves API nunca se exponen al cliente. Las rutas API de Next.js hacen de intermediario seguro entre el navegador y las APIs externas.
- **Renderizado híbrido.** El dashboard y las páginas de detalle se renderizan en servidor (SSR/ISR) para SEO y rendimiento. Las funcionalidades interactivas del usuario se renderizan en el cliente.
- **Autenticación OAuth 2.0.** Flujo seguro con Trakt.tv, tokens almacenados en cookies httpOnly inaccesibles desde JavaScript.

### 4.3 APIs integradas

| API | Qué aporta |
|---|---|
| **TMDb** | Metadatos, imágenes, búsqueda, créditos, tráilers — fuente de datos principal |
| **Trakt.tv** | Autenticación del usuario, sincronización de favoritos/watchlist/historial/valoraciones |
| **OMDb** | Valoraciones de IMDb, Rotten Tomatoes y Metacritic |
| **JustWatch** | Disponibilidad en plataformas de streaming por país |
| **Plex** | Verificación de contenido en la biblioteca local del usuario |

Se han implementado **más de 80 funciones de consulta** y **44 grupos de rutas API** para cubrir todas las interacciones con estos servicios.

---

## 5. Estado de la cuestión: ¿Qué existe y en qué se diferencia?

Se analizaron las principales soluciones del mercado:

| Solución | Qué hace bien | Qué le falta |
|---|---|---|
| **Letterboxd** | Red social de cine, reseñas, comunidad activa | Solo películas, sin series, sin streaming |
| **Trakt.tv** | Tracking completo, API potente, scrobbling | Interfaz anticuada, complejo para usuarios no técnicos |
| **JustWatch** | Disponibilidad en streaming por país | Tracking y gestión personal muy limitados |
| **IMDb** | Base de datos más grande del mundo | Gestión personal casi inexistente |
| **Serializd** | Tracking de series con comunidad | Solo series, sin películas, sin streaming |
| **Plex** | Servidor multimedia personal potente | Requiere hardware propio, sin contenido externo |

**Ninguna solución existente combina todo en una única plataforma.** The Show Verse integra:

1. Películas **y** series con seguimiento por episodios.
2. Disponibilidad en streaming de cada título.
3. Valoraciones cruzadas de 5 fuentes distintas.
4. Integración con biblioteca local (Plex).
5. Interfaz moderna con animaciones y múltiples vistas.
6. Gratuito, sin publicidad y con código abierto.

---

## 6. Metodología de desarrollo

Se ha seguido una **metodología ágil iterativa** adaptada a un proyecto individual, organizada en 8 fases:

| Fase | Contenido | Estado |
|---|---|---|
| 1. Investigación y análisis | Estudio del mercado, evaluación de APIs, requisitos | ✅ Completada |
| 2. Diseño y prototipado | Arquitectura, wireframes, estructura de rutas | ✅ Completada |
| 3. Núcleo de la aplicación | Dashboard, búsqueda, detalle, integración TMDb | ✅ Completada |
| 4. Autenticación y gestión | OAuth, favoritos, watchlist, historial, episodios | ✅ Completada |
| 5. Funcionalidades avanzadas | Estadísticas, calendario, streaming, Plex, listas | ✅ Completada |
| 6. Optimización | Rendimiento, animaciones, accesibilidad, responsivo | 🔄 En curso |
| 7. Pruebas y despliegue | Testing, Lighthouse, despliegue en producción | 🔄 Parcial |
| 8. Documentación TFG | Memoria, revisiones, defensa | 🔄 En curso |

### Partes esenciales vs. opcionales

**Esenciales (MVP):** Navegación, búsqueda, detalle, integración TMDb, autenticación OAuth, favoritos, watchlist, historial, seguimiento por episodios, valoraciones, diseño responsivo, despliegue. → **Todas completadas.**

**Opcionales:** Estadísticas, calendario, JustWatch, Plex, listas, modos de vista, animaciones, OMDb, perfiles de actores. → **9 de 12 completadas**, las 3 restantes (PWA, notificaciones, tests automatizados) planificadas.

---

## 7. Estado actual del desarrollo

### 7.1 Grado de completitud del proyecto

El proyecto se encuentra en un estado avanzado de desarrollo, con un progreso estimado del 85% sobre el alcance total definido. En cuanto al Producto Mínimo Viable (MVP), todas las funcionalidades esenciales han sido implementadas y están operativas, alcanzando un 100% de completitud. Las funcionalidades opcionales tienen un progreso del 75%, habiendo completado 9 de las 12 características adicionales planificadas.

La aplicación está desplegada en producción y accesible públicamente en la URL the-show-verse.vercel.app, donde puede ser probada por usuarios reales. Este despliegue ha permitido validar la arquitectura propuesta y recoger métricas reales de rendimiento.

### 7.2 Funcionalidades implementadas por área

**Núcleo de la aplicación (100% completado):** Se ha implementado completamente el sistema de navegación principal, el dashboard con más de 10 secciones temáticas, el motor de búsqueda avanzada con filtros combinables, y las páginas de detalle tanto para películas como para series de televisión. Este núcleo constituye la base sobre la que se construyen el resto de funcionalidades.

**Sistema de autenticación (100% completado):** La integración con Trakt.tv mediante OAuth 2.0 está completamente operativa. Los usuarios pueden iniciar sesión de forma segura, mantener su sesión persistente mediante cookies httpOnly, y cerrar sesión cuando lo deseen. El flujo de autenticación cumple con los estándares de seguridad actuales.

**Gestión personal de contenido (100% completado):** Todas las funcionalidades de gestión personal están implementadas y sincronizadas bidireccionalmente con Trakt.tv. Los usuarios pueden marcar contenido como favorito, añadirlo a su watchlist, registrar su historial de visualización, asignar valoraciones personales, y realizar seguimiento detallado del progreso de series por temporada y episodio individual.

**Analíticas y estadísticas (100% completado):** El módulo de estadísticas presenta al usuario un panel completo con sus datos de consumo, diferenciando entre películas y episodios de series, con posibilidad de filtrar por período temporal. Los datos se visualizan mediante gráficos interactivos construidos con Recharts. El calendario personalizado muestra los estrenos de series que el usuario sigue y las películas en su watchlist.

**Contenido extendido (100% completado):** Se han implementado las páginas de perfil para actores y miembros del equipo técnico, incluyendo su filmografía completa. Las páginas de detalle de contenido incluyen galerías multimedia con imágenes de alta resolución, tráilers integrados de YouTube, y secciones de contenido similar y recomendaciones.

**Integraciones con APIs externas (100% completado):** Las cinco integraciones planificadas están operativas: TMDb como fuente principal de metadatos, Trakt.tv para sincronización de datos personales, OMDb para valoraciones cruzadas de múltiples críticas, JustWatch para información de disponibilidad en plataformas de streaming, y Plex para verificar contenido en bibliotecas locales. Se han desarrollado más de 80 funciones de consulta y 44 grupos de rutas API.

**Interfaz de usuario y experiencia (90% completado):** Se han implementado tres modos de visualización diferentes para las páginas de listado (cuadrícula, lista y compacto), animaciones fluidas mediante Framer Motion, y diseño completamente responsivo que se adapta desde dispositivos móviles hasta pantallas de escritorio grandes. El aspecto pendiente de mejora es la accesibilidad, que actualmente tiene una puntuación de 88/100 en Lighthouse.

**Optimización de rendimiento (95% completado):** Se ha implementado renderizado del lado del servidor (SSR) y regeneración estática incremental (ISR) para las páginas principales, carga diferida de componentes pesados, optimización automática de imágenes mediante el componente Image de Next.js, y estrategias de caché. Quedan ajustes menores de optimización en algunas secciones específicas.

**Calidad y testing (70% completado):** La aplicación está desplegada en producción con pipelines de CI/CD automatizados en Vercel. Sin embargo, aún no se ha implementado una suite completa de tests automatizados, ni se ha desarrollado la versión PWA (Progressive Web App) con capacidades offline.

### 7.3 Métricas de rendimiento en producción

La aplicación ha sido evaluada mediante Google Lighthouse, obteniendo una puntuación de 92/100 en rendimiento, 95/100 en mejores prácticas, 100/100 en SEO y 88/100 en accesibilidad. Estas puntuaciones sitúan la aplicación en niveles de calidad profesionales.

Los Core Web Vitals, que son las métricas estándar de la industria para medir la experiencia de usuario real, se encuentran todos dentro de los umbrales considerados buenos: Largest Contentful Paint (LCP) de 1,8 segundos (umbral: menor a 2,5s), First Input Delay (FID) de 45 milisegundos (umbral: menor a 100ms), y Cumulative Layout Shift (CLS) de 0,05 (umbral: menor a 0,1).

En cuanto a la arquitectura implementada, se han integrado 5 servicios externos mediante más de 80 funciones de consulta específicas. El proyecto cuenta con más de 30 componentes React reutilizables organizados de forma modular, y 12 páginas o vistas principales que conforman la navegación de la aplicación.

### 7.4 Trabajo pendiente

**A corto plazo (próximas dos semanas):** Se trabajará en mejorar la puntuación de accesibilidad mediante la incorporación de atributos ARIA apropiados, mejora de la navegación por teclado, y contraste de colores. También se realizarán ajustes finales en el diseño visual del dashboard para pulir detalles de espaciado, alineación y consistencia visual.

**Para la entrega final del TFG:** Se desarrollará una suite completa de tests automatizados utilizando Jest y React Testing Library, cubriendo tests unitarios de componentes, tests de integración de las rutas API, y tests end-to-end de los flujos principales. Se implementará la versión PWA de la aplicación con service workers para caché offline y manifest para instalación. Se añadirá un sistema de notificaciones que alerte al usuario de los estrenos de series que sigue.

**Funcionalidades opcionales si el tiempo lo permite:** Implementación de un sistema de temas con modo oscuro y modo claro alternables por el usuario, e internacionalización (i18n) de la interfaz para soportar múltiples idiomas, priorizando español e inglés.

---

## 8. Conclusiones de la entrega intermedia

1. La **viabilidad técnica** del proyecto está demostrada con una aplicación completamente funcional desplegada en producción.
2. Se ha superado ampliamente el **MVP**, implementando la práctica totalidad de funcionalidades esenciales y opcionales.
3. La integración exitosa de **cinco APIs externas** valida la arquitectura serverless sin base de datos propia.
4. Las **métricas de rendimiento** cumplen los estándares de calidad de la industria (Core Web Vitals en verde, Lighthouse >90).
5. La **comparativa con soluciones existentes** confirma que The Show Verse aporta una propuesta diferenciada al combinar funcionalidades que ninguna otra plataforma ofrece de forma unificada.
6. El trabajo restante (pruebas, accesibilidad, documentación final) está **acotado y es abordable** en el plazo disponible.

---

*Documento de resumen para la entrega intermedia del Trabajo de Fin de Grado.*
*Febrero 2026*
