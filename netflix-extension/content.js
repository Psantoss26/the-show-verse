// content.js — Observador de reproducción universal para The Show Verse.
//
// Detección Media-Session-first (detection-core.js) + refinadores opcionales por
// plataforma (platform-enhancers.js). Funciona en cualquier sitio donde se
// inyecte (lista curada del manifest + sitios añadidos por el usuario). La
// resolución a TMDb y la deduplicación ocurren en el servidor.
(function () {
  const POLL_MS = 2000;
  // Umbral para contar como visionado real (añadir al historial). El indicador de
  // acceso rápido ya NO depende de esto: sale en la ficha del título vía resolveOnly.
  const MIN_WATCH_SECONDS = 15;
  const DEBUG_THROTTLE_MS = 15000;
  // Cada cuánto se envía el progreso de reproducción (posición/duración) para
  // "Continuar viendo". Al 90% el servidor lo marca como visto automáticamente.
  const PROGRESS_PING_MS = 30000;

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
  let lastBrowseKey = null; // dedup del indicador de FICHA (resolveOnly)

  // Páginas genéricas del catálogo (no son la ficha de un título): no resolver.
  const GENERIC_TITLES = new Set(
    [
      "inicio", "home", "browse", "explorar", "explora", "mi lista", "my list",
      "películas", "peliculas", "movies", "series", "tv shows", "programas de tv",
      "novedades", "new", "buscar", "search", "mi netflix", "próximamente",
      "proximamente", "descargas", "downloads", "categorías", "categorias",
      "originales", "populares", "tendencias", "trending", "watch", "ver",
      "prime video", "index",
    ].map((s) => s.toLowerCase()),
  );

  // Patrones de URL que indican que estás en la FICHA de un título (no en el home
  // ni buscando). Evita falsos positivos con títulos destacados del catálogo. Si
  // no hay patrón para la plataforma, no se filtra por URL.
  const DETAILS_URL_RE = {
    netflix: /\/title\/\d+|[?&#]jbv=\d+/i,
    primevideo: /\/detail\//i,
    amazon: /\/detail\//i,
    max: /\/(show|movie|series|video|episode|feature)\//i,
    hbomax: /\/(show|movie|series|video|episode|feature)\//i,
    disney: /\/(movies|series|browse\/entity|play)\//i,
    crunchyroll: /\/series\/|\/watch\//i,
    disneyplus: /\/(movies|series|browse\/entity|play)\//i,
  };

  // Selectores del título en la FICHA por plataforma. Se lee del DOM VISIBLE (que
  // refleja el título ACTUAL), no de og:title (que queda obsoleto en los SPA y
  // provocaba resultados sin relación, p. ej. "PFL Europa 1"). Se lee el texto o
  // el alt de una imagen-logo. Se añade <h1> como respaldo universal.
  const DETAILS_TITLE_SELECTORS = {
    netflix: [
      '[data-uia="previewModal--player-titleTreatment-logo"]',
      '[data-uia="title-card-title"]',
      ".title-info-metadata-item--title",
      ".previewModal--section-header strong",
    ],
    primevideo: [
      'h1[data-automation-id="title"]',
      '[data-automation-id="title"]',
      ".dv-node-dp-title",
    ],
    amazon: [
      'h1[data-automation-id="title"]',
      '[data-automation-id="title"]',
      ".dv-node-dp-title",
    ],
    max: [
      '[data-testid="dragonfly-title"]',
      '[data-testid="detail-page-title"]',
    ],
    hbomax: ['[data-testid="dragonfly-title"]'],
    disney: ['[data-testid="hero-title"]', ".title-field"],
    disneyplus: ['[data-testid="hero-title"]', ".title-field"],
    crunchyroll: ["h1.erc-series-title", "h1.title", ".hero-heading"],
  };

  function cleanTitleCandidate(t) {
    return D.stripPlatformPrefix(t || "", [platformName]);
  }
  function isValidBrowseTitle(t) {
    if (!t || t.length < 2 || t.length > 120) return false;
    if (isBarePlatformName(t)) return false;
    if (GENERIC_TITLES.has(t.toLowerCase())) return false;
    return true;
  }
  // Texto del nodo o, si es un logo, el alt de la imagen (el propio nodo o hija).
  function textOrAlt(node) {
    let txt = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!txt && node.getAttribute) txt = (node.getAttribute("alt") || "").trim();
    if (!txt && node.querySelector) {
      const img = node.querySelector("img[alt]");
      if (img) txt = (img.getAttribute("alt") || "").trim();
    }
    return txt;
  }

  // Encabezado más prominente y VISIBLE cerca de la parte superior. Agnóstico a la
  // plataforma: cubre HBO Max y cualquier web sin selector propio. Elige el
  // candidato válido con mayor tamaño de fuente y más arriba (el título de la ficha).
  function detectTitleFromHeadings() {
    let best = "";
    let bestScore = -1;
    let nodes;
    try {
      nodes = document.querySelectorAll(
        'h1, h2, [data-testid*="title" i], [class*="title" i]',
      );
    } catch (e) {
      return "";
    }
    const limit = Math.min(nodes.length, 500);
    const vh = self.innerHeight || 1080;
    for (let i = 0; i < limit; i += 1) {
      const node = nodes[i];
      if (node.getClientRects().length === 0) continue; // no renderizado/oculto
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 14) continue;
      if (rect.top > vh * 0.9 || rect.top < -200) continue; // fuera de zona útil
      const t = cleanTitleCandidate(textOrAlt(node));
      if (!isValidBrowseTitle(t)) continue;
      let fontSize = 0;
      try {
        fontSize = parseFloat(getComputedStyle(node).fontSize) || 0;
      } catch (e) {
        fontSize = 0;
      }
      const score = fontSize * 2 - rect.top / 60;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  // Título de la FICHA que se está viendo (navegando, SIN reproducir). Criterio
  // sólido: solo en URLs de ficha; (1) selector propio de la plataforma, (2)
  // encabezado más prominente del DOM, (3) título de pestaña. Nunca og:title.
  function detectBrowsingTitle() {
    const urlRe = DETAILS_URL_RE[platformId];
    if (urlRe && !urlRe.test(location.href)) return "";

    // 1. Selectores específicos de la plataforma (precisos cuando existen).
    const selectors = DETAILS_TITLE_SELECTORS[platformId] || [];
    for (const sel of selectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      for (const node of nodes) {
        const t = cleanTitleCandidate(textOrAlt(node));
        if (isValidBrowseTitle(t)) return t;
      }
    }

    // 2. Encabezado más prominente (universal; robusto para HBO Max y otros).
    const heading = detectTitleFromHeadings();
    if (heading) return heading;

    // 3. Último recurso: título de la pestaña (NUNCA og:title: queda obsoleto).
    const fromTab = cleanTitleCandidate(document.title);
    return isValidBrowseTitle(fromTab) ? fromTab : "";
  }

  // Señal RICA de la ficha: además del título, intenta obtener el nombre de la
  // SERIE + temporada/episodio de los datos estructurados JSON-LD (Prime/Max los
  // exponen), lo que permite resolver el EPISODIO correcto (no solo la serie) sin
  // reproducir. Cae al título por selector/encabezado/pestaña y, en último recurso,
  // a og:title. Solo actúa en URLs de ficha (evita falsos positivos en la home).
  function detectBrowsingSignal() {
    const urlRe = DETAILS_URL_RE[platformId];
    if (urlRe && !urlRe.test(location.href)) return null;

    // 1. JSON-LD (schema.org): fiable y estructurado (serie + T/E).
    const ld = D.detectFromJsonLd(document);
    if (ld) {
      const main = cleanTitleCandidate(ld.showName || ld.movieTitle || ld.episodeName);
      if (isValidBrowseTitle(main)) {
        return {
          mainTitle: main,
          showName: ld.showName ? cleanTitleCandidate(ld.showName) : "",
          episodeName: ld.episodeName || "",
          season: ld.season != null ? ld.season : undefined,
          episode: ld.episode != null ? ld.episode : undefined,
        };
      }
    }

    // 2. Título por selector propio / encabezado / pestaña (lógica existente).
    const title = detectBrowsingTitle();
    if (title) return { mainTitle: title };

    // 3. Último recurso: og:title (mejor que nada para Prime/Max si todo lo demás falla).
    const og = cleanTitleCandidate(D.detectFromMeta(document));
    return isValidBrowseTitle(og) ? { mainTitle: og } : null;
  }

  // Muestra el indicador de acceso rápido para la FICHA actual, resolviendo el
  // título contra TMDb en modo resolveOnly (NO añade nada al historial).
  function maybeShowBrowsingIndicator() {
    if (!indicatorEnabled || syncPaused) return;
    const sig = detectBrowsingSignal();
    if (!sig || !sig.mainTitle) return;
    const title = sig.mainTitle;
    const key = `${platformId}:browse:${sig.showName || title}:${sig.season ?? ""}:${sig.episode ?? ""}`;
    if (key === lastBrowseKey) return; // ya resuelto para esta ficha
    lastBrowseKey = key;
    try {
      chrome.runtime.sendMessage(
        {
          action: "syncWatch",
          platform: platformId,
          platformName,
          mainTitle: title,
          showName: sig.showName || "",
          episodeName: sig.episodeName || "",
          season: sig.season,
          episode: sig.episode,
          subTitle: "",
          tabTitle: document.title,
          resolveOnly: true,
        },
        (response) => {
          if (!extensionAlive()) return;
          if (chrome.runtime.lastError) {
            lastBrowseKey = null; // transitorio: permitir reintento
            return;
          }
          if (
            response &&
            response.success &&
            response.synced &&
            response.synced.tmdbId &&
            response.origin
          ) {
            const url = D.buildDetailsUrl(response.origin, response.synced);
            if (url) {
              showIndicator({
                url,
                title: response.synced.title || title,
                posterPath: response.synced.posterPath,
              });
            }
          }
        },
      );
    } catch (e) {
      lastBrowseKey = null;
    }
  }

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

  // Logo de la app como SVG inline (a prueba de CSP; sin recursos externos).
  function appLogo(size) {
    const box = el("div", {
      width: size + "px",
      height: size + "px",
      flex: "0 0 auto",
      lineHeight: "0",
    });
    box.innerHTML =
      '<svg width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M28,54 a26,26 0 1,0 52,0 a26,26 0 1,0 -52,0" fill="none" stroke="#EAB308" stroke-width="6"/>' +
      '<path d="M48,42 L48,66 L69,54 Z" fill="#EAB308"/>' +
      "</svg>";
    return box;
  }

  function showIndicator({ url, title, posterPath }) {
    if (!indicatorEnabled || !url) return;
    if (url === indicatorDismissedUrl) return; // el usuario lo ocultó para este título
    if (url === indicatorCurrentUrl && document.getElementById(INDICATOR_HOST_ID)) return;

    const prev = document.getElementById(INDICATOR_HOST_ID);
    if (prev) prev.remove();

    // Esquina superior derecha, superpuesto a todo (z-index máximo).
    const host = document.createElement("div");
    host.id = INDICATOR_HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      pointerEvents: "none",
    });

    const shadow = host.attachShadow({ mode: "open" });

    // CSS para el popup "Liquid Glass" Premium (Portada completa + Auto-dismiss)
    const style = document.createElement("style");
    style.textContent = `
      .tsv-wrap {
        position: relative;
        pointer-events: auto;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 0;
        transform: translateY(-16px);
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .tsv-wrap.show {
        opacity: 1;
        transform: translateY(0);
      }
      .tsv-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        width: 170px;
        max-width: 80vw;
        padding: 0 0 14px 0;
        background: rgba(10, 10, 15, 0.65);
        border: 1.5px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 
          inset 0 1px 1.5px rgba(255, 255, 255, 0.22),
          0 16px 40px -8px rgba(0, 0, 0, 0.8),
          0 4px 12px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(32px) saturate(1.2);
        -webkit-backdrop-filter: blur(32px) saturate(1.2);
        color: #fff;
        cursor: pointer;
        user-select: none;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s, border-color 0.25s, box-shadow 0.25s;
      }
      .tsv-card:hover {
        transform: translateY(-2px) scale(1.02);
        background-color: rgba(15, 15, 22, 0.8);
        border-color: rgba(255, 255, 255, 0.22);
        box-shadow: 
          inset 0 1px 1.5px rgba(255, 255, 255, 0.28),
          0 24px 48px -6px rgba(0, 0, 0, 0.85),
          0 6px 16px rgba(0, 0, 0, 0.5);
      }
      .tsv-poster-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 2/3;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1.5px solid rgba(255, 255, 255, 0.08);
      }
      .tsv-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .tsv-content {
        width: 100%;
        padding: 0 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        box-sizing: border-box;
      }
      .tsv-title {
        font-size: 13px;
        font-weight: 750;
        line-height: 1.3;
        color: #ffffff;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-word;
        letter-spacing: -0.01em;
      }
      .tsv-link-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 9.5px;
        font-weight: 800;
        color: #eab308;
        background: rgba(234, 179, 8, 0.06);
        border: 1px solid rgba(234, 179, 8, 0.16);
        padding: 4px 12px;
        border-radius: 100px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        transition: background-color 0.2s, border-color 0.2s;
        margin-top: 2px;
      }
      .tsv-card:hover .tsv-link-pill {
        background-color: rgba(234, 179, 8, 0.15);
        border-color: rgba(234, 179, 8, 0.3);
      }
      @media (max-width: 480px) {
        .tsv-card {
          width: 140px;
          gap: 10px;
          padding: 0 0 10px 0;
          border-radius: 20px;
        }
        .tsv-content {
          padding: 0 10px;
        }
        .tsv-title {
          font-size: 12px;
        }
        .tsv-link-pill {
          font-size: 8.5px;
          padding: 3px 10px;
        }
      }
    `;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "tsv-wrap";

    const posterImgHtml = posterPath 
      ? `<div class="tsv-poster-wrapper">
           <img class="tsv-poster" src="https://image.tmdb.org/t/p/w154${posterPath}" alt="" />
         </div>`
      : `<div class="tsv-poster-wrapper" style="display:flex; align-items:center; justify-content:center;">
           <svg style="width:30px; height:30px; opacity:0.3;" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
             <path d="M28,54 a26,26 0 1,0 52,0 a26,26 0 1,0 -52,0" fill="none" stroke="#FFF" stroke-width="6"/>
             <path d="M48,42 L48,66 L69,54 Z" fill="#FFF"/>
           </svg>
         </div>`;

    wrap.innerHTML = `
      <div class="tsv-card" role="link" tabindex="0" title="Ver en The Show Verse">
        ${posterImgHtml}
        <div class="tsv-content">
          <div class="tsv-title">${title || "Ver detalles"}</div>
          <div class="tsv-link-pill">
            <span>Ver detalles</span>
            <span style="font-size: 9px; margin-left: 2px;">↗</span>
          </div>
        </div>
      </div>
    `;

    const cardNode = wrap.querySelector(".tsv-card");

    const open = () => {
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        /* noop */
      }
      clearDismissTimer();
      wrap.classList.remove("show");
      hideIndicator();
    };

    cardNode.onclick = open;
    cardNode.onkeydown = (e) => {
      if (e.key === "Enter") open();
    };

    // Temporizador de auto-cierre con pausa al hacer hover (5 segundos)
    let autoDismissTimer = null;
    const startDismissTimer = () => {
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(() => {
        wrap.classList.remove("show");
        setTimeout(hideIndicator, 350); // espera a que termine la animación de salida
      }, 5000); // 5 segundos
    };

    const clearDismissTimer = () => {
      if (autoDismissTimer) {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
      }
    };

    cardNode.onmouseenter = () => {
      clearDismissTimer();
    };

    cardNode.onmouseleave = () => {
      startDismissTimer();
    };

    const imgNode = wrap.querySelector(".tsv-poster");
    if (imgNode) {
      imgNode.onerror = () => {
        const wrapNode = wrap.querySelector(".tsv-poster-wrapper");
        if (wrapNode) wrapNode.style.display = "none";
      };
    }

    shadow.appendChild(wrap);
    (document.documentElement || document.body).appendChild(host);
    indicatorCurrentUrl = url;

    // Dispara la animación de entrada en el siguiente frame.
    requestAnimationFrame(() => {
      wrap.classList.add("show");
    });

    // Iniciar temporizador inicial
    startDismissTimer();
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
  // Progreso: entidad resuelta del contenido en curso (para enviar posición sin
  // volver a resolver) + control de cadencia de los pings.
  let currentSynced = null;
  let currentSyncedKey = null;
  let lastProgressPingAt = 0;
  // Vídeo al que ya hemos enganchado los listeners de pausa/fin (para guardar el
  // punto exacto al salir sin duplicar listeners).
  let listenedVideo = null;

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

    // Respaldo JSON-LD: Prime Video y Max no exponen artist/album en la Media
    // Session, así que el nombre de la SERIE se pierde y el "title" (episodio) se
    // toma por película → el episodio no resuelve (404). Los datos estructurados de
    // la ficha/reproductor sí traen la serie + temporada/episodio: los usamos para
    // completar y, si el episodio se había tomado por película, reclasificarlo.
    if (!signal.showName) {
      const ld = D.detectFromJsonLd(document);
      if (ld) {
        if (ld.showName) {
          signal.showName = ld.showName;
          if (signal.movieTitle && !signal.episodeName) {
            signal.episodeName = signal.movieTitle;
            signal.movieTitle = undefined;
          }
        } else if (ld.movieTitle && !signal.movieTitle) {
          signal.movieTitle = ld.movieTitle;
        }
        if (!signal.episodeName && ld.episodeName) signal.episodeName = ld.episodeName;
        if (signal.season == null && ld.season != null) signal.season = ld.season;
        if (signal.episode == null && ld.episode != null) signal.episode = ld.episode;
      }
    }

    // Último recurso: título desde la pestaña si Media Session no dio nombre —
    // pero NUNCA un nombre de plataforma suelto ("Netflix"), que resolvería a una
    // película sin relación. Si la señal tiene evidencia de EPISODIO (números S×E
    // o nombre de episodio), el nombre de la pestaña es el de la SERIE (caso Prime
    // sin JSON-LD): va a showName para que el servidor resuelva como TV.
    if (!signal.showName && !signal.movieTitle) {
      const fromTab = D.stripPlatformPrefix(document.title, [platformName]);
      if (fromTab && !isBarePlatformName(fromTab)) {
        if (signal.episode != null || signal.episodeName) {
          signal.showName = fromTab;
        } else {
          signal.movieTitle = fromTab;
        }
      }
    }

    return signal;
  }

  // Envía el progreso (posición/duración) del contenido ya resuelto, como mucho
  // una vez cada PROGRESS_PING_MS. El servidor hace upsert de "Continuar viendo"
  // y, al 90%, lo marca como visto y responde completed:true (dejamos de sondear).
  function maybeSendProgress(signal, key) {
    if (!currentSynced || currentSyncedKey !== key) return;
    const dur = Number(signal.durationSec);
    const pos = Number(signal.positionSec);
    if (!isFinite(dur) || dur <= 0 || !isFinite(pos) || pos < 0) return;
    const now = Date.now();
    if (now - lastProgressPingAt < PROGRESS_PING_MS) return;
    lastProgressPingAt = now;
    const synced = currentSynced;
    try {
      chrome.runtime.sendMessage(
        {
          action: "syncProgress",
          tmdbId: synced.tmdbId,
          mediaType: synced.mediaType,
          season: synced.season,
          episode: synced.episode,
          title: synced.title,
          posterPath: synced.posterPath,
          platform: platformId,
          positionSeconds: Math.round(pos),
          runtimeSeconds: Math.round(dur),
        },
        (resp) => {
          if (!extensionAlive()) return;
          if (chrome.runtime.lastError) {
            // Service worker no respondió: reintentamos en el próximo ciclo.
            lastProgressPingAt = 0;
            return;
          }
          if (resp && resp.completed) {
            // Ya marcado como visto (≥90%): dejamos de sondear este contenido.
            currentSynced = null;
            currentSyncedKey = null;
          }
        },
      );
    } catch (e) {
      lastProgressPingAt = 0;
    }
  }

  // Envío INMEDIATO del progreso (ignora la cadencia): al pausar, terminar,
  // cambiar de pestaña o cerrar. Así se guarda el punto EXACTO de reproducción
  // al salir, sin esperar al siguiente ciclo de 30 s.
  function flushProgress() {
    if (syncPaused || !currentSynced || !currentSyncedKey) return;
    const video = getMainVideo();
    if (!video) return;
    const dur = isFinite(video.duration) ? Math.round(video.duration) : 0;
    const pos = Math.round(video.currentTime || 0);
    if (dur <= 0 || pos < 0) return;
    lastProgressPingAt = 0; // salta el throttle
    maybeSendProgress({ durationSec: dur, positionSec: pos }, currentSyncedKey);
  }

  // Engancha (una sola vez por elemento) los listeners de pausa/fin del vídeo
  // para volcar la posición justo al pausar o terminar.
  function ensureVideoListeners(video) {
    if (!video || video === listenedVideo) return;
    listenedVideo = video;
    try {
      video.addEventListener("pause", flushProgress);
      video.addEventListener("ended", flushProgress);
    } catch (e) {
      /* elemento no válido: se reintentará con el siguiente vídeo */
    }
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
    if (!signal) {
      // No hay reproducción real (estamos navegando por la FICHA del título):
      // mostramos el indicador de acceso rápido resolviendo el título en modo
      // resolveOnly, SIN añadir nada al historial.
      maybeShowBrowsingIndicator();
      return;
    }
    const rawMain =
      signal && (signal.showName || signal.movieTitle || signal.tabTitle);
    // Nunca sincronizar un nombre de plataforma suelto ("Netflix"): es señal de
    // que no se ha capturado un título real; mejor esperar al siguiente ciclo.
    const mainTitle = rawMain && !isBarePlatformName(rawMain) ? rawMain : null;

    if (!mainTitle) {
      const now = Date.now();
      if (now - lastDebug > DEBUG_THROTTLE_MS) {
        lastDebug = now;
        console.log(
          `[The Show Verse] ${platformName}: reproducción detectada pero sin título legible.`,
        );
      }
      // Aun sin título de reproducción legible, probamos el indicador de ficha.
      maybeShowBrowsingIndicator();
      return;
    }

    const key = `${platformId}:${signal.contentId || `${mainTitle}|${signal.episodeName || ""}`}`;

    // Ya resolvimos este contenido: enviamos progreso (Continuar viendo + visto
    // al 90%). Va ANTES del corte por dedup para que siga latiendo cada ciclo.
    maybeSendProgress(signal, key);
    // Engancha pausa/fin del vídeo para volcar el punto exacto al salir.
    ensureVideoListeners(getMainVideo());

    if (key === lastKey) return;

    // Optimista: marcamos el contenido como intentado ANTES de enviar para no
    // reintentar en bucle títulos que no resuelvan (el servidor deduplica igual).
    lastKey = key;
    // Contenido nuevo: reiniciamos el estado de progreso.
    currentSynced = null;
    currentSyncedKey = null;
    lastProgressPingAt = 0;

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
          // Reproducción real: solo RESOLVEMOS el título (para "Continuar viendo"
          // y el indicador). El "visto" ya no se marca al detectar, sino al 90%
          // mediante los pings de progreso.
          resolveOnly: true,
        },
        (response) => {
          if (!extensionAlive()) return;
          if (chrome.runtime.lastError) {
            // El service worker no respondió (transitorio): permitimos reintentar.
            lastKey = null;
            return;
          }
          if (response && response.success) {
            // Acceso rápido: si el título se resolvió, mostramos el indicador con
            // enlace directo a su página de detalles en The Show Verse y
            // empezamos a enviar el progreso de reproducción.
            const synced = response.synced;
            if (synced && synced.tmdbId) {
              currentSynced = synced;
              currentSyncedKey = key;
              lastProgressPingAt = 0;
              maybeSendProgress(signal, key); // crea la entrada de Continuar viendo ya
              if (response.origin) {
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

  // Guardado del punto de reproducción al SALIR: al ocultar la pestaña
  // (cambiar de pestaña/minimizar) y al descargar la página (cerrar/navegar).
  // visibilitychange es fiable; pagehide es el último recurso (best-effort).
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushProgress();
    });
    window.addEventListener("pagehide", flushProgress);
  } catch (e) {
    /* entorno sin document/window: ignoramos */
  }
})();
