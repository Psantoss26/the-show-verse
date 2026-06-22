// content.js — Observador de reproducción multiplataforma para The Show Verse.
// Detecta lo que el usuario reproduce en Netflix, Prime Video, Max (HBO),
// Disney+ y Plex, y lo envía al service worker para añadirlo al historial.
//
// Fuentes de título por orden de fiabilidad: selectores del reproductor →
// Media Session API (navigator.mediaSession.metadata, que casi todas las
// plataformas rellenan) → título de la pestaña. La resolución a TMDb y la
// deduplicación ocurren en el servidor.

(function () {
  const POLL_MS = 2000;
  const MIN_WATCH_SECONDS = 15; // umbral para contar como visionado real
  const DEBUG_THROTTLE_MS = 15000;

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      let el = null;
      try {
        el = document.querySelector(selector);
      } catch (e) {
        el = null;
      }
      const text = el && clean(el.textContent);
      if (text) return text;
    }
    return "";
  }

  // Extrae temporada/episodio de varios formatos/idiomas:
  // "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 · Episode 1", "Ep. 1".
  function parseSeasonEpisode(text) {
    if (!text) return {};
    const s = text.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
    const e = text.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);
    if (!e) return {};
    return { season: s ? parseInt(s[1], 10) : 1, episode: parseInt(e[1], 10) };
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
    videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return videos[0];
  }

  // Limpia el título de la pestaña quitando prefijo y sufijo de la plataforma.
  function titleFromTab(suffixes) {
    let title = clean(document.title);
    if (!title) return "";
    // Prefijo de plataforma, p. ej. "Prime Video: ", "Netflix - ".
    title = title.replace(
      /^\s*(prime video|amazon prime video|amazon|netflix|max|hbo max|hbo|disney\s*\+|disney plus|star\s*\+|plex)\s*[:\-|–·]\s*/i,
      "",
    );
    for (const suffix of suffixes) {
      const re = new RegExp("\\s*[-|·–]\\s*" + suffix + "\\s*$", "i");
      title = title.replace(re, "");
    }
    title = title.replace(/^watch\s+/i, "").trim();
    if (!title || /^(loading|cargando|prime video|max|disney\+|netflix|plex)$/i.test(title)) return "";
    return title;
  }

  // Media Session API: navigator.mediaSession.metadata suele tener el título de
  // lo que se reproduce (Prime, Disney+, Max, Netflix lo rellenan).
  function mediaSessionMeta() {
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!m) return null;
      const title = clean(m.title);
      const artist = clean(m.artist);
      const album = clean(m.album);
      if (!title && !artist && !album) return null;
      return { title, artist, album };
    } catch (e) {
      return null;
    }
  }

  // Fallback agnóstico a selectores: busca en el DOM un elemento cuyo texto sea
  // un distintivo de temporada+episodio ("T1 E1 El trato", "S1 E1", "T1:E1"…).
  // Útil cuando los selectores de clase del reproductor cambian o no coinciden.
  const SE_SEASON_RE = /^(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*\d{1,3}\b/i;
  const SE_EPISODE_RE = /\b(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*\d{1,3}\b/i;

  function findSeasonEpisodeBadge() {
    let nodes;
    try {
      nodes = document.querySelectorAll("span, div, p, b, strong, li");
    } catch (e) {
      return "";
    }
    const max = Math.min(nodes.length, 5000);
    for (let i = 0; i < max; i += 1) {
      const el = nodes[i];
      if (el.children.length > 2) continue; // solo elementos hoja-ish
      const txt = clean(el.textContent);
      if (!txt || txt.length > 80) continue;
      if (SE_SEASON_RE.test(txt) && SE_EPISODE_RE.test(txt)) return txt;
    }
    return "";
  }

  // Resuelve { mainTitle, subTitle } combinando selectores, Media Session y pestaña.
  function resolveTitle({ titleSel = [], subSel = [], tabSuffixes = [] }) {
    let mainTitle = firstText(titleSel);
    let subTitle = firstText(subSel);
    if (!mainTitle) {
      const ms = mediaSessionMeta();
      if (ms) {
        // En series, el nombre del programa suele venir en artist/album y el
        // episodio en title.
        mainTitle = ms.artist || ms.album || ms.title;
        if ((ms.artist || ms.album) && !subTitle) subTitle = ms.title;
      }
    }
    // Si el subtítulo todavía no contiene temporada + episodio, buscamos un
    // distintivo ("T1 E2", "S1 · E2") en el DOM. En reproductores como Plex el
    // subtítulo trae solo el nombre del episodio (vía Media Session) y los
    // números aparecen aparte cuando los controles están visibles; al fusionarlo
    // conseguimos fijar el episodio en lugar de quedarnos solo con la serie.
    const subHasSE = subTitle && SE_SEASON_RE.test(subTitle) && SE_EPISODE_RE.test(subTitle);
    if (!subHasSE) {
      const badge = findSeasonEpisodeBadge();
      if (badge) subTitle = subTitle ? `${subTitle} · ${badge}` : badge;
    }
    if (!mainTitle) mainTitle = titleFromTab(tabSuffixes);
    return { mainTitle, subTitle };
  }

  // ── Adaptadores por plataforma ──
  const ADAPTERS = [
    {
      id: "netflix",
      name: "Netflix",
      match: (h) => /(^|\.)netflix\.com$/.test(h),
      contentId: () => (location.href.match(/\/watch\/(\d+)/) || [])[1] || null,
      extract() {
        const container =
          document.querySelector('[data-uia="video-title"]') ||
          document.querySelector(".video-title");
        let mainTitle = "";
        let subTitle = "";
        if (container) {
          const h4 = container.querySelector("h4") || container.children[0];
          const spans = Array.from(container.querySelectorAll("span")).map((s) => clean(s.textContent));
          mainTitle = h4 ? clean(h4.textContent) : clean(container.textContent);
          subTitle = spans.filter(Boolean).join(": ");
        }
        if (!mainTitle) {
          const r = resolveTitle({ tabSuffixes: ["Netflix"] });
          mainTitle = r.mainTitle;
          subTitle = subTitle || r.subTitle;
        }
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
    {
      id: "prime",
      name: "Prime Video",
      match: (h) => /(^|\.)primevideo\.com$/.test(h) || /(^|\.)amazon\.[a-z.]+$/.test(h),
      contentId: () =>
        (location.href.match(/\/detail\/([A-Za-z0-9]+)/) || [])[1] ||
        (location.href.match(/[?&]gti=([A-Za-z0-9.]+)/) || [])[1] ||
        null,
      extract() {
        const { mainTitle, subTitle } = resolveTitle({
          titleSel: [
            ".atvwebplayersdk-title-text",
            '[data-testid="player-title"]',
            ".webPlayerSDKContainer .title",
          ],
          subSel: [".atvwebplayersdk-subtitle-text", '[data-testid="player-subtitle"]'],
          tabSuffixes: ["Prime Video", "Amazon\\.[a-z.]+", "Amazon"],
        });
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
    {
      id: "max",
      name: "Max",
      match: (h) => /(^|\.)max\.com$/.test(h) || /(^|\.)hbomax\.com$/.test(h),
      contentId: () => (location.href.match(/\/(?:video\/watch|player)\/([\w-]+)/) || [])[1] || null,
      extract() {
        const { mainTitle, subTitle } = resolveTitle({
          titleSel: [
            '[data-testid="player-ux-asset-title"]',
            '[class*="AssetTitle"]',
          ],
          subSel: ['[data-testid="player-ux-asset-subtitle"]', '[class*="AssetSubtitle"]'],
          tabSuffixes: ["Max", "HBO Max"],
        });
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
    {
      id: "disney",
      name: "Disney+",
      match: (h) => /(^|\.)disneyplus\.com$/.test(h),
      contentId: () => (location.href.match(/\/video\/([\w-]+)/) || [])[1] || null,
      extract() {
        const { mainTitle, subTitle } = resolveTitle({
          titleSel: [
            '[data-testid="hero-title"]',
            '[data-testid="player-title-content"]',
            ".title-field",
          ],
          subSel: ['[data-testid="subtitle-field"]', ".subtitle-field"],
          tabSuffixes: ["Disney\\+", "Disney Plus", "Star\\+"],
        });
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
    {
      id: "plex",
      name: "Plex",
      match: (h) => /(^|\.)plex\.tv$/.test(h),
      contentId: () => (location.href.match(/[?&]key=([^&]+)/) || [])[1] || null,
      extract() {
        const { mainTitle, subTitle } = resolveTitle({
          titleSel: [
            '[data-testid="metadataTitle"]',
            '[class*="MetadataPosterTitle"]',
            '[class*="PlayerControlsMetadata-title"]',
          ],
          subSel: [
            '[data-testid="metadataSubtitle"]',
            '[class*="PlayerControlsMetadata-subtitle"]',
          ],
          tabSuffixes: ["Plex"],
        });
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
  ];

  const adapter = ADAPTERS.find((a) => a.match(location.hostname.replace(/^www\./, "")));
  if (!adapter) return;

  // Solo el frame que contiene el reproductor registra (con all_frames hay varios).
  console.log(`[The Show Verse] Observador de ${adapter.name} activo.`);

  let lastKey = null;
  let lastDebug = 0;

  function tick() {
    const video = getMainVideo();
    if (!video || video.currentTime < MIN_WATCH_SECONDS) return;

    let data;
    try {
      data = adapter.extract();
    } catch (e) {
      data = null;
    }

    if (!data || !data.mainTitle) {
      const now = Date.now();
      if (now - lastDebug > DEBUG_THROTTLE_MS) {
        lastDebug = now;
        console.log(
          `[The Show Verse] ${adapter.name}: reproducción detectada pero no se pudo leer el título.`,
        );
      }
      return;
    }

    const key = `${adapter.id}:${data.contentId || `${data.mainTitle}|${data.subTitle || ""}`}`;
    if (key === lastKey) return;

    // Optimista: marcamos el contenido como intentado ANTES de enviar para no
    // reintentar en bucle títulos que no resuelvan (el servidor deduplica igual).
    lastKey = key;

    chrome.runtime.sendMessage(
      {
        action: "syncWatch",
        platform: adapter.id,
        platformName: adapter.name,
        contentId: data.contentId || null,
        mainTitle: data.mainTitle,
        subTitle: data.subTitle || "",
        season: data.season || null,
        episode: data.episode || null,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          // El service worker no respondió (transitorio): permitimos reintentar.
          lastKey = null;
          return;
        }
        if (response && response.success) {
          console.log(`[The Show Verse] Sincronizado (${adapter.name}): "${data.mainTitle}"`);
        }
      },
    );
  }

  setInterval(tick, POLL_MS);
})();
