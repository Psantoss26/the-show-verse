// platform-enhancers.js — Refinadores OPCIONALES por plataforma.
//
// La detección base (detection-core.js) es Media-Session-first y funciona en
// cualquier sitio. Estos refinadores solo AFINAN campos concretos (contentId
// fiable de la URL, temporada/episodio o títulos desde selectores propios de la
// plataforma). Cada bloque va en try/catch: si un selector cambia o falla, la
// señal base se mantiene intacta. Nunca lanzan.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVEnhancers = api;
})(typeof self !== "undefined" ? self : this, function () {
  const D =
    (typeof self !== "undefined" && self.TSVDetection) ||
    (typeof module !== "undefined" && module.exports
      ? (() => {
          try {
            return require("./detection-core.js");
          } catch (e) {
            return null;
          }
        })()
      : null);

  const clean = (t) => (D ? D.clean(t) : (t || "").replace(/\s+/g, " ").trim());
  const parseSE = (t) => (D ? D.parseSeasonEpisode(t) : {});

  function firstText(doc, selectors) {
    for (const sel of selectors || []) {
      let el = null;
      try {
        el = doc.querySelector(sel);
      } catch (e) {
        el = null;
      }
      const txt = el && clean(el.textContent);
      if (txt) return txt;
    }
    return "";
  }

  const REFINERS = [
    {
      id: "netflix",
      match: /(^|\.)netflix\.com$/,
      contentId: (url) => (url.match(/\/watch\/(\d+)/) || [])[1] || null,
      // El título de Netflix va en [data-uia="video-title"]: <h4>Serie</h4> + spans
      // con "T4:E5 / Capítulo cinco…". Leemos el h4 como serie y los spans como
      // episodio. El overlay se oculta durante la reproducción (Netflix retira el
      // elemento del DOM); content.js cachea el último título bueno de este vídeo
      // para que sobreviva a que desaparezca.
      subSel: ['[data-uia="video-title"] span', ".video-title span"],
      titleSel: [
        '[data-uia="video-title"] h4',
        '[data-uia="video-title"]',
        ".video-title",
      ],
      // Elemento completo del título del reproductor: su texto contiene la
      // temporada Y el episodio ("Stranger Things T4:E5 …") aunque estén en spans
      // distintos. De aquí sacamos T/E de forma fiable (evita el T1 por defecto).
      seSel: ['[data-uia="video-title"]', ".video-title"],
    },
    {
      id: "prime",
      match: /(^|\.)primevideo\.com$|(^|\.)amazon\.[a-z.]+$/,
      contentId: (url) =>
        (url.match(/\/detail\/([A-Za-z0-9]+)/) || [])[1] ||
        (url.match(/[?&]gti=([A-Za-z0-9.]+)/) || [])[1] ||
        null,
      subSel: ['.atvwebplayersdk-subtitle-text', '[data-testid="player-subtitle"]'],
      titleSel: ['.atvwebplayersdk-title-text', '[data-testid="player-title"]'],
    },
    {
      id: "max",
      match: /(^|\.)max\.com$|(^|\.)hbomax\.com$/,
      contentId: (url) =>
        (url.match(/\/(?:video\/watch|player)\/([\w-]+)/) || [])[1] || null,
      subSel: ['[data-testid="player-ux-asset-subtitle"]', '[class*="AssetSubtitle"]'],
      titleSel: ['[data-testid="player-ux-asset-title"]', '[class*="AssetTitle"]'],
    },
    {
      id: "disney",
      match: /(^|\.)disneyplus\.com$/,
      contentId: (url) => (url.match(/\/video\/([\w-]+)/) || [])[1] || null,
      subSel: ['[data-testid="subtitle-field"]', ".subtitle-field"],
      titleSel: [
        '[data-testid="hero-title"]',
        '[data-testid="player-title-content"]',
        ".title-field",
      ],
    },
    {
      id: "plex",
      match: /(^|\.)plex\.tv$/,
      contentId: (url) => (url.match(/[?&]key=([^&]+)/) || [])[1] || null,
      subSel: [
        '[data-testid="metadataSubtitle"]',
        '[class*="PlayerControlsMetadata-subtitle"]',
      ],
      titleSel: [
        '[data-testid="metadataTitle"]',
        '[class*="PlayerControlsMetadata-title"]',
      ],
    },
    {
      id: "crunchyroll",
      match: /(^|\.)crunchyroll\.com$/,
      contentId: (url) => (url.match(/\/watch\/([A-Za-z0-9]+)/) || [])[1] || null,
      subSel: ['h4[class*="title"]', '[class*="episode-title"]'],
      titleSel: ['h1[class*="title"]', '[class*="show-title"]'],
    },
  ];

  // Devuelve una copia de la señal con los campos afinados. Fail-safe.
  function enhance(host, signal, doc) {
    const h = String(host || "").replace(/^www\./, "");
    const r = REFINERS.find((x) => x.match.test(h));
    if (!r || !signal) return signal;
    const out = { ...signal };

    try {
      if (!out.contentId) {
        const id = r.contentId(signal.url || "");
        if (id) out.contentId = id;
      }
    } catch (e) {
      /* selector/URL cambió: ignoramos, señal base intacta */
    }

    try {
      // Temporada/episodio desde el texto que contiene AMBOS (badge o el título
      // completo del reproductor). La temporada solo se fija si aparece de verdad.
      const seText = firstText(doc, r.seSel || r.subSel);
      if (seText) {
        const se = parseSE(seText);
        if (se && se.episode != null && out.episode == null) out.episode = se.episode;
        if (se && se.season != null && out.season == null) out.season = se.season;
        // Enviamos el texto completo como seasonEpisodeText: el servidor también
        // reparsea la temporada de aquí, por si el cliente no la fijó.
        if (se && se.episode != null && !out.seasonEpisodeText) {
          out.seasonEpisodeText = seText;
        }
      }
    } catch (e) {
      /* ignoramos */
    }

    // Nombre de la serie (h4 del título del reproductor).
    try {
      if (!out.showName && !out.movieTitle) {
        const t = firstText(doc, r.titleSel);
        if (t) {
          if (out.episode != null || out.episodeName) out.showName = t;
          else out.movieTitle = t;
        }
      }
    } catch (e) {
      /* ignoramos */
    }

    // Nombre del EPISODIO: título completo del reproductor menos el nombre de la
    // serie y el marcador "E5"/"T4:E5". Es lo que permite al servidor localizar la
    // temporada (Netflix web muestra el episodio pero NO la temporada).
    try {
      if (!out.episodeName) {
        const full = firstText(doc, r.seSel || r.subSel) || "";
        const showTxt = out.showName || firstText(doc, r.titleSel) || "";
        let epName = full;
        if (showTxt && epName.toLowerCase().indexOf(showTxt.toLowerCase()) === 0) {
          epName = epName.slice(showTxt.length).trim();
        }
        epName = epName
          .replace(
            /^\s*(?:T\s*\d+\s*[:x]?\s*)?(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\.?\s*\d+\s*[:.\-–·]?\s*/i,
            "",
          )
          .replace(/\s+/g, " ")
          .trim();
        if (epName && epName.length > 1) out.episodeName = epName;
        else {
          const subTxt = firstText(doc, r.subSel);
          if (subTxt) out.episodeName = subTxt;
        }
      }
    } catch (e) {
      /* ignoramos */
    }

    return out;
  }

  return { enhance, REFINERS };
});
