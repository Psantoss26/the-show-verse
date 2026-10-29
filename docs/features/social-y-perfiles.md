---
tags: [area/features, area/frontend, area/backend, type/referencia]
aliases: [Social, Perfiles públicos, Seguidores]
---
# Social y perfiles públicos

Capa social de The Show Verse: perfiles públicos de cada miembro, seguir y dejar de seguir, un feed de actividad y un directorio de miembros.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/u/[username]` | Perfil público de un miembro (layout persistente `layout.jsx` + `ProfileRouteShell`). |
| `/u/[username]/[section]` | Pestañas del perfil (ver abajo). |
| `/u/[username]/followers`, `/following` | Seguidores y seguidos (`FollowListClient`). |
| `/profile` y `/profile/[section]` | El mismo perfil, para el usuario con sesión. El layout persistente cambia solo la sección activa. |
| `/social` | Sección Social. Su barra elige entre **Actividad / Siguiendo / Yo**. Actividad (por defecto; antes «Hoy») es lo destacado de hoy, ayer o la semana, con historias y más activos, y sus filtros Quién, Día y Agrupar van en la misma barra (ver [[hoy]]). Siguiendo (`?view=activity`) y Yo (`?view=mine`) son el feed de las cuentas que sigo o el mío. Las cifras de la cabecera son Actividades y Personas de Actividad y Activos de la semana. Color propio: rosa/fucsia. |
| `/today` | Redirige a la vista Hoy de `/social`. |
| `/members` | Directorio y buscador de miembros (`/api/users/search`). |

### Pestañas del perfil (`src/app/u/[username]/profileRoutes.js`)

`profile` (resumen), `level` ([[niveles-y-logros]]), `statistics`, `neuronal`, `activity`, `watched`, `reviews`, `favorites`, `watchlist`, `ratings`, `lists` y `social`.

- **Destacados del perfil:** 5 películas y 5 series elegidas por el usuario (`/v1/users/me/profile-favorites`).
- **Vista neuronal:** grafo de todos los títulos del usuario con sus géneros, sagas, meses de visionado y listas. El backend responde `{ unchanged: true }` si el cliente ya tiene la versión vigente (`?v=<firma>`), y guarda el grafo en Redis por firma (`backend/src/lib/neuralGraph.js`, colores en `src/lib/profile/neuralGraph.js`).
- **Buscador de las secciones:** en Neuronal, Actividad, Diario, Favoritos, Pendientes y Puntuaciones, el buscador encuentra un título por su nombre en inglés o en español aunque la tarjeta lleve el otro, como en las páginas de usuario (`useTitleNameSearch` + `/api/tmdb/title-names`; en Neuronal, `searchNodes` recibe esos nombres). Las secciones paginadas cargan todo lo que falte en cuanto hay texto (6 páginas en paralelo y un solo pintado, `loadAll` en `ProfileSection.jsx`), porque la búsqueda solo filtra lo cargado.
- **Insignia de plan:** junto al `@usuario` de la cabecera y al nombre en las filas de miembros (seguidores, seguidos, pestaña Social y `/members`), una píldora «Pro» (verde) o «Sin anuncios» (azul) para quien paga (`PlanBadge`). En el móvil, en las filas, solo el icono. El plan gratis, la gracia de lanzamiento y la facturación apagada no llevan insignia. Ver [[planes-y-suscripciones]].
- **Compartir perfil:** botón junto al nombre de la cabecera (en el propio, tras Configuración; en el ajeno, junto a Seguir). Abre la hoja de compartir de fichas y listas (`DetailsShareSheet`, `kind="profile"`, solo imagen) con una imagen 1080×1920 de `/api/share/profile-card`: foto con aro del color del rango, nombre, @usuario, nivel, cifras (películas, series, episodios, seguidores) y hasta 5 películas y 5 series favoritas, sobre el fondo ambiental del primer póster. El payload lo arma `buildProfileShareCard` y lo valida `sanitizeProfileShareCard` (`src/lib/profile/shareProfile.js`); la escena está en `src/lib/share/profileScenes.jsx`. La foto de perfil puede ser una URL libre, que la ruta solo descarga por https, sin redirecciones, a hosts que resuelven a IP públicas y con tope de 5 MB, o la subida desde un archivo, que Ajustes guarda como `data:image/…;base64` y la ruta decodifica sin descargar (`avatarSource`); si falla, va la inicial. El enlace compartido es siempre `/u/<usuario>`, aunque se esté en una sección.
- **Botones de la cabecera en móvil:** la fila del nombre (`ProfileTitleRow.jsx`) mide, por debajo de 640 px de viewport, si el nombre entero cabe junto a los botones del perfil propio. Si no, los recoge en un botón de tres puntos con un menú en portal (`LIQUID_GLASS_PANEL`, como los del navbar). En el perfil propio hay un paso intermedio: Configuración se queda a la vista junto a los tres puntos (con Sincronizar, Compartir perfil y Cerrar sesión en el menú, seguidas y sin separador) si así cabe el nombre, y solo si tampoco cabe pasa al menú. Para no oscilar, el ancho de cada paso se guarda mientras se ve (el intermedio, hasta verlo, se estima como dos botones redondos) y solo se despliega un paso cuando el nombre cabría con él; las medidas que llegan tarde de un paso anterior se descartan. En el perfil ajeno no se recoge nada: en móvil y en escritorio van solo dos botones redondos, Compartir y Seguir (solo icono, `UserPlus`/`UserCheck`, activo en verde si ya le sigues), que usa la lógica de `useFollowToggle` (exportado desde `FollowButton.jsx`). La hoja de compartir, el aviso de cerrar sesión y el estado de Seguir viven en la fila, no en los botones, para sobrevivir al cambio. Configuración navega con el router del cliente (`useOfflineRouter`), nunca con una carga completa, para que no salga la barra de progreso del navegador. El contenedor de los botones lleva margen vertical negativo para que su altura no estire la fila y el `@usuario` quede pegado al nombre.
- **Tarjetas ajenas decoradas:** al ver el perfil de otro, `POST /v1/items/states` marca qué títulos están también en la biblioteca del visitante, sin revelar nada más de él.

## Feed y actividad

El feed mezcla los mismos tipos de evento en los dos modos: visto, reseña, favorito, pendiente, puntuación, lista, me gusta y seguimientos. Los seguimientos (`getUserActivity` en `backend/src/lib/userProfile.js`) son `follow` (la cuenta empezó a seguir a `targetUser`) y `follower` (`targetUser` empezó a seguirla), solo con cuentas activas; su imagen es el avatar de la otra cuenta (`UserPortrait` en `ActivityBackdropImage`, `isUserActivity`) y al agrupar por acción forman el grupo «Seguimientos». En Siguiendo (`getFollowingActivity`) se omite el `follower` cuyo seguidor es quien mira o alguien a quien sigue, porque ya sale como su `follow`. En Siguiendo y Yo se ve como lista, lista con póster o lista con backdrop; en las tres, cada evento lleva la foto de perfil de quien lo hizo (con póster o backdrop, junto a la imagen del título). `/v1/users/feed/summary` va aparte porque la cabecera no cambia al paginar.

Las alertas de la campana del navbar (`/v1/users/notifications`) reutilizan el feed propio y avisan de los seguidores nuevos (`new_follower`, enlazan al perfil del seguidor; `POST /v1/users/:username/follow` marca `req.pushUserId` del seguido para el push). Ver [[push-notifications]]. La campana está montada dos veces (barra de escritorio y de móvil); las dos comparten la petición en curso (`fetchAlertsShared` en `AlertsMenu.jsx`), así que al entrar o navegar se pide una sola vez. En móvil el panel no tiene alto fijo: mide la barra inferior (`nav.sv-navbar-bottom-shift`) y llega hasta 12 px por encima de ella; en escritorio la lista sigue limitada a `65vh`.

## «Tus amigos» en la ficha

En cada ficha, `FollowingActivity` (`src/components/details/FollowingActivity.jsx`) enseña qué han hecho con ese título las cuentas que sigues: visto o progreso, nota, favorito, pendiente, reseña y listas públicas. Backend: `GET /v1/community/{type}/{tmdbId}/following` → `backend/src/lib/followingTitleActivity.js`, con una consulta por tabla filtrada por el título, así que el coste no crece con el historial de los seguidos.

## Endpoints

Ver la sección *Social y perfiles* de [[backend_api_reference]]. En Next, los proxies están en `src/app/api/users/**`.

## Relacionado
- [[hoy]]
- [[Features]]
- [[comunidad]]
- [[niveles-y-logros]]
