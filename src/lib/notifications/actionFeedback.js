// Reglas PURAS de los avisos de acción: qué petición de la web merece una
// ventana emergente y con qué texto ("Añadida a Favoritas", "Has puntuado…").
//
// Se aplican a las peticiones de escritura a /api/* que terminan bien (ver
// installActionFeedback en actionFeedbackClient.js), así que cualquier botón
// nuevo que use estas rutas avisa sin tener que acordarse de hacerlo.
//
// Devuelven un descriptor:
//   { key, icon, label, text, tmdbId?, mediaType?, season?, episode?,
//     title?, posterPath?, url? }
// o null si la petición no es una acción que se avise (login, sondeos, etc.).

function parseBody(body) {
  if (body == null) return {};
  if (typeof body === "object" && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
    // URLSearchParams / FormData no traen lo que se necesita aquí.
    return typeof body.get === "function" ? {} : body;
  }
  if (typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mediaTypeOf(value) {
  if (value === "show" || value === "tv" || value === "season" || value === "episode") return "tv";
  if (value === "movie") return "movie";
  return null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function episodeLabel(season, episode) {
  if (season == null) return null;
  if (episode == null) return `Temporada ${season}`;
  return `S${pad(season)}E${pad(episode)}`;
}

function titleRef(body, { tmdbId, mediaType, season = null, episode = null } = {}) {
  const id = num(tmdbId);
  if (!id || id <= 0 || !mediaType) return {};
  return {
    tmdbId: id,
    mediaType,
    season: season == null ? null : num(season),
    episode: episode == null ? null : num(episode),
    title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null,
    posterPath: typeof body?.posterPath === "string" && body.posterPath.startsWith("/") ? body.posterPath : null,
  };
}

function ratingText(rating) {
  const value = num(rating);
  return value == null || value <= 0 ? null : `${Number.isInteger(value) ? value : value.toFixed(1)}/10`;
}

// Cada regla: [método, patrón de ruta, (match, body, search) => descriptor|null].
const RULES = [
  // ── Favoritas y pendientes ──────────────────────────────────────────────
  ["POST", /^\/api\/tmdb\/account\/favorite$/, (_, b) => {
    const ref = titleRef(b, { tmdbId: b.mediaId, mediaType: mediaTypeOf(b.mediaType) });
    return b.favorite === false
      ? { icon: "unfavorite", label: "Favoritas", text: "Quitada de Favoritas", ...ref }
      : { icon: "favorite", label: "Favoritas", text: "Añadida a Favoritas", ...ref };
  }],
  ["POST", /^\/api\/tmdb\/account\/watchlist$/, (_, b) => {
    const ref = titleRef(b, { tmdbId: b.mediaId, mediaType: mediaTypeOf(b.mediaType) });
    return b.watchlist === false
      ? { icon: "unwatchlist", label: "Pendientes", text: "Quitada de Pendientes", ...ref }
      : { icon: "watchlist", label: "Pendientes", text: "Añadida a Pendientes", ...ref };
  }],

  // ── Notas ───────────────────────────────────────────────────────────────
  ["POST", /^\/api\/trakt\/item\/rating$/, (_, b) => rating(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.type) })],
  ["POST", /^\/api\/trakt\/ratings$/, (_, b) => rating(b, {
    tmdbId: b.showTmdbId ?? b.showId ?? b.tvId ?? b.tmdbId ?? b.ids?.tmdb,
    mediaType: mediaTypeOf(b.type) || (b.season != null || b.seasonNumber != null ? "tv" : null),
    season: b.season ?? b.seasonNumber ?? null,
    episode: b.episode ?? b.episodeNumber ?? null,
  })],
  ["POST", /^\/api\/tmdb\/ratings$/, (_, b) => rating(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.mediaType) })],
  ["DELETE", /^\/api\/tmdb\/ratings$/, (_, b, s) => ({
    icon: "unrate", label: "Nota", text: "Nota quitada",
    ...titleRef(b, { tmdbId: b.tmdbId ?? s.get("tmdbId"), mediaType: mediaTypeOf(b.mediaType ?? s.get("mediaType")) }),
  })],
  ["POST", /^\/api\/tmdb\/movies\/(\d+)\/rating$/, (m, b) => rating({ ...b, rating: b.value }, { tmdbId: m[1], mediaType: "movie" })],
  ["DELETE", /^\/api\/tmdb\/movies\/(\d+)\/rating$/, (m) => ({
    icon: "unrate", label: "Nota", text: "Nota quitada", ...titleRef({}, { tmdbId: m[1], mediaType: "movie" }),
  })],

  // ── Vistos ──────────────────────────────────────────────────────────────
  ["POST", /^\/api\/trakt\/item\/watched$/, (_, b) => watched(b, b.watched !== false, {
    tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.type),
  }, b.type === "show" ? "Serie marcada como vista" : null)],
  ["POST", /^\/api\/trakt\/episode\/watched$/, (_, b) => watched(b, b.watched !== false, {
    tmdbId: b.tmdbId, mediaType: "tv", season: b.season, episode: b.episode,
  })],
  ["POST", /^\/api\/trakt\/show\/(\d+)\/episode$/, (m, b) => watched(b, b.watched !== false, {
    tmdbId: m[1], mediaType: "tv", season: b.season, episode: b.episode,
  })],
  ["POST", /^\/api\/trakt\/season\/watched$/, (_, b) => watched(b, b.watched !== false, {
    tmdbId: b.tmdbId, mediaType: "tv", season: b.season,
  })],
  ["POST", /^\/api\/trakt\/episode\/play$/, (_, b) => ({
    icon: "watched", label: "Visto", text: `Nuevo visionado de ${episodeLabel(num(b.season), num(b.episode)) || "este episodio"}`,
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: "tv", season: b.season, episode: b.episode }),
  })],
  ["POST", /^\/api\/trakt\/show\/plays$/, (_, b) => ({
    icon: "watched", label: "Visto", text: "Serie completa registrada",
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: "tv" }),
  })],
  ["POST", /^\/api\/trakt\/history\/show$/, (_, b) => ({
    icon: "watched", label: "Visto",
    text: Array.isArray(b.seasonNumbers) && b.seasonNumbers.length === 1
      ? `Temporada ${b.seasonNumbers[0]} marcada como vista`
      : "Temporadas marcadas como vistas",
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: "tv" }),
  })],
  ["POST", /^\/api\/trakt\/item\/history\/add$/, (_, b) => watched(b, true, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.type) })],
  ["POST", /^\/api\/trakt\/item\/history$/, (_, b) => {
    const ref = titleRef(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.type) });
    if (b.op === "remove") return { icon: "unwatched", label: "Historial", text: "Visionado eliminado del historial", ...ref };
    if (b.op === "update") return { icon: "history", label: "Historial", text: "Fecha de visionado actualizada", ...ref };
    return { icon: "watched", label: "Visto", text: "Visionado añadido", ...ref };
  }],
  ["POST", /^\/api\/trakt\/item\/history\/update$/, (_, b) => ({
    icon: "history", label: "Historial", text: "Fecha de visionado actualizada",
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.type) }),
  })],
  ["POST", /^\/api\/trakt\/(item\/)?history\/remove$/, () => ({
    icon: "unwatched", label: "Historial", text: "Visionado eliminado del historial",
  })],

  // ── Continuar viendo y recomendaciones ──────────────────────────────────
  ["DELETE", /^\/api\/progress$/, () => ({ icon: "progress", label: "Continuar viendo", text: "Quitado de Continuar viendo" })],
  ["POST", /^\/api\/recommendations\/dismiss$/, (_, b) => ({
    icon: "dismiss", label: "Recomendaciones", text: "No te lo volveremos a recomendar",
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.mediaType) }),
  })],
  ["DELETE", /^\/api\/recommendations\/dismiss\/(movie|tv)\/(\d+)$/, (m) => ({
    icon: "recommend", label: "Recomendaciones", text: "Vuelve a tus recomendaciones",
    ...titleRef({}, { tmdbId: m[2], mediaType: m[1] }),
  })],

  // ── Listas ──────────────────────────────────────────────────────────────
  ["POST", /^\/api\/lists$/, (_, b) => ({
    icon: "list", label: "Listas", text: b.name ? `Lista «${b.name}» creada` : "Lista creada",
  })],
  ["PATCH", /^\/api\/lists\/[^/]+$/, () => ({ icon: "list", label: "Listas", text: "Lista actualizada" })],
  ["DELETE", /^\/api\/lists\/[^/]+$/, () => ({ icon: "listRemove", label: "Listas", text: "Lista eliminada" })],
  ["POST", /^\/api\/lists\/[^/]+\/items$/, (_, b) => ({
    icon: "list", label: "Listas", text: "Añadida a la lista",
    ...titleRef(b, { tmdbId: b.tmdbId, mediaType: mediaTypeOf(b.mediaType) }),
  })],
  ["DELETE", /^\/api\/lists\/[^/]+\/items$/, () => ({ icon: "listRemove", label: "Listas", text: "Lista vaciada" })],
  ["DELETE", /^\/api\/lists\/[^/]+\/items\/(\d+)\/(movie|tv)$/, (m) => ({
    icon: "listRemove", label: "Listas", text: "Quitada de la lista", ...titleRef({}, { tmdbId: m[1], mediaType: m[2] }),
  })],

  // ── Comunidad ───────────────────────────────────────────────────────────
  ["POST", /^\/api\/community\/(movie|tv)\/(\d+)\/comments$/, (m) => ({
    icon: "review", label: "Reseñas", text: "Reseña publicada", ...titleRef({}, { tmdbId: m[2], mediaType: m[1] }),
  })],
  ["PATCH", /^\/api\/community\/(movie|tv)\/(\d+)\/comments$/, (m) => ({
    icon: "review", label: "Reseñas", text: "Reseña actualizada", ...titleRef({}, { tmdbId: m[2], mediaType: m[1] }),
  })],
  ["DELETE", /^\/api\/community\/(movie|tv)\/(\d+)\/comments$/, (m) => ({
    icon: "reviewRemove", label: "Reseñas", text: "Reseña eliminada", ...titleRef({}, { tmdbId: m[2], mediaType: m[1] }),
  })],
  ["POST", /^\/api\/community\/(movie|tv)\/(\d+)\/comments\/[^/]+\/like$/, () => ({ icon: "like", label: "Comunidad", text: "Te gusta esta reseña" })],
  ["DELETE", /^\/api\/community\/(movie|tv)\/(\d+)\/comments\/[^/]+\/like$/, () => ({ icon: "unlike", label: "Comunidad", text: "Ya no te gusta esta reseña" })],
  ["POST", /^\/api\/community\/lists\/[^/]+\/like$/, () => ({ icon: "like", label: "Comunidad", text: "Te gusta esta lista" })],
  ["DELETE", /^\/api\/community\/lists\/[^/]+\/like$/, () => ({ icon: "unlike", label: "Comunidad", text: "Ya no te gusta esta lista" })],
  ["POST", /^\/api\/users\/([^/]+)\/follow$/, (m) => ({ icon: "follow", label: "Social", text: `Ahora sigues a @${decodeURIComponent(m[1])}` })],
  ["DELETE", /^\/api\/users\/([^/]+)\/follow$/, (m) => ({ icon: "unfollow", label: "Social", text: `Has dejado de seguir a @${decodeURIComponent(m[1])}` })],

  // ── Perfil y ajustes ────────────────────────────────────────────────────
  ["PUT", /^\/api\/users\/me\/profile-favorites$/, () => ({ icon: "profile", label: "Perfil", text: "Destacados del perfil guardados" })],
  ["PATCH", /^\/api\/auth\/me$/, () => ({ icon: "profile", label: "Perfil", text: "Perfil actualizado" })],
  ["PATCH", /^\/api\/user\/preferences$/, () => ({ icon: "settings", label: "Ajustes", text: "Preferencias guardadas" })],
  ["PUT", /^\/api\/auth\/account\/password$/, () => ({ icon: "security", label: "Cuenta", text: "Contraseña actualizada" })],
  ["POST", /^\/api\/auth\/account\/email\/change-request$/, () => ({ icon: "security", label: "Cuenta", text: "Te hemos enviado un correo para confirmar el cambio" })],
  ["POST", /^\/api\/auth\/account\/email\/confirm$/, () => ({ icon: "security", label: "Cuenta", text: "Correo actualizado" })],
  ["POST", /^\/api\/artwork$/, () => ({ icon: "artwork", label: "Imágenes", text: "Imagen actualizada" })],

  // ── Conexiones e importaciones ──────────────────────────────────────────
  ["POST", /^\/api\/netflix\/connect$/, () => ({ icon: "connect", label: "Conexiones", text: "Netflix conectado" })],
  ["POST", /^\/api\/netflix\/disconnect$/, () => ({ icon: "disconnect", label: "Conexiones", text: "Netflix desconectado" })],
  ["POST", /^\/api\/netflix\/pair-mobile$/, () => ({ icon: "connect", label: "Conexiones", text: "Código de emparejamiento creado" })],
  ["POST", /^\/api\/plex\/auth\/session$/, () => ({ icon: "connect", label: "Conexiones", text: "Plex conectado" })],
  ["POST", /^\/api\/plex\/auth\/disconnect$/, () => ({ icon: "disconnect", label: "Conexiones", text: "Plex desconectado" })],
  ["POST", /^\/api\/spotify\/auth\/disconnect$/, () => ({ icon: "disconnect", label: "Conexiones", text: "Spotify desconectado" })],
  ["POST", /^\/api\/trakt\/auth\/disconnect$/, () => ({ icon: "disconnect", label: "Conexiones", text: "Trakt desconectado" })],
  ["POST", /^\/api\/(trakt|tmdb)\/import\/start$/, (m) => ({
    icon: "import", label: "Importación", text: `Importación de ${m[1] === "trakt" ? "Trakt" : "TMDb"} en marcha`,
  })],
  ["POST", /^\/api\/netflix\/(import|extension-import)$/, () => ({ icon: "import", label: "Importación", text: "Historial de Netflix importado" })],
  ["POST", /^\/api\/plex\/sync$/, () => ({ icon: "import", label: "Plex", text: "Plex sincronizado" })],
];

function rating(body, ref) {
  const value = ratingText(body.rating);
  const target = episodeLabel(num(ref.season), num(ref.episode));
  if (!value) {
    return { icon: "unrate", label: "Nota", text: target ? `Nota de ${target} quitada` : "Nota quitada", ...titleRef(body, ref) };
  }
  return {
    icon: "rate", label: "Nota",
    text: target ? `Has puntuado ${target} con un ${value}` : `Has puntuado con un ${value}`,
    ...titleRef(body, ref),
  };
}

function watched(body, isWatched, ref, showText = null) {
  const target = episodeLabel(num(ref.season), num(ref.episode));
  // "Temporada 2" es femenino; "S01E03" (episodio) y el título, masculino.
  const isSeason = ref.season != null && ref.episode == null;
  const done = isSeason ? "marcada como vista" : "marcado como visto";
  const undone = isSeason ? "marcada como no vista" : "marcado como no visto";
  if (!isWatched) {
    return {
      icon: "unwatched", label: "Visto",
      text: target ? `${target} ${undone}` : "Marcado como no visto",
      ...titleRef(body, ref),
    };
  }
  return {
    icon: "watched", label: "Visto",
    text: showText || (target ? `${target} ${done}` : "Marcado como visto"),
    ...titleRef(body, ref),
  };
}

/**
 * Aviso para una petición de escritura que ha terminado bien, o null.
 * @param {{ method: string, url: string, body?: unknown, origin?: string }} request
 */
export function describeAction({ method, url, body, origin = "http://localhost" } = {}) {
  const verb = String(method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") return null;
  let parsed;
  try {
    parsed = new URL(String(url || ""), origin);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(origin).origin || !parsed.pathname.startsWith("/api/")) return null;

  const path = parsed.pathname.replace(/\/+$/, "");
  const data = parseBody(body);
  for (const [ruleMethod, pattern, build] of RULES) {
    if (ruleMethod !== verb) continue;
    const match = path.match(pattern);
    if (!match) continue;
    const descriptor = build(match, data, parsed.searchParams);
    if (!descriptor) return null;
    return {
      ...descriptor,
      // Mismo título y mismo tipo de acción: el aviso nuevo sustituye al
      // anterior (marcar una temporada dispara varias peticiones seguidas).
      key: `action:${descriptor.label}:${descriptor.mediaType || ""}:${descriptor.tmdbId || path}`,
    };
  }
  return null;
}

/**
 * Tipo de la actividad del backend (`watched`, `rating`, `favorite`,
 * `watchlist`) que produce este aviso, para no repetirlo cuando luego llegue
 * por la campana. Null si no tiene equivalente.
 */
export function activityTypeOf(descriptor) {
  switch (descriptor?.icon) {
    case "watched":
      return "watched";
    case "rate":
      return "rating";
    case "favorite":
      return "favorite";
    case "watchlist":
      return "watchlist";
    default:
      return null;
  }
}
