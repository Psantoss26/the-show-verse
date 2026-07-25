export function finalizeLogout({
  applyUser,
  setHydrated,
  redirectTo = null,
  replaceLocation,
}) {
  // La instantánea local debe desaparecer antes de navegar: la página de destino
  // monta AuthProvider de nuevo y no puede recuperar al usuario ya desconectado.
  applyUser(null);
  setHydrated(true);

  if (!redirectTo || typeof replaceLocation !== "function") return false;

  replaceLocation(redirectTo);
  return true;
}
