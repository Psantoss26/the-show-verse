// Modelo de la IMAGEN compartible de un PERFIL (formato historia, 1080×1920),
// hermano de lib/lists/shareList y lib/details/shareCard.
//
// La imagen enseña quién es (foto, nombre, @usuario y nivel), sus cifras
// (películas, series, episodios y seguidores) y sus títulos favoritos: hasta
// cinco películas y cinco series de los destacados del perfil.
//
// Reparto del trabajo, igual que en listas:
//   - la página del perfil arma el payload con `buildProfileShareCard` a partir
//     de lo que ya tiene cargado;
//   - /api/share/profile-card lo valida con `sanitizeProfileShareCard` (la ruta
//     la puede llamar cualquiera: textos cortos, números finitos, solo rutas de
//     TMDb y la foto solo por https).

import { tmdbImagePath } from "../details/shareCard.js";
import { LEVEL_TIER_VISUALS } from "../level/tiers.mjs";

// Pósters de cada fila de favoritos.
export const PROFILE_FAVORITES_ROW_MAX = 5;

function text(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 9_999_999) : 0;
}

// Foto de perfil: una URL que el usuario puede haber pegado a mano. Solo https y
// sin credenciales; la ruta, además, la descarga con sus propias protecciones
// (ver `loadAvatar`).
export function avatarHttpsUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 1000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function favorites(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: text(item?.title ?? item?.name, 80),
      posterPath: tmdbImagePath(item?.posterPath ?? item?.poster_path),
    }))
    .filter((item) => item.posterPath)
    .slice(0, PROFILE_FAVORITES_ROW_MAX);
}

function level(value) {
  const number = Number(value?.level);
  if (!Number.isInteger(number) || number < 1 || number > 999) return null;
  const tierId = typeof value?.tier === "string" ? value.tier : value?.tier?.id;
  return {
    level: number,
    tier: Object.hasOwn(LEVEL_TIER_VISUALS, tierId) ? tierId : "espectador",
    tierName: text(value?.tier?.name, 30) || null,
  };
}

// ------------------------------------------------------------------ cliente

/** Payload de la imagen a partir de la respuesta de /users/:username. */
export function buildProfileShareCard(profile) {
  const user = profile?.user || {};
  const movies =
    Array.isArray(profile?.favoriteMovies)
      ? profile.favoriteMovies
      : (profile?.favorites || []).filter((item) => item?.mediaType === "movie");
  const series =
    Array.isArray(profile?.favoriteSeries)
      ? profile.favoriteSeries
      : (profile?.favorites || []).filter((item) => item?.mediaType === "tv");
  return sanitizeProfileShareCard({
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    level: profile?.level,
    stats: {
      films: profile?.counts?.films,
      shows: profile?.stats?.completedShows,
      episodes: profile?.stats?.episodes,
      followers: profile?.counts?.followers,
    },
    movies,
    series,
  });
}

// ------------------------------------------------------------------ servidor

/** Valida lo que llega a /api/share/profile-card. */
export function sanitizeProfileShareCard(body) {
  const username = text(body?.username, 40);
  return {
    username,
    displayName: text(body?.displayName, 60) || username,
    avatarUrl: avatarHttpsUrl(body?.avatarUrl),
    level: level(body?.level),
    stats: {
      films: count(body?.stats?.films),
      shows: count(body?.stats?.shows),
      episodes: count(body?.stats?.episodes),
      followers: count(body?.stats?.followers),
    },
    movies: favorites(body?.movies),
    series: favorites(body?.series),
  };
}
