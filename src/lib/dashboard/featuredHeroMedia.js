export function resolveFeaturedHeroPoster(resolvedAssets, movie) {
  if (!resolvedAssets) return null;

  // NUNCA devolver un backdrop: en móvil esta ruta es la imagen de portada del
  // hero y debe ser SIEMPRE de tipo póster (retrato). El fallback a
  // `movie.backdrop_path` hacía que, cuando no había póster textless ni
  // `poster_path`, se pintara un backdrop apaisado como portada. Si el título no
  // tiene ningún póster, preferimos no pintar imagen antes que mostrar backdrop.
  return resolvedAssets?.poster || movie?.poster_path || null;
}
