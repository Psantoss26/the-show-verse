"use client";

import OptimizedImage from "@/components/OptimizedImage";
import useOwnCardPoster from "@/lib/hooks/useOwnCardPoster";
import { tmdbSrcSet } from "@/lib/tmdb/imageSrcSet";

/**
 * Póster de una tarjeta de título en filas de la ficha y de DetailModal
 * (Recomendaciones, Colección…): la portada elegida en la ficha o, sin ella,
 * la más votada por todos (`useOwnCardPoster`); si no hay ninguna, `path` (la
 * del item). Sin ninguna ruta, el `placeholder` o nada.
 */
export default function CardPosterImage({ type, id, path, size = "w342", placeholder = null, ...props }) {
  const chosen = useOwnCardPoster(type, id);
  const posterPath = chosen || path || null;
  if (!posterPath) {
    if (!placeholder) return null;
    return <OptimizedImage src={placeholder} {...props} />;
  }
  return (
    <OptimizedImage
      src={`https://image.tmdb.org/t/p/${size}${posterPath}`}
      srcSet={tmdbSrcSet(posterPath)}
      {...props}
    />
  );
}
