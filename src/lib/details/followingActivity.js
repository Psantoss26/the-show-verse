// Textos de "Tus amigos" en la ficha (actividad de las cuentas que sigues con
// un título). Puro, sin React, para poder probarlo con node:test. Los datos
// vienen de backend/src/lib/followingTitleActivity.js.

const numberFormatter = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function formatScore(value) {
  return numberFormatter.format(Number(value) || 0);
}

function nameOf(item) {
  return item?.user?.displayName || item?.user?.username || "Alguien";
}

/** "Ana", "Ana y Luis", "Ana, Luis y Eva", "Ana, Luis y 3 más". */
export function joinNames(items, max = 2) {
  const names = (items || []).map(nameOf);
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  if (names.length === 3 && max >= 2) return `${names[0]}, ${names[1]} y ${names[2]}`;
  return `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
}

/**
 * Frase principal de la franja de la cabecera. Prioriza lo más útil para
 * decidir: quién la ha visto; si nadie, quién la está viendo; si no, quién la
 * tiene pendiente, y como último recurso cualquier interacción.
 */
export function summarySentence(data) {
  const items = data?.items || [];
  if (!items.length) return "";
  const watched = items.filter((item) => item.watched);
  const planned = items.filter((item) => !item.watched && item.watchlist);
  if (watched.length) {
    const watching = watched.filter((item) => item.status === "watching");
    if (watching.length === watched.length) {
      return `${joinNames(watching)} ${watching.length === 1 ? "la está viendo" : "la están viendo"}`;
    }
    return `${joinNames(watched)} ${watched.length === 1 ? "la ha visto" : "la han visto"}`;
  }
  if (planned.length) {
    return `${joinNames(planned)} ${planned.length === 1 ? "la tiene pendiente" : "la tienen pendiente"}`;
  }
  return `${joinNames(items)} ${items.length === 1 ? "se ha fijado en ella" : "se han fijado en ella"}`;
}

/** Datos secundarios de la franja (chips cortos). */
export function summaryChips(data) {
  const s = data?.summary;
  if (!s) return [];
  const chips = [];
  // "Pendiente" solo para quien aún no la ha empezado: tener en la lista algo
  // que ya estás viendo no aporta nada a la frase.
  const planned = (data.items || []).filter((item) => item.watchlist && !item.watched).length;
  // La nota va como número, sin estrella (mismo lenguaje que la actividad).
  if (s.averageRating != null) chips.push({ id: "rating", label: formatScore(s.averageRating), hint: s.rated === 1 ? "su nota" : `media de ${s.rated}` });
  if (s.watching && s.watching < s.watched) chips.push({ id: "watching", label: `${s.watching} viéndola` });
  if (planned) chips.push({ id: "watchlist", label: `${planned} la tiene${planned === 1 ? "" : "n"} pendiente` });
  if (s.reviews) chips.push({ id: "reviews", label: `${s.reviews} reseña${s.reviews === 1 ? "" : "s"}` });
  return chips;
}

/** Estado principal de una persona, con su tono. */
export function statusLabel(item, mediaType = "movie") {
  const isTv = mediaType === "tv";
  switch (item?.status) {
    case "completed":
      return { text: item.watched?.rewatching ? "La está volviendo a ver" : "Terminada", tone: "emerald" };
    case "watching":
      return { text: "Viéndola", tone: "sky" };
    case "rewatched":
      return { text: `Vista ${item.watched?.plays || 2} veces`, tone: "emerald" };
    case "watched":
      return { text: isTv ? "Vista" : "Vista", tone: "emerald" };
    case "planned":
      return { text: "En pendientes", tone: "amber" };
    case "rated":
      return { text: "Puntuada", tone: "yellow" };
    case "favorite":
      return { text: "En favoritos", tone: "rose" };
    case "reviewed":
      return { text: "Reseñada", tone: "violet" };
    default:
      return { text: "En una lista", tone: "zinc" };
  }
}

/** "T2 · E5" */
export function episodeLabel(episode) {
  if (!episode?.season || !episode?.episode) return null;
  return `T${episode.season} · E${episode.episode}`;
}

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "hace 3 días", "ayer"… o null si no hay fecha fiable. */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const seconds = Math.round((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "ahora mismo";
}

/**
 * Marcas de una persona con el título, en orden de lectura, con el mismo
 * lenguaje de iconos que la actividad del perfil. Cada una: { id, label } y,
 * la nota, `value`. Ids: rating · completed · watching · watched · watchlist ·
 * favorite · list.
 */
export function activityMarks(item, mediaType = "movie") {
  if (!item) return [];
  const marks = [];
  if (item.rating != null) marks.push({ id: "rating", value: formatScore(item.rating), label: `Su nota: ${formatScore(item.rating)}` });
  if (item.status === "completed") marks.push({ id: "completed", label: item.watched?.rewatching ? "La está volviendo a ver" : "Serie terminada" });
  else if (item.status === "watching") marks.push({ id: "watching", label: "La está viendo" });
  else if (item.watched) {
    const plays = item.watched.plays || 1;
    marks.push({ id: "watched", label: plays > 1 ? `Vista ${plays} veces` : mediaType === "tv" ? "Vista" : "Vista", count: plays > 1 ? plays : null });
  }
  if (item.watchlist && !item.watched) marks.push({ id: "watchlist", label: "En pendientes" });
  if (item.favorite) marks.push({ id: "favorite", label: "En favoritos" });
  if (item.lists?.length) marks.push({ id: "list", label: `En ${item.lists.length === 1 ? "una lista" : `${item.lists.length} listas`}` });
  return marks;
}

/**
 * La marca del avatar en la fila de estadísticas: la nota; si no hay y es una
 * serie que está viendo, "viéndola"; si no, pendiente; y si no, lo primero que
 * tenga (visto, terminada, favorito, lista).
 */
export function primaryMark(item, mediaType = "movie") {
  const marks = activityMarks(item, mediaType);
  const find = (id) => marks.find((mark) => mark.id === id);
  return (
    find("rating") ||
    (mediaType === "tv" ? find("watching") : null) ||
    find("watchlist") ||
    marks[0] ||
    null
  );
}
