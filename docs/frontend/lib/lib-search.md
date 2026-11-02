---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/search

> Búsqueda fuzzy tolerante a erratas e historial de búsquedas recientes, ambos usados por el buscador del `Navbar`.

## Responsabilidad

Dos utilidades independientes y puras (sin red) que soportan el buscador global: `fuzzy.js` calcula similitud entre la consulta del usuario y un título aunque haya erratas; `history.js` persiste en `localStorage` las últimas búsquedas del usuario, normalizadas y deduplicadas.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `fuzzy.js` | `levenshtein(a, b)`: distancia de edición (O(n·m), dos filas). `trigramSimilarity(a, b)`: coeficiente de Dice sobre trigramas, robusto a transposiciones y consultas multi-palabra. `fuzzySimilarity(query, title)`: máximo entre similitud de edición consulta↔título completo, consulta↔cada token del título, y trigramas — puntúa `[0,1]`. `tokenFuzzyMatches(queryToken, titleTokens)`: si un token de la consulta casa (tolerando 1 edición en tokens ≤4 caracteres, 2 en más largos) con algún token del título. Opera sobre texto ya normalizado (sin acentos, minúsculas, sin puntuación). |
| `ranking.js` (+ `ranking.test.mjs`) | Peso de lo conocido en el orden de resultados del `Navbar`. `searchResultReach(item)`: votos y popularidad (personas: votos del título más votado de `known_for`). `searchReachScore(item)`: `1500·log10(1+votos) + 800·log10(1+popularidad)`, que `scoreSearchResult` suma al texto (exacto 10000, empieza por 7000, palabra entera 6500, trozo 5000, más hasta 3000 por palabras): un título conocido que empieza por la consulta gana a uno exacto desconocido. `isEmptySearchResult`/`withoutEmptySearchResults`: quita películas, series y personas sin imagen y con menos de 20 votos (salvo que no quede nada). `isWeakSearchResultSet`: ningún resultado llega a 100 votos (errata probable); el `Navbar` lanza entonces también la búsqueda por prefijo y la suma a lo que había. |
| `history.js` (+ `history.test.mjs`) | `readSearchHistory(storage)`/`addSearchHistory(query, storage)`/`removeSearchHistory(query, storage)`/`clearSearchHistory(storage)`: historial de búsquedas en `localStorage` (clave `showverse:navbar:search-history:v1`), límite `SEARCH_HISTORY_LIMIT` (25 entradas; en el móvil el desplegable del Navbar mide el alto hasta el borde de `visualViewport`, teclado incluido, y desplaza el resto), normalizado (espacios, longitud máx. 120) y deduplicado por clave sin acentos/mayúsculas. Mantiene además una copia en memoria (`WeakMap` por `storage`) para no releer/parsear en cada llamada. |

## Cómo se usa

Al escribir, el `Navbar` pide solo la primera página de `/search/movie`, `/search/tv`, `/search/person` y `/search/collection` en español e inglés (8 peticiones; antes 16, con `/search/multi` y la página 2), y el resto llega con «Más resultados». Ambos ficheros los consume únicamente `src/components/Navbar.jsx`: `fuzzySimilarity`/`tokenFuzzyMatches` para puntuar resultados de búsqueda tolerando erratas (p. ej. "intersteler nolan"), y las funciones de `history.js` para pintar/gestionar el desplegable de búsquedas recientes.

En el desplegable de resultados del Navbar, al pasar de página con las flechas se precargan y decodifican las portadas de la página de destino (`preloadSearchPosters`, con un tope de 250 ms) y la lista entra deslizándose desde el lado de la flecha pulsada (WAAPI, solo `transform`/`opacity`); si el alto cambia, el panel lo anima siguiendo a la lista mientras dura el relevo. Los resultados sin portada pintan un hueco del mismo tamaño con el icono del tipo, así que todas las filas miden igual.

## Dependencias

- Ninguna API externa ni de otros módulos de `lib`. Ambos ficheros son utilidades puras (o solo dependientes de `window.localStorage`).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[components]]
