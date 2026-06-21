// popup.js - Check active session status of The Show Verse and load event logs

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const userInfo = document.getElementById("user-info");
  const userEmail = document.getElementById("user-email");
  const actionBtn = document.getElementById("action-btn");
  const logsList = document.getElementById("logs-list");

  // 1. Fetch dynamic host origin and check session
  chrome.storage.local.get(["showVerseOrigin", "logs"], (result) => {
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

    // Verify authentication cookies
    fetch(`${origin}/api/auth/me`, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.user) {
          statusDot.className = "dot dot-green";
          statusText.textContent = "Sincronización activa";
          
          userInfo.style.display = "block";
          userEmail.textContent = json.user.displayName || json.user.username || json.user.email;
          
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
});
