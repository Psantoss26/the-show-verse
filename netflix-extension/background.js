// background.js - Service worker with dynamic origin resolution and diagnostic logging

async function addLog(message, type = "info") {
  const logEntry = {
    time: new Date().toLocaleTimeString(),
    message,
    type
  };
  chrome.storage.local.get(["logs"], (result) => {
    let logs = result.logs || [];
    logs.unshift(logEntry);
    logs = logs.slice(0, 10); // Keep last 10 entries
    chrome.storage.local.set({ logs });
  });
}

const NETFLIX_NOT_LOGGED_IN = "No has iniciado sesión en Netflix. Inicia sesión en netflix.com primero.";

async function getRealNetflixAccountDetails() {
  try {
    console.log("[The Show Verse Service Worker] Fetching Netflix account details...");

    // IMPORTANTE: en un service worker MV3 el origen es chrome-extension://, por
    // lo que la petición a netflix.com es cross-origin. Sin credentials:"include"
    // las cookies de sesión NO se envían y Netflix responde como invitado.
    const res = await fetch("https://www.netflix.com/YourAccount", {
      credentials: "include",
      redirect: "follow",
    });

    if (res.status === 401 || res.status === 403) {
      return { error: NETFLIX_NOT_LOGGED_IN };
    }
    if (!res.ok) {
      console.warn("[The Show Verse Service Worker] Netflix account page status:", res.status);
      return { error: `No se pudo acceder a tu cuenta de Netflix (HTTP ${res.status}).` };
    }

    // Netflix redirige las páginas privadas a /login (o a la landing "/") cuando
    // no hay sesión. /YourAccount y /account son páginas válidas de sesión activa.
    let finalPath = "";
    try {
      finalPath = new URL(res.url).pathname.toLowerCase();
    } catch (_) {}
    const redirectedToLogin = /^\/(login|signin|signup)?$/.test(finalPath);

    const html = await res.text();

    // Señales POSITIVAS de sesión activa en el reactContext de Netflix. Estas son
    // fiables, a diferencia de buscar "login"/"authURL" (que existen logueado).
    const memberSignal =
      /"membershipStatus"\s*:\s*"(CURRENT_MEMBER|ACTIVE|FORMER_MEMBER)"/i.test(html) ||
      /"isSignedInUser"\s*:\s*true/i.test(html) ||
      /"userGuid"\s*:\s*"[A-Z0-9]+"/i.test(html);
    const anonymous = /"membershipStatus"\s*:\s*"ANONYMOUS"/i.test(html);

    if (!memberSignal && (redirectedToLogin || anonymous)) {
      console.warn("[The Show Verse Service Worker] No active Netflix session detected.");
      return { error: NETFLIX_NOT_LOGGED_IN };
    }

    // Email sin enmascarar desde el estado JSON.
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const jsonEmailMatch =
      html.match(new RegExp(`"(?:email|membershipEmail|emailAddress|userEmail)"\\s*:\\s*"${emailPattern.source}"`, "i"));
    let email = jsonEmailMatch ? jsonEmailMatch[1] : null;

    // Guid estable de la cuenta para fallback de identidad.
    const guidMatch = html.match(/"userGuid"\s*:\s*"([A-Z0-9]+)"/i) || html.match(/"guid"\s*:\s*"([A-Z0-9]+)"/i);
    const guid = guidMatch ? guidMatch[1] : null;

    // Si sólo hay un email enmascarado (pa****@gmail.com) no sirve como identidad
    // válida; usamos un identificador sintético estable basado en el guid.
    if (email && email.includes("*")) email = null;
    if (!email && guid) {
      email = `netflix-${guid.toLowerCase()}@users.theshowverse.local`;
    }

    if (!email) {
      console.warn("[The Show Verse Service Worker] Session active but account id not found.");
      return { error: "Sesión de Netflix detectada, pero no se pudo identificar la cuenta. Vuelve a intentarlo." };
    }

    // Nombre del perfil activo desde la página de navegación.
    let profileName = "Principal";
    try {
      const resBrowse = await fetch("https://www.netflix.com/browse", {
        credentials: "include",
        redirect: "follow",
      });
      if (resBrowse.ok) {
        const htmlBrowse = await resBrowse.text();
        const profileMatch =
          htmlBrowse.match(/"currentProfile"[^}]*?"name"\s*:\s*"([^"]+)"/i) ||
          htmlBrowse.match(/"profileName"\s*:\s*"([^"]+)"/i) ||
          htmlBrowse.match(/"name"\s*:\s*"([^"]+)"/);
        if (profileMatch) {
          profileName = profileMatch[1].trim() || "Principal";
        }
      }
    } catch (e) {
      console.error("[The Show Verse Service Worker] Error fetching browse page:", e);
    }

    console.log(`[The Show Verse Service Worker] Netflix account detected (Profile: ${profileName})`);
    return { email, profileName };
  } catch (e) {
    console.error("[The Show Verse Service Worker] Failed to fetch Netflix details:", e);
    return { error: "No se pudo conectar con Netflix. Asegúrate de tener netflix.com abierto y con sesión iniciada." };
  }
}

// ──────────────────────────────────────────────
// Lectura de la actividad de visionado real de Netflix.
// El service worker reutiliza la sesión activa (cookies) para llamar a la API
// interna de Netflix y obtener el historial completo, sin que el usuario suba
// nada manualmente.
// ──────────────────────────────────────────────

const ALARM_ACTIVITY_POLL = "netflixActivityPoll";
const ACTIVITY_POLL_PERIOD_MIN = 30;
const ACTIVITY_BACKFILL_MAX_PAGES = 20;
const ACTIVITY_INCREMENTAL_MAX_PAGES = 2;
const ACTIVITY_IMPORT_CHUNK = 200;

function getStored(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStored(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

// Obtiene el BUILD_IDENTIFIER necesario para la API shakti de Netflix.
async function getNetflixBuildId() {
  const res = await fetch("https://www.netflix.com/viewingactivity", { credentials: "include" });
  if (!res.ok) return null;
  const html = await res.text();

  const loginPage = html.includes("emailOrPhone") || html.includes("/login");
  const match =
    html.match(/"BUILD_IDENTIFIER"\s*:\s*"([^"]+)"/) ||
    html.match(/BUILD_IDENTIFIER\\?"\s*:\s*\\?"([^"\\]+)/);

  if (!match) {
    return loginPage ? { error: "No has iniciado sesión en Netflix." } : null;
  }
  return { buildId: match[1] };
}

// Epoch en milisegundos de un elemento. Netflix devuelve ms; normalizamos por
// si llegaran en segundos.
function itemEpochMs(item) {
  let epoch = Number(item?.date);
  if (!Number.isFinite(epoch) || epoch <= 0) return 0;
  if (epoch < 1e12) epoch *= 1000;
  return epoch;
}

// Convierte un elemento de viewingactivity en una fila normalizada {title,date,videoId}.
function normalizeViewedItem(item) {
  if (!item) return null;
  const epoch = itemEpochMs(item);
  if (!epoch) return null;
  const date = new Date(epoch).toISOString();
  const videoId = item.movieID != null ? String(item.movieID) : undefined;

  // Episodio: Netflix expone series + seriesTitle + seasonDescriptor + episodeTitle.
  if (item.series) {
    const seriesTitle = item.seriesTitle || item.title || "";
    const seasonDescriptor = item.seasonDescriptor || "";
    const episodeTitle = item.episodeTitle || item.videoTitle || "";
    if (!seriesTitle || !seasonDescriptor || !episodeTitle) return null;
    return { title: `${seriesTitle}: ${seasonDescriptor}: ${episodeTitle}`, date, videoId };
  }

  // Película.
  const title = item.title || item.videoTitle || "";
  if (!title) return null;
  return { title, date, videoId };
}

// Descarga la actividad de visionado paginada. Se detiene al llegar a una página
// vacía o, en modo incremental, al pasar la marca de agua.
async function fetchViewingActivity({ maxPages, sinceEpoch = 0 }) {
  const ctx = await getNetflixBuildId();
  if (!ctx) return { error: "No se pudo leer la sesión de Netflix." };
  if (ctx.error) return { error: ctx.error };

  const rows = [];
  let reachedKnown = false;

  for (let pg = 0; pg < maxPages && !reachedKnown; pg += 1) {
    let res;
    try {
      res = await fetch(`https://www.netflix.com/api/shakti/${ctx.buildId}/viewingactivity?pg=${pg}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } catch (e) {
      break;
    }
    if (!res.ok) break;

    const json = await res.json().catch(() => null);
    const viewedItems = Array.isArray(json?.viewedItems) ? json.viewedItems : [];
    if (viewedItems.length === 0) break;

    for (const item of viewedItems) {
      if (sinceEpoch && itemEpochMs(item) <= sinceEpoch) {
        reachedKnown = true;
        continue;
      }
      const row = normalizeViewedItem(item);
      if (row) rows.push(row);
    }
  }

  return { rows };
}

// Lee la actividad y la envía a la app para resolverla e insertarla en el historial.
async function syncViewingActivity({ full = false } = {}) {
  const { showVerseOrigin, netflixSyncToken, netflixActivityHighWater } = await getStored([
    "showVerseOrigin",
    "netflixSyncToken",
    "netflixActivityHighWater",
  ]);

  const origin = showVerseOrigin || "http://localhost:3000";
  if (!netflixSyncToken) {
    return { success: false, error: "Sincronización no vinculada." };
  }

  const sinceEpoch = full ? 0 : Number(netflixActivityHighWater || 0);
  const maxPages = full ? ACTIVITY_BACKFILL_MAX_PAGES : ACTIVITY_INCREMENTAL_MAX_PAGES;

  const { rows, error } = await fetchViewingActivity({ maxPages, sinceEpoch });
  if (error) {
    addLog(`Lectura de actividad fallida: ${error}`, "error");
    return { success: false, error };
  }

  if (!rows || rows.length === 0) {
    if (full) addLog("Sin nueva actividad de Netflix que importar.", "info");
    return { success: true, imported: 0, fetched: 0 };
  }

  let imported = 0;
  let fetched = 0;
  for (let i = 0; i < rows.length; i += ACTIVITY_IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + ACTIVITY_IMPORT_CHUNK);
    try {
      const res = await fetch(`${origin}/api/netflix/extension-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${netflixSyncToken}`,
        },
        body: JSON.stringify({ items: chunk }),
        credentials: "omit",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog(`Importación de actividad fallida: ${json.error || res.status}`, "error");
        return { success: false, error: json.error || `HTTP ${res.status}`, imported };
      }
      imported += Number(json.imported || 0);
      fetched += Number(json.fetched || chunk.length);
    } catch (e) {
      addLog(`Error de conexión al importar actividad: ${e.message}`, "error");
      return { success: false, error: e.message, imported };
    }
  }

  // Avanza la marca de agua hasta el visionado más reciente procesado.
  const newHighWater = rows.reduce((max, row) => {
    const epoch = new Date(row.date).getTime();
    return epoch > max ? epoch : max;
  }, Number(netflixActivityHighWater || 0));
  await setStored({
    netflixActivityHighWater: newHighWater,
    netflixActivityLastSyncAt: new Date().toISOString(),
  });

  addLog(
    imported > 0
      ? `Historial de Netflix actualizado (+${imported}).`
      : "Actividad de Netflix ya estaba al día.",
    imported > 0 ? "success" : "info",
  );
  return { success: true, imported, fetched };
}

function ensureActivityAlarm() {
  chrome.alarms.get(ALARM_ACTIVITY_POLL, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_ACTIVITY_POLL, { periodInMinutes: ACTIVITY_POLL_PERIOD_MIN });
    }
  });
}

chrome.runtime.onInstalled.addListener(ensureActivityAlarm);
chrome.runtime.onStartup.addListener(ensureActivityAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_ACTIVITY_POLL) return;
  chrome.storage.local.get(["netflixSyncToken"], (result) => {
    if (result.netflixSyncToken) {
      syncViewingActivity({ full: false }).catch((e) =>
        console.error("[The Show Verse SW] Activity poll failed:", e),
      );
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Dynamic host origin registration
  if (message.action === "registerOrigin") {
    const { origin } = message;
    chrome.storage.local.set({ showVerseOrigin: origin }, () => {
      addLog(`App vinculada en origin: ${origin}`, "info");
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "storeSyncConfig") {
    const { origin, syncToken, email, profileName } = message;
    if (!origin || !syncToken) {
      sendResponse({ success: false, error: "Faltan origin o token de sincronización." });
      return true;
    }

    chrome.storage.local.set({
      showVerseOrigin: origin,
      netflixSyncToken: syncToken,
      netflixAccountEmail: email || "",
      netflixProfileName: profileName || "Principal",
      netflixConnectedAt: new Date().toISOString(),
      netflixActivityHighWater: 0
    }, () => {
      addLog("Sincronización automática vinculada.", "success");
      ensureActivityAlarm();
      // Backfill inicial del historial real de Netflix en segundo plano.
      syncViewingActivity({ full: true }).catch((e) =>
        console.error("[The Show Verse SW] Initial backfill failed:", e),
      );
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "clearSyncConfig") {
    chrome.storage.local.remove([
      "netflixSyncToken",
      "netflixAccountEmail",
      "netflixProfileName",
      "netflixConnectedAt",
      "netflixActivityHighWater",
      "netflixActivityLastSyncAt"
    ], () => {
      addLog("Sincronización automática desvinculada.", "info");
      chrome.alarms.clear(ALARM_ACTIVITY_POLL);
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "syncNetflixActivity") {
    syncViewingActivity({ full: Boolean(message.full) })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // respuesta asíncrona
  }

  if (message.action === "getSyncStatus") {
    chrome.storage.local.get([
      "showVerseOrigin",
      "netflixSyncToken",
      "netflixAccountEmail",
      "netflixProfileName",
      "netflixConnectedAt"
    ], (result) => {
      sendResponse({
        success: true,
        connected: Boolean(result.netflixSyncToken),
        origin: result.showVerseOrigin || "",
        email: result.netflixAccountEmail || "",
        profileName: result.netflixProfileName || "",
        connectedAt: result.netflixConnectedAt || null
      });
    });
    return true;
  }

  // 2. Fetch Netflix account details
  if (message.action === "getNetflixDetails") {
    addLog("Detectando cuenta activa de Netflix...", "info");
    getRealNetflixAccountDetails()
      .then((details) => {
        if (details) {
          if (details.error) {
            addLog(`Detección fallida: ${details.error}`, "error");
            sendResponse({ success: false, error: details.error });
          } else if (details.email) {
            addLog("Cuenta de Netflix detectada.", "success");
            sendResponse({ success: true, email: details.email, profileName: details.profileName });
          } else {
            const errMsg = "No se pudo extraer el correo electrónico de Netflix.";
            addLog(`Detección fallida: ${errMsg}`, "error");
            sendResponse({ success: false, error: errMsg });
          }
        } else {
          const errMsg = "No se pudo conectar con los servicios de Netflix.";
          addLog(`Detección fallida: ${errMsg}`, "error");
          sendResponse({ success: false, error: errMsg });
        }
      })
      .catch((err) => {
        addLog(`Error al detectar cuenta: ${err.message}`, "error");
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  // 3. Sync watch event
  if (message.action === "syncNetflix") {
    const { videoId, mainTitle, subTitle } = message;
    addLog(`Reproducción detectada: "${mainTitle}"`, "info");

    chrome.storage.local.get(["showVerseOrigin", "netflixSyncToken"], (result) => {
      const origin = result.showVerseOrigin || "http://localhost:3000";
      const syncToken = result.netflixSyncToken || "";
      if (!syncToken) {
        const errMsg = "Abre The Show Verse y pulsa Conectar Netflix para activar la sincronización.";
        addLog(errMsg, "error");
        sendResponse({ success: false, error: errMsg });
        return;
      }
      
      console.log(`[The Show Verse SW] Syncing "${mainTitle}" to: ${origin}/api/netflix/extension-sync`);

      fetch(`${origin}/api/netflix/extension-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${syncToken}`
        },
        body: JSON.stringify({ videoId, mainTitle, subTitle }),
        credentials: "omit"
      })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          addLog(`Sincronizado: "${mainTitle}"`, "success");
          sendResponse({ success: true, synced: json.synced });
        } else {
          const errorMsg = json.error || `HTTP ${res.status}`;
          addLog(`Fallo al sincronizar: ${errorMsg}`, "error");
          sendResponse({ success: false, error: errorMsg });
        }
      })
      .catch((err) => {
        addLog(`Error de conexión: ${err.message}`, "error");
        sendResponse({ success: false, error: err.message });
      });
    });
    return true; // Keep message channel open for async response
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ success: true, installed: true });
    return false;
  }

  if (message.action === "getNetflixDetails") {
    addLog("Detectando cuenta activa de Netflix...", "info");
    getRealNetflixAccountDetails()
      .then((details) => {
        if (details?.email) {
          addLog("Cuenta de Netflix detectada.", "success");
          sendResponse({ success: true, email: details.email, profileName: details.profileName });
          return;
        }

        const error = details?.error || "No se detectó sesión activa en Netflix.";
        addLog(`Detección fallida: ${error}`, "error");
        sendResponse({ success: false, error });
      })
      .catch((err) => {
        addLog(`Error al detectar cuenta: ${err.message}`, "error");
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === "storeSyncConfig") {
    const { origin, syncToken, email, profileName } = message;
    if (!origin || !syncToken) {
      sendResponse({ success: false, error: "Faltan origin o token de sincronización." });
      return false;
    }

    chrome.storage.local.set({
      showVerseOrigin: origin,
      netflixSyncToken: syncToken,
      netflixAccountEmail: email || "",
      netflixProfileName: profileName || "Principal",
      netflixConnectedAt: new Date().toISOString(),
      netflixActivityHighWater: 0
    }, () => {
      addLog("Sincronización automática vinculada.", "success");
      ensureActivityAlarm();
      syncViewingActivity({ full: true }).catch((e) =>
        console.error("[The Show Verse SW] Initial backfill failed:", e),
      );
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "syncNetflixActivity") {
    syncViewingActivity({ full: Boolean(message.full) })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "clearSyncConfig") {
    chrome.storage.local.remove([
      "netflixSyncToken",
      "netflixAccountEmail",
      "netflixProfileName",
      "netflixConnectedAt",
      "netflixActivityHighWater",
      "netflixActivityLastSyncAt"
    ], () => {
      addLog("Sincronización automática desvinculada.", "info");
      chrome.alarms.clear(ALARM_ACTIVITY_POLL);
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});
