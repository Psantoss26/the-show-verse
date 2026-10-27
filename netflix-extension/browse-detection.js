/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// browse-detection.js — Qué título es la FICHA que se está viendo (navegando, sin
// reproducir). Puro y testeable (patrón UMD, `self.TSVBrowse`): el documento, la
// URL y la medida de los nodos se inyectan, así que las capturas de diagnóstico
// lo reproducen igual que el navegador (diagnostic-replay.js).
//
// Orden: (1) JSON-LD (serie + temporada/episodio, o película), (2) selector propio
// de la plataforma, (3) encabezado más prominente y visible, (4) título de la
// pestaña, (5) og:title. El TIPO (película o serie) sale del JSON-LD, de las
// pistas propias de la plataforma o de la ruta de la URL, por ese orden; con él
// la señal lleva `movieTitle` o `showName`, que el servidor respeta al resolver.
//
// En las plataformas conocidas solo hay ficha en sus rutas de ficha: en la portada
// o en un listado, el encabezado más grande es un titular, un carrusel o el aviso
// de cookies («Consentimiento de cookies», «We value your privacy»…), y antes se
// mandaba a resolver como si fuera un título.
(function (root, factory) {
  const api = factory(root.TSVDetection || (typeof require === "function" ? require("./detection-core.js") : null));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVBrowse = api;
})(typeof self !== "undefined" ? self : this, function (D) {
  // Rutas de ficha por plataforma (id de content.js → platformInfo) y el tipo que
  // dicen: "movie", "tv" o null (la ruta no lo distingue). Comprobadas con fichas
  // públicas reales (ver netflix-extension/diagnostics/).
  const DETAIL_ROUTES = {
    netflix: [{ re: /\/title\/\d+|[?&#]jbv=\d+/i, type: null }],
    primevideo: [{ re: /\/detail\//i, type: null }],
    amazon: [{ re: /\/detail\//i, type: null }],
    max: [
      { re: /\/(show|series)\//i, type: "tv" },
      { re: /\/(movie|feature)\//i, type: "movie" },
      { re: /\/(video|episode)\//i, type: null },
    ],
    hbomax: [
      { re: /\/(show|series)\//i, type: "tv" },
      { re: /\/(movie|feature)\//i, type: "movie" },
      { re: /\/(video|episode)\//i, type: null },
    ],
    disneyplus: [
      { re: /\/series\//i, type: "tv" },
      { re: /\/movies\//i, type: "movie" },
      { re: /\/(browse\/entity|play)/i, type: null },
    ],
    crunchyroll: [
      { re: /\/series\//i, type: "tv" },
      { re: /\/watch\//i, type: null },
    ],
    movistarplus: [
      { re: /\/series\/[^/?#]+\/ficha/i, type: "tv" },
      { re: /\/cine\/[^/?#]+\/ficha/i, type: "movie" },
      { re: /\/ficha\b/i, type: null },
    ],
    tv: [
      { re: /\/show\/[^/?#]+\/umc\./i, type: "tv" },
      { re: /\/episode\/[^/?#]+\/umc\./i, type: "tv" },
      { re: /\/movie\/[^/?#]+\/umc\./i, type: "movie" },
    ],
    filmin: [
      { re: /\/serie\/[^/?#]+/i, type: "tv" },
      { re: /\/(pelicula|corto)\/[^/?#]+/i, type: "movie" },
    ],
    skyshowtime: [
      { re: /\/stream\/(tv|series|shows?)\/[^/?#]+\/[0-9a-f-]{36}/i, type: "tv" },
      { re: /\/stream\/movies?\/[^/?#]+\/[0-9a-f-]{36}/i, type: "movie" },
    ],
    rakuten: [
      { re: /\/tv_shows\/[^/?#]+|[?&]content_type=tv_shows/i, type: "tv" },
      { re: /\/movies\/[^/?#]+|[?&]content_type=movies/i, type: "movie" },
    ],
    atresplayer: [
      { re: /\/(series|programas|novelas|realities)\/[^/?#]+\//i, type: "tv" },
      { re: /\/(peliculas|cine|tv-movies)\/[^/?#]+\//i, type: "movie" },
    ],
    rtve: [{ re: /\/play\/videos\/[^/?#]+\//i, type: null }],
    pluto: [
      { re: /\/(on-demand\/)?series\/[^/?#]+/i, type: "tv" },
      { re: /\/(on-demand\/)?movies\/[^/?#]+/i, type: "movie" },
    ],
    plex: [{ re: /details\?key=/i, type: null }],
  };

  // Selectores del título en la FICHA. Se lee el DOM VISIBLE (no og:title, que
  // queda obsoleto en las SPA). Texto del nodo o alt de su imagen-logo.
  const TITLE_SELECTORS = {
    netflix: [
      '[data-uia="previewModal--player-titleTreatment-logo"]',
      '[data-uia="title-card-title"]',
      ".title-info-metadata-item--title",
      ".previewModal--section-header strong",
    ],
    primevideo: ['h1[data-automation-id="title"]', '[data-automation-id="title"]', ".dv-node-dp-title"],
    amazon: ['h1[data-automation-id="title"]', '[data-automation-id="title"]', ".dv-node-dp-title"],
    max: ['[data-testid="dragonfly-title"]', '[data-testid="detail-page-title"]'],
    hbomax: ['[data-testid="dragonfly-title"]'],
    disneyplus: ['[data-testid="hero-title"]', ".title-field"],
    crunchyroll: ["h1.erc-series-title", "h1.title", ".hero-heading"],
  };

  // Páginas genéricas del catálogo y avisos (nunca son el título de una ficha).
  const GENERIC_TITLES = new Set(
    [
      "inicio", "home", "browse", "explorar", "explora", "mi lista", "my list",
      "películas", "peliculas", "movies", "series", "tv shows", "programas de tv",
      "novedades", "new", "buscar", "search", "mi netflix", "próximamente",
      "proximamente", "descargas", "downloads", "categorías", "categorias",
      "originales", "populares", "tendencias", "trending", "watch", "ver",
      "prime video", "index", "404", "¡vaya!", "vaya",
    ].map((s) => s.toLowerCase()),
  );
  const NOT_A_TITLE_RE = /\b(cookies?|privacidad|privacy|consentimiento|consent|aviso legal|inicia sesi[oó]n|sign in|suscr[ií]bete|subscribe)\b/i;

  // Sin espacios de más ni marcas de dirección invisibles (Apple TV+ antepone
  // U+200E al título de la pestaña).
  const clean = (value) =>
    String(value == null ? "" : value).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();

  /**
   * Título de la PESTAÑA sin lo que añade cada plataforma: «Ver X online |
   * SkyShowtime España», «Ver X (2020) | Movistar Plus», «X - Películas - Ver
   * gratis - Rakuten TV», «Prime Video: X - Temporada 1»… Solo se quitan
   * fórmulas conocidas, para no recortar títulos que llevan « - » de verdad.
   */
  function cleanTabTitle(tabTitle, platformName) {
    let t = clean(D.stripPlatformPrefix(clean(tabTitle), [platformName]));
    t = t.replace(/\s*\|.*$/, "");
    t = t.replace(/^(ver|watch|mira)\s+/i, "");
    t = t.replace(/\s+-\s+(temporada|season)\s+\d+.*$/i, "");
    t = t.replace(/\s+-\s+(pel[ií]culas|series|ver gratis|ver online)\b.*$/i, "");
    t = t.replace(/\s+(online|gratis(\s+en\s+l[ií]nea)?|en streaming)\s*$/i, "");
    t = t.replace(/\s*\((19|20)\d{2}\)\s*$/, "");
    return clean(t);
  }

  /** Ruta de ficha de la plataforma: { type } o null. `undefined` si la plataforma no tiene rutas conocidas. */
  function matchDetailRoute(platformId, href) {
    const routes = DETAIL_ROUTES[platformId];
    if (!routes) return undefined;
    const url = String(href || "");
    for (const route of routes) if (route.re.test(url)) return { type: route.type };
    return null;
  }

  function textOrAlt(node) {
    let txt = clean(node.textContent);
    if (!txt && node.getAttribute) txt = clean(node.getAttribute("alt"));
    if (!txt && node.querySelector) {
      const img = node.querySelector("img[alt]");
      if (img) txt = clean(img.getAttribute("alt"));
    }
    return txt;
  }

  // Medida real de un nodo (navegador). Las capturas guardan la suya en
  // data-tsv-top / data-tsv-fs para reproducir la elección del encabezado.
  function measureNode(node) {
    const rect = node.getBoundingClientRect();
    let fontSize = 0;
    try {
      fontSize = parseFloat(getComputedStyle(node).fontSize) || 0;
    } catch {
      fontSize = 0;
    }
    return { top: rect.top, width: rect.width, height: rect.height, fontSize };
  }

  /**
   * Tipo y pistas que da la propia plataforma. Prime Video: la ficha de una serie
   * lista sus episodios (`av-ep-episode-*`, lo mismo que usa Universal Trakt
   * Scrobbler) y su pestaña acaba en «- Temporada N».
   */
  function platformHints(platformId, doc) {
    if (platformId === "primevideo" || platformId === "amazon") {
      const tab = clean(doc.title);
      const season = (tab.match(/\s-\s(?:Temporada|Season)\s+(\d+)\s*$/i) || [])[1];
      let episodes = false;
      try {
        episodes = Boolean(doc.querySelector('[id^="av-ep-episode-"]'));
      } catch {
        episodes = false;
      }
      if (season || episodes) {
        return { type: "tv", season: season ? Number(season) : undefined };
      }
    }
    return {};
  }

  /**
   * Señal de la ficha, o null si no es una ficha (o no hay título utilizable).
   * @param {{ doc, href, platformId, platformName?, isBareName?: (t)=>boolean,
   *   measure?: (node)=>{top,width,height,fontSize}, viewportHeight?: number }} input
   * @returns {null | { mainTitle, showName?, movieTitle?, episodeName?, season?, episode? }}
   */
  function detectBrowsingSignal(input) {
    const { doc, href, platformId, platformName = "" } = input || {};
    if (!doc) return null;
    const isBareName = input.isBareName || ((t) => D.isBarePlatformName(t));
    const measure = input.measure || measureNode;
    const viewportHeight = input.viewportHeight || 1080;

    const route = matchDetailRoute(platformId, href);
    if (route === null) return null;

    const cleanTitle = (t) => clean(D.stripPlatformPrefix(t || "", [platformName]));
    const isValid = (t) => {
      if (!t || t.length < 2 || t.length > 120) return false;
      if (isBareName(t)) return false;
      if (GENERIC_TITLES.has(t.toLowerCase())) return false;
      return !NOT_A_TITLE_RE.test(t);
    };

    const hints = platformHints(platformId, doc);
    const routeType = route ? route.type : null;

    // 1. JSON-LD: estructurado (serie + temporada/episodio, o película).
    const ld = D.detectFromJsonLd(doc);
    let signal = null;
    if (ld) {
      const main = cleanTitle(ld.showName || ld.movieTitle || ld.episodeName);
      if (isValid(main)) {
        signal = {
          mainTitle: main,
          showName: ld.showName ? cleanTitle(ld.showName) : "",
          episodeName: ld.episodeName || "",
          season: ld.season != null ? ld.season : undefined,
          episode: ld.episode != null ? ld.episode : undefined,
        };
        if (ld.movieTitle && !ld.showName) signal.movieTitle = main;
        if (ld.year) signal.releaseYear = ld.year;
      }
    }

    // 2-4. Selector propio, encabezado más prominente, pestaña.
    if (!signal) {
      let title = "";
      for (const sel of TITLE_SELECTORS[platformId] || []) {
        let nodes = [];
        try {
          nodes = doc.querySelectorAll(sel);
        } catch {
          continue;
        }
        for (const node of nodes) {
          const t = cleanTitle(textOrAlt(node));
          if (isValid(t)) {
            title = t;
            break;
          }
        }
        if (title) break;
      }
      if (!title) title = headingTitle(doc, { cleanTitle, isValid, measure, viewportHeight });
      if (!title) {
        const fromTab = cleanTabTitle(doc.title, platformName);
        if (isValid(fromTab)) title = fromTab;
      }
      if (!title) {
        // 5. og:title (mejor que nada si todo lo demás falla).
        const og = cleanTitle(D.detectFromMeta(doc));
        if (isValid(og)) title = og;
      }
      if (title) signal = { mainTitle: title };
    }
    if (!signal) return null;

    // Tipo: lo que diga la ficha (JSON-LD) manda; si no, la plataforma o la URL.
    const ldType = signal.showName ? "tv" : signal.movieTitle ? "movie" : null;
    const type = ldType || hints.type || routeType;
    if (type === "tv" && !signal.showName) signal.showName = signal.mainTitle;
    if (type === "movie" && !signal.showName && !signal.movieTitle) signal.movieTitle = signal.mainTitle;
    if (type === "tv" && signal.season == null && hints.season != null) signal.season = hints.season;
    // La pestaña de un episodio puede decir sus números: «Ver Half Loop -
    // Separación (Temporada 1, Episodio 2) - Apple TV».
    if (type === "tv" && signal.episode == null) {
      const m = clean(doc.title).match(/\((?:Temporada|Season)\s+(\d{1,3}),\s*(?:Episodio|Episode|Cap[ií]tulo)\s+(\d{1,4})\)/i);
      if (m) {
        signal.season = Number(m[1]);
        signal.episode = Number(m[2]);
        // «Ver <episodio> - <serie> (Temporada…)»: el nombre del episodio.
        const before = clean(doc.title).slice(0, m.index).replace(/^(ver|watch)\s+/i, "");
        const show = signal.showName || "";
        const cut = show ? before.toLowerCase().lastIndexOf(` - ${show.toLowerCase()}`) : -1;
        if (!signal.episodeName && cut > 0) signal.episodeName = before.slice(0, cut).trim();
      }
    }
    // Tipo seguro (JSON-LD, plataforma o ruta): el servidor no busca la película
    // entre series ni al revés.
    if (type) signal.mediaTypeHint = type;
    // Año de la pestaña («Ver Antidisturbios (2020) | Movistar Plus») si el
    // JSON-LD no lo dio.
    if (!signal.releaseYear) {
      const tabYear = Number((clean(doc.title).match(/\((19\d{2}|20\d{2})\)/) || [])[1]);
      if (tabYear) signal.releaseYear = tabYear;
    }
    return signal;
  }

  // Encabezado más prominente y VISIBLE cerca de la parte superior: el de mayor
  // tamaño de letra y más arriba (el título de la ficha).
  function headingTitle(doc, { cleanTitle, isValid, measure, viewportHeight }) {
    let nodes = [];
    try {
      nodes = doc.querySelectorAll('h1, h2, [data-testid*="title" i], [class*="title" i]');
    } catch {
      return "";
    }
    let best = "";
    let bestScore = -1;
    const limit = Math.min(nodes.length, 500);
    for (let i = 0; i < limit; i += 1) {
      const node = nodes[i];
      if (node.getClientRects().length === 0) continue;
      const m = measure(node);
      if (m.width < 40 || m.height < 14) continue;
      if (m.top > viewportHeight * 0.9 || m.top < -200) continue;
      const t = cleanTitle(textOrAlt(node));
      if (!isValid(t)) continue;
      const score = m.fontSize * 2 - m.top / 60;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /**
   * Completa la señal de REPRODUCCIÓN con la de la ficha de la misma página. En
   * muchas plataformas (RTVE Play, Atresplayer, Pluto TV, Filmin…) el vídeo se
   * reproduce en la propia ficha o en una página con sus mismos datos, y su Media
   * Session no dice más que el título; la ficha sabe además el tipo, el año y, en
   * un episodio, la serie y sus números.
   *
   * Nunca pisa lo que dijo el reproductor: solo rellena lo que falta. Un título
   * de película que salió de la pestaña («Ver X gratis en línea») se cambia por
   * el limpio de la ficha si lo contiene. Si la ficha dice con seguridad que es un
   * episodio, el título suelto pasa a ser el del episodio y la serie la de la
   * ficha. Con identidad exacta (metadatos de Netflix) no se toca nada.
   */
  function enrichPlaybackSignal(signal, browse) {
    if (!signal || !browse || signal.identitySource === "netflix_metadata") return signal;
    const out = { ...signal };
    const seriesEvidence = Boolean(out.showName || out.episodeName || out.season != null || out.episode != null);
    const lower = (t) => clean(t).toLowerCase();

    if (browse.mediaTypeHint === "tv" && browse.showName) {
      if (!out.showName) {
        if (out.movieTitle && lower(out.movieTitle) !== lower(browse.showName) && !out.episodeName) {
          out.episodeName = out.movieTitle;
        }
        delete out.movieTitle;
        out.showName = browse.showName;
      }
      if (!out.episodeName && browse.episodeName) out.episodeName = browse.episodeName;
      if (out.season == null && browse.season != null) out.season = browse.season;
      if (out.episode == null && browse.episode != null) out.episode = browse.episode;
      out.mediaTypeHint = out.mediaTypeHint || "tv";
    } else if (browse.mediaTypeHint === "movie" && browse.movieTitle && !seriesEvidence) {
      if (!out.movieTitle || lower(out.movieTitle).includes(lower(browse.movieTitle))) {
        out.movieTitle = browse.movieTitle;
      }
      if (lower(out.movieTitle) === lower(browse.movieTitle)) out.mediaTypeHint = out.mediaTypeHint || "movie";
    }
    if (!out.releaseYear && browse.releaseYear && out.mediaTypeHint) out.releaseYear = browse.releaseYear;
    return out;
  }

  return { DETAIL_ROUTES, TITLE_SELECTORS, matchDetailRoute, detectBrowsingSignal, enrichPlaybackSignal, platformHints, cleanTabTitle };
});
