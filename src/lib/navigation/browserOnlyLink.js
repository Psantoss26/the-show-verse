// Enlaces que deben abrirse en el NAVEGADOR aunque el móvil tenga instalada la
// app del sitio. En Android, una app verificada para un dominio (App Links)
// se queda con todos sus enlaces: la app de Letterboxd abría la exportación de
// datos, que no tiene, y se quedaba cargando.
//
//   - Dentro de la app de Android de The Show Verse: lo abre el nativo
//     (openInBrowser) en una pestaña dirigida al navegador por su paquete.
//   - En el navegador de Android: un enlace intent:// pide la página a Chrome
//     (con la URL normal de respaldo si no está).
//   - En el resto (escritorio, iPhone): el enlace normal.

const CHROME_PACKAGE = "com.android.chrome";

/** ¿Navegador de Android? (no la app de The Show Verse, que lo resuelve aparte). */
export function isAndroidBrowser(userAgent) {
  return /\bAndroid\b/i.test(String(userAgent || ""));
}

/** intent:// que abre una URL https en Chrome, con la propia URL de respaldo. */
export function androidBrowserIntentUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== "https:") return url;
  const target = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return (
    `intent://${target}#Intent;scheme=https;action=android.intent.action.VIEW;` +
    `category=android.intent.category.BROWSABLE;package=${CHROME_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  );
}
