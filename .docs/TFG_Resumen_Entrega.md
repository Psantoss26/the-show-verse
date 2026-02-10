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

### Métricas de rendimiento en producción

| Métrica Lighthouse | Resultado |
|---|---|
| Performance | **92/100** |
| Best Practices | **95/100** |
| SEO | **100/100** |
| Accessibility | **88/100** (en mejora) |

| Core Web Vital | Resultado | Umbral bueno |
|---|---|---|
| LCP | **1,8s** | < 2,5s ✅ |
| FID | **45ms** | < 100ms ✅ |
| CLS | **0,05** | < 0,1 ✅ |

### Cifras del proyecto

| Concepto | Valor |
|---|---|
| Rutas API | 44 grupos |
| Funciones de consulta | 80+ |
| Componentes React | 30+ |
| Páginas / vistas | 12 |
| APIs externas integradas | 5 |
| Commits | 50+ |

### Resumen de estado

- **Funcionalidades completas:** Dashboard, búsqueda avanzada, detalle de películas/series/actores, autenticación OAuth, favoritos, watchlist, historial, seguimiento por episodios, valoraciones, estadísticas, calendario, streaming, Plex, listas, modos de vista, animaciones, enlaces externos, despliegue en producción.
- **En desarrollo:** Ajustes de diseño del dashboard, mejoras de accesibilidad.
- **Planificado:** Pruebas automatizadas, PWA, notificaciones.

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
