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
    items: Array.isArray(cached?.items) ? cached.items : [],
    page: cached?.page || 1,
    hasMore: Boolean(cached?.hasMore),
  };
}

export function getCommunityListDetailsCacheKey(listId) {
  return listId ? `showverse:list-details:community:${listId}:v1` : null;
}

export function shouldRenderCachedListDuringAuthHydration({
  canUse,
  hydrated,
  hasCachedData,
}) {
  return Boolean(canUse || (!hydrated && hasCachedData));
}
