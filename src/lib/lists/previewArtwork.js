import {
  pickBestBackdropForPreview,
  pickBestEnglishPoster,
  pickBestNeutralBackdropByResVotes,
} from "../details/tmdbImages.js";

const previewArtworkCache = new Map();

function mediaTypeOf(item) {
  return item?.media_type === "tv" || (!item?.title && item?.name)
    ? "tv"
    : "movie";
}

function artworkKey(item) {
  if (item?.id == null) return null;
  return `${mediaTypeOf(item)}:${item.id}`;
}

async function resolveArtwork(item, resolveImages) {
  const key = artworkKey(item);
  if (!key || typeof resolveImages !== "function") return null;

  const cached = previewArtworkCache.get(key);
  if (cached) return cached;

  const mediaType = mediaTypeOf(item);
  const request = Promise.resolve(resolveImages(mediaType, item.id))
    .then((images) => {
      if (!images) {
        previewArtworkCache.delete(key);
        return null;
      }

      const englishBackdrop = pickBestBackdropForPreview(
        images?.backdrops || [],
        { preferLangs: ["en", "en-US"], minWidth: 780 },
      );
      const neutralBackdrop = pickBestNeutralBackdropByResVotes(
        images?.backdrops || [],
        { minWidth: 780 },
      )?.file_path;
      const englishPoster = pickBestEnglishPoster(
        images?.posters || [],
      )?.file_path;

      const resolved = {
        backdropPath:
          englishBackdrop || neutralBackdrop || item?.backdrop_path || null,
        posterPath: englishPoster || item?.poster_path || null,
      };
      previewArtworkCache.set(key, resolved);
      return resolved;
    })
    .catch(() => {
      previewArtworkCache.delete(key);
      return null;
    });

  previewArtworkCache.set(key, request);
  return request;
}

/**
 * Resuelve una sola vez el artwork de los primeros títulos de una lista.
 * Mantiene intactos poster_path/backdrop_path porque las filas dashboard usan
 * esos campos; las vistas de portada consumen los campos privados nuevos.
 */
export async function enrichListPreviewArtwork(
  items,
  { resolveImages, limit = 5 } = {},
) {
  const source = Array.isArray(items) ? items : [];
  const previewCount = Math.min(Math.max(0, limit), source.length);
  const resolved = await Promise.all(
    source
      .slice(0, previewCount)
      .map((item) => resolveArtwork(item, resolveImages)),
  );

  return source.map((item, index) => {
    if (index >= previewCount) return item;
    const artwork = resolved[index];
    return {
      ...item,
      _listPreviewBackdrop:
        artwork?.backdropPath || item?.backdrop_path || null,
      _listPreviewPoster: artwork?.posterPath || item?.poster_path || null,
    };
  });
}

export function clearListPreviewArtworkCache() {
  previewArtworkCache.clear();
}
