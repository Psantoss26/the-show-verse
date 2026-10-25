---
tags: [area/features, area/frontend, area/backend, type/referencia]
aliases: [Hoy, Today, Actividad destacada]
---
# Hoy

Vista por defecto de la sección Social (`/social`): lo más destacado de lo que han visto, puntuado y reseñado hoy, ayer o esta semana las cuentas que sigues, o toda la comunidad. La idea viene de la página Today de Trakt (cliente abierto `trakt/trakt-lite`, `projects/client/src/lib/sections/today/`). Comparte el rosa/fucsia de Social.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/social` | Opción «Hoy» de la barra: historias, historia destacada, destacados, «Para ti», feed agrupado y más activos. |
| `/social?view=activity`, `?view=mine` | Opciones «Siguiendo» y «Yo»: el feed completo de siempre (ver [[social-y-perfiles]]). |
| `/today` | Redirige a `/social` conservando `scope`, `day`, `group` y `story`. |

Hoy es una opción más de la barra sticky de Social (`SocialClient`), junto a Siguiendo y Yo: **Hoy / Siguiendo / Yo**. La barra es la misma en las tres opciones; con Hoy sus desplegables pasan a ser:
- **Quién:** Siguiendo o Comunidad.
- **Día:** Hoy, Ayer, cada día de la semana y Semana, con su recuento.
- **Agrupar:** por título, por persona o por hora.
- **Vista** (botones de icono): rejilla de carteles o lista. Se recuerda en `localStorage` (`showverse:social:todayLayout`), aparte de la vista de Siguiendo / Yo.

El buscador filtra lo de Hoy por título o persona. En móvil, como el resto de menús, van dentro de `MobileFiltersPanel`. `TodayClient` es controlado: recibe esos valores como props y devuelve los recuentos de los días (`onDaysChange`). `SocialHub` (`src/app/social/SocialHub.jsx`) pone el fondo y la cabecera «Social.» con las cifras (Siguiendo, Seguidores, Activos). Cambiar de opción solo reescribe la URL, sin volver a pedir el RSC.

Parámetros de URL (`src/lib/today/params.js`):
- `scope=following|community`
- `day=today|yesterday|week|YYYY-MM-DD`
- `group=title|person|time`
- `story=<título>`: abre el reproductor en esa historia y se quita de la URL al consumirse.

Los valores por defecto (`following`, `today`, `title`) no se escriben en la URL.

## Píldora «Hoy» del navbar

`TodayNavbarEntry` (`src/components/today/`), como `TodayNavbarEntry.svelte` de trakt-lite. Solo aparece con sesión y si hay historias. Es de cristal líquido, el de la casa (`LIQUID_GLASS_BAR` + `LiquidGlassOpticalLayers`). Las caras van «recortadas» como el AvatarStack *cutout* de Trakt: cada una vacía con una máscara el hueco de la siguiente, en vez de llevar un aro oscuro. El contador es rosa.
- **Escritorio** (junto a Buscar): caras de hasta 3 personas con historias, «Hoy» y un contador de historias sin ver.
- **Móvil** (junto a la campana): un círculo con dos carteles inclinados y el contador en la esquina.
- **Brillo:** mientras queda algo sin ver, un destello cónico recorre el borde una vez por minuto (`.sv-today-shine` en `globals.css`; sin animación con reduced-motion).
- **Destino:** `/social?story=<primera sin ver>`.
- **Datos:** usa la misma petición que la vista (`src/lib/today/todayFeedClient.js`: petición en curso compartida y copia de 60 s). Se actualiza al navegar.
- **Contador:** baja al momento al ver historias, porque `writeSeenStories` emite `today-seen-stories-change`.

## Qué se ve

Maqueta como la Today de Trakt. En escritorio hay tres columnas con su título alineado arriba (`ColumnHeading`, con la misma letra que «Películas favoritas» del perfil: 12 px en negrita, versalitas espaciadas y gris, con una línea horizontal fina debajo, alineada en las tres): **Historia destacada** (con «Reproducir todo»), **De la gente que sigues** o **De la comunidad** (con el número de títulos) y **Más activos**. Por debajo de `xl`, Más activos baja bajo las otras dos; en móvil todo va en una columna. El texto va a 12 px como mínimo y los iconos a 14–16 px, para que se lean nítidos. Las tarjetas son superficies lisas, sin desenfoque y sin bordes: en Hoy nada va contorneado. Las caras apiladas se recortan una sobre otra con una máscara, sin aro.

- **Controles:** los desplegables Quién, Día y Agrupar de la barra (ver arriba).
- **Cifras de la cabecera** (`SocialHub`):
  - **Actividades** y **Personas** de Hoy, con lo elegido en Quién y Día. Las manda `TodayClient` (`onSummaryChange`) al cargar cada ventana; al entrar por Siguiendo o Yo salen de la petición compartida de Hoy.
  - **Activos**: cuentas que sigues con actividad en los últimos 7 días.

  Sustituyen a Siguiendo y Seguidores, y a la antigua línea «N actividades de M personas».
- **Historias:** en móvil, carril de círculos, uno por título más uno de «Para ti»; el aro es de color mientras quede algo sin ver. En escritorio se abren desde la destacada, desde «Reproducir todo» o desde cada cartel. Todas abren el **reproductor a pantalla completa** (`TodayStoryViewer`):
  - Cada fotograma dura 5 s. En un título con dos o más personas, el primero es un resumen.
  - Tocar el tercio izquierdo vuelve atrás y el resto avanza. Mantener pulsado pausa.
  - Deslizar en horizontal cambia de título y hacia abajo cierra.
  - Teclado: ← y → cambian de fotograma, espacio pausa y Esc cierra.
  - Los fotogramas vistos se guardan en `localStorage` (`today-seen-stories`) durante 24 h.
  - El reproductor se dimensiona con la pantalla: en ordenador ocupa hasta el 96 % del alto (1100 px como mucho) y el ancho justo para que el cartel lo llene. En 2K el cartel mide unos 571 × 856 px y en Full HD unos 452 × 678.
  - El cartel va **siempre a 2:3, entero y sin recortar**: su ancho es el menor entre el ancho del hueco y dos tercios de su alto (`container-type: size` y `min(100cqw, 66.6667cqh)`).
  - Debajo, un pie de alto fijo (116 px) en una fila compacta: cara, nombre, acción, hito, hora y nota. Una reseña va a dos líneas y un spoiler, tras un botón. El texto nunca cambia el tamaño del cartel.
  - En la cabecera, junto a pausa y cerrar, el botón de cuadrícula («Ver todo Hoy») cierra las historias y lleva a la vista Hoy de `/social`, como el de Trakt.
  - **Ficha del título** (`TodayStoryDetails`). En ordenador (con ratón), al pasar por el cartel este se convierte en la ficha y la historia se pausa mientras dure; al salir vuelve el cartel. Para que el giro no haga idas y vueltas cerca de los bordes, no se usan `mouseenter`/`mouseleave` de la tarjeta (sus caras en 3D cambian de forma bajo el ratón mientras gira). Se compara la posición del ratón con el rectángulo fijo del hueco de la tarjeta, con un margen de 90 ms para entrar y 160 ms para salir. En táctil se abre al **tocar la portada** y se cierra con otro toque (también al cambiar de fotograma); tocar fuera de la portada sigue yendo atrás o adelante. La ficha muestra:
    - backdrop con idioma, con el criterio de DetailsClient (`pickLadderBackdrop`: inglés → español → original → sin idioma). Solo el último cuarto se funde con el fondo de la ficha, para que no se vea el corte sin oscurecer la imagen;
    - fila de año · temporadas y episodios o duración · estado · géneros, sin título en texto: ya va en el fondo con idioma (queda para lectores de pantalla);
    - marcador compacto de la ficha móvil (`DetailsScoreboardPanel` con `mobileScoresOnly`: TMDb, Trakt, IMDb y stats de Trakt);
    - sinopsis en 3 líneas;
    - lo positivo y lo negativo de la comunidad, con las mismas tarjetas que DetailsClient («Análisis de sentimientos»): tinte esmeralda o rosa, cuadradito del icono en color y un punto luminoso por frase. Una fila para lo positivo y otra para lo negativo, con hasta dos frases por lado a dos líneas.

    La ficha **cabe entera sin desplazar** y va a su **tamaño natural** (letra de 13 px, el marcador de la ficha móvil) mientras quepa; en una tarjeta grande no se agranda nada, solo sobra aire abajo. Si no cabe, se reduce con `zoom` lo justo. El alto necesario se **mide** por título (cada uno trae textos de distinta longitud) y el ajuste solo baja, así no oscila. `zoom` vuelve a maquetar, así el texto sigue nítido. Incluye la sinopsis en 3 líneas y hasta dos frases positivas y dos negativas, a dos líneas cada una.
    Los datos salen de `useDetailModalData`, los de la ficha rápida. Se **precargan** mientras se ve el cartel de la historia, y la tarjeta solo **da la vuelta** (giro 3D `rotateY` de 0,7 s, con cartel delante y ficha detrás) cuando está todo: detalles, notas, stats, opinión (`sentimentResolved`, nuevo en el hook) y el fondo ya descargado. Así la ficha aparece completa, sin datos que lleguen después.
  - Las flechas de título anterior y siguiente van pegadas a la tarjeta, no en los bordes de la pantalla.
- **Historia destacada:** la más reciente con un **hito** (estreno o final de temporada o de serie). Si ninguna tiene hito, la que ha juntado a más gente. Tarjeta con:
  - quién la protagoniza y la etiqueta del hito (o «Serie» / «Película»);
  - el cartel centrado sobre el fondo del título;
  - el título, la línea de resumen y la hora;
  - la nota media y el botón «Reproducir historia».
- **Destacados:** filas compactas con la primera reseña sin spoiler y la primera nota de una película o serie entera, sin repetir el título destacado.
- **«Para ti»:** episodios estrenados en la ventana de series que estás viendo y estrenos de tu lista de Pendientes.
- **Feed:** rejilla de carteles. Encima de cada cartel solo va la foto de perfil de quien lo vio (o las de dos personas), arriba a la derecha: la nota y el hito se ven en la vista lista y en la historia. Debajo de cada cartel, el título y una línea como en Trakt: «Visto T1 · E2», «Vistos 3 episodios», «Visto y calificado», «2 personas» (`summarizeActions`), con la hora («22:03», «ayer, 22:03», «jue, 20:14»).

  En **vista lista** (`ListRow`), cada título es una fila con el cartel pequeño, el título (y el hito), la línea con la hora, la nota y las caras: cabe mucho más a lo alto. Desde `xl`, y más en `2xl` (monitores 2K), las filas crecen: cartel de 64 px, título a 16 px y caras de 36 px. Al pulsar un cartel o una fila se abre su historia. Tres agrupaciones, en cualquiera de las dos vistas:
  - por título (por defecto);
  - por persona, con un bloque por persona;
  - por hora, en franjas mañana 5–12, tarde 12–18, noche 18–23 y madrugada. La madrugada cuenta como el final del día anterior.
- **Más activos:** las 5 personas con más acciones en la ventana: puesto, cara, nombre, «N historias» y una barra fina proporcional al primero.
- **Panel de persona** (`TodayPersonDrawer`): el mismo panel lateral que las secciones de DetailsClient (`SectionSheet`, acento `pink` y la foto en `leading`). Tiene:
  - pestañas Todo / Vistos / Notas / Reseñas con recuento;
  - buscador si hay más de 4 títulos;
  - filas `TitleRow` con lo que hizo («Ha puntuado · 8,5/10 · hace 1 h»), y la reseña si la hay;
  - botón Seguir y enlace al perfil.

  Pulsar un título abre su ficha rápida.
- Al pulsar un título en la destacada, los destacados o «Para ti» se abre la ficha rápida (`DetailModalProvider placement="right"`).

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
  - `src/app/social/page.jsx` (RSC: con la vista «Hoy» carga sus datos con presupuesto de 2,5 s y solo con el token de acceso, como `/calendar`), `SocialHub.jsx` y `TodayClient.jsx`.
  - Componentes en `src/components/today/`.
  - Las historias, la destacada, los destacados, las agrupaciones y el ranking se calculan en el cliente, en `src/lib/today/stories.js` (tests en `stories.test.mjs`). Cambiar de agrupación no vuelve a pedir nada.
- **Acceso:** la píldora del navbar y Social (menú de perfil, menú móvil y barra inferior). La entrada propia «Hoy» de los menús se quitó al fusionar; quien la tenía en la barra inferior la conserva como Social (`LEGACY_KEYS` en `mobileBottomNav.js`).

## Datos de prueba

`npm run demo:social -- --viewer <usuario>` (en `backend/`, solo contra la base
local) crea estas cuentas. Ver [[01-local-development]].

| Cuenta | Qué cubre |
|---|---|
| `demo_lucia` | Maratón de Peaky Blinders T6E3–E6 con final de serie, nota de la serie, reseña, favorito y pendiente. |
| `demo_marcos` | Final de Peaky Blinders con reseña con spoiler, Dune 2 vista, puntuada y reseñada. Una lista pública y una privada, que no debe salir. |
| `demo_sara` | Estreno de Separación (T1E1 con nota del episodio pegada al visionado, más E2–E3) y Parásitos. Stranger Things T4E1 (estreno de temporada) hace 4 días. |
| `demo_dani` | Oppenheimer ayer, The Bear T1E8 (final de temporada) con nota de temporada, una lista y The Last of Us. |
| `demo_elena` | Nadie de la demo la sigue, así que solo sale en Comunidad. Final de Breaking Bad e Interstellar, más un bloque importado (5 películas en el mismo instante en punto) que Hoy no debe contar. |
| `demo_oculto` | Tiene activado `hideFromCommunityToday`: no debe salir ni en Comunidad. |

Cada cuenta lleva una foto de perfil generada: un degradado con sus iniciales, en WebP como data URL, igual que una foto subida desde Ajustes. Ninguna es la cara de una persona real. La genera `sharp`, que llega con Next; si no está, la cuenta se queda sin foto.

Con `--viewer`, esa cuenta sigue a Lucía, Marcos, Sara y Dani, y Dani la sigue a ella.

## Endpoints

`GET /v1/users/today`, en la sección *Social y perfiles* de [[backend_api_reference]]. Proxy de Next en `src/app/api/users/today/route.js`.

## Relacionado
- [[social-y-perfiles]]
- [[trakt-comparativa-sync]]
- [[Features]]
