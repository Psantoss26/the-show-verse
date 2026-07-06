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
    chrome.storage.local.get(["streamingSyncPaused"], (result) => {
      applyPausedState(result.streamingSyncPaused);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.streamingSyncPaused) return;
      applyPausedState(changes.streamingSyncPaused.newValue);
    });
  } catch (e) {
    start();
  }
})();
