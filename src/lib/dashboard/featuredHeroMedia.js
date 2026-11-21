export function resolveFeaturedHeroPoster(resolvedAssets, movie) {
  if (!resolvedAssets) return null;

  // NUNCA devolver un backdrop: en móvil esta ruta es la imagen de portada del
  // hero y debe ser SIEMPRE de tipo póster (retrato). El fallback a
  // `movie.backdrop_path` hacía que, cuando no había póster textless ni
  // `poster_path`, se pintara un backdrop apaisado como portada. Si el título no
  // tiene ningún póster, preferimos no pintar imagen antes que mostrar backdrop.
  return resolvedAssets?.poster || movie?.poster_path || null;
}

// QUÉ HACER CON EL ARTE RESUELTO DEL DESTACADO
//
// Si la petición de /images de TMDb falla (red caída, o recién recuperada al
// volver la app de segundo plano), los selectores devuelven null igual que si
// el título no tuviera póster sin idioma ni logo. Guardar ese null como
// definitivo dejaba el póster CON idioma y el título en texto en el hueco del
// logo hasta recargar. Por eso un fallo se reintenta (el hero sigue en su
// estado de carga) y, agotados los reintentos, se guarda el respaldo marcado
// como `incomplete` para volver a pedirlo en cuanto la app vuelva a primer
// plano o recupere la red.
export const FEATURED_HERO_RETRY_DELAYS_MS = Object.freeze([800, 2000, 5000]);

export function featuredHeroAssetsOutcome({ imagesLoaded, attempt = 0 }) {
  if (imagesLoaded) return { action: "store", incomplete: false };
  if (attempt < FEATURED_HERO_RETRY_DELAYS_MS.length) {
    return { action: "retry", delay: FEATURED_HERO_RETRY_DELAYS_MS[attempt] };
  }
  return { action: "store", incomplete: true };
}

export function shouldResolveFeaturedHeroAssets(assets) {
  return !assets || assets.incomplete === true;
}
