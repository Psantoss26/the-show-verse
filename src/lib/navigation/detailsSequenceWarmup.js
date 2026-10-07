// Precalienta el título al que llevan las flechas Anterior/Siguiente.
//
// La transición (detailsSequenceTransition) no anima hasta que la ficha nueva
// tiene su portada y su fondo descargados y decodificados. Esas imágenes son
// las `original` de TMDb (varios MB), así que se descargaban DESPUÉS del clic y
// eran casi todo el tiempo de espera. Al pasar por encima de la flecha (o
// enfocarla) se piden ya, con los mismos criterios que usa DetailsClient para
// elegirlas, y al hacer clic salen de la caché del navegador.
import { getDetails } from "@/lib/api/tmdb";
import { readPersistedArtworkOverride } from "@/lib/artworkApi";
import { pickBestEnglishPoster, pickHeroBackdropPath } from "@/lib/details/tmdbImages";

const warmed = new Map();
// Mantiene vivas las peticiones en curso: un `Image` sin referencias puede
// recogerse antes de terminar la descarga.
const inFlight = new Set();

function parseDetailsHref(href) {
  const match = href?.match(/^\/details\/(movie|tv)\/(\d+)$/);
  return match ? { type: match[1], id: match[2] } : null;
}

function preloadImage(size, path) {
  if (!path) return;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "low";
  inFlight.add(image);
  const done = () => inFlight.delete(image);
  image.onload = done;
  image.onerror = done;
  image.src = `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * Selección de imágenes que pintará la ficha en escritorio, según los datos
 * de TMDb y la selección guardada del usuario.
 */
export function pickSequenceWarmupArtwork(data, override = {}) {
  if (!data) return { posters: [], backdrop: null };
  const englishPoster = pickBestEnglishPoster(data.images?.posters || [])?.file_path || null;
  const posters = [...new Set([override?.poster, englishPoster, data.poster_path].filter(Boolean))];
  const backdrop = pickHeroBackdropPath({
    backdropPath: data.backdrop_path,
    backdrops: data.images?.backdrops,
    preferredPaths: [override?.background],
  });
  return { posters, backdrop };
}

export function warmDetailsSequenceTarget(href) {
  if (typeof window === "undefined" || warmed.has(href)) return warmed.get(href);
  const parsed = parseDetailsHref(href);
  if (!parsed) return undefined;

  const task = getDetails(parsed.type, parsed.id, {
    appendToResponse: "images",
    language: "es-ES",
  })
    .then((data) => {
      const override = readPersistedArtworkOverride(parsed) || {};
      const { posters, backdrop } = pickSequenceWarmupArtwork(data, override);
      // La portada entra primero en w342 y luego se sustituye por la original;
      // el fondo de escritorio usa siempre la original.
      posters.forEach((path) => preloadImage("w342", path));
      preloadImage("original", posters[0]);
      preloadImage("original", backdrop);
    })
    .catch(() => {
      // Sin red o TMDb caído: se reintentará en el siguiente hover.
      warmed.delete(href);
    });

  warmed.set(href, task);
  return task;
}
