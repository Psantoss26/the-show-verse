export function resolveCollectionDetailsInitialState(cached) {
  return {
    loading: !cached,
    error: null,
    collection: cached?.collection || null,
    parts: Array.isArray(cached?.parts) ? cached.parts : [],
  };
}

export function resolveCommunityListDetailsInitialState(cached) {
  return {
    loading: !cached,
    loadingMore: false,
    error: null,
    list: cached?.list || null,
    ratingSummary: cached?.ratingSummary || null,
    imdbRatingItems: Array.isArray(cached?.imdbRatingItems) ? cached.imdbRatingItems : [],
    items: Array.isArray(cached?.items) ? cached.items : [],
    page: cached?.page || 1,
    hasMore: Boolean(cached?.hasMore),
  };
}

export function getCommunityListDetailsCacheKey(listId) {
  return listId ? `showverse:list-details:community:${listId}:v1` : null;
}

// La caché de una ficha de lista solo puede sembrar el primer render cuando
// volvemos con atrás/adelante. En una entrada normal se revalida desde la red
// para no mostrar una lista desactualizada de otra sesión o dispositivo.
// Mantener esta decisión en un helper permite que listas personales, de
// comunidad y colecciones respeten exactamente el mismo contrato.
export function resolveBackNavigationDetailsSnapshot(
  cached,
  isBackNavigation,
) {
  return isBackNavigation && cached ? cached : null;
}

export function shouldRenderCachedListDuringAuthHydration({
  canUse,
  hydrated,
  hasCachedData,
}) {
  return Boolean(canUse || (!hydrated && hasCachedData));
}
