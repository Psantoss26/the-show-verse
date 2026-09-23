/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
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

  // Texto de un elemento SEPARANDO el de cada hijo con un espacio.
  //
  // `textContent` pega los hijos sin nada en medio, y el título del reproductor de
  // Netflix son elementos hermanos: <h4>Stranger Things</h4><span>T4:E5</span>.
  // Leído en crudo sale "Stranger ThingsT4:E5", y ahí el patrón de TEMPORADA no
  // casa —exige un límite antes de la "T" y delante tiene la "s" de "Things"—, así
  // que se perdía la temporada justo en la plataforma más usada: el episodio se
  // quedaba sin temporada y acababa registrado a nivel serie.
  function textOf(el) {
    if (!el) return "";
    const children = el.children;
    if (!children || children.length === 0) return clean(el.textContent);
    const parts = [];
    for (let i = 0; i < children.length; i += 1) parts.push(textOf(children[i]));
    const joined = clean(parts.filter(Boolean).join(" "));
    return joined || clean(el.textContent);
  }

  function firstText(doc, selectors) {
    for (const sel of selectors || []) {
      let el = null;
      try {
        el = doc.querySelector(sel);
      } catch (e) {
        el = null;
      }
      const txt = el && textOf(el);
      if (txt) return txt;
    }
    return "";
  }

  // Quita `prefix` del principio de `text` (sin distinguir mayúsculas). Devuelve
  // null si no estaba, para que el llamador sepa si el recorte llegó a ocurrir.
  function stripPrefix(text, prefix) {
    const t = clean(text);
    const p = clean(prefix);
    if (!t || !p) return null;
    if (t.toLowerCase().indexOf(p.toLowerCase()) !== 0) return null;
    return t.slice(p.length).replace(/^\s*[-–—·:.]\s*/, "").trim();
  }

  const SEASON_MARKER_RE =
    /(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*\d{1,3}/i;

  /**
   * Texto del que se pueden leer temporada y episodio SIN riesgo de confundirlos
   * con el nombre de la obra.
   *
   * El subtítulo del reproductor (`subSel`) es un campo dedicado: solo existe en
   * series y se usa tal cual. `seSel`, en cambio, es el bloque de título COMPLETO
   * —en Netflix incluye el nombre de la serie— y de ahí solo se puede leer lo que
   * quede tras quitar ese nombre: hay películas que llevan un número de "capítulo"
   * en el suyo ("John Wick: Capítulo 2") y leerlo entero las convertía en el
   * episodio 2 de una serie inexistente. Si no se pudo separar el título, se exige
   * además una marca de TEMPORADA, que ningún nombre de película trae.
   */
  function seasonEpisodeSource(doc, r, signal) {
    const subtitle = firstText(doc, r.subSel);
    if (subtitle) return subtitle;
    if (!r.seSel) return "";
    const full = firstText(doc, r.seSel);
    if (!full) return "";
    const showTxt = signal.showName || firstText(doc, r.titleSel);
    const withoutShow = stripPrefix(full, showTxt);
    if (withoutShow !== null) return withoutShow;
    return SEASON_MARKER_RE.test(full) ? full : "";
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
      subSel: [
        '[class*="current-media-info"] h4',
        'h4[class*="title"]',
        '[class*="episode-title"]',
      ],
      // El nombre de la SERIE: lo más fiable es el enlace a /series/. Se prueban
      // varios candidatos por si cambia el DOM (el primero que encaje gana).
      titleSel: [
        'a[href*="/series/"]',
        '[class*="show-title-link"]',
        '[class*="current-media-info"] a[class*="title"]',
        'h1[class*="title"]',
        '[class*="show-title"]',
        '[class*="series-title"]',
      ],
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
      const seText = seasonEpisodeSource(doc, r, out);
      if (seText) {
        const se = parseSE(seText);
        // El título del reproductor es la fuente MÁS específica que existe: lo
        // publica el propio reproductor para lo que está sonando. Cuando trae
        // temporada Y episodio manda sobre el rastreo genérico del DOM
        // (findSeasonEpisodeBadge), que recorre toda la página y puede haber
        // cogido el badge de una fila de recomendaciones o del "siguiente
        // episodio". Con solo el episodio se completa lo que falte, sin pisar.
        if (se && se.episode != null && se.season != null) {
          out.season = se.season;
          out.episode = se.episode;
          out.seasonEpisodeText = seText;
        } else if (se && se.episode != null) {
          if (out.episode == null) out.episode = se.episode;
          // Enviamos el texto completo como seasonEpisodeText: el servidor también
          // reparsea la temporada de aquí, por si el cliente no la fijó.
          if (!out.seasonEpisodeText) out.seasonEpisodeText = seText;
        } else if (se && se.season != null && out.season == null) {
          out.season = se.season;
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

    // Serie SIN nombre de serie pero con evidencia de episodio: caso típico de
    // Crunchyroll/anime, donde la Media Session da el EPISODIO como título (y no
    // expone la serie en artist/album). Promovemos el título del reproductor
    // (r.titleSel = nombre de la SERIE, p. ej. el enlace a /series/) a showName y
    // pasamos el título de la Media Session a episodeName. Solo actúa si HAY un
    // título de serie en el DOM y difiere del que teníamos, así no regresiona las
    // plataformas que ya rellenan showName (Netflix/Prime/…) ni las películas.
    try {
      const seriesEvidence =
        out.season != null || out.episode != null || Boolean(out.episodeName);
      if (seriesEvidence && !out.showName && out.movieTitle) {
        const domShow = firstText(doc, r.titleSel);
        if (
          domShow &&
          clean(domShow).toLowerCase() !== clean(out.movieTitle).toLowerCase()
        ) {
          out.episodeName = out.episodeName || out.movieTitle;
          out.showName = domShow;
          out.movieTitle = undefined;
        }
      }
    } catch (e) {
      /* ignoramos */
    }

    return out;
  }

  return { enhance, REFINERS };
});
