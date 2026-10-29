# Sincronización de streaming: recuperación y pruebas

Esta implementación refuerza la integración propia: extensión 3.0 y Android 1.3
(versionCode 4). Los fallos encontrados en reintentos, cambios de episodio,
persistencia y vinculación eran corregibles sin sustituir el sistema.

## Clasificación película/episodio

Lo que decide si algo es una película o un episodio son los campos que el
reproductor DEDICA a describir un episodio: el nombre de la serie, el del
episodio y el badge de temporada/episodio. El **título principal no cuenta**, ni
en el cliente ni en el servidor, porque hay películas que llevan un número de
capítulo en su propio nombre: «John Wick: Capítulo 2» hacía saltar el patrón de
episodio, se buscaba solo en el catálogo de series y se guardaba como el episodio
2 de una serie sin relación. Una vez que un campo dedicado confirma que es un
episodio, el título sí puede aportar los números que falten.

Por el mismo motivo, el título de una película no se recorta por esos patrones
antes de buscarlo en TMDb: «John Wick: Capítulo 2» quedaba en «John Wick», que es
otra película. En series sí se recorta, porque lo que hay que buscar es el nombre
de la serie.

El número de episodio en un campo dedicado, aunque no se sepa de qué serie es,
nunca se declara película: buscar el nombre de un episodio en el catálogo de cine
devuelve la película que más se le parezca. Sin serie no se guarda nada.

## Consultas a TMDb por fiabilidad

Un mismo contenido produce varias consultas posibles. No valen lo mismo: el
nombre de la serie, el título principal o el de la pestaña los publica el
reproductor, mientras que el texto de una notificación, el subtítulo o el badge
«T1:E1» son campos de relleno que traen la descripción del episodio, el nombre
del perfil o la duración. La búsqueda libre de TMDb casi nunca devuelve vacío, así
que una consulta de relleno «resolvía» por relevancia un título sin relación y,
como bastaba con que algo resolviera, era ese el que se guardaba.

Ahora gana la primera consulta con coincidencia **exacta** en TMDb, venga de donde
venga. Una coincidencia aproximada solo se acepta de una fuente fiable, y solo si
ninguna otra consulta da una exacta.

## Lectura del título en el navegador

**Netflix (extensión 3.3):** la identidad sale del reproductor y de los metadatos de
Netflix, no del DOM: el vídeo que suena según `playerApp.getState()` y, con su id, la
serie, la temporada y el episodio numerados, o la película con su año. Lo de abajo
queda como respaldo cuando los metadatos no llegan. Detalle en
`netflix-extension/README.md` → *Netflix: reproductor y metadatos*.


El título del reproductor de Netflix son elementos hermanos: `<h4>` con la serie y
sendos `<span>` con «T4:E5» y el nombre del episodio. `textContent` los pega sin
separación («Stranger ThingsT4:E5»), y ahí el patrón de temporada no casa porque
exige un límite antes de la «T». La temporada se perdía justo en la plataforma más
usada, el episodio quedaba sin ella y acababa registrado a nivel serie. El texto
se lee ahora separando los hijos.

De ese bloque de título, además, solo se leen temporada y episodio tras quitar el
nombre de la serie; si no se puede separar, se exige una marca de temporada, que
ningún nombre de película trae. Y cuando el reproductor da los dos números, manda
sobre el rastreo genérico del DOM, que recorre toda la página y puede haber cogido
el badge de una fila de recomendaciones.

## Numeración de la plataforma frente a TMDb

Las plataformas agrupan y parten temporadas a su manera y cuentan episodios que
TMDb no tiene (especiales, recapitulaciones). Su temporada y episodio no siempre
existen en TMDb, o existen pero son otro episodio:

| Serie | Plataforma | TMDb |
| --- | --- | --- |
| *Ataque a los Titanes* | T6 («Temporada 4 Parte 2»), E82 | S4E23 |
| *Jujutsu Kaisen* | T2:E32 | S1E32 (una sola temporada) |
| *My Hero Academia* | T5:E93 (suma especiales) | S5E1 |
| *Dragon Ball Z Kai* | T2:E1 (2 temporadas) | S5E1 (6 temporadas) |

El resolutor lo pasa a TMDb (`reconcileEpisodeNumbers` en
`src/lib/netflix/streamingResolve.js`). La solución general es **alinear por
inicios de temporada**. La extensión da la posición del episodio en la
plataforma (`absoluteEpisode`, contando todas sus temporadas) y dentro de su
temporada (`seasonEpisodeIndex`), sacadas de los metadatos de Netflix. Cuando
una plataforma agrupa o parte temporadas, las suyas empiezan casi siempre donde
empieza alguna de TMDb; lo que se desvía es la cuenta de antes. Por eso:

1. **El par existe y su posición en TMDb cuadra** con la de la plataforma: se
   queda. Si no cuadra (en *Dragon Ball Z Kai* el T2:E1 de TMDb existe, pero es
   otro episodio), no se acepta.
2. **El inicio de la temporada de la plataforma cae cerca** (≤ 6 %) del de una
   temporada de TMDb: el episodio se cuenta desde ahí. Cubre *My Hero Academia* y
   *Dragon Ball Z Kai*, sea cual sea el desfase de la cuenta.
3. **Si no**, la plataforma parte una temporada de TMDb por la mitad: se reparte
   la posición absoluta (*Ataque a los Titanes*, *Jujutsu Kaisen*).
4. **El nombre del episodio**, si casa sin ambigüedad con un episodio de TMDb a
   ±12 del resultado, lo confirma o corrige (`anchorEpisodeByName`). Corrige un
   desfase que quede dentro de una temporada.

Sin esas posiciones (app Android, clientes antiguos, otras plataformas), un par
que existe en TMDb se comprueba por el **nombre del episodio**: si casa EXACTO con
un único episodio distinto de la serie, ese es el bueno (`episodeElsewhereByName`;
la app de Netflix para Android muestra el «T2:E1» relativo de *Dragon Ball Z Kai*,
que en TMDb es otro episodio). Un nombre traducido distinto, genérico o repetido
no cambia nada. Por lo demás se deduce lo que se puede del par: si existe se queda; si el número no cabe en esa temporada es
absoluto; si cae en la misma temporada se usa la posición dentro de ella o, sin
ella, se prueba el nombre en toda la serie (confianza baja); en una serie de una
sola temporada en TMDb se supone absoluto salvo que el nombre diga otra cosa. Sin
ningún par posible se busca por nombre y, si tampoco, se guarda a nivel serie.

Vale para cualquier plataforma y para lo que llega del mapa de ids. Cuando el id
lo da el propio reproductor (Netflix con metadatos), el mapa no se descarta porque
sus números no coincidan: van en la numeración de Netflix.

## Anuncios, tráileres y avances

Un vídeo mucho más corto que el título no es el título: un anuncio previo (Pluto
TV pone 95 s y luego 259 s antes de una película de 90 min), un tráiler o el
avance de la ficha. Con su posición (94 de 95 s) el progreso llegaba al 90 % y la
película se daba por vista. El backend compara la duración del reproductor con la
de TMDb (`isPlausibleRuntime` en `backend/src/lib/tmdbRuntime.js`): si es menos de
la mitad, el punto se ignora (`ignored: 'runtime_mismatch'`), sin «Continuar
viendo» ni historial. Solo se compara con la duración de la película o del
episodio concreto; la media de una serie no sirve. La extensión, además, nunca
toma por el vídeo principal el avance de la ficha de Prime Video.

## Fichas en todas las plataformas

La detección de la FICHA (navegando, sin reproducir) está en
`netflix-extension/browse-detection.js`, comprobada con fichas, portadas y
listados públicos reales de Prime Video, Movistar Plus+, Filmin, SkyShowtime,
Rakuten TV, Atresplayer, RTVE Play, Pluto TV y Apple TV+
(`netflix-extension/diagnostics/`).

- **Solo en rutas de ficha.** En las portadas y los listados el encabezado más
  grande era un titular o el aviso de cookies («Consentimiento de cookies», «We
  value your privacy»…) y se mandaba a resolver como un título.
- **Tipo seguro.** JSON-LD (`Movie`, `TVSeries`, `TVEpisode`), pistas de la
  plataforma (lista de episodios de Prime Video) o la ruta (`/pelicula/` frente a
  `/serie/`…). Con él la señal lleva `movieTitle` o `showName` y `mediaTypeHint`;
  con «película» el resolutor no busca entre series.
- **Año.** JSON-LD (`datePublished`) o «(2020)» en la pestaña: el resolutor
  prefiere el título de ese año y acepta «Título (subtítulo)» de TMDb si el año
  casa («Incontrolable» de 2025, no «Incontrôlable» de 2006).
- **Temporada y episodio** del JSON-LD (también del nombre «Temporada 4» si falta
  `seasonNumber`, como en RTVE) o de la pestaña («(Temporada 1, Episodio 2)» en
  Apple TV+).
- **Título de la pestaña limpio** como último recurso: sin «Ver …», «online»,
  «gratis en línea», el año, ni el nombre de la plataforma.

**Durante la reproducción** la señal se completa con la ficha de la misma página
(`enrichPlaybackSignal`): en RTVE Play, Atresplayer, Pluto TV, Rakuten TV o Filmin
el vídeo suena en la propia ficha y su Media Session solo da un título; la ficha
aporta la serie, la temporada y el episodio, o el tipo y el año de la película.
Nunca pisa lo que dijo el reproductor, y con los metadatos de Netflix no actúa.

## Fichas en la app Android

La ficha se lee del árbol de accesibilidad (`AccessibilityStreamingService`):

- **Solo ventanas de la plataforma.** Si no había ninguna, se leía la ventana
  activa, fuera de la app que fuera: en una tablet con dos apps a la vez (o con The
  Show Verse delante) llegaba como ficha de Prime Video el aviso «Solo lectura ·
  servidor no disponible…».
- **Tipo.** Antes la ficha se mandaba siempre como película. Ahora, si la pantalla
  muestra temporadas o episodios (`ScreenHeuristics.isSeriesSignal`), va como serie
  con `mediaTypeHint: "tv"` y el resolutor solo busca series; si no, va sin tipo.
  Prime Video titula *Suits* como «La clave del éxito», y como película resolvía
  la de 1983 con ese nombre.
- **Sin tipo**, el resolutor prefiere una serie mucho más popular (≥ 10×) cuyo
  subtítulo («Suits: **la clave del éxito**») es exactamente el texto, frente a una
  película que se llama así.
- «Suscripciones» y «Prime» (pestañas de Prime Video) no se toman por títulos.
- **El reproductor no es una ficha.** Netflix expone sus controles como texto
  («Adelantar 10 segundos», «Brillo», «Pausar»). Con dos o más controles propios
  del reproductor a la vista (`ScreenHeuristics.isPlayerControl`) la pantalla no se
  trata como ficha: «Brillo» resolvía una película, esa «ficha» se recordaba como lo
  último visto (`RecentDetail`) y el episodio que sonaba se quedaba sin la serie de
  la ficha de verdad. «Mostrar controles» y «Sin sonido» no cuentan: también salen
  en el tráiler de la ficha.
- Tampoco son títulos las filas numeradas de episodios de Netflix («5. Pastorcito
  alpino», que sí delatan una serie), «Porque has visto…», los avisos de
  notificaciones, los premios («2 Emmy · 86 premios») ni «Calificación», «Me
  encanta» o «No es para mí».

### Episodio sin serie

Sin la serie de la ficha, Netflix en Android solo da el nombre del episodio
(«Marco», T1:E10). El servidor lo prueba como consulta, pero si coincide con una
serie («Marco») solo la acepta cuando ese episodio existe en ella con ese nombre
(`episodeBelongsToShow`); si no, no registra nada. El paréntesis final que añade
Netflix a algunos episodios («Iván (N.° 88)» en *The Blacklist*) se quita antes de
compararlo con TMDb.

## Apps sin sesión multimedia (Prime Video, Disney+)

La sincronización del móvil se apoya en la MediaSession que publica cada app.
Netflix la publica siempre; Prime Video y Disney+, en la mayoría de móviles y
tablets, no (solo al enviar a otro dispositivo o en imagen en imagen). Sin ella no
aparecía ni «Detectado reproduciendo» y no llegaba nada al servidor.

Ahora el servicio de accesibilidad avisa cuando ve el reproductor de una app
(`ScreenPlayback`): por `PlayerScreen` (barra de avance o tiempos) o por dos o más
controles suyos. Desde entonces `MediaListenerService` la trata como una
reproducción, igual que una sesión, hasta que:

- se ve otra pantalla de esa app (una ficha),
- otra app pasa a primer plano,
- el reproductor se ve en pausa (botón «Reproducir» y ninguno de pausa),
- se apaga la pantalla (cuenta como pausa), o
- pasan 4 horas sin volver a verlo.

No se exige volver a ver los controles: se ocultan a los pocos segundos.

Lo que suena sale de la pantalla (`ScreenSignal`): la serie y el episodio del
reproductor y, si no los pinta, la ficha abierta justo antes de reproducir (la misma
regla de frescura que la pista de serie). La posición es la del reproductor cuando
se ha visto, y si no, estimada por reloj. Las apps que sí publican sesión (Netflix,
Plex) siguen solo por ella.

El reproductor se lee en todas las plataformas salvo Netflix y Plex. Además, ya no
se toman por títulos las pestañas «Mi espacio», «Para ti» y «Búsqueda», el estado
del envío a otro dispositivo, los controles como «Velocidad, 1x» ni las notas de
X-Ray («Rick Hoffman portrays Louis Litt»).

En la ficha de Prime Video tampoco son títulos los carruseles y etiquetas: «Otros
clientes también vieron», «Películas dramáticas», «Estreno», «Relacionado», «#1 en
España», «Calificada 16+», «Descargar T1», «Volver a ver episodio 9» o el recuento
«( 16 episodios)», que sí delata una serie. El primero de ellos iba como título
principal: «Otros clientes también vieron» acababa resolviendo una película del
carrusel.

La comprobación de que lo que devolvió TMDb está en pantalla
(`TitleMatch.corroborates`) acepta también cada parte de un título «Original:
subtítulo» con al menos 4 letras. Prime Video pinta «Suits» en la ficha de «Suits:
la clave del éxito», y la resolución correcta se descartaba sin notificar. Lo
contrario no vale: TMDb no puede devolver más palabras que las leídas
(«Interstellar» en pantalla no respalda la serie «Interstellar Ella»), salvo
artículos y conectores.

La comprobación vale con cualquiera de los nombres del título
(`TitleMatch.corroboratesAny`): el de TMDb en español, el original y el inglés. En
modo «solo resolver» el servidor los devuelve en `synced.alternativeTitles`
(`loadAlternativeTitles` en `extension-sync/route.js`, con la ficha en `en-US` de
TMDb). Prime Video pinta «The Mentalist» y TMDb devuelve «El mentalista», y esa
ficha se descartaba solo por el idioma.

En el servidor, el tipo «serie» de una ficha de Android (`mediaTypeHint: "tv"`)
solo se aplica a su título principal (`showName`). Los demás textos de la señal
pueden ser de un carrusel y se buscan sin tipo: en la ficha de *Interstellar* el
título leído era «Otros clientes también vieron», y «Interstellar», buscado solo
entre series, resolvía «Interstellar Ella» (2 votos) en vez de la película.

### Títulos desconocidos en fichas con varios textos

La app Android manda los cuatro primeros textos que lee en la ficha, y el título no
siempre es el primero. Casi cualquier palabra de la interfaz coincide exacta con
algún título de TMDb que nadie ha visto: «Todos», «Brillo» o «Búsqueda», con 0
votos. Por eso, en una ficha (`detectionKind: "detail"`) con más de un texto
distinto, el servidor salta los títulos con menos de 5 votos y menos de 5 de
popularidad, y prueba el texto siguiente. En la ficha de *Your Name* de Prime
Video, «TODOS» iba primero y resolvía la película «Todos»; ahora resuelve «Your
Name.» con el tercer texto.

Una novedad recién estrenada tiene pocos votos pero mucha popularidad, así que se
sigue resolviendo. Una ficha con un solo texto (el encabezado de la ficha en el
navegador) no se toca: una película poco conocida de Filmin se sigue resolviendo.

### Reconocer el reproductor y los anuncios

Prime Video no expone su barra de avance como `SeekBar` y, con los controles a la
vista, no siempre pinta tiempos: `PlayerScreen` no lo reconocía y la reproducción no
empezaba nunca. Ahora basta con que la pantalla demuestre que es el reproductor
(`ScreenHeuristics.isPlayerScreen`): dos controles, o un texto que solo sale en él,
como la velocidad con su valor («Velocidad, 1x») o una nota de X-Ray («Rick
Hoffman portrays Louis Litt»). Entonces su línea «T6 E9 Nombre» se lee aunque no
haya tiempos.

Prime pone un **anuncio** antes del título. Mientras se ve («Anuncio», «Anuncio 1 de
2», «Saltar anuncio»…), cuenta como reproducción, pero su tiempo y su texto no se
guardan como lectura del contenido: si no, la duración del anuncio se tomaba por la
del título y el servidor lo descartaba (`runtime_mismatch`). «AD» a secas no cuenta:
en la ficha es la insignia de audiodescripción.

Si la sesión existe pero llega sin título, se identifica igual que sin sesión. Si
aun así no hay título, la app manda una vez por sesión los textos de la pantalla
al servidor, que los guarda como descarte `empty_title`. Sin el Registro del móvil
es la forma de ver qué muestra el reproductor de cada app.

### El episodio pulsado en la ficha

En Prime Video los controles se ocultan enseguida y casi nunca se llega a leer la
línea «T6 E9 …» del reproductor. Lo único que se sabía de lo que sonaba era la
serie de la ficha, y a Continuar viendo llegaba la serie entera en vez del
episodio (las tres reproducciones de Prime registradas iban sin temporada ni
episodio).

El servicio de accesibilidad escucha ahora también las pulsaciones
(`typeViewClicked`). Si lo pulsado es un episodio, lo recuerda (`EpisodeChoice`,
`RecentDetail.rememberEpisode`):

- un botón de la ficha («Reanudar episodio 9», «Volver a ver episodio 9»,
  «Reproducir T2 E3»);
- una fila de la lista de episodios («2. Cuentas a Pagar»).

La temporada, si el texto no la trae, sale del selector de la ficha («Temporada 6»,
«Descargar T6»). Pulsar el botón de descarga de una fila no cuenta.

`ScreenSignal` añade ese episodio a la serie de la ficha cuando el reproductor no
dice nada. Solo vale para esa ficha y con la misma regla de frescura que la propia
ficha. Lo que se lea en el reproductor sigue ganando.

**Límite conocido:** si Prime pasa solo al siguiente episodio y no se llega a ver la
línea del reproductor (tocando la pantalla), se sigue atribuyendo al episodio
pulsado.

### Sin estorbar al reproductor

Leer la pantalla de otra app con accesibilidad es una llamada a SU hilo principal
por cada nodo. Mientras arranca el vídeo, el reproductor de Prime Video cambia sin
parar (la rueda de carga, el anuncio) y se releía entero cada 2,5 s en todas sus
ventanas: miles de llamadas compitiendo con el propio reproductor, que podía
quedarse en negro cargando. Ahora:

- **Lecturas espaciadas.** En el reproductor, o en una pantalla sin nada que leer
  (la de carga), los cambios de contenido se leen como mucho cada 5 s durante el
  minuto siguiente. Un cambio de pantalla se lee al momento, y una ficha vuelve a
  hacer inmediatas las lecturas.
- **Menos nodos.** El recorrido del reproductor se corta a 600 nodos (la ficha
  sigue en 1600).
- **Menos consultas.** La ventana en primer plano (`ScreenPlayback`) se consulta
  como mucho cada 10 s.

### Botones de la ficha y pista «serie» equivocada

«Volver a empezar» es un botón de reproducir de la ficha de Prime Video (y una
serie de TMDb). Tampoco son títulos las tarjetas de carrusel («Carrie (2013). Prime
Video»), «Descargar 2. Nombre a tu dispositivo», «Estuvo 8 semanas en el Top 10»,
«N.º 4 en películas de anime», «Ganadora de 6 OSCAR®», «NUEVA PELÍCULA», «MEJOR
VALORADO» ni las fechas.

Los carruseles traen textos de temporada de otros títulos, así que una película
puede llegar marcada como serie. Si el título principal no existe como serie, el
servidor lo prueba sin tipo antes de pasar al resto de textos: la ficha de
*Shutter Island* resolvía el botón «Volver a empezar». Una serie cuyo título
contiene el texto sigue ganando («La clave del éxito» → *Suits*).

## Prime Video y Crunchyroll en la app Android

Estas dos apps no publican en su MediaSession de qué serie es el episodio (a veces
ni su número) y no siempre publican la posición. Sin serie, el servidor no resolvía
nada o resolvía un título ajeno; sin posición, solo se podía estimar por reloj, y
una posición estimada nunca marca un episodio como visto.

Su reproductor sí lo muestra cada vez que aparecen los controles: la serie, debajo
«T1 E3 · Nombre del episodio» y el tiempo junto a la barra de avance. El servicio
de accesibilidad lo lee (`PlayerScreen`, recorrido en orden de lectura) y lo deja en
`PlayerScreenCache`. `MediaListenerService` lo combina con la sesión:

- **Identidad.** La serie del reproductor completa lo que la sesión no dice y gana a
  la pista de una ficha vista antes, pero nunca a la serie que da la propia sesión.
  Si la lectura contradice a la sesión (otro número u otro nombre de episodio), es
  de otro contenido y se ignora. Solo valen lecturas tomadas desde poco antes de la
  sesión de reproducción o, tras un cambio de contenido, desde ese cambio. Viaja
  como `seriesFromHint`, así que el servidor comprueba que el episodio es de esa
  serie y no le da confianza máxima.
- **Posición.** Si la sesión no la publica, se toma la de la pantalla y se avanza con
  el tiempo que la sesión pasa reproduciendo (no durante las pausas). No se marca como
  estimada, así que sí puede completar el visionado al 90%.
- **Ficha.** En la pantalla del reproductor no se busca ficha: el botón de reproducir
  de los controles en pausa la hacía pasar por una. Se reconocen los botones de
  Crunchyroll («Empezar a ver T1 E1», «Continue watching S1 E3», «Crunchylista»…), y
  las filas de episodios, los géneros y los botones de Cast ya no se toman por el
  título. Crunchyroll analiza todas sus ventanas, como Prime Video.

La lectura del reproductor solo se aplica a estas dos apps. Las mejoras de la
detección de fichas (botones, filas de episodios, géneros) y el tope de espera del
servicio de accesibilidad (antes, una pantalla que cambia sin parar no llegaba a
leerse nunca) valen para todas. Con el indicador desactivado, la accesibilidad sigue
leyendo Prime Video y Crunchyroll porque alimenta la sincronización; no notifica nada.

## Serie entera y episodio en Continuar viendo

Continuar viendo guarda una fila por título y episodio; la serie sin episodio
conocido va con temporada y episodio 0. Si un punto llegaba sin episodio de una
serie cuyo episodio ya estaba bien sincronizado, se creaba una segunda tarjeta con
la serie entera. Pasa cuando la app no sabe leer el episodio: Prime Video con los
controles ocultos, o el episodio siguiente que arranca solo.

- **Al guardar** (`POST /auth/netflix/progress`): un punto sin episodio se ignora
  (`ignored: "show_level_has_episode"`) si de esa serie ya hay un episodio en curso,
  que conserva su punto. Al revés, cuando llega el episodio, la tarjeta de la serie
  entera que hubiera de antes se borra.
- **Al leer** (`GET /progress`, `withoutShowLevelDuplicates`): las parejas que
  quedaron de antes no se muestran. Se van borrando solas con el siguiente punto
  del episodio.

Prueba: `streamingProgress.integration.test.js` (opt-in, Postgres desechable) y
`progress.test.js`.

## El progreso avanza mientras se ve

El punto de progreso se envía cada 30 s, pero Continuar viendo se quedaba con el
primero. Había dos causas:

- **En la app Android**, cada punto entra en una cola duradera (`ProgressOutbox`) y
  WorkManager la entrega. Se programaba con `ExistingWorkPolicy.KEEP`: si una
  entrega se estaba reintentando (un fallo de red, un evento que el servidor aún no
  identifica), seguía esperando su retraso, que se duplica en cada intento (10 s,
  20 s, 40 s… hasta horas), y los puntos nuevos no salían. Ahora un punto nuevo
  sustituye la entrega pendiente (`REPLACE`): sale al momento. Si lo único que
  queda en la cola son eventos que el servidor aún no identifica, la entrega
  termina en vez de reintentarse.
- **En la web**, la página y la fila del dashboard leían el progreso solo al
  abrirse (la fila, también al volver a la pestaña). Ahora las dos se releen cada
  60 s mientras están a la vista y al volver a la pestaña, con un mínimo de 30 s
  entre lecturas (`lib/api/progressRefresh.js`).

## Corrección de detecciones

Cada título que se notifica (ficha o reproducción) queda registrado como una
detección con su `detectionId`. Desde la notificación de Android («No es
correcto»), desde el indicador de la extensión («¿No es correcto?») o desde
**Detecciones recientes** (`/detections`, enlazada en Ajustes → Conexiones), el
usuario puede indicar que no había ninguna ficha abierta o que el título era otro.
En ese caso elige el correcto y, en series, el episodio, ya rellenado con lo que
leyó el reproductor.

La corrección mueve o borra lo que guardó esa detección (y solo eso), redirige los
pings posteriores y crea reglas sobre la **huella** de lo que había en pantalla:

- **Título fijo:** la huella se resuelve directamente al título elegido.
- **Veto:** el título propuesto no vuelve a ofrecerse para esa huella.
- **«No es un título»:** esa huella se ignora; los clientes además descartan el
  texto antes de tratar la pantalla como ficha.

Las reglas valen al momento para quien corrige y para todos cuando coinciden 3
usuarios distintos (`DETECTION_GLOBAL_MIN_SUPPORTERS`). Diseño completo:
`docs/superpowers/specs/2026-10-05-streaming-detection-corrections-design.md`.

## Flujo

1. El reproductor aporta título, episodio y posición; el servidor resuelve TMDb.
2. Cada cliente guarda los puntos de progreso antes de enviarlos. Si no pudo
   resolver el título, guarda la observación para resolverla al recuperar conexión.
3. Los reintentos conservan `eventId` y `observedAt`. La extensión usa almacenamiento
   persistente y alarmas; Android usa preferencias cifradas y WorkManager.
4. El backend serializa las escrituras de cada usuario/contenido en una transacción,
   conserva recibos de eventos e ignora puntos anteriores al último confirmado.
   Repetir un envío no duplica el historial ni resucita un episodio completado.
5. Se conserva el umbral de finalización del 90%. Una posición estimada no marca
   un visionado completo. Verlo de nuevo después sigue pudiendo crear otro visionado.

Las respuestas de resolución de un episodio anterior no pueden modificar el nuevo.
Los fallos de resolución se reintentan con espera creciente. Las observaciones
que siguen sin resolverse tras tres respuestas 404/422 se descartan con diagnóstico
para no bloquear toda la cola. Los fallos de red y servidor se conservan. Cada
respuesta 404/422 del resolutor queda además medida en el backend
(`streaming_discards`, ver [[detecciones-streaming]] → *Medición por plataforma*).

Cada dispositivo tiene una vinculación independiente, asociada al usuario de
The Show Verse. Compartir un correo de Netflix no transfiere la vinculación entre
usuarios. Cambiar de cuenta elimina los pendientes de la vinculación anterior.
La desconexión global de ajustes revoca todos los dispositivos.

## Activación

1. Comprobar las variables reales del backend y ejecutar `npm --prefix backend run
   deploy:check`. En esta sesión la configuración existente falló al conectar con
   PostgreSQL y Redis; la comprobación sí pasó con servicios locales aislados.
   No se cambiaron las credenciales ni se migró producción.
2. Aplicar `npm --prefix backend run db:migrate` en el entorno de destino. La
   migración aditiva `0016_calm_hannibal_king.sql` crea `streaming_events`, y
   `0018_streaming_detections.sql`, las tablas de detecciones y su aprendizaje. `0026_streaming_content_ids.sql`
   añade el mapa de ids de contenido y `0027_streaming_discards.sql`, los descartes. El comando
   de arranque actual del backend también aplica las migraciones pendientes.
3. Desplegar backend y frontend antes de actualizar los clientes.
4. En Chrome, actualizar la extensión o descomprimir el ZIP y cargar la carpeta
   desde `chrome://extensions` con el modo de desarrollador. Conceder acceso a
   los sitios de streaming elegidos, volver a vincular desde ajustes y recargar
   las pestañas de los reproductores.
5. Instalar el APK de Android, vincular desde ajustes y habilitar el acceso a
   notificaciones. Habilitar accesibilidad si se necesita su detección auxiliar.
   El APK generado es de depuración: una instalación firmada con otra clave
   requiere el proceso de actualización con su clave original o una instalación
   independiente. No se ha publicado ni firmado una versión de distribución.

La extensión muestra pendientes y el último error. Android muestra el número de
pendientes y registra las confirmaciones. «Guardado para sincronizar» indica cola
local, no confirmación del servidor. Las colas admiten 1000 eventos; al llenarse se
informa del fallo en lugar de borrar eventos antiguos silenciosamente.

## Validación reproducible

```sh
node --test netflix-extension/*.test.* src/lib/netflix/*.test.mjs
npm --prefix backend test
npm run lint
npm run build
```

La detección se prueba reproductor a reproductor, con película y con episodio, en
dos mitades que comparten las mismas señales:

- `netflix-extension/players.test.js` reconstruye el DOM real de cada reproductor
  (con su estructura de nodos, que es la que rompía la lectura) sobre el DOM mínimo
  de `netflix-extension/fake-dom.js`, y comprueba la señal completa: si es serie o
  película, la serie, el episodio y sus números.
- `src/lib/netflix/playbackSignals.test.mjs` pasa esas señales por el endpoint real
  contra un TMDb simulado que se comporta como el de verdad —su búsqueda libre
  devuelve siempre algo— y comprueba qué se guarda: tipo, id de TMDb, temporada y
  episodio, y qué llega al backend en los pings de progreso.

Ese arnés transpila el endpoint a ESNext. Con el objetivo por omisión (ES5)
TypeScript degrada los spreads de iteradores del endpoint y algunos devuelven
listas vacías: las pruebas pasaban sin ejercitar el camino.

Las pruebas de integración usan PostgreSQL real y requieren una base
**desechable** con las migraciones aplicadas. No usar la base de producción:

```sh
STREAMING_TEST_DATABASE_URL=postgresql://USER:PASS@HOST/TEST_DB \
  node --test backend/src/routes/streamingProgress.integration.test.js \
  backend/src/routes/streamingDetections.integration.test.js
```

Una base desechable en local, con las migraciones aplicadas:

```sh
docker run -d --rm --name tsv-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tsv_test \
  -p 55432:5432 postgres:16-alpine
U=postgresql://postgres:test@127.0.0.1:55432/tsv_test
(cd backend && NODE_ENV=test DATABASE_URL=$U DATABASE_URL_UNPOOLED=$U node src/db/migrate.js)
```

Android, con JDK 17, Gradle 8.7 y Android SDK instalado:

```sh
cd android-companion
gradle testDebugUnitTest assembleDebug
```

Se comprobaron automáticamente la detección de cada reproductor (película y
episodio), la clasificación película/serie, la resolución a TMDb frente a
resultados señuelo, la persistencia y los reintentos de la extensión, las
respuestas tardías entre episodios, el cierre antes de resolución, las
observaciones sin conexión, las coincidencias ambiguas, las escrituras
concurrentes, la repetición de eventos, el progreso antiguo, los visionados
repetidos, los tokens revocados y las vinculaciones independientes.

Los cambios de la app Android (`SignalBuilder`) llevan sus pruebas JVM en
`SignalBuilderTest`, pero **no se han compilado ni ejecutado**: la máquina donde se
hicieron no tiene JDK, Gradle ni Android SDK. Antes de publicar el APK hay que
ejecutar el comando de arriba.

## Capturas de diagnóstico

Para arreglar una plataforma con datos reales, la extensión guarda lo que lee la
detección en la pestaña (**Capturar diagnóstico**, en su ventana). Cada captura,
con lo que debería detectarse (`expected`), se copia a
`netflix-extension/diagnostics/` y pasa a ser una prueba de
`netflix-extension/diagnostic.test.js`. Detalle en `netflix-extension/README.md`
→ *Diagnóstico*.

## Matriz de comprobación con cuentas reales

Repetir estos casos en cada servicio habilitado en navegador y Android. Estas
pruebas con reproductores reales quedan pendientes; las pruebas automatizadas
no certifican el comportamiento de aplicaciones externas.

| Caso | Resultado esperado |
| --- | --- |
| Película al 30% y al 95% | Progreso primero; un solo visionado al finalizar |
| Autoplay al siguiente episodio | Cada punto pertenece a su episodio |
| Cortar red, avanzar y reconectar | Pendientes enviados con la hora original |
| Cerrar pestaña o app después de guardar | La cola persiste y se recupera |
| Respuesta perdida y reenvío | No duplica el historial |
| Pausar y reanudar sincronización | No envía mientras está pausada |
| Revocar token | Informa de revinculación, sin dar por enviado el progreso |
| Dos dispositivos y cuenta de streaming compartida | Vinculaciones independientes |
| Título o episodio ambiguo | No inventa una coincidencia segura |
| Posición estimada de accesibilidad | No completa automáticamente el visionado |

## Límites y alternativa

Este sistema observa reproducción en dispositivos vinculados. No importa por sí
solo el historial completo de una cuenta ni lo visto en televisores o dispositivos
sin la integración. Las plataformas pueden ocultar o cambiar sus metadatos;
Android puede restringir la ejecución y diferir WorkManager. La recuperación
periódica de Android es de 15 minutos y no garantiza una hora exacta de envío.
Forzar la detención de Android requiere abrir de nuevo la aplicación.

No se puede garantizar compatibilidad universal con todas las plataformas. Para
evaluar importación de cuentas mediante Younify Connect haría falta acceso real
de partner, documentación y claves del proveedor. No se ha añadido una integración
simulada ni se ha contratado un servicio. La implementación propia queda lista
para comparar sus resultados con esa alternativa cuando se disponga de acceso.

Referencias: [ciclo de vida de extensiones](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[trabajo persistente Android](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work).
