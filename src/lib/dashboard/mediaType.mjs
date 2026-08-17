// src/lib/dashboard/mediaType.mjs
// Deduce si un item es película o serie. Sin dependencias: es puro y testeable.
//
// Por la app circulan DOS formas de item y las dos acaban aquí:
//   - la de TMDB, en snake_case (`media_type`, `first_air_date`, `name`/`title`),
//     que usan los dashboards;
//   - la de nuestro backend, en camelCase (`mediaType`, `tmdbId`), que usan el
//     perfil, la actividad y el feed social — y que lleva `title` también en las
//     series, así que las heurísticas de TMDB la clasifican mal.
//
// De ahí venía un bug recurrente: una serie del perfil se abría como película con
// el tmdbId de la serie, y se parcheaba caso por caso poniéndole `media_type` a
// mano al item (ver DashboardCalendarSection). Se arregla en el origen:
//
//   1. Si el item DECLARA su tipo, eso manda. Lo declarado siempre vale más que
//      lo adivinado.
//   2. Si no lo declara (o declara algo que no es película ni serie, como
//      'person' en las búsquedas mixtas), se cae a la heurística de TMDB de
//      siempre.

// 'show' es como lo llama Trakt; llega en items de esa integración.
const TV_TYPES = new Set(["tv", "show"]);
const MOVIE_TYPES = new Set(["movie"]);

export const getMediaTypeForItem = (item) => {
  const declared = String(item?.media_type ?? item?.mediaType ?? "").toLowerCase();
  if (TV_TYPES.has(declared)) return "tv";
  if (MOVIE_TYPES.has(declared)) return "movie";

  // Sin tipo declarado: se deduce de los campos propios de TMDB.
  if ((item?.name && !item?.title) || item?.first_air_date) return "tv";
  return "movie";
};
