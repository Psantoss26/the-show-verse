// content.js — Observador de reproducción universal para The Show Verse.
//
// Detección Media-Session-first (detection-core.js) + refinadores opcionales por
// plataforma (platform-enhancers.js). Funciona en cualquier sitio donde se
// inyecte (lista curada del manifest + sitios añadidos por el usuario). La
// resolución a TMDb y la deduplicación ocurren en el servidor.
(function () {
  const POLL_MS = 2000;
  const MIN_WATCH_SECONDS = 15; // umbral para contar como visionado real
  const DEBUG_THROTTLE_MS = 15000;

  const D = self.TSVDetection;
  const E = self.TSVEnhancers;
  if (!D) {
    console.warn("[The Show Verse] detection-core.js no está cargado; sync inactivo.");
    return;
  }

  // Nombre legible de la plataforma según el host (para logs/UI). Si no está en
  // la lista, se usa el propio host (sitios añadidos por el usuario).
  const PLATFORM_NAMES = {
    "netflix.com": "Netflix",
    "primevideo.com": "Prime Video",
    amazon: "Prime Video",
    "max.com": "Max",
    "hbomax.com": "HBO Max",
    "disneyplus.com": "Disney+",
    "plex.tv": "Plex",
    "crunchyroll.com": "Crunchyroll",
    "movistarplus.es": "Movistar+",
    "tv.apple.com": "Apple TV+",
    "filmin.es": "Filmin",
    "skyshowtime.com": "SkyShowtime",
    "pluto.tv": "Pluto TV",
    "rakuten.tv": "Rakuten TV",
    "atresplayer.com": "Atresplayer",
    "rtve.es": "RTVE",
  };

  function platformInfo(host) {
    const h = String(host || "").replace(/^www\./, "");
    for (const key in PLATFORM_NAMES) {
      if (h.includes(key)) return { id: key.split(".")[0], name: PLATFORM_NAMES[key] };
    }
    return { id: h, name: h };
  }

  // Nombres de plataforma "a secas" — nunca deben usarse como título: buscar
  // "Netflix" en TMDb devuelve una película basura ("Netflix Tudum 2025"…).
  const PLATFORM_NAME_SET = new Set(
    Object.values(PLATFORM_NAMES)
      .concat(["HBO", "Star+", "Paramount+", "Amazon", "Disney", "Pluto", "Rakuten"])
      .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()),
  );
  function isBarePlatformName(t) {
    return PLATFORM_NAME_SET.has(
      String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    );
  }

  // Último título BUENO por vídeo. El overlay de título de Netflix (y otros) se
  // oculta durante la reproducción y el elemento desaparece del DOM; sin esto
  // caeríamos al título de la pestaña (a menudo solo "Netflix"). Se cachea cuando
  // el overlay está visible y se reutiliza mientras se ve el mismo vídeo.
  let lastGood = null;

  // ---- Indicador de acceso rápido a la página de detalles de The Show Verse ----
  // Widget flotante en el lateral que aparece cuando el título se resuelve, con un
  // enlace directo a su página de detalles. Se construye por DOM+estilos JS dentro
  // de un Shadow DOM: aislado del CSS del sitio y sin chocar con su CSP.
  const INDICATOR_HOST_ID = "tsv-quick-access-host";
  let indicatorEnabled = true; // se lee de storage al iniciar
  let indicatorDismissedUrl = null; // URL ocultada por el usuario (no re-mostrar)
  let indicatorCurrentUrl = null; // URL visible ahora (evita reconstruir en bucle)

  function el(tag, styles, props) {
    const node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    if (props) Object.assign(node, props);
    return node;
  }

  function hideIndicator() {
    const host = document.getElementById(INDICATOR_HOST_ID);
    if (host) host.remove();
    indicatorCurrentUrl = null;
  }

  function showIndicator({ url, title, posterPath }) {
    if (!indicatorEnabled || !url) return;
    if (url === indicatorDismissedUrl) return; // el usuario lo ocultó para este título
    if (url === indicatorCurrentUrl && document.getElementById(INDICATOR_HOST_ID)) return;

    const prev = document.getElementById(INDICATOR_HOST_ID);
    if (prev) prev.remove();

    const host = el("div", {
      position: "fixed",
      top: "50%",
      right: "14px",
      transform: "translateY(-50%)",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    host.id = INDICATOR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const wrap = el("div", {
      position: "relative",
      pointerEvents: "auto",
      fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    });

    const card = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      maxWidth: "250px",
      padding: "8px 12px 8px 8px",
      background: "rgba(10,10,15,0.92)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "14px",
      boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
      color: "#fff",
      cursor: "pointer",
      transition: "transform .15s ease",
    });
    card.setAttribute("role", "link");
    card.tabIndex = 0;
    card.title = "Ver en The Show Verse";
    card.onmouseenter = () => {
      card.style.transform = "scale(1.03)";
    };
    card.onmouseleave = () => {
      card.style.transform = "scale(1)";
    };
    const open = () => {
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        /* noop */
      }
    };
    card.onclick = open;
    card.onkeydown = (e) => {
      if (e.key === "Enter") open();
    };

    if (posterPath) {
      const img = el(
        "img",
        {
          width: "40px",
          height: "60px",
          borderRadius: "8px",
          objectFit: "cover",
          background: "#222",
          flex: "0 0 auto",
          display: "block",
        },
        { src: `https://image.tmdb.org/t/p/w92${posterPath}`, alt: "" },
      );
      // Si la CSP del sitio bloquea la imagen, la ocultamos y seguimos.
      img.onerror = () => {
        img.style.display = "none";
      };
      card.appendChild(img);
    }

    const txt = el("div", { minWidth: "0", lineHeight: "1.25" });
    txt.appendChild(
      el(
        "div",
        {
          fontSize: "10px",
          letterSpacing: ".4px",
          color: "#EAB308",
          fontWeight: "800",
          textTransform: "uppercase",
        },
        { textContent: "The Show Verse" },
      ),
    );
    txt.appendChild(
      el(
        "div",
        {
          fontSize: "13px",
          fontWeight: "700",
          marginTop: "2px",
          display: "-webkit-box",
          webkitLineClamp: "2",
          webkitBoxOrient: "vertical",
          overflow: "hidden",
        },
        { textContent: title || "Ver detalles" },
      ),
    );
    txt.appendChild(
      el(
        "div",
        { fontSize: "11px", color: "#a1a1aa", marginTop: "3px" },
        { textContent: "Ver detalles ↗" },
      ),
    );
    card.appendChild(txt);

    const close = el(
      "div",
      {
        position: "absolute",
        top: "-8px",
        right: "-8px",
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: "#18181b",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "#d4d4d8",
        fontSize: "13px",
        lineHeight: "18px",
        textAlign: "center",
        cursor: "pointer",
        pointerEvents: "auto",
      },
      { textContent: "×" },
    );
    close.title = "Ocultar";
    close.onclick = (e) => {
      e.stopPropagation();
      indicatorDismissedUrl = url;
      hideIndicator();
    };

    wrap.appendChild(card);
    wrap.appendChild(close);
    shadow.appendChild(wrap);
    (document.documentElement || document.body).appendChild(host);
    indicatorCurrentUrl = url;
  }

  // Devuelve el <video> principal en reproducción (reproductor real grande).
  // Con all_frames evitamos miniaturas/anuncios de frames laterales exigiendo
  // un tamaño mínimo de reproductor.
  function getMainVideo() {
    const videos = Array.from(document.querySelectorAll("video")).filter(
      (v) =>
        v.readyState > 0 &&
        isFinite(v.duration) &&
        v.duration > 0 &&
        v.clientWidth >= 320 &&
        v.clientHeight >= 180,
    );
    if (!videos.length) return null;
    videos.sort(
      (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
    );
    return videos[0];
  }

  // Metadatos crudos de Media Session (título/artista/álbum/carátulas).
  function mediaSessionRaw() {
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!m) return null;
      return {
        title: m.title || "",
        artist: m.artist || "",
        album: m.album || "",
        artwork: Array.isArray(m.artwork)
          ? m.artwork.map((a) => ({ src: a.src, sizes: a.sizes }))
          : [],
      };
    } catch (e) {
      return null;
    }
  }

  const { id: platformId, name: platformName } = platformInfo(location.hostname);
  console.log(`[The Show Verse] Observador universal activo (${platformName}).`);

  let lastKey = null;
  let lastDebug = 0;
  let pollTimer = null;
  let syncPaused = false;

  // Comprueba que el contexto de la extensión siga vivo. Tras recargar/actualizar
  // la extensión, el content script antiguo queda huérfano y `chrome.runtime`
  // pasa a ser undefined: acceder a él lanza y rompería cada tick.
  function extensionAlive() {
    try {
      return Boolean(
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id,
      );
    } catch (e) {
      return false;
    }
  }

  function stop() {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function start() {
    if (pollTimer == null && !syncPaused) {
      pollTimer = setInterval(tick, POLL_MS);
    }
  }

  // Construye el PlaybackSignal a partir de las señales de la página, o null si
  // no hay reproducción real (sin vídeo grande o por debajo del umbral).
  function buildSignal() {
    const video = getMainVideo();
    if (!video || video.currentTime < MIN_WATCH_SECONDS) return null;

    let seasonEpisodeText = "";
    try {
      seasonEpisodeText = D.findSeasonEpisodeBadge(document);
    } catch (e) {
      seasonEpisodeText = "";
    }

    let signal = D.buildPlaybackSignal({
      host: location.hostname,
      url: location.href,
      contentId: null,
      mediaSession: mediaSessionRaw(),
      tabTitle: document.title,
      seasonEpisodeText,
      durationSec: isFinite(video.duration) ? Math.round(video.duration) : undefined,
      positionSec: Math.round(video.currentTime),
    });

    if (E) {
      try {
        signal = E.enhance(location.hostname, signal, document);
      } catch (e) {
        /* refinador falló: seguimos con la señal base */
      }
    }

    // Cache del último título bueno para ESTE vídeo: si ahora tenemos serie/peli
    // (overlay visible) lo guardamos; si no (overlay oculto, elemento fuera del
    // DOM) lo recuperamos, evitando caer al título de la pestaña ("Netflix").
    const cid = signal.contentId;
    if (cid && (signal.showName || signal.movieTitle)) {
      lastGood = {
        contentId: cid,
        showName: signal.showName,
        movieTitle: signal.movieTitle,
        episodeName: signal.episodeName,
        season: signal.season,
        episode: signal.episode,
      };
    } else if (cid && lastGood && lastGood.contentId === cid) {
      signal.showName = signal.showName || lastGood.showName;
      signal.movieTitle = signal.movieTitle || lastGood.movieTitle;
      signal.episodeName = signal.episodeName || lastGood.episodeName;
      if (signal.season == null) signal.season = lastGood.season;
      if (signal.episode == null) signal.episode = lastGood.episode;
    }

    // Último recurso: título desde la pestaña si Media Session no dio nombre —
    // pero NUNCA un nombre de plataforma suelto ("Netflix"), que resolvería a una
    // película sin relación.
    if (!signal.showName && !signal.movieTitle) {
      const fromTab = D.stripPlatformPrefix(document.title, [platformName]);
      if (fromTab && !isBarePlatformName(fromTab)) signal.movieTitle = fromTab;
    }

    return signal;
  }

  function tick() {
    if (!extensionAlive()) {
      // Extensión recargada/actualizada: paramos este script huérfano. La
      // pestaña recuperará la sincronización al recargarse.
      stop();
      return;
    }
    if (syncPaused) {
      stop();
      return;
    }

    const signal = buildSignal();
    const rawMain =
      signal && (signal.showName || signal.movieTitle || signal.tabTitle);
    // Nunca sincronizar un nombre de plataforma suelto ("Netflix"): es señal de
    // que no se ha capturado un título real; mejor esperar al siguiente ciclo.
    const mainTitle = rawMain && !isBarePlatformName(rawMain) ? rawMain : null;

    if (!signal || !mainTitle) {
      const now = Date.now();
      if (now - lastDebug > DEBUG_THROTTLE_MS) {
        lastDebug = now;
        console.log(
          `[The Show Verse] ${platformName}: reproducción detectada pero sin título legible.`,
        );
      }
      return;
    }

    const key = `${platformId}:${signal.contentId || `${mainTitle}|${signal.episodeName || ""}`}`;
    if (key === lastKey) return;

    // Optimista: marcamos el contenido como intentado ANTES de enviar para no
    // reintentar en bucle títulos que no resuelvan (el servidor deduplica igual).
    lastKey = key;

    try {
      chrome.runtime.sendMessage(
        {
          action: "syncWatch",
          platform: platformId,
          platformName,
          ...signal,
          // Retrocompat con el backend/route: mainTitle/subTitle.
          mainTitle,
          subTitle: signal.episodeName || "",
        },
        (response) => {
          if (!extensionAlive()) return;
          if (chrome.runtime.lastError) {
            // El service worker no respondió (transitorio): permitimos reintentar.
            lastKey = null;
            return;
          }
          if (response && response.success) {
            console.log(
              `[The Show Verse] Sincronizado (${platformName}): "${mainTitle}"`,
            );
            // Acceso rápido: si el título se resolvió, mostramos el indicador con
            // enlace directo a su página de detalles en The Show Verse.
            const synced = response.synced;
            if (synced && synced.tmdbId && response.origin) {
              const url = D.buildDetailsUrl(response.origin, synced);
              if (url) {
                showIndicator({
                  url,
                  title: synced.title || mainTitle,
                  posterPath: synced.posterPath,
                });
              }
            }
          }
        },
      );
    } catch (e) {
      // Contexto invalidado justo al enviar: permitimos reintento y paramos.
      lastKey = null;
      stop();
    }
  }

  function applyPausedState(paused) {
    syncPaused = Boolean(paused);
    if (syncPaused) {
      stop();
    } else {
      lastKey = null;
      start();
    }
  }

  try {
    chrome.storage.local.get(
      ["streamingSyncPaused", "indicatorEnabled"],
      (result) => {
        indicatorEnabled = result.indicatorEnabled !== false; // por defecto true
        applyPausedState(result.streamingSyncPaused);
      },
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.streamingSyncPaused) {
        applyPausedState(changes.streamingSyncPaused.newValue);
      }
      if (changes.indicatorEnabled) {
        indicatorEnabled = changes.indicatorEnabled.newValue !== false;
        if (!indicatorEnabled) hideIndicator();
      }
    });
  } catch (e) {
    start();
  }
})();
