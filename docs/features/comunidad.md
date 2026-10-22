---
tags: [area/features, area/backend, type/referencia]
aliases: [Comunidad, Comentarios, Me gusta]
---
# Comunidad

Comentarios y reseñas en las fichas, resumen de sentimiento, listas de la comunidad y «me gusta». Antes todo dependía de Trakt en tiempo real; ahora vive en la base de datos propia (`backend/src/community/`), sembrada desde Trakt y con contenido nativo de los miembros.

## Comentarios

- **Sembrado:** la primera vez que se abre la sección de un título, `seed.js` toma un bloqueo y descarga sus comentarios públicos de Trakt (`trakt.js`, solo con client-id). Se **renuevan cada semana** en segundo plano al abrir la sección, para que lleguen los nuevos y se actualicen «me gusta» y respuestas.
- **Idioma:** Trakt no lo da. `commentLanguage.js` combina alfabeto, palabras funcionales y trigramas para quedarse solo con inglés y español (un detector de trigramas solo fallaba con comentarios cortos).
- **Pestañas** (`tabs.js`): *Populares* (me gusta + respuestas) y *Recientes*. «Ordenar por likes» reordena; en Recientes se limita a los últimos 30 días.
- **Comentarios nativos:** los miembros publican, editan y borran sus reseñas (con aviso de spoiler). Las reseñas importadas de Letterboxd entran aquí a nombre del usuario.
- **Autores:** `/v1/users/public/resolve-usernames` decide qué autores son miembros reales para enlazar su perfil y no generar enlaces rotos a autores de Trakt.

## Sentimiento

`GET /v1/community/{type}/{tmdbId}/sentiment` devuelve temas a favor y en contra. Se calcula en el sembrado: si Trakt tiene temas oficiales para el título, se traducen al español (`translate.js`); si no, se usa una heurística sobre los comentarios guardados (`buildHeuristicSentiment` en `sentiment.js`). En `sentiment.js` hay también un generador con un LLM local vía Ollama (`generateSentiment`), pero hoy no se llama desde ningún sitio.

## Listas de la comunidad

- Listas importadas de Trakt y **listas de usuario publicadas** (`userLists.js`): una lista propia y pública se copia a `community_lists` y se resincroniza al editarla. Si pasa a privada se retira; si se borra, se va con sus «me gusta».
- Páginas: `/lists` (pestaña de comunidad), `/lists/community/[id]` (detalle) y la sección de listas de cada ficha (`/v1/community/{type}/{tmdbId}/lists`).

## «Me gusta»

Idempotentes (repetir la llamada no infla el contador) en comentarios, listas, colecciones (sagas de TMDb) y actores. Cuentan XP para quien da y quien recibe (ver [[niveles-y-logros]]). Componentes: `CommentLikeButton`, `ListLikeButton`, `useCollectionLike`, `useActorLike`.

## Endpoints

Sección *Comunidad* de [[backend_api_reference]]. Proxies de Next en `src/app/api/community/**`.

## Relacionado
- [[Features]]
- [[social-y-perfiles]]
- [[2026-07-08-community-content-migration]] (plan original)
