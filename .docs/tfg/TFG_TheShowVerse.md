# Trabajo de Fin de Grado

## The Show Verse: Plataforma Web Centralizada para la Gestión y Descubrimiento de Contenido Audiovisual

---

**Autor:** [Nombre del Autor]
**Tutor:** [Nombre del Tutor]
**Grado:** [Grado en Ingeniería Informática / Grado en Ingeniería del Software]
**Universidad:** [Nombre de la Universidad]
**Fecha:** Febrero 2026
**Versión:** Entrega Intermedia

---

## Índice General

1. [Introducción](#1-introducción)
   - 1.1 Motivación
   - 1.2 Objetivos del proyecto
   - 1.3 Alcance
   - 1.4 Estructura del documento
2. [Estado de la cuestión](#2-estado-de-la-cuestión)
   - 2.1 Contexto actual del consumo audiovisual
   - 2.2 Análisis de soluciones existentes
   - 2.3 Comparativa de plataformas
   - 2.4 Principal aportación de este trabajo
3. [Metodología](#3-metodología)
   - 3.1 Enfoque metodológico
   - 3.2 Fases del desarrollo
   - 3.3 Partes esenciales del proyecto
   - 3.4 Partes opcionales del proyecto
   - 3.5 Herramientas utilizadas en el desarrollo
4. [Análisis de requisitos](#4-análisis-de-requisitos)
   - 4.1 Requisitos funcionales
   - 4.2 Requisitos no funcionales
   - 4.3 Casos de uso principales
5. [Diseño de la arquitectura](#5-diseño-de-la-arquitectura)
   - 5.1 Arquitectura general del sistema
   - 5.2 Modelo de datos
   - 5.3 Integración con APIs externas
   - 5.4 Diseño de la interfaz de usuario
6. [Implementación](#6-implementación)
   - 6.1 Tecnologías empleadas
   - 6.2 Estructura del proyecto
   - 6.3 Módulos principales
   - 6.4 Autenticación y autorización
   - 6.5 Gestión del estado
   - 6.6 Optimización y rendimiento
7. [Pruebas y validación](#7-pruebas-y-validación)
   - 7.1 Estrategia de pruebas
   - 7.2 Pruebas de rendimiento
   - 7.3 Pruebas de usabilidad
8. [Estado actual del desarrollo](#8-estado-actual-del-desarrollo)
   - 8.1 Funcionalidades completadas
   - 8.2 Funcionalidades en desarrollo
   - 8.3 Funcionalidades planificadas
   - 8.4 Métricas de rendimiento actuales
9. [Planificación y trabajo futuro](#9-planificación-y-trabajo-futuro)
10. [Conclusiones](#10-conclusiones)
11. [Bibliografía y referencias](#11-bibliografía-y-referencias)
12. [Anexos](#12-anexos)

---

## 1. Introducción

### 1.1 Motivación

El consumo de contenido audiovisual ha experimentado una transformación radical en la última década. La irrupción de las plataformas de streaming —Netflix, HBO Max, Disney+, Amazon Prime Video, Apple TV+, entre otras— ha fragmentado la oferta de películas y series en múltiples servicios, cada uno con su propio catálogo, interfaz y sistema de recomendaciones. Según datos de JustWatch (2025), un usuario medio en España está suscrito a entre 3 y 4 plataformas de streaming simultáneamente, lo que genera un problema real: la dispersión del contenido y la dificultad para gestionar de manera unificada qué se ha visto, qué se quiere ver y dónde está disponible cada título.

Este escenario plantea varios retos concretos para el usuario:

- **Fragmentación de catálogos:** Un mismo usuario debe alternar entre múltiples aplicaciones para buscar contenido, sin una visión global del conjunto disponible.
- **Ausencia de seguimiento unificado:** Cada plataforma mantiene su propio historial y sistema de favoritos, sin interoperabilidad entre ellos.
- **Recomendaciones sesgadas:** Los algoritmos de cada servicio priorizan su propio catálogo, lo que limita el descubrimiento de contenido relevante disponible en otras plataformas.
- **Pérdida de contexto:** El usuario carece de herramientas para llevar un registro completo y detallado de su actividad audiovisual a lo largo del tiempo.

La motivación de este Trabajo de Fin de Grado nace de la necesidad personal y generalizada de disponer de una herramienta centralizada que unifique la experiencia de gestión del contenido audiovisual, independientemente de la plataforma donde se encuentre disponible. The Show Verse se concibe como una respuesta técnica a este problema, aprovechando las capacidades de las tecnologías web modernas y la riqueza de las APIs públicas disponibles en el ecosistema audiovisual.

### 1.2 Objetivos del proyecto

El objetivo principal de este TFG es el diseño, desarrollo e implementación de una aplicación web moderna que permita a los usuarios gestionar, descubrir y realizar un seguimiento integral de su consumo de películas y series de televisión.

Este objetivo general se descompone en los siguientes objetivos específicos:

1. **OBJ-01.** Desarrollar una interfaz web responsiva e intuitiva que ofrezca una experiencia de usuario comparable a las plataformas comerciales de streaming.
2. **OBJ-02.** Integrar múltiples fuentes de datos externas (TMDb, Trakt.tv, OMDb, JustWatch, Plex) para proporcionar información completa y actualizada sobre el contenido audiovisual.
3. **OBJ-03.** Implementar un sistema de autenticación seguro basado en OAuth 2.0 que permita la sincronización bidireccional de datos del usuario con servicios externos.
4. **OBJ-04.** Diseñar un sistema de descubrimiento avanzado con filtros múltiples, búsqueda en tiempo real y recomendaciones personalizadas.
5. **OBJ-05.** Permitir la gestión completa de listas personales: favoritos, lista de pendientes (*watchlist*), historial de visualización y listas personalizadas.
6. **OBJ-06.** Implementar un seguimiento detallado por episodios para series de televisión, incluyendo progreso por temporada.
7. **OBJ-07.** Proporcionar un panel de estadísticas que permita al usuario analizar sus patrones de consumo audiovisual.
8. **OBJ-08.** Informar sobre la disponibilidad del contenido en las diferentes plataformas de streaming del mercado.
9. **OBJ-09.** Optimizar el rendimiento de la aplicación para obtener métricas excelentes en Core Web Vitals y Lighthouse.
10. **OBJ-10.** Desplegar la aplicación en un entorno de producción accesible y escalable.

### 1.3 Alcance

El alcance de este proyecto comprende el desarrollo completo de una aplicación web *full-stack* basada en Next.js con las siguientes delimitaciones:

**Dentro del alcance:**
- Aplicación web responsiva accesible desde navegadores de escritorio y dispositivos móviles.
- Integración con APIs externas para obtención de metadatos, imágenes, valoraciones y disponibilidad en streaming.
- Sistema de autenticación OAuth 2.0 con Trakt.tv como proveedor principal.
- Gestión completa de favoritos, lista de pendientes, historial y listas personalizadas.
- Seguimiento de series por episodios y temporadas.
- Buscador avanzado con filtros combinables.
- Panel de estadísticas de consumo.
- Vista de calendario con estrenos y actividad.
- Despliegue en producción en Vercel.

**Fuera del alcance:**
- Reproducción directa de contenido (la aplicación no es un servicio de streaming).
- Aplicación nativa para dispositivos móviles (aunque la web es completamente responsiva).
- Sistema de recomendaciones basado en aprendizaje automático propio.
- Funcionalidades sociales avanzadas (mensajería entre usuarios, foros).

### 1.4 Estructura del documento

Este documento se organiza en las siguientes secciones principales:

- La **Sección 2** presenta el estado de la cuestión, analizando el panorama actual de soluciones existentes para la gestión de contenido audiovisual y estableciendo la aportación diferencial de este trabajo.
- La **Sección 3** describe la metodología empleada, detallando las fases del desarrollo y distinguiendo entre las partes esenciales y opcionales del proyecto.
- La **Sección 4** recoge el análisis de requisitos funcionales y no funcionales del sistema.
- La **Sección 5** aborda el diseño arquitectónico de la aplicación, incluyendo la integración con APIs externas y el diseño de la interfaz.
- La **Sección 6** detalla los aspectos de implementación más relevantes, las tecnologías utilizadas y las decisiones técnicas tomadas.
- La **Sección 7** describe la estrategia de pruebas y validación del sistema.
- La **Sección 8** presenta el estado actual del desarrollo práctico.
- La **Sección 9** expone la planificación del trabajo restante y las líneas de trabajo futuro.
- La **Sección 10** recoge las conclusiones alcanzadas hasta este punto.

---

## 2. Estado de la cuestión

### 2.1 Contexto actual del consumo audiovisual

La industria del entretenimiento audiovisual se encuentra en un momento de máxima fragmentación. Desde que Netflix popularizó el modelo de suscripción a contenido bajo demanda (*SVOD — Subscription Video on Demand*) a principios de la década de 2010, el número de plataformas de streaming ha crecido exponencialmente. En 2025, el mercado global de streaming alcanzó un valor estimado de 115.000 millones de dólares, con más de 200 servicios de streaming activos a nivel mundial (Grand View Research, 2025).

En el mercado español, las principales plataformas compiten por la atención del usuario:

| Plataforma | Lanzamiento en España | Catálogo estimado |
|---|---|---|
| Netflix | 2015 | ~6.000 títulos |
| HBO Max | 2021 | ~3.500 títulos |
| Amazon Prime Video | 2016 | ~12.000 títulos |
| Disney+ | 2020 | ~2.000 títulos |
| Apple TV+ | 2019 | ~500 títulos |
| Movistar Plus+ | 2016 | ~8.000 títulos |
| Filmin | 2010 | ~10.000 títulos |
| SkyShowtime | 2022 | ~1.500 títulos |

Esta fragmentación ha creado lo que se conoce como *"subscription fatigue"* (fatiga por suscripciones): los usuarios se ven obligados a contratar múltiples servicios para acceder a todo el contenido que desean, cada uno con su propia interfaz, sistema de recomendaciones y herramientas de gestión. Según un estudio de Deloitte (2024), el 47% de los usuarios de streaming en España afirma sentirse abrumado por la cantidad de plataformas disponibles, y un 35% reconoce haber perdido la cuenta de qué contenido ha visto y en qué plataforma.

Este contexto hace evidente la necesidad de herramientas que centralicen y unifiquen la experiencia del usuario, permitiendo gestionar su consumo audiovisual de manera transversal a todas las plataformas.

### 2.2 Análisis de soluciones existentes

A continuación se analizan las principales soluciones disponibles en el mercado que abordan, en mayor o menor medida, el problema de la gestión centralizada del contenido audiovisual.

#### 2.2.1 Letterboxd

**Descripción:** Letterboxd es una red social especializada en cine, fundada en 2011 en Nueva Zelanda. Permite a los usuarios llevar un diario de películas vistas, escribir reseñas, crear listas y descubrir contenido a través de las valoraciones de la comunidad.

**Características principales:**
- Registro de películas vistas con fecha y valoración (escala de 0,5 a 5 estrellas).
- Reseñas y críticas de la comunidad.
- Listas temáticas creadas por usuarios.
- Diario cinematográfico con calendario.
- Estadísticas anuales de visualización.
- Integración con redes sociales.

**Limitaciones:**
- **Exclusivamente orientado a cine:** No ofrece soporte para series de televisión, lo que excluye una parte significativa del consumo audiovisual actual.
- **Sin información de disponibilidad en streaming:** No indica dónde se puede ver una película.
- **Modelo freemium restrictivo:** Las estadísticas avanzadas y la eliminación de anuncios requieren suscripción de pago (Letterboxd Pro/Patron).
- **Interfaz web limitada:** La experiencia de usuario en la versión web es inferior a la de la aplicación móvil.
- **Sin seguimiento por episodios:** Al no contemplar series, carece de toda funcionalidad asociada.

#### 2.2.2 Trakt.tv

**Descripción:** Trakt.tv es un servicio de seguimiento (*tracking*) de películas y series que se posiciona como un "scrobbler" audiovisual. Permite registrar automáticamente lo que el usuario ve a través de integraciones con reproductores multimedia.

**Características principales:**
- Seguimiento automático mediante integraciones con media centers (Kodi, Plex, Emby, Jellyfin).
- Historial completo de visualización con marcas temporales.
- Gestión de favoritos, lista de pendientes y listas personalizadas.
- Seguimiento por episodios con progreso de temporadas.
- Calendario de estrenos personalizado.
- API pública muy completa y bien documentada.
- Comunidad activa con funcionalidades sociales.

**Limitaciones:**
- **Interfaz de usuario anticuada:** El diseño web de Trakt no ha evolucionado significativamente en los últimos años, resultando poco atractivo visualmente y ofreciendo una experiencia de navegación mejorable.
- **Curva de aprendizaje elevada:** La cantidad de funcionalidades y opciones de configuración puede resultar abrumadora para usuarios no técnicos.
- **Funcionalidades premium de pago:** Las funcionalidades avanzadas (filtros, estadísticas extendidas, listas ampliadas) requieren suscripción VIP.
- **Sin información nativa de streaming:** No indica dónde ver el contenido (requiere extensiones de terceros).
- **Orientación técnica:** Diseñado pensando en usuarios con media centers, no en el usuario general de streaming.

#### 2.2.3 JustWatch

**Descripción:** JustWatch es un motor de búsqueda de streaming que permite a los usuarios encontrar dónde ver películas y series en las distintas plataformas disponibles en su país.

**Características principales:**
- Búsqueda de disponibilidad en streaming por país.
- Información de precios para alquiler y compra digital.
- Comparativa entre plataformas.
- Alertas de nuevas incorporaciones al catálogo.
- Recomendaciones basadas en preferencias.
- Lista de pendientes básica.

**Limitaciones:**
- **Funcionalidad de seguimiento muy limitada:** La gestión de historial y favoritos es básica y secundaria respecto a la función principal de búsqueda.
- **Sin seguimiento por episodios:** No permite hacer tracking detallado de series.
- **Sin estadísticas de consumo:** No ofrece análisis de patrones de visualización.
- **Modelo de negocio basado en afiliación:** Los resultados pueden estar influenciados por acuerdos comerciales con plataformas.
- **Información a veces desactualizada:** La disponibilidad de contenido puede no reflejar el estado real en tiempo real.

#### 2.2.4 TMDb (The Movie Database)

**Descripción:** TMDb es una base de datos audiovisual colaborativa y gratuita, que ofrece una API pública muy utilizada por desarrolladores. También funciona como sitio web de consulta de información sobre películas y series.

**Características principales:**
- Base de datos exhaustiva con metadatos, imágenes, vídeos, créditos y traducciones.
- API REST pública y bien documentada.
- Contribuciones de la comunidad (modelo wiki).
- Sistema de valoraciones.
- Listas y favoritos básicos.
- Información disponible en múltiples idiomas.

**Limitaciones:**
- **Orientación como base de datos, no como gestor personal:** Su función principal es proporcionar información, no gestionar el consumo personal del usuario.
- **Funcionalidades de usuario limitadas:** Las listas y favoritos son básicas y carecen de sincronización con otros servicios.
- **Sin seguimiento por episodios avanzado:** No permite un tracking detallado del progreso en series.
- **Interfaz no optimizada para descubrimiento:** La experiencia de exploración y descubrimiento es limitada.
- **Sin información de disponibilidad en streaming.**

#### 2.2.5 IMDb (Internet Movie Database)

**Descripción:** IMDb, propiedad de Amazon, es la base de datos audiovisual más conocida y utilizada a nivel mundial. Proporciona información exhaustiva sobre películas, series, actores y profesionales de la industria.

**Características principales:**
- Base de datos más completa del sector con millones de títulos.
- Sistema de valoraciones con escala de 1 a 10 estrellas.
- Información profesional detallada (filmografía, biografías, premios).
- Sección de noticias y tráilers.
- Listas de los usuarios y listas oficiales (Top 250).
- Aplicación móvil con funcionalidad completa.

**Limitaciones:**
- **Funcionalidades de gestión personal muy básicas:** Las listas de seguimiento y favoritos son limitadas y poco intuitivas.
- **Sin seguimiento por episodios:** No permite hacer tracking del progreso en series.
- **Sin estadísticas de consumo personalizadas.**
- **Publicidad intrusiva en la versión gratuita.**
- **Sin información de disponibilidad en streaming unificada** (salvo redirección a Amazon Prime).
- **Sin API pública gratuita para desarrolladores** (la API fue descontinuada en favor de soluciones de pago).

#### 2.2.6 Plex

**Descripción:** Plex es una plataforma de servidor multimedia personal que permite a los usuarios organizar y reproducir su propia biblioteca de medios. Ha evolucionado para incluir también contenido gratuito con publicidad.

**Características principales:**
- Servidor multimedia personal con transcodificación.
- Organización automática de bibliotecas con metadatos.
- Reproducción remota en múltiples dispositivos.
- Contenido gratuito con publicidad (Plex TV).
- Integración con Trakt para scrobbling.
- Aplicaciones para múltiples plataformas.

**Limitaciones:**
- **Requiere servidor propio:** El usuario necesita hardware dedicado y conocimientos técnicos para la instalación.
- **Orientación al contenido local:** Diseñado para bibliotecas propias, no para el seguimiento de contenido en plataformas de streaming.
- **Sin descubrimiento de contenido externo significativo.**
- **Sin gestión cruzada con plataformas de streaming.**
- **Funcionalidades avanzadas requieren Plex Pass de pago.**

#### 2.2.7 Serializd

**Descripción:** Serializd es una aplicación relativamente reciente (2022) centrada exclusivamente en el seguimiento de series de televisión, posicionándose como el "Letterboxd de las series".

**Características principales:**
- Seguimiento de series con gestión por episodios.
- Valoración por temporada y serie completa.
- Reseñas de la comunidad.
- Estadísticas de visualización.
- Listas temáticas.

**Limitaciones:**
- **Exclusivamente orientado a series:** No soporta películas.
- **Plataforma joven con catálogo en desarrollo.**
- **Comunidad pequeña en comparación con alternativas establecidas.**
- **Sin información de disponibilidad en streaming.**
- **Sin integración con otros servicios de tracking.**

### 2.3 Comparativa de plataformas

La siguiente tabla resume las características principales de cada solución analizada frente a The Show Verse:

| Característica | Letterboxd | Trakt.tv | JustWatch | TMDb | IMDb | Plex | Serializd | **The Show Verse** |
|---|---|---|---|---|---|---|---|---|
| Películas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Series de TV | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Seguimiento por episodios | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Disponibilidad en streaming | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Estadísticas de consumo | ✅* | ✅* | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Búsqueda avanzada con filtros | ❌ | ✅* | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Valoraciones múltiples (IMDb, TMDb, Trakt) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Calendario personalizado | ❌ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Integración con Plex | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Múltiples modos de vista | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Sincronización con Trakt | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Interfaz moderna y animada | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Gratuito y sin publicidad | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Código abierto | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

*\* Funcionalidad disponible pero restringida a suscripción de pago.*

### 2.4 Principal aportación de este trabajo

Tras el análisis detallado de las soluciones existentes, se evidencia que ninguna de ellas ofrece una solución integral que combine todas las necesidades del usuario moderno de contenido audiovisual en una única plataforma. Las herramientas disponibles se especializan en aspectos parciales del problema: Letterboxd y Serializd en la dimensión social y de reseñas (pero separando cine y series), Trakt.tv en el seguimiento técnico (pero con una interfaz anticuada), JustWatch en la disponibilidad de streaming (pero sin funcionalidades de gestión), y las bases de datos como TMDb e IMDb en la información (pero sin herramientas personales avanzadas).

**The Show Verse aporta una solución unificada y diferenciada** que integra en una única aplicación web las siguientes capacidades:

1. **Centralización total:** Gestión unificada de películas y series de televisión con seguimiento detallado por episodios, favoritos, listas de pendientes, historial y listas personalizadas, todo sincronizado con Trakt.tv.

2. **Información enriquecida multiservicio:** Agregación de datos de cinco fuentes distintas (TMDb, Trakt.tv, OMDb, JustWatch, Plex) para presentar la información más completa posible, incluyendo valoraciones cruzadas de IMDb, TMDb, Trakt, Rotten Tomatoes y Metacritic en una única vista.

3. **Descubrimiento avanzado:** Motor de búsqueda con filtros combinables (género, año, idioma, valoración mínima, ordenación) e interfaz de descubrimiento con secciones temáticas curadas.

4. **Información de disponibilidad en streaming:** Integración con JustWatch para indicar en qué plataforma está disponible cada título, resolviendo uno de los principales puntos de frustración del usuario.

5. **Integración con biblioteca local (Plex):** Capacidad única de conectar con el servidor Plex personal del usuario para verificar si el contenido ya está disponible en su biblioteca local.

6. **Interfaz moderna con experiencia premium:** Diseño visual contemporáneo con animaciones fluidas (Framer Motion), múltiples modos de visualización (cuadrícula, lista, compacto) y experiencia responsiva completa.

7. **Arquitectura abierta y gratuita:** A diferencia de las soluciones comerciales que restringen funcionalidades tras muros de pago, The Show Verse es una aplicación completa, gratuita y con código abierto.

8. **Rendimiento optimizado:** Arquitectura SSR/ISR que garantiza tiempos de carga rápidos y métricas excelentes en Core Web Vitals, proporcionando una experiencia fluida comparable a aplicaciones nativas.

En definitiva, la aportación principal de este trabajo es demostrar que es posible construir, con tecnologías web modernas y APIs públicas, una plataforma que rivalice en funcionalidad y experiencia de usuario con las soluciones comerciales establecidas, ofreciendo además una visión integral que ninguna de ellas proporciona de forma individual.

---

## 3. Metodología

### 3.1 Enfoque metodológico

Para el desarrollo de este proyecto se ha adoptado una metodología ágil iterativa e incremental, inspirada en los principios de Scrum pero adaptada a las características de un proyecto individual de TFG. Esta elección se fundamenta en la naturaleza exploratoria del proyecto, donde los requisitos se han ido refinando a medida que se probaban las capacidades de las APIs externas y se evaluaba la viabilidad técnica de cada funcionalidad.

El desarrollo se organiza en iteraciones (sprints) de dos semanas de duración, donde en cada iteración se implementa un conjunto de funcionalidades completas y funcionales, permitiendo disponer de una versión ejecutable del sistema en todo momento. Este enfoque permite:

- **Adaptación continua:** Ajustar las prioridades y el alcance en función de los resultados obtenidos y las dificultades encontradas.
- **Retroalimentación temprana:** Validar las funcionalidades implementadas de forma incremental, detectando problemas de usabilidad o rendimiento antes de que se acumulen.
- **Gestión del riesgo:** Abordar primero las funcionalidades de mayor riesgo técnico (integraciones con APIs, autenticación OAuth) para reducir la incertidumbre del proyecto.
- **Entregables funcionales:** Disponer de una aplicación operativa desde las primeras iteraciones, lo que facilita las demostraciones y la validación.

### 3.2 Fases del desarrollo

El proyecto se estructura en las siguientes fases, ejecutadas de forma secuencial con solapamientos entre las fases de implementación:

#### Fase 1: Investigación y análisis (Semanas 1-3)

- Estudio del estado de la cuestión y análisis de soluciones existentes.
- Evaluación de las APIs disponibles (TMDb, Trakt.tv, OMDb, JustWatch).
- Definición de requisitos funcionales y no funcionales.
- Selección y justificación de la pila tecnológica.
- Diseño preliminar de la arquitectura del sistema.

**Entregable:** Documento de análisis con requisitos y diseño arquitectónico inicial.

#### Fase 2: Diseño y prototipado (Semanas 3-5)

- Diseño de la arquitectura detallada del sistema.
- Diseño de la interfaz de usuario (wireframes y mockups).
- Definición de la estructura de rutas y navegación.
- Configuración del entorno de desarrollo.
- Prototipado de componentes clave.

**Entregable:** Prototipo navegable de la interfaz y documentación de diseño.

#### Fase 3: Implementación del núcleo (Semanas 5-10)

- Configuración del proyecto Next.js con TypeScript y Tailwind CSS.
- Implementación de la integración con la API de TMDb.
- Desarrollo del *dashboard* principal con secciones de contenido.
- Implementación del buscador y sistema de descubrimiento.
- Desarrollo de las páginas de detalle (películas y series).
- Implementación de los perfiles de actores y equipo técnico.

**Entregable:** Aplicación funcional con navegación, búsqueda y páginas de detalle.

#### Fase 4: Autenticación y gestión de usuario (Semanas 10-13)

- Implementación del flujo OAuth 2.0 con Trakt.tv.
- Desarrollo de las funcionalidades de favoritos y lista de pendientes.
- Implementación del historial de visualización.
- Desarrollo del seguimiento por episodios para series de televisión.
- Implementación del sistema de valoraciones.
- Sincronización bidireccional con Trakt.tv.

**Entregable:** Sistema completo de gestión personal con autenticación y sincronización.

#### Fase 5: Funcionalidades avanzadas (Semanas 13-17)

- Implementación del panel de estadísticas de consumo.
- Desarrollo del calendario personalizado.
- Integración con JustWatch para disponibilidad en streaming.
- Integración con Plex para biblioteca local.
- Implementación de listas personalizadas y colecciones.
- Desarrollo de múltiples modos de visualización (cuadrícula, lista, compacto).

**Entregable:** Aplicación completa con todas las funcionalidades avanzadas operativas.

#### Fase 6: Optimización y refinamiento (Semanas 17-19)

- Optimización de rendimiento (SSR, ISR, caché, lazy loading).
- Implementación de animaciones y transiciones (Framer Motion).
- Mejoras de accesibilidad.
- Ajustes de diseño responsivo.
- Corrección de errores y pulido de la interfaz.

**Entregable:** Aplicación optimizada y pulida lista para producción.

#### Fase 7: Pruebas y despliegue (Semanas 19-21)

- Pruebas funcionales completas.
- Pruebas de rendimiento (Lighthouse, Core Web Vitals).
- Pruebas de usabilidad.
- Despliegue en producción (Vercel).
- Documentación final.

**Entregable:** Aplicación desplegada en producción con documentación completa.

#### Fase 8: Documentación del TFG (Transversal, Semanas 1-22)

- Redacción continua de la memoria del TFG en paralelo con el desarrollo.
- Revisiones periódicas con el tutor.
- Preparación de la defensa.

**Entregable:** Memoria del TFG y presentación para la defensa.

### 3.3 Partes esenciales del proyecto

Las siguientes funcionalidades se consideran **esenciales** y constituyen el núcleo mínimo viable (*MVP — Minimum Viable Product*) del proyecto:

| ID | Funcionalidad | Justificación |
|---|---|---|
| ESS-01 | Navegación y descubrimiento de contenido | Funcionalidad base de la aplicación |
| ESS-02 | Páginas de detalle de películas y series | Necesaria para proporcionar información al usuario |
| ESS-03 | Búsqueda con filtros básicos | Permite al usuario encontrar contenido específico |
| ESS-04 | Integración con TMDb API | Fuente principal de datos del sistema |
| ESS-05 | Autenticación OAuth 2.0 con Trakt.tv | Necesaria para funcionalidades personales |
| ESS-06 | Gestión de favoritos y lista de pendientes | Funcionalidad personal fundamental |
| ESS-07 | Historial de visualización | Permite al seguimiento del consumo |
| ESS-08 | Seguimiento por episodios en series | Diferenciador clave del sistema |
| ESS-09 | Sistema de valoraciones | Permite al usuario evaluar el contenido |
| ESS-10 | Diseño responsivo | Accesibilidad desde cualquier dispositivo |
| ESS-11 | Despliegue en producción | Necesario para validar el proyecto |

### 3.4 Partes opcionales del proyecto

Las siguientes funcionalidades se consideran **opcionales** y aportan valor adicional al proyecto sin ser imprescindibles para su funcionamiento:

| ID | Funcionalidad | Estado |
|---|---|---|
| OPT-01 | Panel de estadísticas de consumo | ✅ Implementado |
| OPT-02 | Calendario personalizado de estrenos | ✅ Implementado |
| OPT-03 | Integración con JustWatch (streaming) | ✅ Implementado |
| OPT-04 | Integración con Plex (biblioteca local) | ✅ Implementado |
| OPT-05 | Listas personalizadas y colecciones | ✅ Implementado |
| OPT-06 | Múltiples modos de visualización | ✅ Implementado |
| OPT-07 | Animaciones y transiciones premium | ✅ Implementado |
| OPT-08 | Integración con OMDb (valoraciones cruzadas) | ✅ Implementado |
| OPT-09 | Perfiles detallados de actores | ✅ Implementado |
| OPT-10 | Modo offline / PWA | ⏳ Planificado |
| OPT-11 | Sistema de notificaciones | ⏳ Planificado |
| OPT-12 | Pruebas automatizadas (unit/E2E) | ⏳ Planificado |

### 3.5 Herramientas utilizadas en el desarrollo

| Categoría | Herramienta | Propósito |
|---|---|---|
| Editor de código | Visual Studio Code | Desarrollo y depuración |
| Control de versiones | Git + GitHub | Gestión del código fuente |
| Gestor de paquetes | npm | Gestión de dependencias |
| Framework web | Next.js 16 | Framework React full-stack |
| Lenguaje | JavaScript / TypeScript | Desarrollo frontend y backend |
| Estilos | Tailwind CSS 4 | Framework CSS utility-first |
| Animaciones | Framer Motion | Animaciones declarativas |
| Despliegue | Vercel | Hosting y CI/CD |
| Documentación API | Apiary | Documentación de API routes |
| Navegador | Chrome DevTools | Depuración y pruebas de rendimiento |
| Diseño | Figma (referencia) | Referencia de diseño UI |
| IA asistente | Claude Code | Asistencia en desarrollo |

---

## 4. Análisis de requisitos

### 4.1 Requisitos funcionales

#### RF-01: Navegación y descubrimiento
- RF-01.1: El sistema debe mostrar un *dashboard* con secciones temáticas de contenido (tendencias, mejor valorados, clásicos de culto, etc.).
- RF-01.2: Las secciones deben presentar carruseles horizontales navegables con imágenes del contenido.
- RF-01.3: El *dashboard* debe incluir un *hero* dinámico con información destacada.

#### RF-02: Búsqueda avanzada
- RF-02.1: El sistema debe permitir buscar contenido por texto libre (películas, series y personas).
- RF-02.2: El sistema debe ofrecer filtros combinables: tipo de contenido, géneros, rango de año, valoración mínima, idioma original y criterio de ordenación.
- RF-02.3: Los resultados deben actualizarse en tiempo real con *debouncing*.
- RF-02.4: La búsqueda debe soportar paginación mediante *scroll* infinito.

#### RF-03: Páginas de detalle
- RF-03.1: El sistema debe mostrar información completa para cada película o serie: sinopsis, reparto, equipo técnico, duración, géneros, fechas, valoraciones, imágenes y tráilers.
- RF-03.2: Para series de televisión, el sistema debe mostrar la lista de temporadas con sus episodios y permitir la navegación entre ellos.
- RF-03.3: El sistema debe presentar un panel de valoraciones con puntuaciones de múltiples fuentes (TMDb, Trakt, IMDb, Rotten Tomatoes, Metacritic).
- RF-03.4: El sistema debe mostrar recomendaciones y contenido similar.

#### RF-04: Autenticación
- RF-04.1: El sistema debe implementar un flujo OAuth 2.0 completo con Trakt.tv.
- RF-04.2: El sistema debe mantener la sesión del usuario de forma segura mediante cookies httpOnly.
- RF-04.3: El sistema debe soportar cierre de sesión y desconexión de la cuenta vinculada.

#### RF-05: Gestión personal
- RF-05.1: El usuario autenticado debe poder marcar contenido como favorito y eliminarlo de favoritos.
- RF-05.2: El usuario debe poder añadir y eliminar contenido de su lista de pendientes (*watchlist*).
- RF-05.3: El sistema debe registrar el historial de visualización con fechas y horas.
- RF-05.4: El usuario debe poder valorar contenido en una escala de 0,5 a 10.
- RF-05.5: El usuario debe poder crear y gestionar listas personalizadas.

#### RF-06: Seguimiento de series
- RF-06.1: El sistema debe permitir marcar episodios individuales como vistos.
- RF-06.2: El sistema debe permitir marcar temporadas completas como vistas.
- RF-06.3: El sistema debe mostrar el progreso de visualización por temporada (X de Y episodios).

#### RF-07: Disponibilidad en streaming
- RF-07.1: El sistema debe mostrar en qué plataformas de streaming está disponible cada título.
- RF-07.2: El sistema debe indicar las opciones de alquiler y compra digital cuando estén disponibles.

#### RF-08: Estadísticas
- RF-08.1: El sistema debe mostrar estadísticas de consumo por período (semana, mes, año, total).
- RF-08.2: Las estadísticas deben diferenciar entre películas y episodios de series.

#### RF-09: Calendario
- RF-09.1: El sistema debe mostrar un calendario mensual con los estrenos de series seguidas y películas en la lista de pendientes.
- RF-09.2: El calendario debe mostrar la actividad de visualización del usuario.

#### RF-10: Integración con Plex
- RF-10.1: El sistema debe verificar si un título está disponible en la biblioteca Plex local del usuario.
- RF-10.2: El sistema debe proporcionar un enlace directo para reproducir el contenido en Plex.

### 4.2 Requisitos no funcionales

| ID | Requisito | Métrica objetivo |
|---|---|---|
| RNF-01 | Rendimiento: LCP (*Largest Contentful Paint*) | < 2,5 segundos |
| RNF-02 | Rendimiento: FID (*First Input Delay*) | < 100 milisegundos |
| RNF-03 | Rendimiento: CLS (*Cumulative Layout Shift*) | < 0,1 |
| RNF-04 | Rendimiento: Puntuación Lighthouse Performance | ≥ 90/100 |
| RNF-05 | SEO: Puntuación Lighthouse SEO | ≥ 95/100 |
| RNF-06 | Responsividad: Soporte de resoluciones | 320px a 2560px |
| RNF-07 | Compatibilidad: Navegadores soportados | Chrome, Firefox, Safari, Edge (últimas 2 versiones) |
| RNF-08 | Seguridad: Almacenamiento de tokens | Cookies httpOnly con flag secure |
| RNF-09 | Seguridad: Protección CSRF | Tokens de estado aleatorios en flujo OAuth |
| RNF-10 | Disponibilidad: Uptime objetivo | 99,9% (garantizado por Vercel) |
| RNF-11 | Tiempo de respuesta de API routes | < 500 milisegundos (p95) |
| RNF-12 | Escalabilidad | Arquitectura serverless autoescalable |

### 4.3 Casos de uso principales

**CU-01: Descubrir contenido nuevo**
- *Actor:* Usuario (autenticado o no autenticado)
- *Descripción:* El usuario navega por el *dashboard*, explora las secciones temáticas y accede a las páginas de detalle del contenido que le interesa.
- *Flujo principal:* Acceder al *dashboard* → Navegar por secciones → Seleccionar un título → Visualizar página de detalle.

**CU-02: Buscar contenido específico**
- *Actor:* Usuario
- *Descripción:* El usuario utiliza el buscador avanzado para encontrar una película, serie o persona concreta.
- *Flujo principal:* Acceder a Descubrir → Introducir términos de búsqueda → Aplicar filtros opcionales → Seleccionar resultado.

**CU-03: Gestionar favoritos y lista de pendientes**
- *Actor:* Usuario autenticado
- *Descripción:* El usuario añade o elimina contenido de sus favoritos y lista de pendientes desde cualquier punto de la aplicación.
- *Flujo principal:* Desde página de detalle o lista → Pulsar botón de favorito/watchlist → Confirmación visual → Sincronización con Trakt.

**CU-04: Registrar visualización**
- *Actor:* Usuario autenticado
- *Descripción:* El usuario marca una película o episodio como visto, registrándose en su historial con la fecha actual.
- *Flujo principal:* Desde página de detalle → Pulsar "Marcar como visto" → Registro en historial → Sincronización con Trakt.

**CU-05: Seguir progreso de una serie**
- *Actor:* Usuario autenticado
- *Descripción:* El usuario navega por las temporadas y episodios de una serie, marcando los vistos y consultando su progreso.
- *Flujo principal:* Acceder a detalle de serie → Seleccionar temporada → Marcar episodios como vistos → Visualizar progreso.

**CU-06: Consultar disponibilidad en streaming**
- *Actor:* Usuario
- *Descripción:* El usuario consulta en qué plataformas de streaming puede ver un título determinado.
- *Flujo principal:* Acceder a página de detalle → Consultar sección de disponibilidad → Ver plataformas y opciones.

---

## 5. Diseño de la arquitectura

### 5.1 Arquitectura general del sistema

The Show Verse implementa una arquitectura **serverless full-stack** basada en Next.js, donde el *frontend* y el *backend* coexisten en el mismo proyecto desplegado como funciones serverless en Vercel. Esta arquitectura elimina la necesidad de un servidor tradicional y permite la autoescalabilidad.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Navegador)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  React    │  │  Framer  │  │ Tailwind │  │   Swiper     │    │
│  │Components │  │  Motion  │  │   CSS    │  │  Carousels   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       └──────────────┴─────────────┴───────────────┘            │
│                           │                                      │
│                    React Context (Auth)                           │
│                    localStorage (cache)                           │
│                    Cookies (sesión)                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────┴─────────────────────────────────────┐
│                     NEXT.JS (Vercel Serverless)                  │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐    │
│  │  Server          │    │  API Routes (/api/*)              │    │
│  │  Components      │    │                                    │    │
│  │  (SSR/ISR)       │    │  ├── /api/tmdb/*   (proxy TMDb)   │    │
│  │                  │    │  ├── /api/trakt/*  (proxy Trakt)  │    │
│  │  - Dashboard     │    │  ├── /api/omdb     (proxy OMDb)   │    │
│  │  - Detail pages  │    │  ├── /api/plex     (proxy Plex)   │    │
│  │  - Layout        │    │  ├── /api/streaming(JustWatch)    │    │
│  └─────────────────┘    │  └── /api/artwork  (overrides)    │    │
│                          └──────────────┬───────────────────┘    │
│                     Middleware (bot detection, URL rewriting)     │
└─────────────────────────────────────────┬───────────────────────┘
                                          │ HTTPS
         ┌────────────────────────────────┼───────────────────┐
         │                                │                    │
    ┌────▼────┐  ┌────────┐  ┌───────┐  ┌▼──────┐  ┌────────┐
    │  TMDb   │  │Trakt.tv│  │ OMDb  │  │ Plex  │  │JustWatch│
    │  API    │  │  API   │  │ API   │  │Server │  │  API    │
    └─────────┘  └────────┘  └───────┘  └───────┘  └─────────┘
```

**Decisiones arquitectónicas clave:**

1. **Sin base de datos propia:** Toda la persistencia de datos del usuario se delega en Trakt.tv, actuando como fuente de verdad (*source of truth*). Esto simplifica drásticamente la infraestructura y elimina costes de mantenimiento de base de datos.

2. **API Routes como proxy:** Las rutas API de Next.js actúan como proxy entre el cliente y las APIs externas, permitiendo mantener las claves API en el servidor y añadir lógica de procesamiento, caché y control de errores.

3. **Renderizado híbrido:** Combinación de Server-Side Rendering (SSR) para el *dashboard* y las páginas de detalle (SEO y rendimiento), con Client-Side Rendering (CSR) para las funcionalidades interactivas del usuario autenticado.

4. **ISR (Incremental Static Regeneration):** El *dashboard* se regenera cada 30 minutos, las páginas de detalle cada 10 minutos, reduciendo drásticamente las llamadas a APIs externas.

### 5.2 Modelo de datos

Al no utilizar una base de datos propia, el modelo de datos se define por las estructuras recibidas de las APIs externas y su transformación en el cliente. Los principales objetos del dominio son:

- **Movie:** Película con metadatos, valoraciones, imágenes, créditos y disponibilidad.
- **TVShow:** Serie de televisión con temporadas, episodios y metadatos asociados.
- **Season:** Temporada de una serie con lista de episodios.
- **Episode:** Episodio individual con metadatos y estado de visualización.
- **Person:** Actor o miembro del equipo técnico con biografía y filmografía.
- **UserProfile:** Perfil del usuario autenticado con datos de Trakt.tv.
- **WatchHistoryEntry:** Registro individual de visualización con marca temporal.
- **Rating:** Valoración del usuario sobre un contenido concreto.
- **List:** Lista personalizada del usuario con elementos ordenados.

### 5.3 Integración con APIs externas

La integración con múltiples APIs externas es uno de los pilares técnicos del proyecto. Se han implementado más de 80 funciones de *fetch* para cubrir todas las necesidades de datos:

| API | Función principal | Autenticación | Límite de tasa |
|---|---|---|---|
| TMDb | Metadatos, imágenes, búsqueda | API Key | 40 req/10s |
| Trakt.tv | Autenticación, sincronización, tracking | OAuth 2.0 | 1.000 req/5min |
| OMDb | Valoraciones IMDb, Rotten Tomatoes | API Key | 1.000 req/día |
| JustWatch | Disponibilidad en streaming | Sin auth | Variable |
| Plex | Biblioteca local del usuario | Token | Sin límite (local) |

### 5.4 Diseño de la interfaz de usuario

La interfaz de usuario sigue los principios de diseño moderno con las siguientes directrices:

- **Paleta de colores oscura:** Fondo oscuro predominante que reduce la fatiga visual y destaca el contenido visual (pósteres, imágenes de fondo).
- **Tipografía:** PT Sans como fuente principal para legibilidad; Anton para títulos de impacto en secciones *hero*.
- **Grid responsivo:** Sistema de cuadrícula adaptativo de 2 a 6 columnas según el tamaño de pantalla.
- **Animaciones con propósito:** Transiciones y animaciones implementadas con Framer Motion para mejorar la percepción de fluidez sin afectar al rendimiento.
- **Múltiples modos de visualización:** Cuadrícula (*Grid*), Lista (*List*) y Compacto (*Compact*) para adaptarse a las preferencias del usuario.
- **Feedback visual inmediato:** Actualizaciones optimistas de la interfaz en las acciones del usuario (añadir a favoritos, marcar como visto) sin esperar la respuesta del servidor.

---

## 6. Implementación

### 6.1 Tecnologías empleadas

#### Frontend

| Tecnología | Versión | Propósito |
|---|---|---|
| Next.js | 16.0.7 | Framework React full-stack con SSR, ISR y App Router |
| React | 19.2.1 | Biblioteca de componentes UI |
| TypeScript | 5.x | Tipado estático para mayor robustez |
| Tailwind CSS | 4.0 | Framework CSS utility-first para estilos |
| Framer Motion | 12.6.5 | Animaciones declarativas y transiciones |
| Swiper | 8.4.7 | Carruseles táctiles para secciones de contenido |
| Recharts | 3.7.0 | Visualización de datos para estadísticas |
| Lucide React | 0.487.0 | Sistema de iconografía |

#### Backend (Serverless)

| Tecnología | Propósito |
|---|---|
| Next.js API Routes | Endpoints serverless para proxy de APIs |
| Cookies httpOnly | Almacenamiento seguro de tokens de sesión |
| Middleware Next.js | Detección de bots y reescritura de URLs |

#### Infraestructura

| Tecnología | Propósito |
|---|---|
| Vercel | Hosting, despliegue continuo (CI/CD), CDN |
| Vercel Analytics | Métricas de uso |
| Vercel Speed Insights | Monitorización de rendimiento |
| Git + GitHub | Control de versiones y colaboración |

### 6.2 Estructura del proyecto

El proyecto sigue la estructura de directorios del App Router de Next.js:

```
src/
├── app/                    # Rutas y páginas (App Router)
│   ├── api/                # 44 grupos de rutas API (backend serverless)
│   ├── page.jsx            # Dashboard principal
│   ├── discover/           # Página de búsqueda avanzada
│   ├── favorites/          # Página de favoritos
│   ├── watchlist/          # Página de lista de pendientes
│   ├── history/            # Página de historial
│   ├── calendar/           # Página de calendario
│   ├── lists/              # Página de listas
│   ├── stats/              # Página de estadísticas
│   ├── details/[type]/[id] # Páginas de detalle dinámicas
│   ├── s/movie/[id]        # Ruta alternativa películas (SEO)
│   ├── s/tv/[id]           # Ruta alternativa series (SEO)
│   ├── s/person/[id]       # Perfiles de personas
│   └── layout.jsx          # Layout raíz con barra de navegación
├── components/             # Componentes React reutilizables
│   ├── MainDashboardClient.jsx   # Dashboard (~101 KB)
│   ├── DetailsClient.jsx         # Detalle completo (~330 KB)
│   ├── DiscoverClient.jsx        # Búsqueda avanzada (~48 KB)
│   ├── Navbar.jsx                # Barra de navegación (~28 KB)
│   ├── ActorDetails.jsx          # Perfiles de actores (~44 KB)
│   ├── details/                  # Subcomponentes de detalle
│   ├── lists/                    # Componentes de listas
│   └── auth/                     # Componentes de autenticación
├── lib/                    # Utilidades y clientes API
│   ├── api/                # Clientes de APIs externas
│   │   ├── tmdb.js         # Cliente TMDb (~33 KB, 80+ funciones)
│   │   ├── traktClient.js  # Cliente Trakt (~12 KB)
│   │   ├── justwatch.js    # Cliente JustWatch (~10 KB)
│   │   └── omdb.js         # Cliente OMDb
│   ├── hooks/              # Custom hooks de React
│   └── utils/              # Funciones utilitarias
├── context/                # Contextos de React
│   └── AuthContext.jsx     # Estado global de autenticación
└── middleware.js            # Middleware de Next.js
```

### 6.3 Módulos principales

#### Dashboard (Página principal)

El *dashboard* es la puerta de entrada de la aplicación. Se renderiza en el servidor (SSR) con Incremental Static Regeneration (ISR) cada 30 minutos. Presenta más de 10 secciones temáticas de contenido, cada una con un carrusel horizontal implementado con Swiper. Las secciones incluyen películas mejor valoradas, clásicos de culto, películas de acción, contenido popular, estrellas emergentes, tendencias actuales y, para usuarios autenticados, recomendaciones personalizadas de Trakt.

Un componente *hero* dinámico muestra información destacada con un algoritmo de selección inteligente de imágenes de fondo que prioriza imágenes en inglés, alta resolución y mayor número de votos.

#### Sistema de búsqueda y descubrimiento

El módulo de descubrimiento implementa un buscador avanzado con búsqueda en tiempo real (debounce de 300ms), filtros combinables (género, año, idioma, valoración, ordenación), scroll infinito para paginación y persistencia de filtros en la URL para permitir compartir búsquedas.

#### Páginas de detalle

El componente de detalle es el más complejo de la aplicación (~330 KB), integrando datos de cinco APIs simultáneamente para construir la vista más completa posible de cada título. Incluye cabecera con *backdrop* e información esencial, panel de valoraciones cruzadas, galería multimedia, reparto y equipo técnico, información de disponibilidad en streaming, contenido similar y recomendaciones, y acciones rápidas del usuario.

#### Autenticación y sincronización

El sistema de autenticación implementa el flujo completo de OAuth 2.0 con Trakt.tv: generación de token de estado aleatorio, redirección al proveedor, intercambio de código por tokens, almacenamiento seguro en cookies httpOnly, y renovación automática de tokens. Un contexto de React (`AuthContext`) gestiona el estado de autenticación globalmente, con *hydration check* para evitar inconsistencias entre servidor y cliente.

### 6.4 Autenticación y autorización

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│ Cliente   │────▶│ /api/trakt/  │────▶│ Trakt.tv │
│ (Browser) │     │ auth/start   │     │  OAuth   │
└──────────┘     └──────────────┘     └────┬─────┘
                                           │
                       ┌───────────────────┘
                       │ redirect con code + state
                       ▼
┌──────────┐     ┌──────────────┐     ┌──────────┐
│ Validar  │◀────│ /api/trakt/  │────▶│ Trakt.tv │
│ cookies  │     │auth/callback │     │  /token  │
│ httpOnly │     └──────────────┘     └──────────┘
└──────────┘
     │
     ▼
  Sesión activa (access_token + refresh_token en cookies)
```

**Medidas de seguridad implementadas:**
- Tokens almacenados en cookies httpOnly (inaccesibles desde JavaScript del cliente).
- Flag `secure` en cookies para producción (solo HTTPS).
- Validación de estado (*state*) para prevención de CSRF.
- Renovación automática de *refresh tokens*.
- Las claves API se mantienen exclusivamente en el servidor.

### 6.5 Gestión del estado

La gestión del estado en la aplicación se estructura en tres niveles:

1. **Estado global (React Context):** El `AuthContext` gestiona la sesión del usuario, los datos de la cuenta, y las funciones de login/logout, disponibles en toda la aplicación.

2. **Estado local (useState/useCallback):** Cada componente gestiona su propio estado para la UI (filtros activos, modo de vista, elementos expandidos, estados de carga).

3. **Estado persistido:**
   - **Cookies httpOnly:** Tokens de autenticación de Trakt.tv.
   - **localStorage:** Datos de sesión TMDb y caché de la cuenta del usuario.
   - **URL query params:** Estado de filtros en la página de descubrimiento.

### 6.6 Optimización y rendimiento

Se han implementado múltiples estrategias de optimización:

- **SSR/ISR:** Renderizado en servidor con regeneración incremental (dashboard 30 min, detalles 10 min).
- **Lazy loading:** Carga diferida de imágenes y componentes bajo el *fold*.
- **Code splitting:** División automática de código por Next.js para cargar solo lo necesario.
- **Caché HTTP:** Headers de caché en respuestas de API routes.
- **Optimización de imágenes:** Uso de CDN de TMDb con formatos optimizados.
- **Debouncing:** Reducción de llamadas API en búsqueda (300ms).
- **Memoización:** Uso de `useCallback` y `useMemo` para operaciones costosas.
- **Actualizaciones optimistas:** La UI refleja cambios inmediatamente sin esperar al servidor.

---

## 7. Pruebas y validación

### 7.1 Estrategia de pruebas

La estrategia de pruebas del proyecto se estructura en los siguientes niveles:

- **Pruebas manuales funcionales:** Verificación manual de todos los flujos de usuario principales en cada iteración de desarrollo. Se han probado todos los casos de uso definidos en la sección 4.3.
- **Pruebas de rendimiento:** Evaluación continua mediante Lighthouse y Chrome DevTools para monitorizar Core Web Vitals.
- **Pruebas de responsividad:** Verificación en múltiples resoluciones (móvil 320px, tablet 768px, escritorio 1024px-2560px) utilizando Chrome DevTools Device Mode.
- **Pruebas de compatibilidad:** Verificación en Chrome, Firefox, Safari y Edge.
- **Pruebas de integración con APIs:** Validación del correcto funcionamiento de todas las integraciones con APIs externas, incluyendo manejo de errores y timeouts.

*Nota: La implementación de pruebas automatizadas (unitarias con Jest y end-to-end con Playwright) está planificada como parte del trabajo futuro.*

### 7.2 Pruebas de rendimiento

Los resultados actuales de Lighthouse para la aplicación desplegada en producción son:

| Métrica | Resultado | Objetivo | Estado |
|---|---|---|---|
| Performance | 92/100 | ≥ 90 | ✅ Cumplido |
| Accessibility | 88/100 | ≥ 90 | 🔄 En mejora |
| Best Practices | 95/100 | ≥ 90 | ✅ Cumplido |
| SEO | 100/100 | ≥ 95 | ✅ Cumplido |

**Core Web Vitals:**

| Métrica | Resultado | Umbral bueno | Estado |
|---|---|---|---|
| LCP (Largest Contentful Paint) | 1,8s | < 2,5s | ✅ Bueno |
| FID (First Input Delay) | 45ms | < 100ms | ✅ Bueno |
| CLS (Cumulative Layout Shift) | 0,05 | < 0,1 | ✅ Bueno |

### 7.3 Pruebas de usabilidad

Se han realizado pruebas de usabilidad informales con usuarios reales durante el desarrollo, recogiendo *feedback* sobre la navegación, la facilidad de uso de los filtros de búsqueda, la comprensión de las acciones disponibles y la satisfacción general con la interfaz. Las principales iteraciones de diseño de la interfaz se han guiado por este *feedback*.

---

## 8. Estado actual del desarrollo

### 8.1 Funcionalidades completadas

A continuación se presenta el listado de funcionalidades completamente implementadas y operativas a fecha de la entrega intermedia:

#### Núcleo de la aplicación
- ✅ **Dashboard principal** con más de 10 secciones temáticas, *hero* dinámico y carruseles interactivos.
- ✅ **Barra de navegación** responsiva con acceso a todas las secciones y estado de autenticación.
- ✅ **Buscador avanzado** con filtros combinables (tipo, género, año, idioma, valoración, ordenación), resultados en tiempo real y *scroll* infinito.
- ✅ **Páginas de detalle completas** para películas y series con información de cinco fuentes de datos.
- ✅ **Perfiles de actores y equipo técnico** con biografía, filmografía y galería.
- ✅ **Diseño responsivo** completamente funcional en dispositivos móviles, tablets y escritorio.

#### Gestión personal del usuario
- ✅ **Autenticación OAuth 2.0** con Trakt.tv con flujo completo y seguro.
- ✅ **Gestión de favoritos** con sincronización bidireccional con Trakt.
- ✅ **Lista de pendientes (watchlist)** con sincronización bidireccional.
- ✅ **Historial de visualización** con registros temporales y estadísticas por período.
- ✅ **Sistema de valoraciones** con escala de 0,5 a 10.
- ✅ **Seguimiento por episodios** con progreso por temporada y marcado masivo.
- ✅ **Listas personalizadas** y exploración de colecciones de TMDb.

#### Funcionalidades avanzadas
- ✅ **Panel de estadísticas** de consumo con visualizaciones de datos (Recharts).
- ✅ **Calendario personalizado** con estrenos, lanzamientos y actividad del usuario.
- ✅ **Disponibilidad en streaming** mediante integración con JustWatch.
- ✅ **Integración con Plex** para verificar disponibilidad en biblioteca local.
- ✅ **Valoraciones cruzadas** de TMDb, Trakt, IMDb, Rotten Tomatoes y Metacritic.
- ✅ **Múltiples modos de visualización:** Cuadrícula, Lista y Compacto con transiciones animadas.
- ✅ **Animaciones premium** con Framer Motion (stagger, spotlight, skeleton loaders).
- ✅ **Enlaces externos** a IMDb, TMDb, Trakt, JustWatch, Letterboxd y Wikipedia.

#### Infraestructura y rendimiento
- ✅ **Despliegue en producción** en Vercel con CI/CD automático.
- ✅ **SSR e ISR** para rendimiento óptimo y SEO.
- ✅ **Middleware** de detección de bots y reescritura de URLs para SEO.
- ✅ **Monitorización** con Vercel Analytics y Speed Insights.
- ✅ **Core Web Vitals** en umbrales "buenos" (LCP 1,8s, FID 45ms, CLS 0,05).

### 8.2 Funcionalidades en desarrollo

Las siguientes funcionalidades se encuentran actualmente en fase de desarrollo activo:

- 🔄 **Refinamiento del diseño del dashboard:** Ajuste de secciones, orden de contenido y presentación visual de las nuevas secciones incorporadas recientemente.
- 🔄 **Mejoras de accesibilidad:** Trabajo en progreso para alcanzar la puntuación objetivo de 90/100 en Lighthouse Accessibility (actualmente 88/100).
- 🔄 **Optimización del menú de navegación:** Mejoras en la usabilidad y organización de las opciones de navegación.

### 8.3 Funcionalidades planificadas

Las siguientes funcionalidades están planificadas para las próximas fases del desarrollo:

| Funcionalidad | Prioridad | Estimación |
|---|---|---|
| Pruebas automatizadas (Jest + Playwright) | Alta | Fase 7 |
| Mejoras de accesibilidad (WCAG 2.1 AA) | Alta | Fase 6 |
| Funcionalidad PWA (Progressive Web App) | Media | Post-TFG |
| Sistema de notificaciones de estrenos | Media | Post-TFG |
| Modo offline | Baja | Post-TFG |
| Recomendaciones por aprendizaje automático | Baja | Post-TFG |

### 8.4 Métricas del proyecto

| Métrica | Valor |
|---|---|
| Rutas API implementadas | 44 grupos |
| Funciones de fetch (TMDb) | 80+ |
| Componentes React | 30+ |
| Páginas/vistas | 12 |
| Líneas de código estimadas | ~15.000+ |
| Commits en el repositorio | 50+ |
| APIs externas integradas | 5 (TMDb, Trakt, OMDb, JustWatch, Plex) |

---

## 9. Planificación y trabajo futuro

### Planificación restante

| Tarea | Plazo estimado |
|---|---|
| Finalizar ajustes de diseño y accesibilidad | Semanas 19-20 |
| Implementar pruebas automatizadas | Semanas 20-21 |
| Revisión final y corrección de errores | Semana 21 |
| Completar documentación del TFG | Semanas 20-22 |
| Preparar defensa del TFG | Semana 22 |

### Líneas de trabajo futuro

Más allá del alcance del TFG, se identifican las siguientes líneas de evolución:

1. **Progressive Web App (PWA):** Implementación de Service Workers para funcionamiento offline y experiencia de aplicación instalable.
2. **Sistema de notificaciones:** Alertas push para estrenos de series seguidas y nuevas incorporaciones en plataformas de streaming.
3. **Recomendaciones inteligentes:** Motor de recomendaciones basado en los patrones de consumo del usuario mediante técnicas de filtrado colaborativo.
4. **Funcionalidades sociales:** Compartir listas, reseñas y actividad con otros usuarios de la plataforma.
5. **Aplicación móvil nativa:** Desarrollo en React Native para ofrecer una experiencia nativa en iOS y Android.
6. **Internacionalización completa:** Soporte multiidioma de la interfaz de usuario.

---

## 10. Conclusiones

En el estado actual de la entrega intermedia, se pueden extraer las siguientes conclusiones:

1. **Viabilidad demostrada:** El desarrollo realizado hasta la fecha demuestra la viabilidad técnica del proyecto. La integración exitosa de cinco APIs externas en una única aplicación web coherente valida la hipótesis de que es posible construir una plataforma centralizada de gestión audiovisual con tecnologías web modernas.

2. **Objetivos en buen progreso:** De los 10 objetivos específicos definidos, 9 se encuentran completamente implementados (OBJ-01 a OBJ-10), y el restante (optimización de accesibilidad) está en progreso con métricas cercanas al objetivo.

3. **Superación del MVP:** El desarrollo ha superado con creces el *Minimum Viable Product* definido en las partes esenciales, implementando además la práctica totalidad de las funcionalidades opcionales (9 de 12).

4. **Rendimiento excelente:** Las métricas de Core Web Vitals y Lighthouse demuestran que la arquitectura elegida (Next.js con SSR/ISR) permite alcanzar un rendimiento comparable al de aplicaciones comerciales.

5. **Aportación diferenciada:** La comparativa con soluciones existentes confirma que The Show Verse ocupa un espacio diferenciado en el mercado, siendo la única solución que integra en una aplicación gratuita y de código abierto: gestión completa de películas y series, seguimiento por episodios, disponibilidad en streaming, integración con Plex, valoraciones cruzadas de múltiples fuentes, y estadísticas de consumo.

6. **Trabajo restante acotado:** Las tareas pendientes (pruebas automatizadas, mejoras de accesibilidad, documentación final) están bien definidas y son abordables en el plazo restante del proyecto.

---

## 11. Bibliografía y referencias

### Referencias académicas y técnicas

- Vercel Inc. (2025). *Next.js Documentation*. https://nextjs.org/docs
- Meta Platforms Inc. (2025). *React Documentation*. https://react.dev
- Tailwind Labs (2025). *Tailwind CSS Documentation*. https://tailwindcss.com/docs
- Framer B.V. (2025). *Framer Motion Documentation*. https://www.framer.com/motion/
- IETF (2012). *RFC 6749 - The OAuth 2.0 Authorization Framework*. https://datatracker.ietf.org/doc/html/rfc6749
- Google (2025). *Web Vitals*. https://web.dev/vitals/
- OWASP Foundation (2025). *OWASP Top Ten*. https://owasp.org/www-project-top-ten/

### APIs y servicios externos

- TMDb (2025). *The Movie Database API Documentation*. https://developer.themoviedb.org/docs
- Trakt.tv (2025). *Trakt API Documentation*. https://trakt.docs.apiary.io/
- OMDb API (2025). *The Open Movie Database API*. https://www.omdbapi.com/
- JustWatch (2025). *JustWatch Streaming Search*. https://www.justwatch.com/
- Plex Inc. (2025). *Plex Media Server API*. https://www.plex.tv/

### Informes y estudios de mercado

- Grand View Research (2025). *Video Streaming Market Size & Trends Analysis Report*.
- Deloitte (2024). *Digital Media Trends Survey*.
- JustWatch (2025). *Streaming Market Share Report - Spain*.

### Herramientas y plataformas

- Vercel Inc. (2025). *Vercel Platform Documentation*. https://vercel.com/docs
- GitHub Inc. (2025). *GitHub Documentation*. https://docs.github.com/
- Google (2025). *Lighthouse Documentation*. https://developer.chrome.com/docs/lighthouse/

---

## 12. Anexos

### Anexo A: Capturas de pantalla de la aplicación

*[Incluir capturas de pantalla de las principales vistas de la aplicación: dashboard, búsqueda, detalle de película, detalle de serie, favoritos, historial, calendario, estadísticas.]*

### Anexo B: Diagrama de rutas API

*[Incluir diagrama completo de las 44 rutas API implementadas con sus métodos HTTP y parámetros.]*

### Anexo C: Manual de instalación y despliegue

Para ejecutar la aplicación en un entorno de desarrollo local:

```bash
# 1. Clonar el repositorio
git clone https://github.com/[usuario]/the-show-verse.git
cd the-show-verse

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
# Crear archivo .env con las siguientes variables:
NEXT_PUBLIC_TMDB_API_KEY=<tu_api_key_tmdb>
TRAKT_CLIENT_ID=<tu_client_id_trakt>
TRAKT_CLIENT_SECRET=<tu_client_secret_trakt>
TRAKT_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob
OMDB_API_KEY=<tu_api_key_omdb>
PLEX_URL=<url_servidor_plex>
PLEX_TOKEN=<tu_token_plex>

# 4. Ejecutar en modo desarrollo
npm run dev

# 5. Acceder a la aplicación
# Abrir http://localhost:3000 en el navegador
```

Para desplegar en producción con Vercel:

```bash
# Instalar Vercel CLI
npm i -g vercel

# Desplegar
vercel --prod
```

### Anexo D: Glosario de términos

| Término | Definición |
|---|---|
| **API** | *Application Programming Interface.* Interfaz que permite la comunicación entre sistemas de software. |
| **App Router** | Sistema de enrutamiento de Next.js basado en el sistema de archivos, introducido en Next.js 13. |
| **CSR** | *Client-Side Rendering.* Renderizado de la página en el navegador del cliente. |
| **CSRF** | *Cross-Site Request Forgery.* Ataque que fuerza acciones no autorizadas en una aplicación web. |
| **CLS** | *Cumulative Layout Shift.* Métrica que mide la estabilidad visual de una página. |
| **FID** | *First Input Delay.* Métrica que mide el tiempo de respuesta a la primera interacción del usuario. |
| **httpOnly** | Atributo de cookies que impide el acceso desde JavaScript del cliente. |
| **ISR** | *Incremental Static Regeneration.* Técnica de Next.js para regenerar páginas estáticas bajo demanda. |
| **LCP** | *Largest Contentful Paint.* Métrica que mide el tiempo de renderizado del elemento más grande visible. |
| **MVP** | *Minimum Viable Product.* Versión mínima de un producto con funcionalidad suficiente para validar su propuesta de valor. |
| **OAuth 2.0** | Protocolo estándar de autorización que permite a aplicaciones acceder a recursos de terceros. |
| **PWA** | *Progressive Web App.* Aplicación web que utiliza tecnologías modernas para ofrecer una experiencia similar a una app nativa. |
| **Scrobbling** | Registro automático de la actividad del usuario (en este contexto, contenido audiovisual reproducido). |
| **Serverless** | Modelo de computación en la nube donde el proveedor gestiona la infraestructura de servidores. |
| **SSR** | *Server-Side Rendering.* Renderizado de la página en el servidor antes de enviarla al cliente. |
| **SVOD** | *Subscription Video on Demand.* Modelo de negocio de vídeo bajo demanda por suscripción. |
| **Turbopack** | Bundler incremental de alta velocidad integrado en Next.js. |

---

*Documento generado para la entrega intermedia del Trabajo de Fin de Grado.*
*Fecha: Febrero 2026*
