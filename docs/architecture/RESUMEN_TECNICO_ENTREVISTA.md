---
tags: [area/arquitectura, type/referencia]
aliases: [Resumen técnico para entrevistas, Chuleta entrevista]
---
# The Show Verse — Resumen técnico para entrevistas

> Actualizado el 2 de octubre de 2026. Chuleta para repasar el proyecto antes de una
> entrevista técnica: tecnologías, arquitectura, funcionalidades, decisiones y preguntas típicas.

## Qué es The Show Verse

The Show Verse es una plataforma web full-stack (PWA) para descubrir, organizar y hacer seguimiento de películas y series, con capa social y estadísticas personales. Unifica en una sola app lo que normalmente está repartido entre TMDB, Trakt, Letterboxd, JustWatch y las propias plataformas de streaming.

**Pitch en una frase:** "Tu universo personal de cine y series: qué ver, qué has visto, qué ven tus amigos y cómo ha sido tu año, sincronizado automáticamente con lo que ves en Netflix, Prime o Plex".

**Problema que resuelve:** con el contenido repartido entre muchas plataformas, el usuario no tiene un sitio central donde registrar lo que ve, decidir qué ver y compararlo con su círculo.

### Cifras para dar en una entrevista

| Métrica | Valor aproximado |
| --- | --- |
| Inicio del proyecto | noviembre de 2025 |
| Commits | ~1.960 |
| Código frontend (src) | ~185.000 líneas JS/JSX |
| Código backend propio | ~24.000 líneas JS |
| Páginas (App Router) | 41 |
| Rutas API de Next.js (BFF) | 172 |
| Endpoints del backend Fastify | ~130 |
| Tablas PostgreSQL | 31 |
| Ficheros de test | ~196 |
| Clientes adicionales | extensión de navegador para Netflix y otras plataformas, app companion Android |

El proyecto nació como Trabajo de Fin de Grado y ha evolucionado a un producto autoalojado en producción en theshowverse.com.

## Arquitectura general

Es una arquitectura de tres capas: clientes, una web Next.js que hace de BFF (Backend for Frontend) y una API Fastify con PostgreSQL. Todo está autoalojado en un NAS con Docker Compose y se publica con Cloudflare Tunnel.

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
  │ Navegador / PWA  │  │   App Android    │  │  Extensión de navegador  │
  │ SW + offline     │  │ WebView + sync   │  │ detecta Netflix, Prime…  │
  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘
           └─────────────────────┼─────────────────────────┘
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │   Cloudflare: DNS, TLS, WAF y Tunnel saliente (sin abrir puertos)     │
  └────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
  ┌─ NAS · Docker Compose ─────────────────────────────┐   ┌─ APIs externas ─┐
  │  ┌──────────────────────────────────────────────┐  │   │ TMDB            │
  │  │ web · Next.js 16 (SSR + BFF)                 │──┼──►│ Trakt           │
  │  │ páginas, 172 rutas /api, middleware, OG      │  │   │ OMDb (IMDb, RT) │
  │  └───────────┬──────────────────────┬───────────┘  │   │ Plex            │
  │              ▼                      ▼              │   │ Spotify         │
  │  ┌──────────────────────────┐  ┌──────────────┐    │   │ JustWatch       │
  │  │ backend · Fastify 5      │  │ Ollama       │    │   │ Letterboxd      │
  │  │ ~130 endpoints REST, JWT │  │ LLM local    │    │   │ FilmAffinity    │
  │  │ Zod, Drizzle, web-push   │  │ (asistente)  │    │   │ Gemini / OpenAI │
  │  └──────┬─────────────┬─────┘  └──────────────┘    │   └─────────────────┘
  │         ▼             ▼                            │
  │  ┌────────────┐ ┌──────────────┐                   │
  │  │ PostgreSQL │ │ Redis        │                   │
  │  │ 31 tablas  │ │ rate limiting│                   │
  │  └────────────┘ └──────────────┘                   │
  └────────────────────────────────────────────────────┘
```

Los clientes nunca hablan directamente con el backend ni con las APIs externas: todo pasa por las rutas `/api` de Next.js.

- **Web Next.js (BFF):** renderiza las páginas con SSR y expone 172 rutas `/api`. Estas rutas hacen de proxy autenticado hacia Fastify, agregan y cachean llamadas a TMDB, Trakt, OMDb y otras fuentes, y ocultan las claves de API al navegador.
- **Backend Fastify:** es la fuente de verdad de los datos del usuario (biblioteca, historial, valoraciones, listas, social, logros). Calcula los dashboards y las recomendaciones, y envía las notificaciones push.
- **Datos:** PostgreSQL guarda todo. Redis respalda el rate limiting y, si se cae, la API sigue funcionando con memoria.
- **Despliegue:** un push a `main` lanza GitHub Actions en un runner self-hosted dentro del NAS. Primero pasa los tests del backend y después reconstruye las imágenes Docker. Al arrancar, el backend aplica las migraciones de Drizzle.
- **Acceso privado:** el middleware de Next.js bloquea los dispositivos no autorizados con una cookie de acceso (hash SHA-256). Deja pasar los bots de vista previa de enlaces (WhatsApp, Telegram…) para que las tarjetas compartidas se vean bien.

## Stack tecnológico

Cada tecnología está elegida para un trabajo concreto; esta tabla es la respuesta corta a "¿qué usas y para qué?".

| Capa | Tecnología | Para qué se usa |
| --- | --- | --- |
| Framework web | Next.js 16 (App Router, salida standalone) | SSR de fichas y perfiles, rutas API como BFF, middleware, imágenes OG |
| UI | React 19 | Componentes cliente con hooks propios para sesión, navegación y datos |
| Estilos | Tailwind CSS 4 + CSS Modules | Utilidades para toda la UI; CSS Modules en piezas aisladas como el recap |
| Animación | Framer Motion 12 | Transiciones de página, modales, tarjetas pop-out, entradas escalonadas |
| Gráficos | Recharts 3 | Estadísticas del perfil (barras, líneas, distribuciones) |
| Grafo | d3-force | Vista "neuronal" del perfil: grafo de títulos, géneros y personas |
| Carruseles | Swiper 12, react-slick | Filas del dashboard y galerías de imágenes |
| Calendario | react-calendar, react-day-picker, date-fns | Calendario de estrenos y selección de fechas de visionado |
| Iconos | lucide-react | Iconografía coherente en toda la app |
| API propia | Fastify 5 (Node.js, ESM) | Backend REST: auth, biblioteca, historial, social, dashboards, niveles, push |
| Validación | Zod | Esquemas de entrada de los endpoints |
| ORM y migraciones | Drizzle ORM + drizzle-kit | Esquema tipado de 31 tablas y migraciones SQL versionadas |
| Base de datos | PostgreSQL | Usuarios, biblioteca, historial, listas, comunidad, logros, cachés |
| Caché / límites | Redis (ioredis) | Almacén del rate limiting; si falla, la API sigue con memoria |
| Auth | JWT con jose, bcrypt, cookies HttpOnly | Access token de 15 min + refresh token rotado de 30 días; login con Google |
| Seguridad HTTP | @fastify/helmet, @fastify/cors, @fastify/rate-limit | Cabeceras seguras, orígenes permitidos, protección anti-abuso |
| Docs de API | @fastify/swagger + Swagger UI, API Blueprint + Dredd | Contrato OpenAPI navegable y pruebas de contrato |
| Notificaciones | web-push (VAPID) + Service Worker | Avisos push de estrenos, actividad social y logros |
| Email | Resend | Verificación de email y cambio de correo |
| IA | Ollama (LLM local), con Gemini u OpenAI como alternativa | Asistente "¿qué veo ahora?" con explicaciones en lenguaje natural |
| Infraestructura | Docker Compose en un NAS + Cloudflare Tunnel | Producción autoalojada sin abrir puertos, con TLS y WAF de Cloudflare |
| CI/CD | GitHub Actions con runner self-hosted | Build y despliegue automático al NAS en cada push |
| Tests | node:test (nativo) | Tests unitarios y de integración sin frameworks extra |
| Clientes extra | Extensión de navegador (Manifest V3), app Android (Kotlin/Gradle) | Detectar lo que se reproduce en las plataformas y sincronizarlo |

## Funcionalidades técnicas principales

Cada bloque resume qué hace la funcionalidad y la decisión técnica que merece la pena contar.

### Dashboard y motor de recomendaciones

- El backend construye "pools" de contenido (estrenos, tendencias, por género, calendario) desde TMDB y los guarda en la tabla `dashboard_pools`. Cada pool tiene un TTL distinto: 12 h, 24 h, 7 días o 30 días.
- Las filas rotan cada día con un barajado determinista (PRNG mulberry32 con el número de día como semilla). Se ve contenido distinto cada día, pero el mismo durante todo ese día.
- Las recomendaciones parten de "semillas" de la biblioteca del usuario. Se agregan sus recomendados (peso 1,0) y similares (peso 0,6), se puntúan y se filtran por votos mínimos y por señal pública fiable.
- Las recomendaciones se cachean 24 h en BD y se invalidan con un `basisHash` del estado de la biblioteca. Si la biblioteca cambia, se recalculan.

### Ficha de detalle (película, serie, temporada, episodio, persona)

- Server Component con SSR más cliente interactivo. Es el componente más grande de la app.
- Un marcador agrega notas de TMDB, IMDb, Rotten Tomatoes, Metacritic, Trakt y FilmAffinity. Muestra la gráfica de notas por episodio (SeriesGraph), reparto, premios, colecciones, imágenes, vídeos y banda sonora de Spotify.
- Un menú de secciones fijo con scroll-spy, y la sección "Amigos" con la actividad de las personas que sigues sobre ese título.
- En escritorio la ficha se abre como modal (DetailModal) sin salir del dashboard. En móvil se navega a la página completa.

### Biblioteca, historial y progreso

- Favoritos, pendientes, valoraciones (también por temporada y episodio), listas propias e historial de visionados con rewatches.
- El progreso de series se calcula por episodio: "continuar viendo", "en curso" y "completadas".
- Importación desde Trakt.tv con progreso en segundo plano. Las fechas falsas de importación (muchas filas con el mismo instante) se detectan y se excluyen de las estadísticas temporales.

### Sincronización automática con plataformas de streaming

- Una extensión de Chrome (Manifest V3) detecta lo que se reproduce en Netflix, Prime Video, Max, Disney+, Plex, Crunchyroll, Movistar+ y más de 10 plataformas. También funciona en cualquier web que añada el usuario.
- La detección prioriza la Media Session API frente a los selectores CSS de cada plataforma, que se rompen con cada cambio de interfaz. Emite un contrato único (`PlaybackSignal`) que el backend resuelve contra TMDB.
- Si no se puede saber el episodio exacto, se registra la serie con baja confianza en lugar de perder el visionado.
- En Netflix también lee el historial real de la cuenta para hacer un backfill incremental. La app Android hace lo mismo con las sesiones multimedia del sistema.
- Autenticación de la extensión: un token revocable (`tsv_netflix_*`) independiente de la sesión web.

### Capa social

- Perfiles públicos `/u/[username]` estilo Letterboxd: seguir y seguidores, 5 favoritos elegidos a mano, actividad, reseñas, listas y estadísticas.
- Comentarios y reseñas por título con spoilers ocultables y "me gusta". Listas de la comunidad con likes.
- Un resumen de "sentimiento" de la comunidad por título, generado con reglas heurísticas sobre los comentarios.

### Gamificación: niveles y logros

- 40 niveles en 8 rangos (de Espectador a Leyenda) con una curva cuadrática de XP: los primeros niveles llegan rápido y los últimos cuestan años.
- La XP se deriva del estado actual, no de un registro de eventos. El mismo historial siempre da la misma XP, un reimport no duplica nada y lo anterior cuenta de forma retroactiva.
- 38 logros y rachas de días consecutivos. Un plugin de Fastify invalida la caché de nivel cuando cambia la biblioteca.

### Estadísticas, vista neuronal y recap anual

- Estadísticas del perfil con Recharts: horas, géneros, décadas, notas y actividad mensual.
- Vista "neuronal": un grafo d3-force al estilo de Obsidian. Cada título es un nodo unido a géneros y sagas, y los grupos aparecen solos con la simulación de fuerzas. Los géneros de series y películas de TMDB se unifican.
- Recap anual estilo Wrapped (`/recap/[year]`): historias a pantalla completa con banda sonora. Cuenta en la zona horaria del usuario y excluye los marcados en bloque de las horas y días. La tarjeta compartible se genera en servidor con `ImageResponse` de `next/og`.

### Calendario y notificaciones

- Calendario de estrenos y de episodios de las series que sigues.
- Notificaciones web push (VAPID) con Service Worker y entregas registradas en `push_deliveries` para no repetir. En la navbar hay un centro de alertas con popups dentro de la app.

### PWA y modo offline

- PWA instalable con Service Worker propio sin librerías. Usa estrategia "red primero", cachés versionadas por build y una caché estable para el manifiesto y los iconos.
- El modo offline es de solo lectura a propósito: se consultan las páginas ya visitadas, pero las escrituras exigen conexión para evitar conflictos. Las cachés privadas se invalidan al cerrar sesión o cambiar de cuenta.

### Asistente de IA "¿Qué veo ahora?"

- Una ruta de Next.js combina candidatos de tu biblioteca y recomendaciones con un LLM. El LLM puede ser Ollama local (un modelo pequeño por CPU), Gemini u OpenAI, configurable por variables de entorno.
- Para reducir la latencia, el LLM solo elige y explica; las sinopsis y los datos salen de TMDB.

## Integraciones externas

The Show Verse combina más de 10 fuentes externas, pero los datos del usuario viven en la BD propia. Trakt dejó de ser la fuente del historial y de los dashboards: ahora es solo una vía de importación y de contenido de comunidad.

| Servicio | Uso en el proyecto | Cómo se integra |
| --- | --- | --- |
| TMDB | Catálogo, imágenes, reparto, temporadas, proveedores de streaming | REST vía BFF con `revalidate` y `Cache-Control` (24 h + stale-while-revalidate); caché adicional en la tabla `tmdb_cache` |
| Trakt.tv | Importar el historial, comentarios y listas de la comunidad | OAuth 2.0 con refresco de tokens en servidor |
| OMDb | Notas de IMDb, Rotten Tomatoes y Metacritic, premios | REST por IMDb id |
| IMDb / FilmAffinity | Nota propia de cada fuente para el marcador | Rutas dedicadas del BFF |
| JustWatch / Letterboxd | Enlaces externos a dónde verlo y a la ficha en Letterboxd | Rutas `/api/links/*` |
| Plex | Biblioteca del servidor Plex del usuario, abrir un título y sincronizar lo visto | Auth JWT de Plex firmado con clave propia (JWK) + API del servidor |
| Spotify | Banda sonora en la ficha y música del recap | OAuth (login / callback) |
| Netflix y otras plataformas | Registrar automáticamente lo que se ve | Extensión MV3 + app Android → `/api/netflix/*` → Fastify |
| Ollama / Gemini / OpenAI | Asistente de IA | Proveedor elegido por variables de entorno |
| Google | Login social | OAuth en `/api/auth/google` |
| Resend | Emails transaccionales | SDK en el backend |

En una entrevista, lo interesante es cómo se protegen las claves y la cuota: ninguna clave sale al navegador, todo pasa por el BFF, que cachea en varios niveles (HTTP, Next.js y BD) para no agotar los límites de las APIs.

## Datos, seguridad, rendimiento y calidad

### Modelo de datos (PostgreSQL + Drizzle)

31 tablas agrupadas por dominio. Las migraciones son SQL versionado (`drizzle-kit generate`) y se aplican solas al arrancar el contenedor.

| Dominio | Tablas principales |
| --- | --- |
| Identidad y sesión | `users`, `refresh_tokens`, `email_change_tokens`, `connected_accounts`, `user_preferences`, `subscriptions` |
| Biblioteca | `favorites`, `watchlist`, `user_ratings`, `watch_history`, `watch_progress`, `user_lists`, `user_list_items` |
| Streaming | `streaming_events` (recibos de lo detectado por la extensión y Android) |
| Social y comunidad | `follows`, `profile_favorites`, `title_comments`, `comment_likes`, `community_lists`, `community_list_items`, `list_likes`, `title_sentiment`, `title_community_state` |
| Gamificación | `user_level_state`, `user_achievements` |
| Recomendación y cachés | `dashboard_pools`, `user_recommendations`, `recommendation_dismissals`, `tmdb_cache` |
| Push | `push_subscriptions`, `push_deliveries` |

### Autenticación y seguridad

- **Tokens:** access token JWT de 15 minutos y refresh token de 30 días (guardado con hash), ambos en cookies HttpOnly que gestiona el BFF. El navegador nunca ve el token como JavaScript.
- **Rotación tolerante a concurrencia:** al rotar, el refresh token usado no se borra; se le deja una ventana de gracia de 60 s. Así, las 10 o 20 peticiones simultáneas que lanza el dashboard al volver no se pisan y la sesión no se cierra sola.
- **Coalescer de refrescos en el BFF:** si varias rutas proxy intentan refrescar el mismo token a la vez, comparten una sola llamada y reciben el mismo token nuevo.
- **Contraseñas:** bcrypt. **Entrada:** validación con Zod. **HTTP:** Helmet, CORS con lista de orígenes y rate limiting de 200 peticiones por minuto por usuario o IP, en Redis con fallback a memoria y respuesta 429 correcta.
- **Perímetro:** Cloudflare Tunnel (sin puertos abiertos en casa), WAF y un gate de acceso por dispositivo en el middleware de Next.js.

### Rendimiento

- SSR en fichas y perfiles; el resto de datos se carga en cliente con cachés en memoria con TTL y deduplicación de peticiones en curso.
- Imágenes servidas directamente desde el CDN de TMDB con el tamaño justo para cada componente. El optimizador de Next está desactivado a propósito porque duplicaba el coste.
- Caché por capas: HTTP (`s-maxage` + `stale-while-revalidate`), `revalidate` de Next.js, tabla `tmdb_cache` y pools del dashboard con TTL.
- View Transitions de React/Next, animaciones con Framer Motion y respeto a `prefers-reduced-motion`. Al volver atrás, las páginas se restauran estáticas, sin reanimar ni reordenar.
- Métricas reales con Vercel Analytics y Speed Insights.

### Testing y calidad

- Unos 196 ficheros de test con `node:test`, el runner nativo de Node, sin Jest ni Vitest.
- Patrón repetido: la lógica de negocio vive en módulos puros (`*Core.js`, `rules.js`, `curve.js`, `score.js`) sin BD ni red, que se prueban de forma aislada. La capa de datos queda fina.
- Pruebas de contrato de la API con Dredd sobre un API Blueprint, y documentación OpenAPI con Swagger UI.
- El CI ejecuta los tests del backend como gate antes de desplegar; si fallan, no se despliega.
- ESLint 9, y una guía de buenas prácticas web modernas (Baseline 2024) que se consulta antes de cada trabajo de UI.

## Áreas de valor y decisiones técnicas destacables

Lo que diferencia al proyecto no es la cantidad de pantallas, sino unas pocas decisiones de ingeniería con su porqué.

### Áreas de valor para el usuario

1. **Registro sin esfuerzo:** lo que ves en Netflix, Prime, Plex o el móvil entra solo en el historial. Es la mayor diferencia frente a Letterboxd o TV Time.
2. **Todo en un sitio:** catálogo, notas de 6 fuentes, dónde verlo, banda sonora y comunidad en una sola ficha.
3. **Descubrimiento personalizado:** dashboard que rota cada día, recomendaciones basadas en tu biblioteca y asistente de IA.
4. **Social:** seguir a amigos, ver qué opinan de cada título, reseñas y listas compartidas.
5. **Motivación y retención:** niveles, logros, rachas, estadísticas, vista neuronal y recap anual compartible.
6. **Funciona en todas partes:** PWA instalable, app Android y lectura sin conexión.

### Decisiones técnicas que conviene saber defender

| Decisión | Por qué | Alternativa descartada |
| --- | --- | --- |
| BFF en Next.js delante de Fastify | Oculta claves y tokens, agrega varias APIs en una llamada y gestiona cookies HttpOnly | Que el navegador llame directamente al backend y a TMDB |
| Backend Fastify separado y no solo rutas de Next | Lógica de dominio, cron de pools, push y tests aislados del framework web; más rendimiento que Express | Meter todo en las API routes de Next.js |
| BD propia como fuente de verdad en vez de Trakt | Control del modelo, sin límites de API de terceros y con funciones propias (social, niveles) | Depender de Trakt para el historial |
| XP derivada del estado, no de eventos | Idempotente: los reimports no duplican y los cambios de reglas se aplican hacia atrás | Registro de eventos de XP |
| Refresh con ventana de gracia + coalescer | Elimina los cierres de sesión por carreras entre peticiones concurrentes | Rotación estricta borrando el token |
| Offline de solo lectura | Evita conflictos de escritura y datos de otra cuenta en caché | Cola de mutaciones offline (se probó y se retiró) |
| Media Session API primero en la extensión | Una detección genérica que no se rompe con cada cambio de interfaz | Selectores CSS por plataforma |
| Autoalojado en un NAS con Cloudflare Tunnel | Coste casi cero, control total y LLM local incluido | Vercel + Railway + Neon + Upstash, que es por donde empezó el proyecto |
| Lógica en módulos puros + `node:test` | Tests rápidos y deterministas sin mocks de BD | Tests de integración para todo |

### Retos técnicos para contar como historia

- **"La sesión se cerraba sola":** se diagnosticó una carrera de refrescos concurrentes. Se resolvió con una ventana de gracia en el backend y un coalescer en el BFF.
- **Estadísticas falseadas por importaciones:** las filas importadas comparten el mismo instante. Se detectan como "marcados en bloque" y se excluyen de las horas y días del recap.
- **Rendimiento visual:** un parpadeo de un frame en las tarjetas resultaba ser un bug de WAAPI en motion-dom; se corrigió subiendo de versión. Además, efectos de cristal (backdrop-filter) que se rompían por un ancestro con `opacity`.
- **Coste de infraestructura:** se desactivó la optimización de imágenes, que duplicaba el coste, y se migró todo a un NAS propio.

## Preguntas típicas de entrevista

Respuestas de 2 o 3 frases para ensayar en voz alta.

**¿Cómo es la arquitectura?**
Tres capas: clientes (web PWA, Android y extensión), una web Next.js 16 que hace de BFF y una API Fastify con PostgreSQL y Redis. Todo corre en Docker Compose en un NAS y se publica con Cloudflare Tunnel.

**¿Por qué Next.js y además Fastify?**
Next aporta SSR, routing y un BFF que oculta claves y gestiona cookies. Fastify concentra la lógica de dominio, los jobs y las notificaciones push, se prueba aislado y es más rápido que Express.

**¿Cómo funciona la autenticación?**
JWT de acceso de 15 minutos y refresh de 30 días en cookies HttpOnly, con rotación. Para que las peticiones concurrentes no se pisen, el token rotado tiene 60 s de gracia y el BFF unifica los refrescos simultáneos. También hay login con Google.

**¿Cómo recomiendas contenido?**
Partiendo de semillas de tu biblioteca, se agregan recomendados y similares de TMDB con pesos, se filtran por calidad y se cachean 24 h. La caché se invalida con un hash del estado de la biblioteca. El dashboard rota cada día con un barajado determinista.

**¿Cómo detectas lo que ve el usuario en Netflix?**
Una extensión MV3 lee la Media Session API y, como refuerzo, la interfaz de cada plataforma. Envía una señal normalizada que el backend resuelve contra TMDB; si no sabe el episodio, guarda la serie con baja confianza.

**¿Qué harías para escalar?**
Sacar los cálculos pesados (pools, recomendaciones, recap) a una cola de trabajos y dar más uso a Redis como caché compartida. También añadir réplicas de lectura de PostgreSQL y mover la web a un CDN o edge, porque el backend ya es stateless gracias a los JWT.

**¿Cómo garantizas la calidad?**
La lógica de negocio está en módulos puros probados con `node:test` (unos 196 ficheros), hay pruebas de contrato con Dredd y el CI bloquea el despliegue si fallan los tests del backend.

**¿Qué es lo más difícil que has resuelto?**
Las sesiones que se cerraban solas por carreras de refresco de tokens, o la sincronización universal de streaming sin depender de selectores frágiles. Cuenta el síntoma, el diagnóstico y la solución.

**¿Qué mejorarías?**
Migrar progresivamente a TypeScript (hoy es sobre todo JS), dividir componentes muy grandes como la ficha de detalle y añadir tests end-to-end con Playwright.

## Relacionado
- [[Architecture]]
- [[RESUMEN_TECNICO]]
- [[Infrastructure]]
- [[Backend]]
