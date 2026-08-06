export function resolvePosterViewerState({
  item,
  viewerState,
  showStars = false,
  fixedIndicator = false,
}) {
  const hasResolvedViewerState = Boolean(
    viewerState && typeof viewerState === "object",
  );
  const viewerOnlyIndicator = Boolean(fixedIndicator);
  const knownSelfWatchlist = fixedIndicator === "watchlist-self";

  // En Perfil, fixedIndicator define únicamente la colocación táctil de la
  // barra. Hasta que el estado privado del visor esté resuelto no se puede
  // inferir Favoritos/Pendientes a partir de la sección del perfil visitado.
  const favorite = Boolean(
    hasResolvedViewerState
      ? viewerState.favorite
      : viewerOnlyIndicator
        ? false
        : item?.isFavorite ?? item?.favorite ?? false,
  );
  const watchlist = Boolean(
    hasResolvedViewerState
      ? viewerState.watchlist
      : knownSelfWatchlist
        ? true
        : viewerOnlyIndicator
          ? false
          : item?.isWatchlist ?? item?.watchlist ?? false,
  );
  const watched = Boolean(
    hasResolvedViewerState
      ? viewerState.watched
      : viewerOnlyIndicator
        ? false
        : item?.watched,
  );
  const userRating = hasResolvedViewerState
    ? viewerState.rating
    : viewerOnlyIndicator
      ? undefined
      : item?.userRating ??
        item?.user_rating ??
        (!showStars ? item?.rating : undefined);

  return { favorite, watchlist, watched, userRating };
}
