// content.js — Observador de reproducción multiplataforma para The Show Verse.
// Detecta lo que el usuario reproduce en Netflix, Prime Video, Max (HBO),
// Disney+ y Plex, y lo envía al service worker para añadirlo al historial.
//
// Los selectores del reproductor de cada plataforma son "best-effort": si la
// plataforma cambia su DOM, se cae al título de la pestaña (document.title) como
// señal estable. La resolución a TMDb y la deduplicación ocurren en el servidor.

(function () {
  const POLL_MS = 2000;
  const MIN_WATCH_SECONDS = 30; // umbral para contar como visionado real

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = el && clean(el.textContent);
      if (text) return text;
    }
    return "";
  }

  // Extrae temporada/episodio de un texto en varios idiomas/formatos:
  // "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 · Episode 1", "Ep. 1".
  function parseSeasonEpisode(text) {
    if (!text) return {};
    const s = text.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
    const e = text.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);
    if (!e) return {};
    return { season: s ? parseInt(s[1], 10) : 1, episode: parseInt(e[1], 10) };
  }

  // Devuelve el <video> principal en reproducción (el de mayor superficie).
  function getMainVideo() {
    const videos = Array.from(document.querySelectorAll("video")).filter(
      (v) => v.readyState > 0 && isFinite(v.duration) && v.duration > 0,
    );
    if (!videos.length) return null;
    videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return videos[0];
  }

  // Limpia el título de la pestaña quitando el sufijo de la plataforma.
  function titleFromTab(suffixes) {
    let title = clean(document.title);
    if (!title) return "";
    for (const suffix of suffixes) {
      const re = new RegExp("\\s*[-|·–]\\s*" + suffix + "\\s*$", "i");
      title = title.replace(re, "");
    }
    title = title.replace(/^watch\s+/i, "").trim();
    if (!title || /^(loading|cargando)$/i.test(title)) return "";
    return title;
  }

  // ── Adaptadores por plataforma ──
  // Cada extract() devuelve { mainTitle, subTitle, season?, episode?, contentId? }.

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
        if (!mainTitle) mainTitle = titleFromTab(["Netflix"]);
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
        const mainTitle =
          firstText([".atvwebplayersdk-title-text", '[data-testid="title"]']) ||
          titleFromTab(["Prime Video", "Amazon"]);
        const subTitle = firstText([".atvwebplayersdk-subtitle-text", '[data-testid="subtitle"]']);
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
        const mainTitle =
          firstText([
            '[data-testid="player-ux-asset-title"]',
            '[class*="AssetTitle"]',
            '[class*="Title"][class*="player" i]',
          ]) || titleFromTab(["Max", "HBO Max"]);
        const subTitle = firstText([
          '[data-testid="player-ux-asset-subtitle"]',
          '[class*="AssetSubtitle"]',
        ]);
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
        const mainTitle =
          firstText([
            '[data-testid="hero-title"]',
            '[data-testid="player-title-content"]',
            ".title-field",
          ]) || titleFromTab(["Disney\\+", "Disney Plus", "Star\\+"]);
        const subTitle = firstText(['[data-testid="subtitle-field"]', ".subtitle-field"]);
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
        const mainTitle =
          firstText([
            '[data-testid="metadataTitle"]',
            '[class*="MetadataPosterTitle"]',
            '[class*="PlayerControlsMetadata-title"]',
          ]) || titleFromTab(["Plex"]);
        const subTitle = firstText([
          '[data-testid="metadataSubtitle"]',
          '[class*="PlayerControlsMetadata-subtitle"]',
        ]);
        if (!mainTitle) return null;
        return { mainTitle, subTitle, ...parseSeasonEpisode(subTitle), contentId: this.contentId() };
      },
    },
  ];

  const adapter = ADAPTERS.find((a) => a.match(location.hostname.replace(/^www\./, "")));
  if (!adapter) return;

  console.log(`[The Show Verse] Observador de ${adapter.name} activo.`);

  let lastKey = null;

  function tick() {
    const video = getMainVideo();
    if (!video || video.currentTime < MIN_WATCH_SECONDS) return;

    let data;
    try {
      data = adapter.extract();
    } catch (e) {
      return;
    }
    if (!data || !data.mainTitle) return;

    const key = `${adapter.id}:${data.contentId || `${data.mainTitle}|${data.subTitle || ""}`}`;
    if (key === lastKey) return;

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
        if (chrome.runtime.lastError) return;
        if (response && response.success) {
          lastKey = key;
          console.log(`[The Show Verse] Sincronizado (${adapter.name}): "${data.mainTitle}"`);
        }
      },
    );
  }

  setInterval(tick, POLL_MS);
})();
