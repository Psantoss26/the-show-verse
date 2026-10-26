---
tags: [area/features, area/companion, type/referencia]
aliases: [Detecciones, Corrección de detecciones]
---
# Detecciones de streaming

La extensión del navegador y la app Android detectan qué título se está viendo en cada plataforma y lo sincronizan (ver [[streaming-sync-reliability]] y [[Companion-Apps]]). Cada detección queda registrada para poder **corregirla** y para que el sistema **aprenda** de las correcciones.

## Páginas

| Ruta | Qué hace |
|---|---|
| `/detections` | Detecciones recientes de la **extensión** (últimos 7 días). Sirve cuando el indicador de la ficha ya desapareció. Las del móvil no salen aquí. Arriba, el **resumen por plataforma** y la lista desplegable de lo que no se pudo reconocer (ver *Medición*). |
| `/detections/[id]` | Corrección de una detección. Se llega desde «No es correcto» en la notificación o el indicador. |

En la app Android, las detecciones del móvil tienen su propio registro y pantalla de corrección (`DeteccionesActivity`, `CorreccionActivity`).

## Dos veredictos

- **«No había ninguna ficha abierta»:** se borra lo guardado y ese texto deja de tomarse por un título en esa plataforma (reglas *not-a-title*, que la extensión y la app descargan con `/api/netflix/detection-rules`).
- **«El título es otro»:** el usuario elige el correcto (y el episodio, si es serie). Lo guardado se mueve allí y esa huella se resuelve a ese título en adelante.

## Aprendizaje (`backend/src/lib/detectionRules.js`)

Una **huella** es plataforma + texto de identidad normalizado. Sus reglas pueden ser:

- **del propio usuario:** valen en cuanto corrige;
- **globales:** derivadas de las correcciones de todos, y solo valen cuando las respaldan al menos 3 usuarios distintos (`DETECTION_GLOBAL_MIN_SUPPORTERS`). Así el error o el abuso de una persona no cambia la detección de nadie más.

Lo personal manda siempre sobre lo global.

## Id de contenido (`backend/src/lib/contentIdMap.js`)

Antes de buscar por texto, el resolutor (`/api/netflix/extension-sync`) pregunta qué título es el **id del contenido** en la plataforma, el que la extensión saca de la URL de reproducción. Solo en Netflix (`/watch/<id>`), Max, Disney+ y Crunchyroll, donde ese id es el episodio o la película que suena. En Prime Video es la ficha de la serie y en Plex la URL no cambia al reproducir, así que no se usan.

- **Se aprende solo:** cada reproducción resuelta con confianza alta guarda el id del usuario en `streaming_content_ids` (película o episodio concreto; nunca una serie sin episodio).
- **La corrección lo fija:** corregir una detección con id deja ese id en el título y episodio elegidos; «no había ficha» o «es otro» sin elegir lo borra. Una resolución automática posterior no pisa una corrección.
- **Para los demás** vale cuando coinciden en el mismo título y episodio los mismos usuarios que pide una regla global (`DETECTION_GLOBAL_MIN_SUPPORTERS`) y nadie empata en cabeza.
- **El reproductor puede contradecirlo** (`src/lib/netflix/contentIdMatch.js`): otro número de temporada o episodio, película frente a serie, un título vetado o una regla del usuario hacia otro título hacen que se busque por texto como antes, y esa resolución rehace la fila automática. La corrección del propio usuario para ese id manda siempre, incluso sobre «no es un título».

Funciona aunque el texto no sirva para aprender (un «Capítulo 3» genérico no tiene huella, pero sí id). La detección se registra con `source = 'content_id'`. La app Android no envía ids, así que no lo usa.

## Medición por plataforma

Para saber qué plataforma falla más, el resultado de cada observación queda en el backend:

- **Resueltas:** las detecciones (`streaming_detections`), con su vía (`search`, `user_rule`, `global_rule`, `content_id`) y su confianza.
- **Corregidas:** las detecciones que el usuario corrigió; son los aciertos falsos que se conocen.
- **Descartadas:** lo que el resolutor no pudo convertir en un título (`streaming_discards`), con la señal original y su motivo: `unresolved` (no está en TMDb), `not_a_title` (una regla lo descarta), `hint_mismatch` (la serie de la ficha no tiene ese episodio) o `empty_title` (no quedaba texto que buscar).

Los descartes los registra el propio endpoint de resolución (`/api/netflix/extension-sync`) en cada salida 404 o 422, así que cubren la extensión y la app Android sin actualizar ningún cliente. La misma observación repetida en 10 minutos (reintentos de la cola, cada punto de la reproducción) es un solo descarte con varios `attempts`. Se purgan a los 30 días, como las detecciones.

El **acierto** de una plataforma es «resueltas sin corregir / (resueltas + descartadas)» (`backend/src/lib/streamingStats.js`). Es una cota superior: un error que nadie corrige cuenta como acierto.

- **Un usuario:** `/detections` muestra su resumen de la extensión (`GET /streaming/stats?origin=browser`) y sus descartes recientes.
- **Todos los usuarios:** `npm --prefix backend run streaming:stats` (opciones `--days 30`, `--origin android|browser`, `--json`). Solo lee; es la tabla de partida para decidir qué plataforma arreglar primero.

## Autenticación

- **Token de sincronización** (extensión y endpoint de resolución): `lookup`, registro de detecciones y descartes, y reglas *not-a-title*.
- **Token del móvil** (app Android y *The Show Verse Sync*, sin sesión web): rutas `/streaming/device/*`.
- **Sesión web:** listado, detalle, corrección, resumen por plataforma y descartes.

## Endpoints

Sección *Detecciones de streaming* de [[backend_api_reference]]. Proxies de Next en `src/app/api/streaming/{detections,device,stats,discards}` y `src/app/api/netflix/detection-rules`.

## Relacionado
- [[Features]]
- [[trakt-comparativa-sync]]
- [[streaming-sync-reliability]]
- [[Companion-Apps]]
