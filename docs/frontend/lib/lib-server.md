---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/server

> Utilidades exclusivas de servidor: dataset público de valoraciones IMDb y traducción EN→ES de texto de reseñas.

## Responsabilidad

Dos módulos sin relación directa entre sí, agrupados por ejecutarse solo en el servidor (Node): descarga/parseo de un dataset masivo de IMDb con caché en memoria, y traducción de texto en inglés a español con fallback local si el traductor externo falla.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `imdbRatingsDataset.js` | Descarga el dataset público `title.ratings.tsv.gz` de IMDb (`IMDB_RATINGS_DATASET_URL`, streaming con `createGunzip` + `readline`), lo parsea a un `Map` en memoria (`globalThis` para sobrevivir a *hot reload*) con TTL de 24h y reintento a los 5 min si falló la última descarga. Expone `lookupImdbRating(s)(imdbId(s))` y `getImdbRatingsDatasetStatus()` (para diagnóstico). Deduplica descargas concurrentes vía una promesa `inflight` compartida. |
| `translateText.js` | `translateEnglishToSpanish(value)`: intenta primero el endpoint público no oficial de Google Translate (`translate.googleapis.com`, timeout 2.5s con `AbortController`); si falla, cae a `fallbackTranslateEnToEs` — un diccionario de frases exactas (`EXACT_EN_ES`) más una lista de sustituciones por regex palabra-a-palabra pensada para las frases típicas de "pros/cons" de reseñas de Trakt. Cachea resultados en memoria (`globalThis.__showverseTranslationCache`) por texto de entrada. |

## Cómo se usa

- `imdbRatingsDataset.js` lo usan las rutas `src/app/api/imdb/top-rated/route.js` y `src/app/api/imdb/ratings/route.js` como fuente de valoraciones IMDb masivas (alternativa/complemento a OMDb en [[lib-api]]). Solo puede ejecutarse en Node (usa `node:zlib`, `node:stream`, `node:readline`), nunca en el navegador ni en Edge runtime.
- `translateText.js` lo usa `src/app/api/trakt/community/sentiments/route.js` para traducir los patrones de sentimiento (ver [[lib-details]]`/sentiment.js`) extraídos de comentarios de Trakt.

## Dependencias

- Externas: dataset público de IMDb (`datasets.imdbws.com`), endpoint público de Google Translate.
- Internas: ninguna hacia otros módulos de `lib` (son hojas del árbol, consumidas solo por route handlers).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[lib-details]]
