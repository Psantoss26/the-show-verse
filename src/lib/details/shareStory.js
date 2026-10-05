// Modelo del VÍDEO compartible de una ficha (formato historia, 1080×1920).
//
// El vídeo empieza con la imagen compartible (la portada con botones y
// puntuaciones) y después enseña, sección a sección, lo que la imagen no cabe:
// visionados (y episodios vistos en las series), la reseña del usuario y los
// detalles del título. Las puntuaciones no tienen sección: ya van en la portada.
//
// Reparto del trabajo:
//   - el cliente arma el payload con `buildShareStoryPayload`;
//   - /api/share/details-story lo valida con `sanitizeShareStory` y pinta cada
//     capa (fondo, cabecera y una capa transparente por sección);
//   - el cliente compone las capas fotograma a fotograma siguiendo
//     `storyTimeline` / `storyFrame` y codifica el MP4.
// Toda la coreografía vive aquí, sin DOM, para poder probarla.

export const STORY_FPS = 30;
// Sin sección de puntuaciones: la nota propia y las públicas ya salen en la
// portada, que es la primera pantalla del vídeo, y repetirlas en una sección
// aparte alargaba el vídeo para decir lo mismo.
export const STORY_SCENES = ["plays", "episodes", "review", "details", "production"];

// Episodios vistos de una serie que caben en una sección del vídeo. Con más, se
// enseñan los ÚLTIMOS (los más avanzados de la serie) y un «+N más».
export const STORY_MAX_EPISODES = 14;

// Datos de las tarjetas «Detalles» y «Producción» de la ficha que pasan a la
// secciones «Detalles» y «Producción» del vídeo, ya formateados como en la ficha, con su
// longitud máxima.
export const STORY_FACTS = {
  originalTitle: 80,
  release: 40,
  end: 40,
  format: 40,
  duration: 30,
  status: 30,
  network: 60,
  budget: 30,
  revenue: 30,
  awards: 140,
  production: 120,
};

// Lo que la ficha enseña cuando no hay dato: no merece una celda.
const EMPTY_FACT_RE = /^(?:[-–—·?]+|n\/?a|desconocid[oa]s?|sin datos|unknown|0)$/i;

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function text(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function finite(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function isoDate(value) {
  if (typeof value !== "string" || !ISO_RE.test(value.trim())) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Recorta en el último límite de palabra y añade "…". */
export function truncateText(value, max) {
  const clean = text(value, 10_000);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

function factsData(value) {
  const facts = {};
  if (!value || typeof value !== "object") return facts;
  for (const [key, max] of Object.entries(STORY_FACTS)) {
    const raw = value[key];
    if (raw == null || typeof raw === "object") continue;
    const clean = text(raw, 10_000);
    if (!clean || EMPTY_FACT_RE.test(clean)) continue;
    facts[key] = clean.length > max ? truncateText(clean, max) : clean;
  }
  return facts;
}

// ------------------------------------------------------------------ cliente

// Progreso de «Continuar viendo» (1-99%) del título, con su episodio si es una
// serie.
function resumeData(value) {
  const percent = finite(value?.percent, 0, 100);
  if (percent == null) return null;
  const rounded = Math.round(percent);
  if (rounded < 1 || rounded > 99) return null;
  // `null` no es 0: con `Number(null)` una película acababa en «T0·E1».
  const season = value?.season == null ? null : finite(value.season, 0, 500);
  const episode = value?.episode == null ? null : finite(value.episode, 1, 5000);
  return {
    percent: rounded,
    season: season != null && episode != null ? Math.round(season) : null,
    episode: season != null && episode != null ? Math.round(episode) : null,
  };
}

function ratingValue(value, min = 0) {
  const number = finite(value, 0, 10);
  return number != null && number > min ? Math.round(number * 10) / 10 : null;
}

// Episodios vistos ({ temporada: [episodios] }), en orden, con la nota de IMDb
// de cada uno (SeriesGraph) y la del usuario. Solo los VISTOS.
function watchedEpisodes(watchedBySeason, imdbRatings, userRatings) {
  const imdb = new Map();
  for (const season of Array.isArray(imdbRatings?.seasons) ? imdbRatings.seasons : []) {
    const sn = Number(season?.season_number ?? season?.seasonNumber);
    for (const episode of Array.isArray(season?.episodes) ? season.episodes : []) {
      const en = Number(episode?.episode_number ?? episode?.episodeNumber);
      if (!Number.isInteger(sn) || !Number.isInteger(en)) continue;
      imdb.set(`S${sn}E${en}`, {
        rating: episode?.vote_average ?? episode?.rating ?? null,
        name: episode?.name || "",
      });
    }
  }
  const rows = [];
  for (const [seasonKey, episodes] of Object.entries(watchedBySeason || {})) {
    const season = Number(seasonKey);
    if (!Number.isInteger(season) || season < 1 || !Array.isArray(episodes)) continue;
    for (const value of new Set(episodes.map(Number))) {
      if (!Number.isInteger(value) || value < 1) continue;
      const key = `S${season}E${value}`;
      rows.push({
        season,
        episode: value,
        name: text(imdb.get(key)?.name, 60),
        imdb: ratingValue(imdb.get(key)?.rating),
        mine: ratingValue(userRatings?.[key], 0),
      });
    }
  }
  rows.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return rows;
}

function historyDates(history) {
  const dates = (Array.isArray(history) ? history : [])
    .map((entry) => isoDate(entry?.watched_at ?? entry?.watchedAt ?? entry?.watchedAtIso ?? null))
    .filter(Boolean);
  return [...new Set(dates)].sort((a, b) => (a < b ? 1 : -1));
}

/**
 * Payload desde el estado de la ficha.
 *
 * La reseña propia va siempre que exista, salvo si está marcada como spoiler
 * (el vídeo se publica y lo ve quien no ha visto el título).
 */
export function buildShareStoryPayload({
  type,
  watched,
  plays,
  history,
  lastWatchedAt,
  tvProgress,
  continueWatching,
  watchedBySeason,
  episodeImdbRatings,
  episodeUserRatings,
  review,
  details,
}) {
  const isTv = type === "tv";
  const dates = historyDates(history);
  const last = isoDate(lastWatchedAt) || dates[0] || null;

  // En «Continuar viendo» la sección de visionados lo enseña también: una
  // película a medias sale aunque aún no cuente como vista.
  const resume = resumeData(continueWatching);
  let playsData = null;
  if (isTv && tvProgress?.percent > 0) {
    playsData = {
      percent: tvProgress.percent,
      watched: tvProgress.watched,
      total: tvProgress.total,
      last,
      resume,
    };
  } else if (!isTv && watched) {
    playsData = {
      count: Math.max(Number(plays) || 0, dates.length, 1),
      dates: dates.slice(0, 4),
      last,
      resume,
    };
  } else if (resume) {
    playsData = { count: 0, dates: [], last: null, resume };
  }

  const episodeRows = isTv ? watchedEpisodes(watchedBySeason, episodeImdbRatings, episodeUserRatings) : [];
  const shown = episodeRows.slice(-STORY_MAX_EPISODES);

  const reviewText = text(review?.comment ?? review?.text, 2000);
  const reviewData =
    reviewText && !review?.spoiler
      ? { text: reviewText, date: isoDate(review?.created_at ?? review?.date ?? null) }
      : null;

  return {
    plays: playsData,
    episodes: shown.length
      ? { items: shown, more: episodeRows.length - shown.length }
      : null,
    review: reviewData,
    details: details
      ? {
          year: details.year ?? null,
          runtime: details.runtime ?? null,
          seasons: details.seasons ?? null,
          episodes: details.episodes ?? null,
          genres: (details.genres || []).map((genre) => genre?.name ?? genre).filter(Boolean),
          peopleLabel: details.peopleLabel || null,
          people: (details.people || []).filter(Boolean),
          overview: details.overview || null,
          facts: factsData(details.facts),
          endLabel: details.endLabel || null,
        }
      : null,
  };
}

// ------------------------------------------------------------------ servidor

/** Valida el payload que llega a la ruta: nada de lo que no se reconoce pasa. */
export function sanitizeShareStory(body) {
  const plays = body?.plays && typeof body.plays === "object" ? body.plays : null;
  const review = body?.review && typeof body.review === "object" ? body.review : null;
  const details = body?.details && typeof body.details === "object" ? body.details : null;
  const episodeList = body?.episodes && typeof body.episodes === "object" ? body.episodes : null;

  let playsData = null;
  if (plays) {
    const percent = finite(plays.percent, 0, 100);
    const count = finite(plays.count, 0, 9999);
    const resume = resumeData(plays.resume);
    if (percent != null && percent > 0) {
      playsData = {
        percent: Math.round(percent),
        watched: Math.round(finite(plays.watched, 0, 100_000) ?? 0),
        total: Math.round(finite(plays.total, 0, 100_000) ?? 0),
        last: isoDate(plays.last),
        resume,
      };
    } else if ((count != null && count > 0) || resume) {
      playsData = {
        count: Math.round(count ?? 0),
        dates: (Array.isArray(plays.dates) ? plays.dates : []).map(isoDate).filter(Boolean).slice(0, 4),
        last: isoDate(plays.last),
        resume,
      };
    }
  }

  const episodeItems = (Array.isArray(episodeList?.items) ? episodeList.items : [])
    .slice(0, STORY_MAX_EPISODES)
    .map((item) => {
      if (item?.season == null || item?.episode == null) return null;
      const season = finite(item.season, 1, 500);
      const episode = finite(item.episode, 1, 5000);
      if (season == null || episode == null) return null;
      return {
        season: Math.round(season),
        episode: Math.round(episode),
        name: text(item?.name, 60),
        imdb: ratingValue(item?.imdb),
        mine: ratingValue(item?.mine, 0),
      };
    })
    .filter(Boolean);

  const reviewText = review ? truncateText(review.text, 340) : "";
  const year = finite(details?.year, 1870, 2200);
  const runtime = finite(details?.runtime, 1, 2000);
  const seasons = finite(details?.seasons, 1, 500);
  const episodes = finite(details?.episodes, 1, 100_000);

  return {
    plays: playsData,
    episodes: episodeItems.length
      ? { items: episodeItems, more: Math.round(finite(episodeList?.more, 0, 100_000) ?? 0) }
      : null,
    review: reviewText ? { text: reviewText, date: isoDate(review.date) } : null,
    details: details
      ? {
          year: year ? Math.round(year) : null,
          runtime: runtime ? Math.round(runtime) : null,
          seasons: seasons ? Math.round(seasons) : null,
          episodes: episodes ? Math.round(episodes) : null,
          genres: (Array.isArray(details.genres) ? details.genres : [])
            .map((genre) => text(genre, 24))
            .filter(Boolean)
            .slice(0, 4),
          peopleLabel: text(details.peopleLabel, 20) || null,
          people: (Array.isArray(details.people) ? details.people : [])
            .map((name) => text(name, 40))
            .filter(Boolean)
            .slice(0, 3),
          overview: details.overview ? truncateText(details.overview, 260) : null,
          facts: factsData(details.facts),
          endLabel: details.endLabel === "Finalización" ? "Finalización" : "Última emisión",
        }
      : null,
  };
}

/**
 * Secciones que tienen algo que enseñar, en orden; sin datos, se omiten en vez
 * de pintarse vacías.
 */
export function storySceneIds(card, story) {
  const details = story?.details || null;
  const facts = details?.facts || {};
  const tv = card?.type === "tv";
  // Las mismas tarjetas que la ficha: «Detalles» y «Producción».
  const hasDetails =
    !!details &&
    !!(
      facts.originalTitle ||
      facts.release ||
      (tv && facts.end) ||
      (tv && facts.format) ||
      facts.duration ||
      facts.status ||
      details.year ||
      details.runtime ||
      details.seasons ||
      details.genres?.length ||
      details.overview
    );
  const hasProduction =
    !!details &&
    !!(
      details.people?.length ||
      facts.awards ||
      facts.production ||
      (tv ? facts.network : facts.budget || facts.revenue)
    );
  return STORY_SCENES.filter((id) => {
    if (id === "plays") return !!story?.plays;
    if (id === "episodes") return !!story?.episodes?.items?.length;
    if (id === "review") return !!story?.review;
    if (id === "production") return hasProduction;
    return hasDetails;
  });
}

// ---------------------------------------------------------------- formatos

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatStoryDate(iso) {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dateFormatter.format(new Date(time)) : "";
}

export function formatRuntime(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ------------------------------------------------------------- coreografía
//
// Portada (con un acercamiento lento) → fundido al fondo de las secciones →
// una sección tras otra, cada una entra subiendo y sale desvaneciéndose → vuelta
// a la portada, para que en bucle (historias) el final enlace con el principio.

export const STORY_TIMING = {
  coverHold: 3.0,
  crossfade: 0.6,
  scene: 2.9,
  enter: 0.55,
  exit: 0.4,
  // Lo que la sección siguiente se adelanta a que termine la anterior.
  overlap: 0.15,
  outroHold: 1.4,
};

/**
 * Tramos del vídeo. Cada sección empieza a entrar justo antes de que la
 * anterior acabe de salir (`overlap`): si esperase a que terminase habría un
 * instante con la pantalla vacía, y con un solape largo se leían las dos a la
 * vez, una encima de otra.
 */
export function storyTimeline(sceneIds, timing = STORY_TIMING) {
  const scenes = [];
  let cursor = timing.coverHold + timing.crossfade * 0.5;
  for (const id of sceneIds) {
    scenes.push({ id, start: cursor, end: cursor + timing.scene });
    cursor += timing.scene - timing.overlap;
  }
  if (scenes.length) cursor = scenes[scenes.length - 1].end;
  const storyEnd = scenes.length ? cursor : timing.coverHold;
  const outroStart = scenes.length ? storyEnd - timing.exit * 0.5 : timing.coverHold;
  const duration = scenes.length ? outroStart + timing.crossfade + timing.outroHold : timing.coverHold;
  return { scenes, storyStart: timing.coverHold, outroStart, duration, timing };
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * Qué pintar en el instante `t` (segundos). Todo son opacidades, escalas y
 * desplazamientos verticales en px de la imagen.
 */
export function storyFrame(timeline, t) {
  const { timing, scenes, storyStart, outroStart, duration } = timeline;

  // Portada: acercamiento lento mientras está; fundido de salida y de vuelta.
  const fadeOut = clamp01((t - storyStart) / timing.crossfade);
  const fadeBack = scenes.length ? clamp01((t - outroStart) / timing.crossfade) : 0;
  const coverAlpha = scenes.length ? Math.max(1 - easeInOut(fadeOut), easeInOut(fadeBack)) : 1;
  const coverScale =
    t < outroStart || !scenes.length
      ? 1 + 0.045 * easeOutCubic(clamp01(t / (storyStart + timing.crossfade)))
      : 1 + 0.03 * (1 - easeOutCubic(clamp01((t - outroStart) / (duration - outroStart))));

  // Fondo de las secciones: se aleja muy despacio todo el rato que se ve.
  const storySpan = Math.max(0.001, outroStart + timing.crossfade - storyStart);
  const backdropScale = 1.08 - 0.06 * clamp01((t - storyStart) / storySpan);
  const storyAlpha = scenes.length ? Math.min(easeInOut(fadeOut), 1 - easeInOut(fadeBack)) : 0;

  const layers = scenes.map((scene) => {
    const enter = clamp01((t - scene.start) / timing.enter);
    const exit = clamp01((t - (scene.end - timing.exit)) / timing.exit);
    const visible = t >= scene.start && t < scene.end;
    return {
      id: scene.id,
      alpha: visible ? easeOutCubic(enter) * (1 - easeInCubic(exit)) : 0,
      offsetY: visible ? 80 * (1 - easeOutCubic(enter)) - 60 * easeInCubic(exit) : 0,
    };
  });

  return {
    cover: { alpha: coverAlpha, scale: coverScale },
    backdrop: { alpha: storyAlpha, scale: backdropScale },
    header: { alpha: storyAlpha },
    scenes: layers,
  };
}

/** Número de fotogramas del vídeo. */
export function storyFrameCount(timeline, fps = STORY_FPS) {
  return Math.round(timeline.duration * fps);
}
