// popup.js - Check active session status of The Show Verse and load event logs

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const userInfo = document.getElementById("user-info");
  const userEmail = document.getElementById("user-email");
  const actionBtn = document.getElementById("action-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const logsList = document.getElementById("logs-list");
  let syncPaused = false;

  function renderPauseButton(paused) {
    syncPaused = Boolean(paused);
    pauseBtn.style.display = "block";
    pauseBtn.textContent = syncPaused ? "Reanudar sincronización" : "Pausar sincronización";
    pauseBtn.classList.toggle("btn-paused", syncPaused);
  }

  // 1. Fetch dynamic host origin and check session
  chrome.storage.local.get([
    "showVerseOrigin",
    "logs",
    "netflixSyncToken",
    "netflixAccountEmail",
    "netflixProfileName",
    "streamingSyncPaused"
  ], (result) => {
    const origin = result.showVerseOrigin || "http://localhost:3000";
    console.log("[The Show Verse Popup] Querying auth status from:", origin);

    // Render logs
    const logs = result.logs || [];
    if (logs.length > 0) {
      logsList.innerHTML = "";
      logs.forEach((log) => {
        const logItem = document.createElement("div");
        logItem.className = "log-item";
        
        let color = "#e4e4e7"; // default info
        if (log.type === "success") color = "#34d399";
        if (log.type === "error") color = "#f87171";
        
        logItem.innerHTML = `
          <span class="log-message" style="color: ${color};" title="${log.message}">${log.message}</span>
          <span class="log-time">${log.time}</span>
        `;
        logsList.appendChild(logItem);
      });
    }

    if (result.netflixSyncToken) {
      renderPauseButton(result.streamingSyncPaused);
      statusDot.className = result.streamingSyncPaused ? "dot dot-orange" : "dot dot-green";
      statusText.textContent = result.streamingSyncPaused
        ? "Sincronización pausada"
        : "Sincronización activa";

      userInfo.style.display = "block";
      userEmail.textContent = `${result.netflixAccountEmail || "Netflix"} · ${result.netflixProfileName || "Principal"}`;

      actionBtn.style.display = "block";
      actionBtn.textContent = "Ir a Configuración";
      actionBtn.href = `${origin}/profile/settings`;
      return;
    }

    // Verify app authentication as a helpful setup hint. Extension service workers
    // cannot rely on app cookies for long-lived background sync.
    fetch(`${origin}/api/auth/me`, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.user) {
          statusDot.className = "dot dot-orange";
          statusText.textContent = "Pendiente de conectar Netflix";
          
          userInfo.style.display = "block";
          userInfo.innerHTML = "Pulsa Conectar Netflix en The Show Verse para activar la sincronización automática.";
          
          actionBtn.style.display = "block";
          actionBtn.textContent = "Ir a Configuración";
          actionBtn.href = `${origin}/profile/settings`;
        } else {
          statusDot.className = "dot dot-red";
          statusText.textContent = "Sesión no detectada";
          
          userInfo.style.display = "block";
          userInfo.innerHTML = "Inicia sesión en The Show Verse para sincronizar tu actividad.";
          
          actionBtn.style.display = "block";
          actionBtn.textContent = "Iniciar Sesión";
          actionBtn.href = `${origin}/login`;
        }
      })
      .catch((err) => {
        console.error("[The Show Verse Popup] Connection error:", err);
        statusDot.className = "dot dot-red";
        statusText.textContent = "Sin conexión con la app";
        
        userInfo.style.display = "block";
        userInfo.innerHTML = `No se pudo conectar a <a href="${origin}" target="_blank" style="color:#e50914;text-decoration:none;">${origin}</a>. Abre la web primero.`;
        
        actionBtn.style.display = "block";
        actionBtn.textContent = "Abrir Aplicación";
        actionBtn.href = origin;
      });
  });

  // Handle action buttons open in new tab
  actionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (actionBtn.href) {
      chrome.tabs.create({ url: actionBtn.href });
    }
  });

  pauseBtn.addEventListener("click", () => {
    const nextPaused = !syncPaused;
    pauseBtn.disabled = true;

    chrome.runtime.sendMessage(
      { action: "setSyncPaused", paused: nextPaused },
      (response) => {
        pauseBtn.disabled = false;
        if (!response?.success) return;

        renderPauseButton(response.paused);
        statusDot.className = response.paused ? "dot dot-orange" : "dot dot-green";
        statusText.textContent = response.paused
          ? "Sincronización pausada"
          : "Sincronización activa";
      },
    );
  });

  // ── Añadir un sitio de streaming no incluido de serie ──
  const currentSiteEl = document.getElementById("current-site");
  const addSiteBtn = document.getElementById("add-site-btn");
  const customSitesEl = document.getElementById("custom-sites");

  // Hosts ya cubiertos por el manifest (evita ofrecer añadir lo ya soportado).
  const BUILTIN_HOSTS = [
    "netflix.com", "primevideo.com", "amazon.", "max.com", "hbomax.com",
    "disneyplus.com", "plex.tv", "crunchyroll.com", "movistarplus.es",
    "tv.apple.com", "filmin.es", "skyshowtime.com", "pluto.tv", "rakuten.tv",
    "atresplayer.com", "rtve.es",
  ];
  const isBuiltin = (host) => BUILTIN_HOSTS.some((h) => host.includes(h));

  function renderCustomSites(sites) {
    customSitesEl.innerHTML = "";
    (sites || []).forEach((origin) => {
      const row = document.createElement("div");
      row.className = "log-item";
      const label = document.createElement("span");
      label.className = "log-message";
      try {
        label.textContent = new URL(origin).hostname;
      } catch (e) {
        label.textContent = origin;
      }
      const rm = document.createElement("span");
      rm.className = "log-time";
      rm.textContent = "✕";
      rm.style.cursor = "pointer";
      rm.title = "Quitar";
      rm.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "unregisterSite", origin }, () =>
          refreshSites(),
        );
      });
      row.appendChild(label);
      row.appendChild(rm);
      customSitesEl.appendChild(row);
    });
  }

  function refreshSites() {
    chrome.storage.local.get(["customSites"], (r) =>
      renderCustomSites(r.customSites || []),
    );
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    let origin = "";
    let host = "";
    try {
      if (tab && tab.url) {
        const u = new URL(tab.url);
        origin = u.origin;
        host = u.hostname;
      }
    } catch (e) {
      origin = "";
    }

    if (!origin || !/^https?:/.test(origin)) {
      currentSiteEl.textContent = "Abre una web de streaming para poder añadirla.";
      return;
    }
    if (isBuiltin(host)) {
      currentSiteEl.textContent = `${host} ya está soportado.`;
      return;
    }

    chrome.storage.local.get(["customSites"], (r) => {
      const sites = r.customSites || [];
      if (sites.includes(origin)) {
        currentSiteEl.textContent = `${host} ya está añadido.`;
        return;
      }
      currentSiteEl.textContent = `¿Sincronizar ${host}?`;
      addSiteBtn.style.display = "block";
      addSiteBtn.addEventListener(
        "click",
        () => {
          addSiteBtn.disabled = true;
          // request() debe ejecutarse dentro del gesto del usuario (el clic).
          chrome.permissions.request({ origins: [origin + "/*"] }, (granted) => {
            if (!granted) {
              addSiteBtn.disabled = false;
              return;
            }
            chrome.runtime.sendMessage({ action: "registerSite", origin }, (resp) => {
              addSiteBtn.disabled = false;
              if (resp && resp.success) {
                addSiteBtn.style.display = "none";
                currentSiteEl.textContent = `${host} añadido. Recarga la pestaña.`;
                refreshSites();
              }
            });
          });
        },
        { once: true },
      );
    });
  });

  refreshSites();
});
