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
para no bloquear toda la cola. Los fallos de red y servidor se conservan.

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
   `0018_streaming_detections.sql`, las tablas de detecciones y su aprendizaje. El comando
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
