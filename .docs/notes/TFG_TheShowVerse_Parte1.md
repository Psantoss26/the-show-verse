# TRABAJO DE FIN DE GRADO

---

**TÍTULO:** The Show Verse — Plataforma Web para la Gestión y Descubrimiento de Contenido Audiovisual

**TITULACIÓN:** Grado en Ingeniería Informática / Ingeniería del Software

**AUTOR:** Pablo Santos García (Psantoss26)

**TUTOR/DIRECTOR:** [Nombre del tutor]

**DEPARTAMENTO:** [Departamento correspondiente]

**CURSO ACADÉMICO:** 2025–2026

**FECHA DE DEFENSA:** [Fecha]

---

> *This product uses the TMDb API but is not endorsed or certified by TMDb.*
> *This product uses the Trakt.tv API but is not an official Trakt product.*

---

## DECLARACIÓN DE ORIGINALIDAD

El presente Trabajo de Fin de Grado ha sido realizado íntegramente por el alumno. Se ha citado debidamente toda fuente de información utilizada. El autor declara que no ha cometido plagio ni cualquier otra forma de deshonestidad académica.

---

# RESUMEN EJECUTIVO

**The Show Verse** es una aplicación web full-stack orientada a la gestión y el descubrimiento personalizado de contenido audiovisual (películas y series). La plataforma permite a los usuarios llevar un seguimiento exhaustivo de lo que han visto, lo que tienen pendiente y sus favoritos, sincronizando toda la información de forma bidireccional con la plataforma Trakt.tv mediante OAuth 2.0 [8].

El proyecto está desarrollado con **Next.js 16** [1] y **React 19** [2], utilizando el paradigma de **App Router** y **Server-Side Rendering (SSR)** para maximizar el rendimiento y el SEO. La interfaz implementa un diseño premium de tipo *glassmorphism* con animaciones fluidas mediante **Framer Motion** [7], y la capa de estilos se construye sobre **Tailwind CSS 4** [6].

La aplicación integra tres APIs externas: **The Movie Database (TMDb)** [3] para obtener metadatos de películas, series y personas; **Trakt.tv** [4] para la autenticación, el historial y la gestión de listas; y **OMDb** [5] para enriquecer los datos con ratings complementarios de IMDb y Rotten Tomatoes.

**Palabras clave:** Next.js, React, SSR, API REST, OAuth 2.0, TMDb, Trakt.tv, Tailwind CSS, Framer Motion, aplicación web, contenido audiovisual, gestión de media.

---

# ABSTRACT

**The Show Verse** is a full-stack web application focused on the personalised management and discovery of audiovisual content (movies and TV shows). The platform enables users to keep an exhaustive log of what they have watched, their pending items and their favourites, synchronising all data bidirectionally with the Trakt.tv platform via OAuth 2.0 [8].

The project is built with **Next.js 16** [1] and **React 19** [2], leveraging the **App Router** paradigm and **Server-Side Rendering (SSR)** to maximise performance and SEO. The interface implements a premium glassmorphism design with smooth animations powered by **Framer Motion** [7], and the styling layer is built on **Tailwind CSS 4** [6].

The application integrates three external APIs: **The Movie Database (TMDb)** [3] for movie, series and person metadata; **Trakt.tv** [4] for authentication, history and list management; and **OMDb** [5] for supplementary ratings from IMDb and Rotten Tomatoes.

**Keywords:** Next.js, React, SSR, REST API, OAuth 2.0, TMDb, Trakt.tv, Tailwind CSS, Framer Motion, web application, audiovisual content, media tracking.

---

# ÍNDICE GENERAL

1. Introducción y Motivación
2. Objetivos del Proyecto
3. Estado del Arte
4. Planificación y Metodología
5. Análisis de Requisitos
6. Diseño de la Arquitectura
7. Stack Tecnológico
8. Implementación del Sistema
   - 8.1 Estructura del Proyecto
   - 8.2 Arquitectura de la Aplicación (Next.js App Router)
   - 8.3 Sistema de Autenticación (OAuth 2.0 con Trakt)
   - 8.4 Integración con APIs Externas
   - 8.5 Componentes Principales
   - 8.6 Gestión del Estado Global
   - 8.7 Sistema de Rutas y Middleware
   - 8.8 Diseño de la Interfaz de Usuario
9. Funcionalidades Detalladas
   - 9.1 Dashboard Principal
   - 9.2 Búsqueda y Descubrimiento
   - 9.3 Detalles de Película y Serie
   - 9.4 Gestión de Temporadas y Episodios
   - 9.5 Favoritos y Watchlist
   - 9.6 Historial de Visionado
   - 9.7 Calendario
   - 9.8 Listas Personalizadas
   - 9.9 Detalles de Actor / Crew
   - 9.10 Sistema de Vistas (Grid, List, Compact)
   - 9.11 Estadísticas de Usuario
10. APIs Integradas
    - 10.1 TMDb API
    - 10.2 Trakt.tv API
    - 10.3 OMDb API
11. Rendimiento y Optimización
12. Pruebas y Validación
13. Despliegue y DevOps
14. Conclusiones y Trabajo Futuro
15. Bibliografía y Referencias

---

---

# 1. INTRODUCCIÓN Y MOTIVACIÓN

## 1.1 Contexto

El consumo de contenido audiovisual ha experimentado una transformación radical en los últimos años. La proliferación de plataformas de *streaming* — Netflix, HBO Max, Disney+, Amazon Prime Video, Apple TV+, entre otras — ha puesto a disposición del espectador un catálogo prácticamente ilimitado de películas y series. Esta abundancia, lejos de simplificar la experiencia del usuario, genera el llamado **paradox of choice** (paradoja de la elección): cuanto mayor es la oferta disponible, mayor es la dificultad para elegir y el riesgo de perderse contenido relevante.

Además, el usuario moderno consume contenido de forma dispersa en múltiples plataformas simultáneamente, lo que dificulta llevar un registro coherente de lo visto, lo pendiente y las obras favoritas. Herramientas como *Letterboxd*, *Trakt.tv* o *Simkl* han intentado cubrir esta necesidad, pero cada una presenta limitaciones en cuanto a interfaz, personalización o amplitud de funcionalidades.

## 1.2 Motivación

La motivación principal de este Trabajo de Fin de Grado surge de la necesidad personal de disponer de una plataforma centralizada, moderna y con una experiencia de usuario realmente premium para gestionar el consumo audiovisual. El proyecto nace de la unión de dos intereses: la pasión por el desarrollo web con tecnologías de vanguardia y el entusiasmo por el cine y las series.

Desde el punto de vista técnico, el proyecto ofrece la oportunidad de:

- Aplicar arquitecturas modernas de desarrollo web (**SSR**, **ISR**, **App Router**).
- Integrar múltiples servicios externos mediante **APIs REST** y protocolos de autenticación estándar (**OAuth 2.0**).
- Diseñar una interfaz de usuario atractiva y funcional aplicando principios de **UX/UI** actuales.
- Demostrar competencias en el desarrollo full-stack con un stack tecnológico de referencia en la industria.

## 1.3 Justificación Académica

El proyecto abarca de forma transversal las competencias del Grado en Ingeniería Informática:

| Área de Conocimiento | Aplicación en el Proyecto |
|---|---|
| Ingeniería del Software | Ciclo de vida, metodología ágil, control de versiones |
| Redes y Protocolos | Integración de APIs REST, OAuth 2.0, HTTP/HTTPS |
| Diseño de Interfaces | UX/UI, diseño responsivo, animaciones |
| Sistemas Distribuidos | SSR, ISR, despliegue en la nube (Vercel) |
| Seguridad Informática | Gestión de tokens, cookies httpOnly, middleware de rutas |
| Bases de Datos | Gestión de estado, caché de datos externos |

---

# 2. OBJETIVOS DEL PROYECTO

## 2.1 Objetivo General

Desarrollar una aplicación web completa, moderna y de calidad profesional para la gestión y el descubrimiento de contenido audiovisual, integrando múltiples fuentes de datos externas y ofreciendo una experiencia de usuario premium con sincronización en tiempo real con la plataforma Trakt.tv [4].

## 2.2 Objetivos Específicos

**Objetivos Funcionales:**

1. Implementar un sistema de autenticación OAuth 2.0 [8] completo con Trakt.tv [4], incluyendo refresco automático de tokens y gestión segura de sesiones mediante cookies httpOnly.
2. Integrar la API de TMDb [3] para obtener metadatos completos de películas, series, temporadas, episodios y personas (actores, directores).
3. Desarrollar un dashboard dinámico con más de 10 secciones de contenido curado, incluyendo carruseles animados y un hero rotatorio.
4. Implementar un módulo completo de gestión de favoritos, watchlist e historial de visionado sincronizado con Trakt.
5. Crear un sistema de seguimiento de episodios y temporadas con progreso por serie.
6. Desarrollar un explorador de contenido con búsqueda avanzada y filtros múltiples.
7. Implementar un calendario de estrenos integrado con los datos de Trakt [4].
8. Construir páginas de detalle completas para películas, series y actores.
9. Ofrecer múltiples vistas (Grid, List, Compact) con transiciones animadas.
10. Proporcionar estadísticas detalladas del historial del usuario.

**Objetivos Técnicos:**

1. Utilizar **Next.js 16** [1] con **App Router** y **Server-Side Rendering** para garantizar el rendimiento y el SEO.
2. Alcanzar métricas de rendimiento excelentes: Performance > 90, SEO = 100 en Lighthouse.
3. Garantizar un diseño completamente responsivo para móvil, tableta y escritorio.
4. Implementar caché inteligente en el servidor (ISR) [1] para reducir las llamadas a las APIs externas.
5. Desarrollar un middleware de Next.js [1] para el reenvío de bots de redes sociales.
6. Publicar la aplicación en producción mediante Vercel con CI/CD automático.

**Objetivos de Diseño:**

1. Implementar un diseño visual premium con estética *glassmorphism* y paleta oscura.
2. Lograr una experiencia de usuario fluida mediante animaciones con **Framer Motion** [7].
3. Asegurar la accesibilidad básica y los atajos de teclado.

---

# 3. ESTADO DEL ARTE

## 3.1 Plataformas de Gestión de Contenido Audiovisual

El mercado de aplicaciones de tracking de películas y series es relativamente nicho pero activo. A continuación se analizan los principales competidores directos:

### 3.1.1 Letterboxd

**Letterboxd** es la plataforma de referencia para el registro y descubrimiento de películas, con una fuerte componente social. Sus principales características son el sistema de reseñas y la comunidad activa. Sin embargo, sus limitaciones incluyen la ausencia de soporte completo para series de televisión, el enfoque excesivo en la crítica frente al tracking, y una interfaz conservadora que no aprovecha las posibilidades del diseño moderno.

### 3.1.2 Trakt.tv

**Trakt.tv** es la plataforma más completa para tracking (seguimiento) de películas y series, con una API muy potente. No obstante, su interfaz de usuario es anticuada y poco intuitiva, su diseño es funcional pero no atractivo, y carece de un sistema premium de descubrimiento de contenido.

### 3.1.3 Simkl

**Simkl** ofrece funcionalidades similares a Trakt con mejor interfaz, pero con menor ecosistema de integraciones y comunidad.

### 3.1.4 JustWatch

**JustWatch** se especializa en la localización de contenido en plataformas de streaming pero carece de funcionalidades de tracking y gestión personal.

## 3.2 Posicionamiento de The Show Verse

Frente a los competidores analizados, **The Show Verse** ocupa un nicho diferenciado: combina la potencia de tracking de Trakt (usando su propia API) con una interfaz de usuario moderna y premium, más cercana a la experiencia de las propias plataformas de streaming. No pretende competir en el apartado social de Letterboxd, sino en la experiencia personal del usuario.

| Característica | Letterboxd | Trakt.tv | The Show Verse |
|---|---|---|---|
| Seguimiento películas | ✅ | ✅ | ✅ |
| Seguimiento series/episodios | ❌ | ✅ | ✅ |
| Interfaz moderna | ⚠️ | ❌ | ✅ |
| Descubrimiento de contenido | ⚠️ | ⚠️ | ✅ |
| Diseño responsivo completo | ✅ | ⚠️ | ✅ |
| Animaciones premium | ❌ | ❌ | ✅ |
| Integración multi-API | ❌ | ❌ | ✅ |
| SSR / rendimiento | ⚠️ | ⚠️ | ✅ |

## 3.3 Tecnologías de Referencia

### 3.3.1 Next.js y el App Router

**Next.js** [1] se ha consolidado como el framework de referencia para el desarrollo de aplicaciones React [2] en producción. La versión 13+ introdujo el **App Router**, un paradigma basado en React Server Components [2] que permite renderizar componentes directamente en el servidor, reduciendo el JavaScript enviado al cliente y mejorando el rendimiento inicial (LCP, FCP).

En este proyecto se utiliza Next.js 16 con App Router como base arquitectónica.

### 3.3.2 Server-Side Rendering e ISR

El **SSR** (Server-Side Rendering) [1] genera el HTML en el servidor en cada petición, garantizando contenido siempre actualizado y un SEO óptimo. El **ISR** (Incremental Static Regeneration) [1] combina las ventajas del renderizado estático con la capacidad de regenerar páginas individuales sin necesidad de reconstruir toda la aplicación. En el proyecto se utiliza ISR con una ventana de revalidación de 10 minutos para los endpoints de catálogo de TMDb [3].

### 3.3.3 OAuth 2.0

**OAuth 2.0** [8] es el protocolo estándar de autorización más extendido. Permite a una aplicación acceder a recursos de terceros en nombre del usuario sin necesidad de conocer sus credenciales. En el proyecto se implementa el flujo **Authorization Code** [8] con Trakt.tv [4], incluyendo el refresco automático de tokens expirados.

---

# 4. PLANIFICACIÓN Y METODOLOGÍA

## 4.1 Metodología de Desarrollo

El proyecto se ha desarrollado siguiendo una metodología **ágil adaptada** [13] a un desarrollo individual, con las siguientes características:

- **Iteraciones semanales:** cada semana se planifica un conjunto de funcionalidades a implementar.
- **Backlog priorizado:** las funcionalidades se priorizan según su impacto en el usuario y su dependencia técnica.
- **Revisión continua:** al final de cada iteración se revisa el resultado y se ajusta la planificación.
- **Control de versiones con Git:** cada funcionalidad se desarrolla en su propia rama (*feature branch*).

## 4.2 Fases del Proyecto

| Fase | Descripción | Duración Estimada |
|---|---|---|
| **1. Análisis** | Estudio de requisitos, análisis de APIs, selección tecnológica | 2 semanas |
| **2. Diseño** | Arquitectura del sistema, wireframes, diseño del sistema de componentes | 2 semanas |
| **3. Implementación Core** | Setup del proyecto, layout, Navbar, integración TMDb básica | 3 semanas |
| **4. Autenticación** | OAuth 2.0 con Trakt, gestión de tokens, middleware | 2 semanas |
| **5. Funcionalidades** | Dashboard, detalles, favoritos, watchlist, historial, calendario | 5 semanas |
| **6. Pulido UI/UX** | Animaciones, vistas múltiples, responsive, microinteracciones | 2 semanas |
| **7. Optimización** | Rendimiento, caché, SEO, Core Web Vitals | 1 semana |
| **8. Despliegue** | Configuración Vercel, CI/CD, variables de entorno | 1 semana |
| **9. Documentación** | README, documentación técnica, TFG | 2 semanas |

## 4.3 Herramientas de Gestión

- **Control de versiones:** Git + GitHub (`github.com/Psantoss26/the-show-verse`)
- **CI/CD:** GitHub Actions + Vercel (build automático por push a `main`)
- **Editor de código:** Visual Studio Code
- **Gestión de paquetes:** npm
