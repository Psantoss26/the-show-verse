export function resolveFeaturedHeroPoster(resolvedAssets, movie) {
  if (!resolvedAssets) return null;

  return (
    resolvedAssets?.poster ||
    movie?.poster_path ||
    movie?.backdrop_path ||
    null
  );
}
