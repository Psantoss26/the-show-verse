// Modelo de la IMAGEN COMPARTIBLE de una ficha (estilo "captura" de la ficha
// móvil: portada, logo, fila de acciones con sus estados y un marcador con solo
// TMDb, Trakt e IMDb).
//
// También la de una TEMPORADA (`season`): el MISMO dibujo que la ficha (póster
// a sangre, botones del mismo tamaño y en la misma posición), con una fila de
// solo las acciones con estado del usuario: serie · visto · nota. Las flechas
// de temporada anterior/siguiente y el lápiz de editar son navegación/edición
// de la página: en una imagen no significan nada.
//
// Lo usan los dos extremos:
//   - el cliente (DetailsClient) arma el payload con `buildShareCardPayload`;
//   - la ruta /api/share/details-card lo valida con `sanitizeShareCard` y pinta
//     la fila con `shareCardActionButtons`.
// La ruta la puede llamar cualquiera, así que el saneado no se fía de nada:
// textos cortos, números finitos y solo rutas de imagen de TMDb.

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

const TMDB_PATH_RE = /^\/[\w-]+\.(?:jpg|jpeg|png|svg|webp)$/i;
const PERCENT_RE = /^(\d{1,3})%$/;
const SCORE_KEYS = ["tmdb", "trakt", "imdb"];

function text(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function tmdbImagePath(value) {
  return typeof value === "string" && TMDB_PATH_RE.test(value) ? value : null;
}

function finite(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function percent(value) {
  const match = typeof value === "string" ? value.trim().match(PERCENT_RE) : null;
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 0 && number <= 100 ? `${number}%` : null;
}

function seasonData(raw) {
  if (!raw || typeof raw !== "object") return null;
  return { previous: raw.previous === true, next: raw.next === true };
}

function score(raw) {
  if (!raw || typeof raw !== "object") return null;
  const value = text(raw.value, 6);
  // Sin nota no se pinta la insignia vacía: la imagen enseña lo que hay.
  if (!value) return null;
  return { value, votes: text(raw.votes, 8) || null };
}

// Mismo formato que StarRating: 9 -> "9", 7.5 -> "7.5".
export function formatUserRating(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * Valida el cuerpo que llega a la ruta. Siempre devuelve una tarjeta pintable:
 * lo que no se reconoce se descarta en vez de fallar.
 */
export function sanitizeShareCard(body) {
  const actions = body?.actions && typeof body.actions === "object" ? body.actions : {};
  const scores = body?.scores && typeof body.scores === "object" ? body.scores : {};
  const rating = finite(actions.rating, 0, 10);
  const plays = finite(actions.plays, 0, 9999);
  const type = body?.type === "tv" ? "tv" : "movie";

  return {
    type,
    title: text(body?.title, 80),
    posterPath: tmdbImagePath(body?.posterPath),
    logoPath: tmdbImagePath(body?.logoPath),
    // Sin logo se escribe el título, salvo que la portada ya lo traiga impreso.
    showTitle: body?.showTitle !== false,
    actions: {
      trailer: actions.trailer === true,
      soundtrack: actions.soundtrack === true,
      watched: actions.watched === true,
      plays: plays == null ? 0 : Math.round(plays),
      progress: percent(actions.progress),
      rating: rating != null && rating > 0 ? rating : null,
      favorite: actions.favorite === true,
      watchlist: actions.watchlist === true,
      list: actions.list === true,
      comments: actions.comments === true,
    },
    scores: Object.fromEntries(SCORE_KEYS.map((key) => [key, score(scores[key])])),
    // Temporada: si hay temporada anterior / siguiente (sus flechas).
    season: type === "tv" ? seasonData(body?.season) : null,
  };
}

/**
 * Payload desde el estado de la ficha. Recibe los MISMOS valores que se pasan
 * a DetailActionsRow / DetailsScoreboardPanel, para que la imagen enseñe
 * exactamente los estados que se ven en pantalla.
 */
export function buildShareCardPayload({
  type,
  title,
  posterPath,
  logoPath,
  showTitle = true,
  trailerAvailable,
  soundtrackAvailable,
  trakt,
  rating,
  favorite,
  watchlist,
  listActive,
  commentsActive,
  scores,
  season = null,
}) {
  // Misma lectura que TraktWatchedControl: en series el badge es el progreso
  // ("45%"); en películas, el número de visionados.
  const badge = typeof trakt?.badge === "string" ? trakt.badge.trim() : "";
  const watched = !trakt?.loading && !!trakt?.watched;
  const isSeries = badge.includes("%");

  return {
    type,
    title,
    posterPath: posterPath || null,
    logoPath: logoPath || null,
    showTitle: !!showTitle,
    actions: {
      trailer: !!trailerAvailable,
      soundtrack: !!soundtrackAvailable,
      watched,
      plays: !isSeries && watched ? Number(trakt?.plays || 0) : 0,
      progress: isSeries && watched ? badge : null,
      rating: typeof rating === "number" ? rating : null,
      favorite: !!favorite,
      watchlist: !!watchlist,
      list: !!listActive,
      comments: !!commentsActive,
    },
    scores: Object.fromEntries(
      SCORE_KEYS.map((key) => {
        const item = scores?.[key];
        return [
          key,
          item?.value != null && item.value !== ""
            ? { value: String(item.value), votes: item.sub ? String(item.sub) : null }
            : null,
        ];
      }),
    ),
    season: season ? { previous: !!season.previous, next: !!season.next } : null,
  };
}

/**
 * Los ocho botones de la fila móvil, en el orden de DetailActionsRow:
 *   - películas: tráiler · soundtrack · visto · nota · favorito · pendiente · lista · reseñas
 *   - series (fila combinada, replegada): multimedia · valoración de episodios · …
 *   - temporadas: serie · visto · nota (ver arriba), sin flechas ni editar.
 *
 * Cada botón: { key, icon, variant, color?, label?, labelSuffix?, fill?, filledIcon? }
 *   variant "solid"    -> blanco con icono negro (acciones de reproducción)
 *   variant "active"   -> cristal teñido del color del estado, con halo
 *   variant "glass"    -> cristal neutro (estado apagado)
 *   variant "disabled" -> cristal con el icono atenuado
 */
export function shareCardActionButtons(card) {
  const a = card.actions;
  const media =
    card.type === "tv"
      ? [
          {
            key: "media",
            icon: "play",
            variant: a.trailer || a.soundtrack ? "solid" : "disabled",
          },
          { key: "episodes", icon: "chart", variant: "solid" },
        ]
      : [
          { key: "trailer", icon: "play", variant: a.trailer ? "solid" : "disabled" },
          { key: "soundtrack", icon: "music", variant: a.soundtrack ? "solid" : "disabled" },
        ];

  let watched;
  if (a.watched && a.progress === "100%") {
    watched = { icon: "eye", variant: "active", color: "green", iconColor: "emerald", fill: 100 };
  } else if (a.watched && a.progress) {
    watched = {
      variant: "active",
      color: "green",
      label: a.progress.replace("%", ""),
      labelSuffix: "%",
      fill: Number.parseInt(a.progress, 10),
    };
  } else if (a.watched && a.plays > 0) {
    watched = { variant: "active", color: "green", label: String(a.plays) };
  } else if (a.watched) {
    watched = { icon: "eye", variant: "active", color: "green" };
  } else {
    watched = { icon: "eyeOff", variant: "glass" };
  }

  const toggle = (key, icon, on, color, filledIcon = false) =>
    on
      ? { key, icon, variant: "active", color, filledIcon }
      : { key, icon, variant: "glass" };

  const rating =
    a.rating != null
      ? { key: "rating", variant: "active", color: "yellow", label: formatUserRating(a.rating) }
      : { key: "rating", icon: "star", variant: "glass" };

  if (card.season) {
    return [
      { key: "series", icon: "monitorPlay", variant: "glass" },
      { key: "watched", ...watched },
      rating,
    ];
  }

  return [
    ...media,
    { key: "watched", ...watched },
    rating,
    toggle("favorite", "heart", a.favorite, "red", true),
    toggle("watchlist", "bookmark", a.watchlist, "blue", true),
    toggle("list", "list", a.list, "purple"),
    toggle("comments", "message", a.comments, "orange"),
  ];
}

export function shareCardFileName(title, extension = "png") {
  const slug = String(title || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "titulo"}-the-show-verse.${extension}`;
}
