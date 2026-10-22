---
tags: [area/features, area/companion, type/referencia]
aliases: [Detecciones, Corrección de detecciones]
---
# Detecciones de streaming

La extensión del navegador y la app Android detectan qué título se está viendo en cada plataforma y lo sincronizan (ver [[streaming-sync-reliability]] y [[Companion-Apps]]). Cada detección queda registrada para poder **corregirla** y para que el sistema **aprenda** de las correcciones.

## Páginas

| Ruta | Qué hace |
|---|---|
| `/detections` | Detecciones recientes de la **extensión** (últimos 7 días). Sirve cuando el indicador de la ficha ya desapareció. Las del móvil no salen aquí. |
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

## Autenticación

- **Token de sincronización** (extensión y endpoint de resolución): `lookup`, registro y reglas *not-a-title*.
- **Token del móvil** (app Android y *The Show Verse Sync*, sin sesión web): rutas `/streaming/device/*`.
- **Sesión web:** listado, detalle y corrección.

## Endpoints

Sección *Detecciones de streaming* de [[backend_api_reference]]. Proxies de Next en `src/app/api/streaming/{detections,device}` y `src/app/api/netflix/detection-rules`.

## Relacionado
- [[Features]]
- [[streaming-sync-reliability]]
- [[Companion-Apps]]
