// Decide qué caché puede pintar una página de usuario en su primer render.
// En una entrada normal solo usamos datos recientes para no mostrar contenido
// obsoleto. Al volver con atrás/adelante, la instantánea representa exactamente
// la vista que el usuario acaba de dejar y puede restaurarse aunque haya vencido
// el TTL de refresco; la petición habitual seguirá actualizándola después.
export function resolveUserListInitialSnapshot(cache, isBackNavigation) {
  const hasItems = Array.isArray(cache?.items) && cache.items.length > 0;
  const hasBackNavigationSnapshot = Boolean(isBackNavigation && hasItems);

  return {
    hasBackNavigationSnapshot,
    shouldRestoreSnapshot: Boolean(
      hasItems && (cache?.fresh || hasBackNavigationSnapshot),
    ),
  };
}
