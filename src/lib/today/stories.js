// src/lib/today/stories.js
//
// PÁGINA HOY: del listado plano de acciones que entrega /api/users/today
// (visto · nota · reseña) a todo lo que pinta la página. Es la misma división
// que hace Trakt en su cliente (trakt-lite, sections/today): el servidor no
// agrupa nada y aquí se arman las historias por título, la historia destacada,
// los destacados, la agrupación por persona o por franja horaria y el ranking
// de los más activos. Cambiar de agrupación o de pestaña no vuelve a pedir nada.
//
// Todo es puro (tests en stories.test.mjs).

// Fuerza de los hitos de episodio: un final de serie pesa más que un estreno de
// temporada. La historia destacada y la fusión de maratones se quedan con el
// más fuerte.
export const MILESTONE_RANK = {
  season_premiere: 1,
  season_finale: 2,
  series_premiere: 3,
  series_finale: 4,
};

export const MILESTONE_LABELS = {
  season_premiere: "Estreno de temporada",
  season_finale: "Final de temporada",
  series_premiere: "Estreno de la serie",
  series_finale: "Final de la serie",
};

export const MOST_ACTIVE_MAX = 5;
export const HIGHLIGHTS_MAX = 2;

const time = (value) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function strongerMilestone(a, b) {
  return (MILESTONE_RANK[b] || 0) > (MILESTONE_RANK[a] || 0) ? b : a || null;
}

export function mediaKey(media) {
  return media ? `${media.type}:${media.tmdbId}` : "";
}

const byLatest = (a, b) => time(b.activityAt ?? b.latestAt) - time(a.activityAt ?? a.latestAt);

/**
 * Maratones: los episodios que una persona ha visto de la misma serie en la
 * ventana se funden en una sola acción (la más reciente) con `episodeCount`, y
 * conserva el hito más fuerte. Igual con dos visionados de la misma película.
 */
export function mergeWatches(actions) {
  const out = [];
  const merged = new Map();
  for (const action of [...actions].sort(byLatest)) {
    if (action.kind !== "watch") {
      out.push(action);
      continue;
    }
    const key = `${action.user?.id}|${mediaKey(action.media)}`;
    const earlier = merged.get(key);
    if (!earlier) {
      const first = { ...action, episodeCount: action.target === "episode" ? 1 : 0 };
      merged.set(key, first);
      out.push(first);
      continue;
    }
    earlier.episodeCount += action.target === "episode" ? 1 : 0;
    earlier.milestone = strongerMilestone(earlier.milestone, action.milestone);
  }
  return out;
}

/**
 * La nota de un episodio que acaba de ver la misma persona se pega a su
 * visionado (una tarjeta, no dos). Si el visionado es una maratón, la nota se
 * queda suelta: no se sabría a qué episodio corresponde.
 */
export function mergeRatings(actions) {
  const watches = new Map();
  for (const action of actions) {
    if (action.kind === "watch" && action.target === "episode" && action.episodeCount === 1) {
      watches.set(`${action.user?.id}|${mediaKey(action.media)}|${action.season}|${action.episode}`, action);
    }
  }
  return actions.filter((action) => {
    if (action.kind !== "rating" || action.target !== "episode") return true;
    const watch = watches.get(`${action.user?.id}|${mediaKey(action.media)}|${action.season}|${action.episode}`);
    if (!watch) return true;
    watch.rating = action.rating;
    return false;
  });
}

/** Acciones listas para pintar: maratones fundidas y notas pegadas. */
export function prepareActions(actions) {
  return mergeRatings(mergeWatches(Array.isArray(actions) ? actions : []));
}

function uniqueUsers(actions) {
  const users = new Map();
  for (const action of actions) {
    if (action.user?.id && !users.has(action.user.id)) users.set(action.user.id, action.user);
  }
  return [...users.values()];
}

// Media de las notas del título entero (película o serie), una por persona:
// la más reciente. Las de episodios o temporadas no dicen qué opinan de la obra.
function averageRating(actions) {
  const latest = new Map();
  for (const action of [...actions].sort(byLatest)) {
    if (action.kind !== "rating" || !["movie", "show"].includes(action.target)) continue;
    if (!latest.has(action.user?.id)) latest.set(action.user?.id, Number(action.rating));
  }
  const values = [...latest.values()].filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** Una historia por título, de la más reciente a la más antigua. */
export function toTitleStories(prepared) {
  const groups = new Map();
  for (const action of prepared) {
    const key = mediaKey(action.media);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  return [...groups.entries()]
    .map(([key, actions]) => {
      const sorted = actions.sort(byLatest);
      return {
        key,
        media: sorted[0].media,
        actions: sorted,
        users: uniqueUsers(sorted),
        averageRating: averageRating(sorted),
        milestone: sorted.reduce((best, a) => strongerMilestone(best, a.milestone), null),
        latestAt: sorted[0].activityAt,
      };
    })
    .sort(byLatest);
}

/**
 * Historia destacada: la más reciente con un hito (un final, un estreno); si no
 * hay, la que ha juntado a más gente.
 */
export function pickHeroStory(stories) {
  if (!stories?.length) return null;
  const milestone = stories.find((story) => story.milestone);
  if (milestone) return milestone;
  return [...stories].sort((a, b) => b.users.length - a.users.length || byLatest(a, b))[0];
}

/**
 * Destacados de la columna lateral: la primera reseña sin spoiler y la primera
 * nota de una película o serie entera, fuera del título destacado (ya se ve
 * arriba).
 */
export function toHighlights(stories, hero) {
  const actions = stories
    .filter((story) => story.key !== hero?.key)
    .flatMap((story) => story.actions)
    .sort(byLatest);
  const comment = actions.find((a) => a.kind === "comment" && a.comment?.body?.trim() && !a.comment.spoiler);
  const rating = actions.find((a) => a.kind === "rating" && ["movie", "show"].includes(a.target));
  return [comment, rating].filter(Boolean).slice(0, HIGHLIGHTS_MAX);
}

/** Una tarjeta por persona, con todo lo suyo de la ventana. */
export function toPersonGroups(prepared) {
  const groups = new Map();
  for (const action of prepared) {
    const id = action.user?.id;
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, { key: id, user: action.user, actions: [] });
    groups.get(id).actions.push(action);
  }
  return [...groups.values()]
    .map((group) => {
      const actions = group.actions.sort(byLatest);
      return {
        ...group,
        actions,
        titles: new Set(actions.map((a) => mediaKey(a.media))).size,
        latestAt: actions[0].activityAt,
      };
    })
    .sort(byLatest);
}

/**
 * Los más activos: por número de acciones (con las maratones ya fundidas, así
 * que ver 12 episodios seguidos cuenta como una), y la barra de cada uno en
 * proporción al primero.
 */
export function toMostActive(groups, max = MOST_ACTIVE_MAX) {
  const ranked = [...groups]
    .sort((a, b) => b.actions.length - a.actions.length || byLatest(a, b))
    .slice(0, max);
  const leader = ranked[0]?.actions.length || 1;
  return ranked.map((group, index) => ({
    ...group,
    rank: index + 1,
    count: group.actions.length,
    share: group.actions.length / leader,
  }));
}

// Franjas de la línea temporal. La madrugada (23–5) cierra el día.
export const DAY_PARTS = [
  { key: "morning", label: "Mañana", from: 5, to: 12 },
  { key: "afternoon", label: "Tarde", from: 12, to: 18 },
  { key: "evening", label: "Noche", from: 18, to: 23 },
  { key: "night", label: "Madrugada", from: 23, to: 29 },
];

const hourFormatters = new Map();
function localParts(value, tz) {
  const key = tz || "local";
  if (!hourFormatters.has(key)) {
    hourFormatters.set(key, new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || undefined,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }));
  }
  const parts = {};
  for (const part of hourFormatters.get(key).formatToParts(new Date(value))) parts[part.type] = part.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * Franja horaria de un instante. La madrugada se cuenta como el final del día
 * anterior: las 2:00 del sábado siguen siendo "la noche del viernes".
 */
export function dayPartOf(value, tz) {
  const { day, hour } = localParts(value, tz);
  if (hour < 5) return { day: addDays(day, -1), part: DAY_PARTS[3] };
  return { day, part: DAY_PARTS.find((p) => hour >= p.from && hour < p.to) || DAY_PARTS[3] };
}

/**
 * Línea temporal: secciones por franja (y por día si la ventana abarca varios),
 * de la más reciente a la más antigua.
 */
export function toFeedSections(prepared, tz) {
  const sections = new Map();
  for (const action of [...prepared].sort(byLatest)) {
    const { day, part } = dayPartOf(action.activityAt, tz);
    const key = `${day}|${part.key}`;
    if (!sections.has(key)) sections.set(key, { key, day, part: part.key, label: part.label, actions: [] });
    sections.get(key).actions.push(action);
  }
  const list = [...sections.values()];
  const multipleDays = new Set(list.map((s) => s.day)).size > 1;
  return list.map((section) => ({ ...section, showDay: multipleDays }));
}

/**
 * Historias del reproductor a pantalla completa: un grupo por título con un
 * fotograma de resumen (si lo han tocado dos o más personas) y uno por acción.
 * Lo de «Para ti» abre la secuencia en un grupo propio.
 */
export function toStoryGroups(stories, forYou = []) {
  const groups = [];
  if (forYou?.length) {
    groups.push({
      key: "for-you",
      kind: "for-you",
      media: forYou[0].media,
      frames: forYou.map((item) => ({ key: item.key, type: "for-you", item, media: item.media })),
    });
  }
  for (const story of stories) {
    const frames = [];
    if (story.users.length >= 2) {
      frames.push({ key: `summary:${story.key}`, type: "summary", story, media: story.media });
    }
    for (const action of story.actions) {
      frames.push({ key: `friend:${action.key}`, type: "friend", action, media: story.media });
    }
    groups.push({ key: story.key, kind: "title", media: story.media, story, frames });
  }
  return groups;
}

/** «N actividades de M personas» de la cabecera. */
export function summarize(actions) {
  const list = Array.isArray(actions) ? actions : [];
  return {
    actions: list.length,
    people: new Set(list.map((a) => a.user?.id).filter(Boolean)).size,
  };
}

/** Pocas cosas hoy: la página propone mirar ayer. */
export function isQuietDay(day, count) {
  return day === "today" && count > 0 && count <= 3;
}
