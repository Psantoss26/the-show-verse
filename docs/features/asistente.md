---
tags: [area/features, area/frontend, area/ia, type/referencia]
aliases: [Asistente, Qué ver con IA, Watch Next]
---
# Asistente

Chat de recomendaciones en `/assistant` («Qué ver con IA»): el usuario escribe lo que le apetece y el asistente responde con títulos de la app. La página (chat, conversaciones, vistas de pósters y lista) está descrita en [[app-router-pages]]; aquí se explica **cómo se eligen los títulos**.

## Qué entiende del mensaje

El intérprete (`src/lib/ai/watchNextIntent.js`, puro y con pruebas) convierte el texto en criterios:

| Criterio | Ejemplos | Cómo se aplica |
|---|---|---|
| Tipo | «una peli», «una serie», «miniserie», «en cines» | Solo películas o solo series. Si se dan minutos sin tipo («de menos de 90 minutos»), es una película. |
| Géneros | «comedia», «terror», «ciencia ficción», «crimen», «bélica»… | Géneros de TMDb por tipo. Las series no tienen terror ni romance: se buscan por palabra clave (`horror`, `romance`) y se comprueban con el género más cercano. Varios géneros: primero todos a la vez («comedia romántica») y luego cualquiera. |
| Excluidos | «sin terror», «nada de romance», «que no sea de miedo ni drama» | `without_genres` y fuera del resultado, en cualquier nivel. |
| Ánimo | «ligera», «para reír», «para llorar», «que me haga pensar», «con tensión», «en pareja», «con niños» | Favorece unos géneros y aparta otros (no los exige). «Con niños» sí exige familiar o animación y quita el terror. |
| Temas | «hechos reales», «atracos», «viajes en el tiempo», «zombis», «navideña», «superhéroes», «distopía» | Palabras clave de TMDb. |
| Duración | «menos de 90 minutos», «hora y media», «de 2 horas», «más de 150 min», «corta», «capítulos cortos» | `with_runtime` de TMDb; en series, la duración del episodio. «Serie corta» favorece miniseries. |
| Nota | «buena nota», «bien valorada», «obra maestra», «más de 7», «nota de 7,5» | Nota mínima de TMDb con un mínimo de votos para que sea fiable; el orden usa una media ponderada por votos. |
| Plataforma | Netflix, Prime Video, Disney+, HBO Max, Apple TV, Movistar Plus+, Filmin, SkyShowtime, Rakuten TV, Atresplayer, RTVE Play, FlixOlé, MUBI, Crunchyroll, Pluto TV; «gratis» | Disponibilidad en España (`watch_region=ES`, suscripción, gratis o con anuncios). «Que no esté en Netflix» no cuenta como pedir Netflix. |
| Cines | «qué hay en cines», «cartelera», «ir al cine» | Cartelera de España (`now_playing` y estrenos en salas de las últimas semanas). |
| Época | «de 1996», «de los 80», «entre 2010 y 2015», «estrenos», «de este año», «clásicos» | Fechas de estreno. Nunca se recomienda algo sin estrenar salvo que pida próximos estrenos. |
| Origen | «coreana», «japonesa», «anime», «española», «francesa», «nórdica», «Bollywood» | Idioma original (y país cuando hace falta). |
| Parecida a | «parecida a "Dark"», «si me gustó Breaking Bad», «algo como Dark», «parecido a mis favoritas» | Busca el título en TMDb y usa sus recomendaciones y similares (o las de tus últimas favoritas). Con similares de sobra, solo cuentan esos. |
| Pendientes | «de mis pendientes», «de mi lista» | Solo títulos de Pendientes. |
| Otros | «rever», «próximos estrenos», «dame 2 pelis» | Permite lo ya visto, solo lo que está por estrenar, número de títulos. |

## Cómo se eligen

`/api/ai/watch-next` (`src/app/api/ai/watch-next/route.js`), con la lógica de candidatos en `src/lib/ai/watchNextCandidates.js`:

1. **Candidatos.**
   - Búsquedas de `/discover` construidas con los criterios: ya cumplen plataforma, duración, nota, fechas, idioma y géneros, y lo dejan anotado en cada título (`verified`).
   - Cartelera, «parecida a…» y los Pendientes del usuario.
   - Novedades y tendencias de TMDb y Trakt solo cuando no hay criterios concretos (o se piden estrenos o cines).
2. **Datos del usuario.** Pendientes, favoritos, valoraciones e historial salen del backend de la app (`/v1/watchlist`, `/v1/favorites`, `/v1/ratings`, `/v1/history`); sin sesión del backend, de TMDb y Trakt. Lo ya visto queda fuera salvo que se pida «rever».
3. **Comprobación.** Duración, plataforma y país no vienen en los listados: de los candidatos que no salieron de una búsqueda que lo garantice (Pendientes incluidos) se pide la ficha de TMDb, como mucho 36.
4. **Filtro por niveles.**
   - Primero lo que cumple todo.
   - Si no llega, se deja de exigir la nota, la época y la duración exacta (15 min de margen) y, al final, el género, el tema y el parecido.
   - Tipo, excluidos, plataforma, cines y «de mis pendientes» no se relajan nunca.
   - La respuesta dice qué se ha relajado.
5. **Orden** (`scoreCandidate`).
   - Encaje con los géneros, el ánimo y el tema.
   - Calidad ponderada por votos y popularidad.
   - Afinidad con los géneros de favoritas y bien valoradas.
   - **Pendientes:** suman más cuando cumplen lo pedido.
   - **Novedad:** solo sin criterios.
   - **Penalizaciones:** lo recomendado en los últimos 14 días.
6. **IA.**
   - El modelo (Gemini, OpenAI u Ollama) elige entre los candidatos YA filtrados, con los criterios en el mensaje. Así decide el tono, pero no puede saltarse lo pedido.
   - Se varía el resultado: tipos y orígenes distintos, y nunca dos de la misma saga.
7. **Respuesta.** Resume los criterios aplicados («He buscado películas de comedia, de 90 min como mucho, nota de 7 o más, en Netflix»), cuántos títulos están en Pendientes y lo relajado. Cada título lleva etiquetas de lo que cumple (género, plataforma, «Pendiente», «En cines»).

Los identificadores de géneros, plataformas y palabras clave de TMDb se comprobaron contra su API (región ES) el 2026-11-04.

## Pruebas

- `src/lib/ai/watchNextIntent.test.mjs`: interpretación de mensajes (tipo, géneros y negación, ánimo, duración, nota, plataformas, época, origen, «parecida a», pendientes).
- `src/lib/ai/watchNextCandidates.test.mjs`: consultas de TMDb, filtro por niveles y orden.

## Relacionado
- [[Features]]
- [[app-router-pages]]
- [[components]]
