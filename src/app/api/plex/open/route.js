// src/app/api/plex/open/route.js
// Página de redirección intermedia para abrir el contenido en la app Plex.
//
// En lugar de intentar abrir la app desde un onClick de React (poco fiable
// en móvil), el icono de Plex enlaza a ESTA URL. El navegador la carga como
// una navegación completa, lo que es mucho más fiable para deep links.
//
// POLÍTICA EN MÓVIL Y TABLET: la app o nada. Ninguna rama navega por su cuenta
// a una página web; si el lanzamiento no prospera se ofrecen botones y decide
// el usuario. En ESCRITORIO se mantiene la redirección a Plex Web, que allí es
// el destino correcto. La frontera entre ambos es la misma que usa la web para
// decidir qué interfaz pinta (ver la variante `desktop:` en globals.css), no el
// user-agent: una tablet no es un escritorio aunque tenga la resolución de uno.
//
// Query params:
//   - slug:    string  — slug del contenido (ej. "fight-club", "the-wire")
//   - type:    string  — "movie" | "show"
//   - webUrl:  string  — URL de app.plex.tv/desktop como fallback de escritorio
//   - title:   string  — título para mostrar en la página (opcional)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
    const { searchParams } = new URL(request.url);

    const slug = searchParams.get("slug") || "";
    const type = searchParams.get("type") || "movie";
    const webUrl = searchParams.get("webUrl") || "";
    const title = searchParams.get("title") || "este contenido";

    // Tipo de contenido normalizado
    const contentType = type === "show" || type === "tv" ? "show" : "movie";

    // URLs derivadas del slug
    const watchPlexUrl = slug
        ? `https://watch.plex.tv/${contentType}/${slug}`
        : "";

    // plex:// custom scheme — abre la app directamente en la ficha de detalles
    const plexSchemeUrl = slug ? `plex://${contentType}/${slug}` : "";

    // URL definitiva de fallback (preferimos watch.plex.tv porque también sirve
    // como Universal/App Link y funciona aunque la app no esté instalada)
    const fallbackUrl = watchPlexUrl || webUrl || "https://app.plex.tv";

    // Android intent URI, SIN `S.browser_fallback_url`: ese parámetro es
    // justamente lo que hacía que Chrome se fuera solo a la web de Plex cuando
    // el lanzamiento no prosperaba. Sin él, y con `package=`, Chrome abre la
    // ficha de Play Store de la app -- que sigue siendo una app, no el
    // navegador. En táctil no queremos NINGUNA salida automática a web.
    const intentUrl = slug
        ? `intent://${contentType}/${slug}#Intent;scheme=plex;package=com.plexapp.android;end`
        : "";

    // Título seguro para HTML
    const safeTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    // URL segura para incrustar en HTML
    const safeWatchUrl = watchPlexUrl
        ? watchPlexUrl.replace(/"/g, "&quot;")
        : "";
    const safeFallbackUrl = fallbackUrl.replace(/"/g, "&quot;");
    const safePlexSchemeUrl = plexSchemeUrl.replace(/"/g, "&quot;");
    const safeIntentUrl = intentUrl.replace(/"/g, "&quot;");
    const safeWebUrl = webUrl.replace(/"/g, "&quot;");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Abriendo en Plex…</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a1a;
      color: #f0f0f0;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      gap: 20px;
    }
    .plex-logo {
      width: 80px;
      height: 80px;
      background: #e5a00d;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      box-shadow: 0 8px 32px rgba(229,160,13,0.4);
    }
    h1 {
      font-size: clamp(18px, 5vw, 22px);
      font-weight: 700;
      color: #fff;
    }
    .subtitle {
      font-size: 14px;
      color: #888;
      max-width: 280px;
      line-height: 1.5;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #333;
      border-top-color: #e5a00d;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 300px;
      margin-top: 8px;
    }
    .btn {
      display: block;
      padding: 14px 24px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      transition: opacity 0.15s;
    }
    .btn:active { opacity: 0.8; }
    .btn-primary {
      background: #e5a00d;
      color: #000;
    }
    .btn-secondary {
      background: #2a2a2a;
      color: #ccc;
      border: 1px solid #333;
    }
    #status {
      font-size: 13px;
      color: #666;
      min-height: 18px;
    }
  </style>
</head>
<body>
  <div class="plex-logo">🎬</div>
  <h1>Abriendo en Plex</h1>
  <p class="subtitle">Abriendo <strong>${safeTitle}</strong> en la app Plex…</p>
  <div class="spinner" id="spinner"></div>
  <p id="status">Lanzando la app…</p>
  <div class="btn-group" id="btn-group" style="display:none;">
    ${safePlexSchemeUrl ? `<a href="${safePlexSchemeUrl}" class="btn btn-primary" id="btn-app">Abrir en la app de Plex</a>` : ""}
    ${safeWatchUrl ? `<a href="${safeWatchUrl}" class="btn btn-secondary" target="_self">Ver en Plex (web)</a>` : ""}
    ${safeWebUrl ? `<a href="${safeWebUrl}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">Abrir Plex Web</a>` : ""}
  </div>

  <script>
    (function () {
      var ua = navigator.userAgent || '';
      var isAndroid = /Android/i.test(ua);

      // MÓVIL Y TABLET = todo lo que no sea "un ordenador de verdad". Se usa el
      // MISMO criterio que la variante \`desktop:\` de la web (ver globals.css):
      // el ancho no distingue un iPad de un monitor, el puntero sí. Con el
      // sniffing de user-agent anterior, una tablet que se anunciara como
      // escritorio se iba derecha a la web.
      var esEscritorio = window.matchMedia(
        '(min-width: 64rem) and (hover: hover) and (pointer: fine)'
      ).matches;

      // Dentro de la app de Android, el WebView resuelve los esquemas externos
      // con \`ACTION_VIEW\`, que entiende \`plex://\` pero NO \`intent://\` (esa
      // forma necesita \`Intent.parseUri\`). Así que allí se usa \`plex://\`.
      var enAppAndroid = !!window.TSVAndroidBridge;

      var intentUrl    = "${safeIntentUrl}";
      var plexScheme   = "${safePlexSchemeUrl}";
      var watchUrl     = "${safeWatchUrl}";
      var fallbackUrl  = "${safeFallbackUrl}";
      var webUrl       = "${safeWebUrl}";

      var statusEl  = document.getElementById('status');
      var spinnerEl = document.getElementById('spinner');
      var btnGroup  = document.getElementById('btn-group');

      function showFallback(msg) {
        statusEl.textContent = msg || 'Si la app no se abrió, usa los botones:';
        spinnerEl.style.display = 'none';
        btnGroup.style.display  = 'flex';
      }

      if (esEscritorio) {
        // Escritorio: ahí sí, Plex Web es el destino natural.
        statusEl.textContent = 'Redirigiendo a Plex Web…';
        window.location.replace(webUrl || watchUrl || fallbackUrl);
        return;
      }

      // ---- MÓVIL Y TABLET: SOLO LA APP ----
      // A partir de aquí NINGUNA rama navega sola a una página web. Antes sí:
      // iOS tenía un temporizador de 2s que se iba a watch.plex.tv si la app
      // tardaba en pasar a primer plano, el intent de Android llevaba un
      // parámetro de repliegue a esa misma web, y el caso por defecto hacía un
      // \`location.replace\`. Cualquiera de los tres acababa en el navegador.
      // Ahora, si el lanzamiento no prospera, se ofrecen BOTONES y decide el
      // usuario.
      var destino = (isAndroid && !enAppAndroid && intentUrl)
        ? intentUrl
        : plexScheme;

      if (!destino) {
        // Sin slug no hay enlace nativo que probar.
        showFallback('No hay enlace directo a la app para este contenido.');
        return;
      }

      statusEl.textContent = 'Abriendo la app de Plex…';
      window.location.href = destino;

      // El navegador puede bloquear un salto a un esquema propio que no venga
      // de un gesto del usuario. Por eso el botón de abajo NO es solo un plan
      // B: es un reintento con gesto, que es la vía más fiable de las dos.
      setTimeout(function () {
        showFallback('Si la app no se abrió, ábrela desde aquí:');
      }, 2500);
    })();
  </script>
</body>
</html>`;

    return new Response(html, {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache",
            "X-Robots-Tag": "noindex",
        },
    });
}
