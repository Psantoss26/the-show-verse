---
tags: [area/features, type/referencia]
aliases: [Recap, Tu año, Year in review]
---
# Recap anual: «Tu año en The Show Verse»

Resumen anual al estilo *Wrapped*, en pantallas que se pasan como historias.

## Páginas

- `/recap`: el año actual si ya tiene actividad; si no, el último con datos.
- `/recap/[year]`: un año concreto.
- Accesos: menú del navbar, barra inferior móvil (configurable en ajustes) y banner y tarjeta de vista previa en el perfil (`RecapPromoBanner`, `RecapPreviewCard`).

## Pantallas (`src/components/recap/RecapSlides.jsx`)

Intro, minutos vistos, películas frente a series, primer y último título del año, géneros, serie y película del año, top de series y de películas, maratones, ritmo (horas y días de la semana), calendario (mapa de calor), puntuaciones, épocas, mapa del mundo (países de producción), personas (reparto y dirección), hitos, **persona** y resumen final.

La *persona* del año sale de las señales del usuario: El Maratoniano, El Cinéfilo, El Explorador, El Arqueólogo, El Estreno Andante, El Noctámbulo, El Crítico, El Fiel o El Constante (`PERSONAS` en `yearInReviewCore.js`). Cada pantalla puede llevar una banda sonora (`useRecapSoundtrack`).

### Transiciones

- **Entre pantallas** (`RecapStory`): la que entra se desliza encima de la que sale, que no se desvanece; así no asoma el fondo negro a mitad del cambio. Se anima `transform` como cadena (no `x`/`scale`) para que framer lo mande a WAAPI y vaya en el compositor mientras se monta la pantalla nueva. Con *reduced motion*, solo un fundido corto.
- **Entre vistas** (`RecapClient`): cargando, mensajes (sin sesión, Pro, error, año vacío) y el resumen se relevan con un fundido de 350 ms; la vista anterior se queda opaca debajo hasta el final. Las frases de «cargando» también se relevan con un fundido.
- **Segmentos de progreso**: claves estables y transición CSS en los que no son el activo; al saltar o volver atrás, el segmento que se deja se llena o se vacía deslizando en vez de saltar. El activo lo pinta el temporizador en cada fotograma, fuera de React.
- **Entradas dentro de cada pantalla** (`recapUi`): `Reveal` y `WordsReveal` animan `transform` como cadena (compositor). `CountUp` escribe la cifra en el nodo de texto en cada fotograma, sin re-renderizar la pantalla 60 veces por segundo.

## Reglas de cálculo (`backend/src/lib/yearInReviewCore.js`)

- Días, meses y horas en la **zona horaria del usuario**.
- Los visionados **marcados en bloque** (temporada entera, importación) cuentan para los totales pero no para horas, días de la semana ni maratones, porque no dicen cuándo se vieron de verdad.
- Duración: la de la fila, si no la de TMDb, y si no un valor por defecto.

## Coste y caché (`backend/src/lib/yearInReview.js`)

1. Firma del estado del usuario: si no cambió, el resumen sale de Redis.
2. Metadatos leídos de `tmdb_cache` extrayendo solo los campos necesarios en SQL.
3. Lo que falte se pide a TMDb en tandas con tope de tiempo; si no da tiempo, el resultado se guarda poco tiempo y se completa en la siguiente visita.

En el cliente, `src/lib/recap/recapCache.js` y `recapModel.js`. Cambiar las reglas implica subir `YEAR_IN_REVIEW_VERSION`.

## Compartir

`/api/recap/card` genera la imagen en formato story (1080×1920) a partir del resumen que ya tiene el cliente, sin volver a pedirlo ni tocar cookies. Valida y recorta todo porque es pública.

## Endpoints

- `GET /v1/stats/year-in-review?year=&refresh=` (backend).
- `GET /api/recap` y `GET /api/recap/card` (Next).

## Relacionado
- [[Features]]
- [[backend_api_reference]]
