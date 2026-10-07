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
  image.src = `https://image.tmdb.org/t/p/${size}${path}`;
  // Descargar no basta: la transición también espera a que estén
  // DECODIFICADAS, y en las `original` eso son ~100ms. Decodificarlas aquí
  // deja el mapa de bits en la caché del navegador antes del clic.
  if (typeof image.decode === "function") image.decode().then(done, done);
  else {
    image.onload = done;
    image.onerror = done;
  }
}

/**
 * Selección de imágenes que pintará la ficha en escritorio, según los datos
 * de TMDb y la selección guardada del usuario.
 */
// Primeras tarjetas visibles del Reparto Principal: dirección y luego reparto,
// en el orden de la ficha (buildCastDataForUI).
const CAST_WARMUP_COUNT = 7;

export function pickSequenceWarmupArtwork(data, override = {}) {
  if (!data) return { posters: [], backdrop: null, profiles: [] };
  const englishPoster = pickBestEnglishPoster(data.images?.posters || [])?.file_path || null;
  const posters = [...new Set([override?.poster, englishPoster, data.poster_path].filter(Boolean))];
  const backdrop = pickHeroBackdropPath({
    backdropPath: data.backdrop_path,
    backdrops: data.images?.backdrops,
    preferredPaths: [override?.background],
  });
  const directors = (data.credits?.crew || []).filter((person) => person?.job === "Director");
  const cast = [...(data.credits?.cast || [])].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
  const profiles = [...new Set([...directors, ...cast].map((person) => person?.profile_path).filter(Boolean))]
    .slice(0, CAST_WARMUP_COUNT);
  return { posters, backdrop, profiles };
}

export function warmDetailsSequenceTarget(href) {
  if (typeof window === "undefined" || warmed.has(href)) return warmed.get(href);
  const parsed = parseDetailsHref(href);
  if (!parsed) return undefined;

  const task = getDetails(parsed.type, parsed.id, {
    appendToResponse: "images,credits",
    language: "es-ES",
  })
    .then((data) => {
      const override = readPersistedArtworkOverride(parsed) || {};
      const { posters, backdrop, profiles } = pickSequenceWarmupArtwork(data, override);
      // La portada entra primero en w342 y luego se sustituye por la original;
      // el fondo de escritorio usa siempre la original.
      posters.forEach((path) => preloadImage("w342", path));
      preloadImage("original", posters[0]);
      preloadImage("original", backdrop);
      // Fotos de las tarjetas del Reparto Principal (misma URL que la ficha).
      profiles.forEach((path) => preloadImage("w342", path));
    })
    .catch(() => {
      // Sin red o TMDb caído: se reintentará en el siguiente hover.
      warmed.delete(href);
    });

  warmed.set(href, task);
  return task;
}
