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

async function getRealNetflixAccountDetails() {
  try {
    console.log("[The Show Verse Service Worker] Fetching Netflix account details...");
    
    // Fetch Netflix YourAccount page to get the logged-in email
    const res = await fetch("https://www.netflix.com/YourAccount");
    if (!res.ok) {
      console.warn("[The Show Verse Service Worker] Netflix settings page returned error status:", res.status);
      return null;
    }
    const html = await res.text();

    // 1. Check if the page redirected to a login page
    const isLoginPage = html.includes("signIn") || 
                         html.includes("login") || 
                         html.includes("iniciar") || 
                         html.includes("authurl") ||
                         html.includes("emailOrPhone");

    if (isLoginPage) {
      console.warn("[The Show Verse Service Worker] Redirected to login page. Netflix session not active.");
      return { error: "No has iniciado sesión en Netflix. Inicia sesión en netflix.com primero." };
    }

    // 2. Try to find unmasked email in JSON state blocks
    const jsonEmailMatch = html.match(/"email"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/i) ||
                           html.match(/"membershipEmail"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/i) ||
                           html.match(/"emailAddress"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/i);

    let email = jsonEmailMatch ? jsonEmailMatch[1] : null;

    // 3. Fallback: Search for any email-like pattern (which can be masked with asterisks, e.g. pa****@gmail.com)
    if (!email) {
      const generalEmailMatch = html.match(/([a-zA-Z0-9._%+*\-]+@[a-zA-Z0-9.*\-]+\.[a-zA-Z*]{2,})/i);
      email = generalEmailMatch ? generalEmailMatch[1] : null;
    }

    if (!email) {
      console.warn("[The Show Verse Service Worker] Could not parse email from settings HTML.");
      return null;
    }

    // 4. Fetch Netflix browse page to get the active profile name
    let profileName = "Principal";
    try {
      const resBrowse = await fetch("https://www.netflix.com/browse");
      if (resBrowse.ok) {
        const htmlBrowse = await resBrowse.text();
        const profileMatch = htmlBrowse.match(/"name"\s*:\s*"([^"]+)"/) ||
                             htmlBrowse.match(/class="profile-name">([^<]+)/i) ||
                             htmlBrowse.match(/class="profile-link"[^>]*>([^<]+)/i);
        if (profileMatch) {
          profileName = profileMatch[1].trim();
        }
      }
    } catch (e) {
      console.error("[The Show Verse Service Worker] Error fetching browse page:", e);
    }

    console.log(`[The Show Verse Service Worker] Scraped details: ${email} (Profile: ${profileName})`);
    return { email, profileName };
  } catch (e) {
    console.error("[The Show Verse Service Worker] Failed to fetch Netflix details:", e);
    return null;
  }
}

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
            addLog(`Cuenta real detectada: ${details.email}`, "success");
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

    chrome.storage.local.get(["showVerseOrigin"], (result) => {
      const origin = result.showVerseOrigin || "http://localhost:3000";
      
      console.log(`[The Show Verse SW] Syncing "${mainTitle}" to: ${origin}/api/netflix/extension-sync`);

      fetch(`${origin}/api/netflix/extension-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ videoId, mainTitle, subTitle }),
        credentials: "include" // Include localhost session cookies
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
