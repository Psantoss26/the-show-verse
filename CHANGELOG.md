# Changelog

Registro de cambios de The Show Verse, del más reciente al más antiguo.

**Cómo mantenerlo:** cada cambio que modifique lo que ve el usuario, una ruta o un endpoint añade una línea en la sección *Sin publicar* (o en el mes en curso) y actualiza el documento afectado de `docs/`. Ver la sección *Documentación* de [`AGENTS.md`](AGENTS.md).

Las entradas anteriores a julio de 2026 no están aquí: el estado de esa fecha lo describen el [`README.md`](README.md) y [`docs/`](docs/README.md).

## Sin publicar

- Ficha de actor, panel lateral de Películas y Series: Ordenar, Desde y Hasta en una sola fila, con su icono y su flecha, ajustando tamaño y espacio al ancho del panel para que ningún texto se corte. En sus menús, la barra de scroll ya no queda pegada a las opciones.
- Móvil: con un modal abierto, los avisos emergentes salen en el borde superior (la barra queda tapada por el modal) en lugar de taparle la cabecera.
- Ficha móvil de películas a medias: la barra «Viendo» bajo la portada entra a la vez que los botones de acción y con su misma animación (la fila sube y el contenido entra con el rebote del primer botón), en lugar de aparecer antes y de golpe.
- Documentación puesta al día con las funcionalidades de julio a octubre de 2026: referencia completa de la API, mapa de páginas y nueva carpeta [`docs/features/`](docs/features/Features.md).

## Octubre de 2026

### Nuevo
- **Recap anual** «Tu año en The Show Verse» (`/recap`, `/recap/[year]`): pantallas tipo *Wrapped*, persona del año, banda sonora e imagen para compartir. → [recap-anual](docs/features/recap-anual.md)
- **Detecciones de streaming** (`/detections`) con corrección «no había ficha» / «es otro título» y reglas que aprenden de las correcciones (personales y globales con consenso). App **The Show Verse Sync** para Android. → [detecciones-streaming](docs/features/detecciones-streaming.md)
- **Letterboxd:** importación de la exportación oficial (con reseñas) y sincronización continua por RSS («me gusta» → favoritos, reseñas → ficha).
- **Importación de IMDb:** puntuaciones, vistos, watchlist y listas.
- **Exportación** de favoritos, pendientes y puntuaciones a CSV, JSON o formato Letterboxd.
- **Listas públicas en la comunidad** y «me gusta» en listas, colecciones y actores. Colecciones populares ordenadas por popularidad.
- **«Tus amigos»** en la ficha: qué han hecho con ese título las cuentas que sigues.
- **Fichas superpuestas** (rutas interceptoras `@overlay`): la página de origen queda montada y se recupera tal cual al volver.
- Navegación anterior/siguiente entre fichas con animación; vídeo compartible de un título; modo soundtrack en la ficha.
- Búsqueda en las páginas de usuario por título en inglés, español u original (`/v1/tmdb/title-names`).
- Preferencias de apertura de fichas (rápida/completa, centrada/lateral, superpuesta/acoplada, vista teléfono).
- Confirmación antes de cambiar favorito y pendiente desde la ficha.

### Mejoras
- Rediseño completo de ActorDetails (escritorio y móvil), temporadas y episodios (carruseles deslizables, modales laterales).
- Secciones «Ver todos» del dashboard con el diseño de Favoritos, botón de recargar y lista ya renderizada en servidor.
- Vistas previas del dashboard: tráiler en un solo intento, sin solapes.
- Criterio mejorado de recomendaciones y de «Más esperadas».
- Copia de seguridad de Redis en el NAS.

## Septiembre de 2026

### Nuevo
- **Notificaciones push** (Web Push y FCM) y avisos dentro de la app para cada acción. → [push-notifications](docs/push-notifications.md)
- **Vista neuronal** del perfil (grafo de títulos, géneros y sagas).
- **Modo sin conexión** de la PWA: copia local de las páginas personales y fichas visitadas. → [lib-offline](docs/frontend/lib/lib-offline.md)
- Ficha en **panel lateral** (modos superpuesto y acoplado) y «vista teléfono» incrustada (`/embed/details`).
- Compartir películas, series, temporadas y episodios (`/api/share/*`).
- Sincronización de Prime Video y Crunchyroll; indicador de versión en la APK.

### Mejoras
- Diseño de tablet (navbar, modales, FeaturedHero).
- Calidad de imagen selectiva en tarjetas y fichas.
- Metacritic y Rotten Tomatoes en la ficha.

## Agosto de 2026

### Nuevo
- **Sección Recomendaciones** (`/recommendations`): baraja para deslizar con descartes guardados en el backend.
- **Niveles, rangos y logros** del perfil. → [niveles-y-logros](docs/features/niveles-y-logros.md)
- **Sección Social** (`/social`): feed de actividad de los seguidos y propia.
- **App Android completa** (WebView + sincronización), con ajustes del login de Google.
- **Comentarios nativos** en la ficha, con pestañas y «me gusta». → [comunidad](docs/features/comunidad.md)
- Continuar viendo y Completadas como páginas propias en escritorio.

### Mejoras
- Estilo *liquid glass* unificado en navbar, menús y botones.
- Rewatches y fechas personalizadas en el modal de episodios vistos.
- Deslizar entre fichas en móvil; plataformas y enlaces en temporadas y episodios.

## Julio de 2026 (desde el 7)

### Nuevo
- **Contenido de comunidad en el backend propio:** comentarios, sentimiento y listas sembrados desde Trakt y servidos desde PostgreSQL. **Calendario** de episodios sin Trakt.
- **Perfiles públicos** `/u/[username]`, seguir/dejar de seguir y **Miembros** (`/members`).
- **Sincronización de streaming:** rewatches al cruzar el 90 %, detección en Prime Video y Max, progreso en «Continuar viendo».
- Primera fase de la **PWA offline**.
- Dashboard estilo Netflix: filas de backdrops alternadas con pósters y **vista previa** con tráiler.
- Fichas con DetailModal central y lateral, animaciones de entrada y vista móvil rediseñada.

### Mejoras
- Rediseño de las páginas de perfil e historial, indicador hover en tarjetas, navbar que encoge con el scroll.
