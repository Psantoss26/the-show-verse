// Vista previa de un título al compartir su enlace (WhatsApp, Telegram, iMessage,
// Discord…). Estos clientes no ejecutan la web: leen las etiquetas Open Graph del
// HTML y montan la tarjeta con una imagen, un título y una descripción.
//
// Lo usan dos sitios, con la misma información:
//   - generateMetadata de cada ficha (película, serie, temporada y episodio), para
//     cualquier cliente que lea la página real;
//   - las rutas /s/*, un HTML mínimo que el middleware sirve a los rastreadores
//     conocidos (no cargan la aplicación entera y también pasan el acceso privado).

import { pickBestBackdropByLangResVotes } from "../details/tmdbImages.js";
import { TMDB_IMAGE_LANGS_PARAM } from "../tmdb/imageLanguages.js";

export const SHARE_SITE_NAME = "The Show Verse";

// w780 (780×439): suficiente para la tarjeta grande de WhatsApp (pide ≥300 px de
// ancho y formato apaisado) y muy por debajo del peso a partir del cual algunos
// clientes dejan de mostrar la imagen. Con w1280 un backdrop con texto rozaba ese
// límite.
const SHARE_IMAGE_SIZE = "w780";
const SHARE_IMAGE_WIDTH = 780;
const SHARE_IMAGE_HEIGHT = 439;
const DESCRIPTION_MAX = 200;

const norm = (value) => (value ? String(value).toLowerCase().split("-")[0] : null);

/**
 * Backdrop para la tarjeta. Se prefiere uno CON IDIOMA (lleva el título impreso,
 * así la imagen se reconoce sola en un chat), con la misma escalera que el resto
 * del arte de la app: inglés → español → sin texto → backdrop por defecto.
 */
export function pickShareBackdrop(backdrops, fallbackPath = null) {
  const list = Array.isArray(backdrops) ? backdrops.filter((img) => img?.file_path) : [];
  for (const lang of ["en", "es"]) {
    const pool = list.filter((img) => norm(img.iso_639_1) === lang);
    const best = pool.length
      ? pickBestBackdropByLangResVotes(pool, { preferLangs: [lang], minWidth: SHARE_IMAGE_WIDTH })
      : null;
    if (best?.file_path) return { path: best.file_path, lang };
  }
  const textless = list.filter((img) => !norm(img.iso_639_1));
  const neutral = textless.length
    ? pickBestBackdropByLangResVotes(textless, { preferLangs: [], minWidth: SHARE_IMAGE_WIDTH })
    : null;
  if (neutral?.file_path) return { path: neutral.file_path, lang: null };
  return fallbackPath ? { path: fallbackPath, lang: null } : null;
}

export function formatRuntime(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function formatDate(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(time);
}

function rating(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `★ ${n.toFixed(1).replace(".", ",")}` : "";
}

function genres(list, max = 2) {
  return (Array.isArray(list) ? list : [])
    .map((g) => g?.name)
    .filter(Boolean)
    .slice(0, max)
    .join(", ");
}

function year(date) {
  return String(date || "").slice(0, 4);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** "a · b · c. Sinopsis…", recortado para que quepa en la tarjeta. */
export function composeDescription(facts, overview) {
  const head = facts.filter(Boolean).join(" · ");
  const body = String(overview || "").replace(/\s+/g, " ").trim();
  const text = head && body ? `${head}. ${body}` : head || body;
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > DESCRIPTION_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:·-]+$/, "")}…`;
}

function imageFor(backdrops, fallbackBackdrop, fallbackPoster) {
  const picked = pickShareBackdrop(backdrops, fallbackBackdrop);
  if (picked) {
    return {
      url: `https://image.tmdb.org/t/p/${SHARE_IMAGE_SIZE}${picked.path}`,
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
      alt: "",
    };
  }
  if (fallbackPoster) {
    return { url: `https://image.tmdb.org/t/p/w500${fallbackPoster}`, width: 500, height: 750, alt: "" };
  }
  return null;
}

/**
 * Datos de la tarjeta a partir de las respuestas de TMDb (puro, para tests).
 * `show` es la serie (con `images.backdrops`) en temporadas y episodios.
 */
export function buildShareData({ kind, item, show = null, seasonNumber, episodeNumber }) {
  if (kind === "movie") {
    const title = item?.title || item?.original_title || "Película";
    const y = year(item?.release_date);
    return {
      kind,
      path: `/details/movie/${item?.id}`,
      ogType: "video.movie",
      title: y ? `${title} (${y})` : title,
      description: composeDescription(
        [rating(item?.vote_average), formatRuntime(item?.runtime), genres(item?.genres)],
        item?.overview || `Ver detalles de ${title}.`,
      ),
      image: imageFor(item?.images?.backdrops, item?.backdrop_path, item?.poster_path),
    };
  }

  if (kind === "tv") {
    const name = item?.name || item?.original_name || "Serie";
    const y = year(item?.first_air_date);
    const seasons = Number(item?.number_of_seasons) || 0;
    return {
      kind,
      path: `/details/tv/${item?.id}`,
      ogType: "video.tv_show",
      title: y ? `${name} (${y})` : name,
      description: composeDescription(
        [
          rating(item?.vote_average),
          seasons ? `${seasons} temporada${seasons === 1 ? "" : "s"}` : "",
          genres(item?.genres),
        ],
        item?.overview || `Ver detalles de ${name}.`,
      ),
      image: imageFor(item?.images?.backdrops, item?.backdrop_path, item?.poster_path),
    };
  }

  const showName = show?.name || show?.original_name || "Serie";
  const showBackdrops = show?.images?.backdrops;

  if (kind === "season") {
    const seasonName = item?.name || `Temporada ${seasonNumber}`;
    const episodes = Array.isArray(item?.episodes) ? item.episodes.length : 0;
    return {
      kind,
      path: `/details/tv/${show?.id}/season/${seasonNumber}`,
      ogType: "video.tv_show",
      title: `${showName} · ${seasonName}`,
      description: composeDescription(
        [
          rating(item?.vote_average),
          episodes ? `${episodes} episodio${episodes === 1 ? "" : "s"}` : "",
          year(item?.air_date),
        ],
        item?.overview || show?.overview || `Ver ${seasonName} de ${showName}.`,
      ),
      // La serie se reconoce por su arte con título; el póster de la temporada
      // queda como último recurso.
      image: imageFor(showBackdrops, show?.backdrop_path, item?.poster_path || show?.poster_path),
    };
  }

  // Episodio
  const episodeName = item?.name || `Episodio ${episodeNumber}`;
  const code = `T${seasonNumber}·E${pad(episodeNumber)}`;
  const image =
    imageFor(showBackdrops, show?.backdrop_path, null) ||
    (item?.still_path
      ? { url: `https://image.tmdb.org/t/p/${SHARE_IMAGE_SIZE}${item.still_path}`, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT, alt: "" }
      : imageFor(null, null, show?.poster_path));
  return {
    kind,
    path: `/details/tv/${show?.id}/season/${seasonNumber}/episode/${episodeNumber}`,
    ogType: "video.episode",
    title: `${showName} · ${code} · ${episodeName}`,
    description: composeDescription(
      [rating(item?.vote_average), formatRuntime(item?.runtime), formatDate(item?.air_date)],
      item?.overview || `Ver ${episodeName} de ${showName}.`,
    ),
    image,
  };
}

const TMDB_KEY = () => process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdb(path, { withImages = false } = {}) {
  const key = TMDB_KEY();
  if (!key) return null;
  const params = new URLSearchParams({ api_key: key, language: "es-ES" });
  let url = `https://api.themoviedb.org/3${path}?${params}`;
  if (withImages) url += `&append_to_response=images&${TMDB_IMAGE_LANGS_PARAM}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Descarga lo necesario de TMDb y devuelve la tarjeta, o null si no existe. */
export async function getShareData({ kind, id, season, episode }) {
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  if (kind === "movie" || kind === "tv") {
    const item = await tmdb(`/${kind}/${tmdbId}`, { withImages: true });
    return item ? buildShareData({ kind, item }) : null;
  }

  const seasonNumber = Number(season);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return null;

  if (kind === "season") {
    const [show, item] = await Promise.all([
      tmdb(`/tv/${tmdbId}`, { withImages: true }),
      tmdb(`/tv/${tmdbId}/season/${seasonNumber}`),
    ]);
    return show ? buildShareData({ kind, item, show, seasonNumber }) : null;
  }

  const episodeNumber = Number(episode);
  if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) return null;
  const [show, item] = await Promise.all([
    tmdb(`/tv/${tmdbId}`, { withImages: true }),
    tmdb(`/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`),
  ]);
  return show ? buildShareData({ kind: "episode", item, show, seasonNumber, episodeNumber }) : null;
}

/** Objeto `metadata` de Next (openGraph + twitter) para la página de la ficha. */
export function shareMetadata(data, fallbackTitle) {
  if (!data) return { title: fallbackTitle };
  const images = data.image ? [data.image] : [];
  return {
    title: data.title,
    description: data.description,
    openGraph: {
      type: data.ogType === "video.episode" ? "video.episode" : data.ogType === "video.movie" ? "video.movie" : "video.tv_show",
      siteName: SHARE_SITE_NAME,
      locale: "es_ES",
      title: data.title,
      description: data.description,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: data.title,
      description: data.description,
      images: images.map((img) => img.url),
    },
  };
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML mínimo para rastreadores: solo etiquetas y una redirección para la
 * persona que abra el enlace en un navegador. Una sola og:image, para que el
 * cliente no escoja otra de la página.
 */
export function renderShareHtml(data, baseUrl, fallbackPath) {
  const url = `${baseUrl}${data?.path || fallbackPath}`;
  const title = data?.title || SHARE_SITE_NAME;
  const description = data?.description || "";
  const img = data?.image;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${esc(url)}"/>
<meta property="og:site_name" content="${esc(SHARE_SITE_NAME)}"/>
<meta property="og:locale" content="es_ES"/>
<meta property="og:type" content="${esc(data?.ogType || "website")}"/>
<meta property="og:url" content="${esc(url)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
${img ? `<meta property="og:image" content="${esc(img.url)}"/>
<meta property="og:image:secure_url" content="${esc(img.url)}"/>
<meta property="og:image:type" content="image/jpeg"/>
<meta property="og:image:width" content="${img.width}"/>
<meta property="og:image:height" content="${img.height}"/>
<meta property="og:image:alt" content="${esc(title)}"/>` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
${img ? `<meta name="twitter:image" content="${esc(img.url)}"/>` : ""}
<meta http-equiv="refresh" content="0;url=${esc(url)}"/>
</head>
<body></body>
</html>`;
}
