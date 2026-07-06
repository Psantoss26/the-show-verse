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
| `history.js` (+ `history.test.mjs`) | `readSearchHistory(storage)`/`addSearchHistory(query, storage)`/`removeSearchHistory(query, storage)`/`clearSearchHistory(storage)`: historial de búsquedas en `localStorage` (clave `showverse:navbar:search-history:v1`), límite `SEARCH_HISTORY_LIMIT` (8 entradas), normalizado (espacios, longitud máx. 120) y deduplicado por clave sin acentos/mayúsculas. Mantiene además una copia en memoria (`WeakMap` por `storage`) para no releer/parsear en cada llamada. |

## Cómo se usa

Ambos ficheros los consume únicamente `src/components/Navbar.jsx`: `fuzzySimilarity`/`tokenFuzzyMatches` para puntuar resultados de búsqueda tolerando erratas (p. ej. "intersteler nolan"), y las funciones de `history.js` para pintar/gestionar el desplegable de búsquedas recientes.

## Dependencias

- Ninguna API externa ni de otros módulos de `lib`. Ambos ficheros son utilidades puras (o solo dependientes de `window.localStorage`).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[components]]
