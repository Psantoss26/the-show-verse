// content-showverse.js - Host origin registry and event bridge

console.log("[The Show Verse Extension] Web bridge active.");

// Marca la presencia de la extensión en la página para que la app pueda detectar
// si está instalada (sin depender del ID público de la Store).
try {
  document.documentElement.setAttribute("data-tsv-netflix-ext", "1");
  document.dispatchEvent(new CustomEvent("tsv-netflix-ext-ready"));
} catch {
  // noop
}

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
  chrome.runtime.sendMessage({ action: "registerOrigin", origin }, () => {
    console.log("[The Show Verse Extension] Registered host origin:", origin);
  });
}

// 2. Listen to details request from the settings page
document.addEventListener("request-netflix-details", () => {
  console.log("[The Show Verse Extension] Web page requested Netflix details.");
  
  chrome.runtime.sendMessage({ action: "getNetflixDetails" }, (response) => {
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

  chrome.runtime.sendMessage({
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
  chrome.runtime.sendMessage({ action: "clearSyncConfig" }, (response) => {
    document.dispatchEvent(new CustomEvent("response-netflix-unbind", {
      detail: response
    }));
  });
});

// Sincronización manual del historial real de Netflix solicitada desde la web.
document.addEventListener("request-netflix-sync", (event) => {
  const detail = event.detail || {};
  chrome.runtime.sendMessage({
    action: "syncNetflixActivity",
    full: Boolean(detail.full)
  }, (response) => {
    document.dispatchEvent(new CustomEvent("response-netflix-sync", {
      detail: response
    }));
  });
});
