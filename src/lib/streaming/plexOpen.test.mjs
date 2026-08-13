import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../app/api/plex/open/route.js";

async function abrir(params = {}) {
  const qs = new URLSearchParams({
    slug: "fight-club",
    type: "movie",
    webUrl: "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F42",
    title: "El club de la lucha",
    ...params,
  });
  const res = await GET(new Request(`https://theshowverse.com/api/plex/open?${qs}`));
  assert.equal(res.status, 200);
  return res.text();
}

// El <script> es lo único que decide a dónde va el usuario.
function script(html) {
  const i = html.indexOf("<script>");
  const f = html.indexOf("</script>", i);
  assert.ok(i > -1 && f > i, "no se localiza el script de la página");
  return html.slice(i, f);
}

test("en táctil no queda ninguna salida automática al navegador", async () => {
  const js = script(await abrir());

  // La ÚNICA navegación automática a web que puede quedar es la de escritorio.
  const saltos = js.match(/window\.location\.replace\(/g) || [];
  assert.equal(saltos.length, 1, "hay más de una redirección automática a web");
  const antes = js.slice(0, js.indexOf("window.location.replace("));
  assert.match(
    antes.slice(-260),
    /if \(esEscritorio\) \{/,
    "la redirección automática no está acotada a escritorio",
  );

  // Las tres vías por las que antes se acababa en el navegador desde un móvil.
  assert.doesNotMatch(js, /S\.browser_fallback_url/);
  assert.doesNotMatch(js, /location\.href = watchUrl/);
  assert.doesNotMatch(js, /visibilitychange/);
});

test("el destino en táctil es siempre un enlace de app", async () => {
  const js = script(await abrir());

  assert.match(js, /var destino = \(isAndroid && !enAppAndroid && intentUrl\)/);
  assert.match(js, /window\.location\.href = destino/);
  // `intent://` sin fallback web: Chrome cae en Play Store, que es una app.
  assert.match(js, /intent:\/\/movie\/fight-club#Intent;scheme=plex;package=com\.plexapp\.android;end/);
  assert.match(js, /plex:\/\/movie\/fight-club/);
});

test("móvil y tablet se separan de escritorio por el puntero, no por el user-agent", async () => {
  const js = script(await abrir());

  // Mismo criterio que la variante `desktop:` de globals.css: si cambia allí,
  // esto tiene que cambiar con ello o una tablet volvería a irse a la web.
  assert.match(
    js,
    /\(min-width: 64rem\) and \(hover: hover\) and \(pointer: fine\)/,
  );
  assert.doesNotMatch(js, /var isMobile =/);
});

test("dentro de la app de Android se usa plex:// y no intent://", async () => {
  const js = script(await abrir());

  // El WebView resuelve los esquemas con ACTION_VIEW, que no sabe interpretar
  // una URI `intent://`.
  assert.match(js, /var enAppAndroid = !!window\.TSVAndroidBridge/);
});

test("las series usan su propio tipo y el título se escapa", async () => {
  const html = await abrir({ type: "tv", title: 'Los <Soprano> & "Cía"' });

  assert.match(html, /plex:\/\/show\/fight-club/);
  assert.match(html, /watch\.plex\.tv\/show\/fight-club/);
  assert.match(html, /Los &lt;Soprano&gt; &amp; &quot;Cía&quot;/);
  assert.doesNotMatch(html, /<Soprano>/);
});

test("sin slug no se inventa una navegación", async () => {
  const js = script(await abrir({ slug: "" }));

  assert.match(js, /if \(!destino\) \{/);
  assert.match(js, /No hay enlace directo a la app/);
});
