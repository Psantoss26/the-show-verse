---
tags: [area/features, area/backend, type/referencia]
aliases: [Niveles, Logros, XP]
---
# Niveles y logros

Cada miembro tiene un **nivel** (1 a 40), un **rango**, **rachas** de días con actividad y un catálogo de **logros**. Se ven en la pestaña *Nivel* del perfil (`/u/[username]/level` y `/profile/level`) y son públicos, como el resto del perfil.

## Cómo se calcula

El XP **se deriva del estado actual** de la biblioteca, no de un registro de eventos. Por eso:

- el mismo historial siempre da el mismo XP;
- reimportar Trakt no duplica nada;
- todo lo anterior cuenta de forma retroactiva, sin scripts de relleno.

El estado se recalcula como máximo una vez por minuto y se invalida al momento tras una escritura relevante (plugin `backend/src/plugins/levelInvalidation.js`). Los «me gusta» invalidan también el nivel de quien los recibe.

### Fuentes de XP (`backend/src/level/rules.js`)

| Fuente | XP | Fuente | XP |
|---|---|---|---|
| Película vista | 10 | Favorito | 3 |
| Revisionado de película | 3 | Pendiente | 1 |
| Episodio visto | 2 | Lista creada | 15 |
| Serie completada | 25 | Título en una lista | 1 |
| Puntuación | 5 | Destacado del perfil | 10 |
| Reseña | 40 | Seguidor | 5 |
| Reseña extensa (≥ 300 caracteres, bonus) | +20 | Miembro seguido | 2 |
| Día con actividad | 5 | «Me gusta» recibido / dado | 5 / 1 |

### Curva y rangos (`backend/src/level/curve.js`)

XP acumulada para el nivel *n*: `50·(n−1)² + 100·(n−1)`. Es cuadrática para que los primeros niveles lleguen rápido y los últimos cuesten años de biblioteca (calibrada con cuentas reales: ~9.500 XP caen en el nivel 13).

| Rango | Niveles | Rango | Niveles |
|---|---|---|---|
| Espectador | 1–5 | Coleccionista | 21–25 |
| Aficionado | 6–10 | Experto | 26–30 |
| Cinéfilo | 11–15 | Maestro | 31–35 |
| Crítico | 16–20 | Leyenda | 36–40 |

El color de cada rango es un *token* (`zinc`, `sky`, `emerald`…) que el frontend traduce en `src/lib/level/tiers.mjs`.

### Rachas (`backend/src/level/streaks.js`)

Días distintos con algo en `watch_history`, contados en UTC. Alimentan los logros de constancia.

### Logros (`backend/src/level/achievements.js`)

38 logros declarativos (métrica + umbral), así la UI pinta el avance («47/50») sin lógica propia y añadir uno es una línea. Familias:

- **Visionado:** de *Primera función* (1 película) a *Proyeccionista* (500).
- **Series:** episodios (1 a 1.000) y series completadas (1 a 25).
- **Crítica:** puntuaciones (1 a 300), reseñas y reseña extensa.
- **Colección:** favoritos, listas, lista de 50 títulos y *Escaparate* (10 destacados del perfil).
- **Social:** seguidores, seguidos y «me gusta» recibidos.
- **Constancia:** rachas de 7, 30 y 100 días; 365 días con actividad.
- **Rareza:** *Maratón* (5 películas en un día), *Trasnochador*, *Veterano* (nivel 20), *Leyenda viva* (nivel 36).

Rarezas: común, raro, épico y legendario. La evaluación se repite en cada lectura; en `user_achievements` solo se guarda la **fecha del primer desbloqueo**, para que un logro no se pierda si luego se borran favoritos.

## Endpoints

- `GET /v1/users/level/catalog` — rangos, fuentes de XP y logros (para explicar el sistema sin duplicar números en el front).
- `GET /v1/users/{username}/level` — estado de un miembro. `?refresh=1` solo para el propio usuario.

## Código

| Pieza | Fichero |
|---|---|
| Rutas | `backend/src/routes/level.js` |
| Reglas puras y tests | `backend/src/level/{rules,curve,achievements,streaks,stats}.js` + `*.test.js` |
| Persistencia | `backend/src/level/store.js` |
| Invalidación | `backend/src/plugins/levelInvalidation.js` |
| Frontend | `src/lib/level/tiers.mjs`, pestaña `level` de `src/app/u/[username]/profileRoutes.js` |

## Relacionado
- [[Features]]
- [[social-y-perfiles]]
- [[backend_api_reference]]
