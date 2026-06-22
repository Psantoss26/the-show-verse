// content-showverse.js - Host origin registry and event bridge

console.log("[The Show Verse Extension] Web bridge active.");

// Si la extensión se recarga/actualiza, este script queda huérfano y
// `chrome.runtime` pasa a ser undefined: acceder a él lanza "Cannot read
// properties of undefined (reading 'sendMessage')". Centralizamos el envío en un
// wrapper que comprueba que el contexto siga vivo y traga el error de contexto.
function extAlive() {
  try {
    return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function safeSendMessage(message, callback) {
  if (!extAlive()) return;
  try {
    chrome.runtime.sendMessage(message, (response) => {
      try {
        if (extAlive() && chrome.runtime.lastError) {
          // sin respuesta del service worker: no propagamos
        }
      } catch (e) {
        // ignore
      }
      if (callback) callback(response);
    });
  } catch (e) {
    // Contexto de extensión invalidado: ignoramos.
  }
}

// Detección de presencia por petición/respuesta. NO mutamos el DOM (atributos en
// <html>/<body>) para no romper la hidratación de React: respondemos solo cuando
// la app lo pide.
document.addEventListener("request-tsv-ext-ping", () => {
  document.dispatchEvent(
    new CustomEvent("response-tsv-ext-ping", { detail: { installed: true } }),
  );
});

// 1. Automatically register the origin if it matches The Show Verse branding
const bodyText = document.body ? document.body.innerText : "";
const pageTitle = document.title || "";
const isShowVerse = 
  pageTitle.toLowerCase().includes("show verse") || 
  pageTitle.toLowerCase().includes("showverse") || 
  bodyText.includes("The Show Verse") || 
  bodyText.includes("showverse");

if (isShowVerse) {
  const origin = window.location.origin;
  safeSendMessage({ action: "registerOrigin", origin }, () => {
    console.log("[The Show Verse Extension] Registered host origin:", origin);
  });
}

// 2. Listen to details request from the settings page
document.addEventListener("request-netflix-details", () => {
  console.log("[The Show Verse Extension] Web page requested Netflix details.");
  
  safeSendMessage({ action: "getNetflixDetails" }, (response) => {
    console.log("[The Show Verse Extension] Received Netflix details from background service worker:", response);
    
    // Dispatch the response back to the webpage
    document.dispatchEvent(new CustomEvent("response-netflix-details", {
      detail: response
    }));
  });
});

document.addEventListener("request-netflix-bind", (event) => {
  console.log("[The Show Verse Extension] Web page requested Netflix sync binding.");
  const detail = event.detail || {};

  safeSendMessage({
    action: "storeSyncConfig",
    origin: window.location.origin,
    syncToken: detail.syncToken,
    email: detail.email,
    profileName: detail.profileName
  }, (response) => {
    document.dispatchEvent(new CustomEvent("response-netflix-bind", {
      detail: response
    }));
  });
});

document.addEventListener("request-netflix-unbind", () => {
  safeSendMessage({ action: "clearSyncConfig" }, (response) => {
    document.dispatchEvent(new CustomEvent("response-netflix-unbind", {
      detail: response
    }));
  });
});

// Sincronización manual del historial real de Netflix solicitada desde la web.
document.addEventListener("request-netflix-sync", (event) => {
  const detail = event.detail || {};
  safeSendMessage({
    action: "syncNetflixActivity",
    full: Boolean(detail.full)
  }, (response) => {
    document.dispatchEvent(new CustomEvent("response-netflix-sync", {
      detail: response
    }));
  });
});
