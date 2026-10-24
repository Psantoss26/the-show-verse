---
tags: [area/features, area/frontend, area/backend, type/referencia]
aliases: [Hoy, Today, Actividad destacada]
---
# Hoy

Página `/today`: lo más destacado de lo que han visto, puntuado y reseñado hoy, ayer o esta semana las cuentas que sigues, o toda la comunidad. La idea viene de la página Today de Trakt (cliente abierto `trakt/trakt-lite`, `projects/client/src/lib/sections/today/`). Comparte el rosa/fucsia de Social.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/today` | Historias, historia destacada, destacados, «Para ti», feed agrupado y más activos. |

Parámetros de URL (`src/lib/today/params.js`): `scope=following|community`, `day=today|yesterday|week|YYYY-MM-DD` y `group=title|person|time`. Los valores por defecto (`following`, `today`, `title`) no se escriben en la URL.

## Qué se ve

- **Cabecera:** pestañas Siguiendo / Comunidad y Hoy / Ayer / Semana, cada una con su recuento. Debajo, los otros cinco días de la semana como chips, y la línea «N actividades de M personas».
- **Historias:** carril de círculos, uno por título más uno de «Para ti». El aro es de color mientras quede algo sin ver. Al pulsar se abre el **reproductor a pantalla completa** (`TodayStoryViewer`):
  - Cada fotograma dura 5 s. En un título con dos o más personas, el primero es un resumen.
  - Tocar el tercio izquierdo vuelve atrás y el resto avanza. Mantener pulsado pausa.
  - Deslizar en horizontal cambia de título y hacia abajo cierra.
  - Teclado: ← y → cambian de fotograma, espacio pausa y Esc cierra.
  - Los fotogramas vistos se guardan en `localStorage` (`today-seen-stories`) durante 24 h.
- **Historia destacada:** la más reciente con un **hito** (estreno o final de temporada o de serie). Si ninguna tiene hito, la que ha juntado a más gente.
- **Destacados** (solo desde `sm`): la primera reseña sin spoiler y la primera nota de una película o serie entera, sin repetir el título destacado.
- **«Para ti»:** episodios estrenados en la ventana de series que estás viendo y estrenos de tu lista de Pendientes.
- **Feed** con tres agrupaciones:
  - por título (por defecto);
  - por persona;
  - por hora, en franjas mañana 5–12, tarde 12–18, noche 18–23 y madrugada. La madrugada cuenta como el final del día anterior.
- **Más activos:** las 5 personas con más acciones en la ventana, con una barra proporcional al primero. En Comunidad llevan botón Seguir.
- **Panel de persona** (`TodayPersonDrawer`): todo lo suyo de la ventana, con enlace al perfil.
- Al pulsar un título se abre la ficha rápida (`DetailModalProvider placement="right"`).

### Reglas

- **Maratones:** los episodios de una misma serie vistos por la misma persona se funden en una acción con `episodeCount` y el hito más fuerte. La nota de un episodio suelto se pega a su visionado.
- **Ventanas:** se cortan en la zona horaria del usuario (`users.timezone`, por defecto Europe/Madrid).
  - «Hoy» son las **últimas 24 h móviles**, como en Trakt.
  - Ayer y los demás días van de medianoche a medianoche.
  - Se puede mirar hasta 30 días atrás.
- **Importaciones fuera:** no cuentan las fechas falsas de importación (00:00/12:00 UTC exactos, o 3 o más filas en el mismo instante; `backend/src/lib/realActivityInstant.js`). Tampoco las series marcadas enteras de una vez (`activity_group`).
- **Comunidad:** incluye a todas las cuentas activas salvo las que desactivan en Ajustes «Mostrar mi actividad en Hoy · Comunidad», que se guarda como `ui_settings.hideFromCommunityToday`.

## Cómo está hecho

- **Backend:** `GET /v1/users/today`, implementado en `backend/src/lib/todayActivity.js` (consultas) y `todayActivityCore.js` (rangos, hitos, normalización; puro y con tests).
  - Hace **una consulta por tabla** (`watch_history`, `user_ratings`, `title_comments` nativos) para todas las cuentas a la vez, acotada por fecha. El feed de `/social` hace 11 consultas por cuenta.
  - La consulta cubre la semana entera, así que los recuentos de las pestañas salen de la misma respuesta.
  - Tope de 2000 filas por tabla (`truncated`).
  - Caché en Redis: 30 s por usuario en Siguiendo, que se invalida al seguir o dejar de seguir; 60 s compartidos en Comunidad. «Para ti» y `viewerFollows` se calculan aparte para quien mira.
- **Frontend:**
  - `src/app/today/page.jsx` (RSC con presupuesto de 2,5 s y solo con el token de acceso, como `/calendar`) y `TodayClient.jsx`.
  - Componentes en `src/components/today/`.
  - Las historias, la destacada, los destacados, las agrupaciones y el ranking se calculan en el cliente, en `src/lib/today/stories.js` (tests en `stories.test.mjs`). Cambiar de agrupación no vuelve a pedir nada.
- **Acceso:** «Hoy» en el menú de perfil y el menú móvil, y como opción de la barra inferior móvil (`mobileBottomNav.js`). Social enlaza a esta página desde su cabecera.

## Endpoints

`GET /v1/users/today`, en la sección *Social y perfiles* de [[backend_api_reference]]. Proxy de Next en `src/app/api/users/today/route.js`.

## Relacionado
- [[social-y-perfiles]]
- [[trakt-comparativa-sync]]
- [[Features]]
