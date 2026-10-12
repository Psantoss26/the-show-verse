// letterboxd-export.js - Exportación oficial de datos de Letterboxd.
//
// Letterboxd no tiene API pública y bloquea las lecturas desde servidores. Su
// exportación de datos (Settings → Data → Export your data) sí trae TODO el
// historial: diario, películas vistas y puntuaciones. La extensión la descarga
// con la sesión que la persona ya tiene iniciada en letterboxd.com en este
// navegador, igual que si pulsara el botón, y se la pasa a The Show Verse, que
// la importa (lib/letterboxd/export en la web).

const LETTERBOXD_ORIGIN = "https://letterboxd.com";
const LETTERBOXD_EXPORT_TIMEOUT_MS = 120000;

function isZipBuffer(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return bytes.length === 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function letterboxdFetch(url, init = {}) {
  return fetch(url, {
    credentials: "include",
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(LETTERBOXD_EXPORT_TIMEOUT_MS),
    ...init,
  });
}

// Respuesta con el ZIP, o null si lo que llegó no es un ZIP.
async function zipFrom(res) {
  if (!res || !res.ok) return null;
  const buffer = await res.arrayBuffer();
  return isZipBuffer(buffer) ? buffer : null;
}

function signedOut(res, html) {
  return /\/sign-in\/?/.test(res.url || "") || /id="signin-form"|name="username"[^>]*autocomplete="username"/i.test(html || "");
}

// Formularios de exportación de la página de ajustes (por si la descarga es un
// POST con token CSRF y no un enlace).
function exportForms(html) {
  const forms = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = re.exec(html))) {
    const action = (match[1].match(/action="([^"]*)"/i) || [])[1] || "";
    if (!/export/i.test(action)) continue;
    const body = new URLSearchParams();
    const inputs = match[2].match(/<input\b[^>]*>/gi) || [];
    for (const input of inputs) {
      const name = (input.match(/name="([^"]*)"/i) || [])[1];
      if (!name) continue;
      body.append(name, (input.match(/value="([^"]*)"/i) || [])[1] || "");
    }
    forms.push({ action: new URL(action, LETTERBOXD_ORIGIN).href, body });
  }
  return forms;
}

/**
 * Descarga la exportación. Devuelve:
 *   { success: true, base64, size }
 *   { success: false, code: "not_logged_in" | "not_found" | "network", error }
 */
async function fetchLetterboxdExport() {
  try {
    // 1. El enlace directo de la exportación.
    const direct = await zipFrom(await letterboxdFetch(`${LETTERBOXD_ORIGIN}/data/export/`).catch(() => null));
    if (direct) return { success: true, base64: bufferToBase64(direct), size: direct.byteLength };

    // 2. La página de ajustes de datos: comprueba la sesión y busca el enlace o
    //    el formulario de exportación tal como esté hoy.
    const settings = await letterboxdFetch(`${LETTERBOXD_ORIGIN}/settings/data/`);
    const html = await settings.text();
    if (settings.status === 401 || settings.status === 403 || signedOut(settings, html)) {
      return {
        success: false,
        code: "not_logged_in",
        error: "Inicia sesión en letterboxd.com en este navegador y vuelve a intentarlo.",
      };
    }

    const links = [...new Set((html.match(/href="([^"]*export[^"]*)"/gi) || []).map((attr) => attr.slice(6, -1)))];
    for (const href of links) {
      const zip = await zipFrom(await letterboxdFetch(new URL(href, LETTERBOXD_ORIGIN).href).catch(() => null));
      if (zip) return { success: true, base64: bufferToBase64(zip), size: zip.byteLength };
    }
    for (const form of exportForms(html)) {
      const zip = await zipFrom(
        await letterboxdFetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.body.toString(),
        }).catch(() => null),
      );
      if (zip) return { success: true, base64: bufferToBase64(zip), size: zip.byteLength };
    }

    return {
      success: false,
      code: "not_found",
      error: "No se encontró la exportación de datos de Letterboxd. Descárgala en letterboxd.com/settings/data e impórtala como ZIP.",
    };
  } catch (error) {
    return { success: false, code: "network", error: `No se pudo conectar con Letterboxd: ${error.message}` };
  }
}
