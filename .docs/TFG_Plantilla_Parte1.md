# The Show Verse

---

## RESUMEN

El presente Trabajo de Fin de Grado aborda el diseño y la implementación de The Show Verse, una aplicación web de gestión y descubrimiento de películas y series que permite a los usuarios unificar todo el contenido audiovisual en un solo lugar, para ello la plataforma cuenta con secciones personalizadas para cada usuario todo ello gestionado a través de APIs externas. Actualmente existen muchas plataformas de streaming que fragmentan el contenido de películas y series causando una experiencia de usuario pobre y dificultando el seguimiento del contenido. Lo que pretende The Show Verse es solucionar este problema ofreciendo una plataforma que unifica el contenido de las principales páginas de puntuaciones y plataformas de streaming haciendo uso de APIs.

El trabajo consiste en el desarrollo completo de una aplicación web en Next.js, que integra las APIs de The Movie Database (TMDb), Trakt.tv y OMDb además de Justwatch para la disponibilidad de las plataformas de streaming y Plex para habilitar el acceso a las películas y series de un servidor local. Se ha implementado un flujo de autenticación OAuth 2.0 completo con Trakt.tv y TMDb para permitir la sincronización del historial, los favoritos, la lista de pendientes, las listas de la comunidad, el calendario de estrenos y las valoraciones del usuario. Además de hacer uso de un sistema de caché para las puntuaciones de IMDb, Trakt y TMDb en las listas de favoritos y pendientes para reducir el número de peticiones. Estos datos se almacenan durante 30 días para puntuaciones de plataformas (IMDb, TMDb y Trakt), 24 horas para datos de OMDb, y caché en memoria para las puntuaciones del usuario.

---

## 1. INTRODUCCIÓN

### 1.1 Justificación y contexto

En los últimos años, el consumo de películas y series ha cambiado radicalmente. Hoy en día la mayoría de contenido se distribuye a través de plataformas de *streaming* como Netflix, HBO Max, Disney+, Amazon Prime Video o Movistar+, cada una con su propio catálogo independiente, lo que genera un problema habitual para cualquier usuario ya que el contenido está disperso en múltiples servicios y no existe ninguna herramienta que permita gestionarlo todo desde un único lugar.

Esto provoca situaciones como perder el seguimiento de una serie que se dejó a medias, no recordar qué episodios se han visto, tener que buscar en varios sitios a la vez si una película está disponible en streaming, o simplemente no tener un registro de lo que ya se ha visto. Las plataformas de *tracking* que existen actualmente, como Trakt.tv o Letterboxd, resuelven parte del problema pero presentan sus propias limitaciones con falta de funcionalidades.

*The Show Verse* nace como respuesta a esa necesidad: una plataforma web que centraliza toda la gestión del contenido audiovisual, integrando los datos de múltiples fuentes mediante APIs externas y ofreciendo al usuario una experiencia completa y funcional.

Desde el punto de vista técnico, el proyecto aborda varios retos propios del desarrollo web actual: la integración de APIs REST de terceros con distintos esquemas de autenticación y formatos de datos como la implementación del protocolo OAuth 2.0 para el acceso con Trakt.tv, el diseño de una estrategia de caché en múltiples niveles para optimizar el rendimiento, y la construcción de una interfaz responsiva con animaciones fluidas.

### 1.2 Motivación

El punto de partida de este trabajo es la experiencia personal como consumidor habitual de películas y series en múltiples plataformas de *streaming*. La dispersión del catálogo disponible entre los diferentes servicios provocaba con frecuencia situaciones de dificultad para recordar el historial de películas y series y la puntuación que le había dado a cada una, además de tener que buscar las puntuaciones y críticas en distintas webs independientes.

Las aplicaciones existentes en el mercado (Letterboxd, Trakt.tv, Simkl) ofrecen soluciones parciales, pero ninguna combina todos los datos y funcionalidades realmente necesarios a la hora de gestionar este tipo de contenido. Trakt.tv, la más completa en cuanto a API y funcionalidades de *tracking*, presenta una interfaz datada que resulta poco motivadora para el uso diario. Letterboxd, más elegante visualmente, carece de soporte completo para series de televisión y para otras funcionalidades importantes.

La necesidad personal de crear una herramienta mejor y de profundizar en desarrollo web hizo que el proyecto fuese una gran oportunidad para el TFG, un problema real, con usuarios reales potenciales, que permitía aplicar directamente los conocimientos adquiridos durante la carrera de Ingenería del Software.

### 1.3 Planteamiento del problema

El problema abordado en este trabajo puede descomponerse en varias categorías técnicas:

**1 — Integración de fuentes de datos**

Los datos necesarios para una plataforma de gestión de contenido audiovisual completa no están disponibles en una única API y se ha aplicado un criterio para obtenerlos. TMDb proporciona los metadatos de películas y series, esto incluye sinopsis, reparto, imágenes, trailers, además de las puntuaciones y listas de usuario que son Favoritos y Pendientes. Trakt.tv gestiona el *tracking* personal del usuario, es decir, el historial de visionado, la sección en progreso y las estadísticas. OMDb complementa con las puntuaciones de IMDb y Rotten Tomatoes y los premios que haya obtenido la película o serie en cuestión. 
Cada API tiene su propio esquema de autenticación, formato de respuesta, límites de uso e identificadores.

**2 — Autenticación y gestión de sesiones**

La funcionalidad de sincronización con Trakt requiere que el usuario delegue permisos en la aplicación mediante OAuth 2.0 lo que implica implementar el flujo completo de autorización (redirección, intercambio de código por token, almacenamiento seguro, refresco automático), sin exponer en ningún momento las credenciales del usuario ni las claves privadas de la aplicación.

**3 — Rendimiento y experiencia de usuario**

Este tipo de aplicación maneja grandes volúmenes de imágenes de alta resolución y realiza múltiples llamadas a APIs externas con límites de peticiones en algunos casos reducidos. Es importante que haya un equilibrio entre datos que se almacenan en caché y aquellos que se muestran en tiempo real.

**4 — Sincronización de estado entre servidor y cliente**

Las acciones del usuario (marcar como visto, añadir a favoritos, puntuar) deben reflejarse de forma inmediata en la interfaz sin esperar la confirmación del servidor pero manteniendo la coherencia en caso de error y en una aplicación en Next.js con Server y Client Components, es necesaria una gestión correcta para que el estado inicial que React espera en el cliente coincida con el HTML que llegó desde el servidor ya que si no se producirán errores de hidratación.

### 1.4 Objetivos

**Objetivo general**

El objetivo es diseñar e implementar una aplicación web completa y funcional para la gestión personalizada y el descubrimiento de nuevas películas y series, que integre múltiples APIs externas y ofrezca una experiencia de usuario centralizada con las principales soluciones ya existentes en el mercado actual.

**Objetivos específicos**

- **1.** Implementar la integración con la API de TMDb para obtener los metadatos completos de películas, series como resúmen, características, imágenes, vídeos, temporadas y episodios.

- **2.** Desarrollar un sistema de autenticación OAuth 2.0 completo con Trakt.tv, incluyendo almacenamiento seguro de tokens en cookies, actualización automática y revocación.

- **3.** Construir un módulo de gestión personal (favoritos, pendientes, historial de visionado y en progreso y puntuaciones de usuario) con sincronización bidireccional con Trakt y TMDb.

- **4.** Implementar un sistema de seguimiento por episodios y temporadas para las series.

- **5.** Diseñar una interfaz de usuario responsiva y accesible que ofrezca múltiples modos de visualización (Grid, List, Compact) con transiciones fluidas y compatibilidad con dispositivos móviles.

- **6.** Optimizar el rendimiento de la aplicación para alcanzar tiempos de carga correctos, incluyendo un sistema de caché en cliente para las puntuaciones de IMDb, Trakt y OMDb en las listas de favoritos y pendientes.

- **7.** Desplegar la aplicación en un entorno de producción como Vercel.

---

## 2. ESTADO DE LA CUESTIÓN

### 2.1 Las plataformas de streaming

El presente estado de la cuestión aborda el contexto tecnológico y de mercado en el que se enmarca el proyecto. Se comienza con una visión del sector de las plataformas de streaming y sus implicaciones para el usuario, a continuación se analizan las tecnologías de desarrollo web actuales que hacen posible la solución propuesta y se finaliza examinando las plataformas existentes más relevantes.

#### 2.1.1 Las plataformas de streaming y sus consecuencias para el usuario

La transición del modelo tradicional al *streaming* bajo demanda se inició con el lanzamiento del servicio de Netflix en 2007, aunque su consolidación definitiva se produjo a partir de 2019, con la irrupción simultánea de Disney+, Apple TV+ y HBO Max. En 2024, el usuario medio en mercados como España o Estados Unidos tiene acceso simultáneo a entre 3 y 5 servicios de *streaming* distintos, según datos de CNMC y Statista.

Esta fragmentación genera una sobrecarga de elección en cada usuario lo que provoca que inviertan una gran cantidad de tiempo en decidir qué ver, olvidan mantener un registro de lo visto y pierden el seguimiento de las series que consumen de forma no continua.

La necesidad de una capa de abstracción sobre las plataformas de *streaming* ha generado el desarrollo de aplicaciones conocidas como **media trackers**.

#### 2.1.2 Plataformas existentes de gestión audiovisual

**Letterboxd** (fundado en 2011, Auckland, Nueva Zelanda) es la plataforma de referencia para el registro y la crítica cinematográfica personal. Con más de 20 millones de usuarios registrados en 2024, su principal fortaleza es la componente social y el sistema de reseñas. Técnicamente, su interfaz web está construida sobre Ruby y presenta un diseño funcional pero conservador. Su limitación más significativa para los propósitos de este trabajo es la ausencia de soporte para el seguimiento de series de televisión por episodio.

**Trakt.tv** (fundado en 2010) es la plataforma más completa en cuanto a funcionalidades de *tracking*, con soporte completo para películas y series a nivel de episodio. Su característica diferencial es la API pública v2, documentada y con límites de uso bastante generosos para desarrolladores registrados. Sin embargo, su interfaz de usuario presenta un diseño anticuado, con una experiencia de usuario que no ha evolucionado significativamente en la última década.

**Simkl** (fundado en 2012) ofrece funcionalidades similares a Trakt con una interfaz algo más moderna, pero con un ecosistema de API menos estable y documentado, y una comunidad de usuarios significativamente menor.

**JustWatch** (fundado en 2014) se especializa en la localización de contenido entre plataformas de *streaming*, pero carece de funcionalidades de *tracking* personal.

La comparación entre estas plataformas provoca oportunidades en el mercado para crear nuevas soluciones ya que ninguna combina la funcionalidad de Trakt (seguimiento por episodio, sincronización, valoraciones) con una interfaz de usuario moderna, animada y responsiva comparable a las propias plataformas de *streaming*. *The Show Verse* se posiciona precisamente en este punto.

### 2.2 Tecnologías de desarrollo web

#### 2.2.1 Protocolos de autenticación

OAuth 2.0 es el estándar que permite a una aplicación actuar en nombre de un usuario en un servicio externo sin que ese servicio le tenga que dar su contraseña. En *The Show Verse* se utiliza para conectar la cuenta de Trakt.tv del usuario con la aplicación.

El flujo implementado, funciona de la siguiente manera en el proyecto:

1. Cuando el usuario pulsa «Conectar con Trakt», la ruta `/api/trakt/auth/start` genera un código aleatorio de seguridad (`state`) para evitar ataques CSRF, construye la URL de autorización de Trakt con el `client_id` de la aplicación y el `redirect_uri`, almacena el `state` en una cookie `httpOnly` con caducidad de 10 minutos, y redirige al usuario a la página de inicio de sesión de Trakt.
2. El usuario introduce sus credenciales en Trakt y concede permisos. Trakt redirige de vuelta a `/api/trakt/auth/callback` incluyendo un `code` de un solo uso y el mismo `state` de antes.
3. La ruta de *callback* verifica que el `state` recibido coincide con el almacenado en la cookie, para confirmar que la respuesta es legítima. A continuación intercambia el `code` por un `access_token` y un `refresh_token` haciendo una petición directamente desde el servidor a `https://api.trakt.tv/oauth/token`, sin que este intercambio pase por el navegador.
4. El `access_token` y el `refresh_token` se guardan en cookies `httpOnly` con los atributos `Secure` y `SameSite=Lax`, de forma que el JavaScript del navegador no puede leerlos en ningún momento.
5. Cuando el `access_token` expira, la aplicación lo renueva automáticamente usando el `refresh_token` a través de la ruta `/api/trakt/oauth/refresh`, sin que el usuario tenga que volver a iniciar sesión.

Este diseño garantiza que ni el `client_secret` de la aplicación ni los tokens del usuario se exponen al cliente en ningún momento del flujo de la aplicación.

#### 2.2.4 APIs REST

Las APIs utilizadas en este proyecto siguen el estilo REST con algunas especificidades:

**TMDb API v3** es una API REST pública con autenticación por API Key. Proporciona acceso a su base de datos de más de 800.000 películas y 150.000 series de televisión, con soporte para más de 40 idiomas. Su límite de peticiones es de 40 peticiones por 10 segundos para cuentas gratuitas.

**Trakt.tv API v2** combina autenticación por API Key para endpoints públicos con OAuth 2.0 Bearer Token para endpoints autenticados. Su límite de peticiones es de 1.000 peticiones por 5 minutos para usuarios autenticados. Un aspecto técnico relevante es el sistema de identificadores: Trakt mantiene sus propios slugs e IDs, pero acepta identificadores de PlexDb, IMDb, TMDb y TheTVDB mediante el endpoint de búsqueda por ID externo.

#### 2.2.5 Rendimiento web

Las estrategias de optimización más relevantes para este proyecto incluyen: Server-Side Rendering para reducir el LCP, el componente `<Image>` de Next.js para optimización automática de imágenes (conversión a WebP, *lazy loading*, reserva de espacio para prevenir CLS), y el *code splitting* automático por ruta para reducir el tiempo de carga inicial.

#### 2.2.6 Diseño de interfaz

El diseño de *The Show Verse* se basa en usar los backdrops y posters obtenidos de TMDb para cada película y serie como elemento principal en el diseño de la interfaz.

**Modo oscuro y backdrops de fondo.** El color de base de la aplicación es el negro (`#000000`). Las imágenes de fondo de las películas y series (seleccionadas automáticamente aplicando criterios de resolución, idioma y votos) se despliegan a pantalla completa con un gradiente en los bordes.

**Efectos en tarjetas, paneles y Navbar.** Los elementos superpuestos a las imágenes (tarjetas de información, paneles laterales, la barra de navegación al hacer *scroll*) utilizan un fondo semi-transparente con desenfoque del contenido detrás (`backdrop-filter: blur`), bordes finos de baja opacidad y sin sombras. Este enfoque mantiene la legibilidad de los textos sin ocultar completamente las imágenes de fondo.

**Animaciones de entrada en listas y secciones.** Cuando se carga una lista de tarjetas (favoritos, pendientes, historial, secciones del dashboard), los elementos no aparecen todos a la vez: cada tarjeta entra con un ligero retraso respecto a la anterior, creando una sensación de fluidez y orden. Para listas largas (más de 30 elementos) el retraso se reduce automáticamente para que la animación no resulte lenta.

**Hover en tarjetas.** Al situar el cursor sobre una tarjeta, esta escala ligeramente y se eleva con sombra, indicando de forma clara que es un elemento interactivo. Los botones de acción rápida (flechas de carrusel, controles de episodios) también responden al *hover* con desplazamientos sutiles en la dirección de su función.

**Transiciones de cambio de vista** Al cambiar entre las vistas Grid, List y Compact, o al navegar entre las pestañas de la página de detalle, el contenido saliente desaparece con una ligera animación de salida antes de que entre el nuevo contenido, evitando los cortes bruscos. Framer Motion gestiona estas transiciones mediante `AnimatePresence`, que permite animar tanto la entrada como la salida de componentes que dejan de estar en el DOM.

---
