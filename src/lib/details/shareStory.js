// Modelo del VÍDEO compartible de una ficha (formato historia, 1080×1920).
//
// El vídeo empieza con la imagen compartible (la portada con botones y
// puntuaciones) y después enseña, sección a sección, lo que la imagen no cabe:
// visionados, puntuación, la reseña del usuario y los detalles del título.
//
// Reparto del trabajo:
//   - el cliente arma el payload con `buildShareStoryPayload`;
//   - /api/share/details-story lo valida con `sanitizeShareStory` y pinta cada
//     capa (fondo, cabecera y una capa transparente por sección);
//   - el cliente compone las capas fotograma a fotograma siguiendo
//     `storyTimeline` / `storyFrame` y codifica el MP4.
// Toda la coreografía vive aquí, sin DOM, para poder probarla.

export const STORY_FPS = 30;
export const STORY_SCENES = ["plays", "rating", "review", "details"];

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

// ------------------------------------------------------------------ cliente

function historyDates(history) {
  const dates = (Array.isArray(history) ? history : [])
    .map((entry) => isoDate(entry?.watched_at ?? entry?.watchedAt ?? entry?.watchedAtIso ?? null))
    .filter(Boolean);
  return [...new Set(dates)].sort((a, b) => (a < b ? 1 : -1));
}

/**
 * Payload desde el estado de la ficha.
 *
 * `review` solo se incluye si el usuario lo pide en la hoja de compartir (es un
 * texto suyo que se va a publicar) y nunca si está marcada como spoiler.
 */
export function buildShareStoryPayload({
  type,
  watched,
  plays,
  history,
  lastWatchedAt,
  tvProgress,
  review,
  includeReview = false,
  details,
}) {
  const isTv = type === "tv";
  const dates = historyDates(history);
  const last = isoDate(lastWatchedAt) || dates[0] || null;

  let playsData = null;
  if (isTv && tvProgress?.percent > 0) {
    playsData = {
      percent: tvProgress.percent,
      watched: tvProgress.watched,
      total: tvProgress.total,
      last,
    };
  } else if (!isTv && watched) {
    playsData = {
      count: Math.max(Number(plays) || 0, dates.length, 1),
      dates: dates.slice(0, 4),
      last,
    };
  }

  const reviewText = text(review?.comment ?? review?.text, 2000);
  const reviewData =
    includeReview && reviewText && !review?.spoiler
      ? { text: reviewText, date: isoDate(review?.created_at ?? review?.date ?? null) }
      : null;

  return {
    plays: playsData,
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

  let playsData = null;
  if (plays) {
    const percent = finite(plays.percent, 0, 100);
    const count = finite(plays.count, 0, 9999);
    if (percent != null && percent > 0) {
      playsData = {
        percent: Math.round(percent),
        watched: Math.round(finite(plays.watched, 0, 100_000) ?? 0),
        total: Math.round(finite(plays.total, 0, 100_000) ?? 0),
        last: isoDate(plays.last),
      };
    } else if (count != null && count > 0) {
      playsData = {
        count: Math.round(count),
        dates: (Array.isArray(plays.dates) ? plays.dates : []).map(isoDate).filter(Boolean).slice(0, 4),
        last: isoDate(plays.last),
      };
    }
  }

  const reviewText = review ? truncateText(review.text, 340) : "";
  const year = finite(details?.year, 1870, 2200);
  const runtime = finite(details?.runtime, 1, 2000);
  const seasons = finite(details?.seasons, 1, 500);
  const episodes = finite(details?.episodes, 1, 100_000);

  return {
    plays: playsData,
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
        }
      : null,
  };
}

/**
 * Secciones que tienen algo que enseñar, en orden. La puntuación sale con nota
 * propia o, si no la hay, con alguna puntuación pública; sin datos, se omite en
 * vez de pintarse vacía.
 */
export function storySceneIds(card, story) {
  const hasScores = Object.values(card?.scores || {}).some(Boolean);
  const hasDetails =
    !!story?.details &&
    !!(
      story.details.year ||
      story.details.runtime ||
      story.details.seasons ||
      story.details.genres?.length ||
      story.details.people?.length ||
      story.details.overview
    );
  return STORY_SCENES.filter((id) => {
    if (id === "plays") return !!story?.plays;
    if (id === "rating") return card?.actions?.rating != null || hasScores;
    if (id === "review") return !!story?.review;
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
