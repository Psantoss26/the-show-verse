// detection-core.js — Núcleo PURO y testeable de detección de reproducción.
//
// Se carga como content script (antes de content.js) exponiendo `self.TSVDetection`,
// y también se puede `require()` desde node:test (patrón UMD). No accede a
// `document`/`location` directamente: el DOM se pasa como argumento, para poder
// probar las funciones sin navegador.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVDetection = api;
})(typeof self !== "undefined" ? self : this, function () {
  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  // Extrae temporada/episodio de varios formatos/idiomas:
  // "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 · Episode 1", "Ep. 1".
  // Devuelve {} si no hay episodio identificable.
  function parseSeasonEpisode(text) {
    if (!text) return {};
    const s = text.match(
      /(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i,
    );
    const e = text.match(
      /(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i,
    );
    if (!e) return {};
    // La temporada NO se asume 1: si no aparece, se deja null (antes se ponía 1,
    // lo que registraba T1 al ver, p. ej., la T4). Quien resuelva decide qué hacer.
    return { season: s ? parseInt(s[1], 10) : null, episode: parseInt(e[1], 10) };
  }

  // Limpia el título de la pestaña quitando prefijo y sufijos de la plataforma.
  function stripPlatformPrefix(docTitle, suffixes) {
    let title = clean(docTitle);
    if (!title) return "";
    title = title.replace(
      /^\s*(prime video|amazon prime video|amazon|netflix|max|hbo max|hbo|disney\s*\+|disney plus|star\s*\+|crunchyroll|movistar\s*\+?|movistar plus\+?|filmin|skyshowtime|apple tv\+?|pluto tv|rakuten tv|atresplayer|rtve play|plex)\s*[:\-|–·]\s*/i,
      "",
    );
    for (const suffix of suffixes || []) {
      const re = new RegExp("\\s*[-|·–]\\s*" + suffix + "\\s*$", "i");
      title = title.replace(re, "");
    }
    title = title.replace(/^watch\s+/i, "").trim();
    if (
      !title ||
      /^(loading|cargando|prime video|max|disney\+|netflix|plex|crunchyroll)$/i.test(
        title,
      )
    )
      return "";
    return title;
  }

  // Fallback agnóstico a selectores: busca en el DOM un texto que sea un
  // distintivo de temporada+episodio ("T1 E1 El trato", "S1 E1", "T1:E1"…).
  // `doc` es el documento (inyectado para poder testear).
  const SE_SEASON_RE = /^(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*\d{1,3}\b/i;
  const SE_EPISODE_RE =
    /\b(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*\d{1,3}\b/i;

  function findSeasonEpisodeBadge(doc) {
    let nodes;
    try {
      nodes = doc.querySelectorAll("span, div, p, b, strong, li");
    } catch (e) {
      return "";
    }
    const max = Math.min(nodes.length, 5000);
    // La temporada y el episodio pueden estar en nodos SEPARADOS (Netflix a veces
    // muestra "T4" y "E5"/"Capítulo cinco" aparte). Recogemos ambos: si un nodo
    // trae los dos, lo devolvemos; si no, combinamos el mejor de cada uno.
    let seasonTxt = "";
    let episodeTxt = "";
    for (let i = 0; i < max; i += 1) {
      const el = nodes[i];
      if (el.children && el.children.length > 2) continue; // solo hojas-ish
      const txt = clean(el.textContent);
      if (!txt || txt.length > 80) continue;
      const hasS = SE_SEASON_RE.test(txt);
      const hasE = SE_EPISODE_RE.test(txt);
      if (hasS && hasE) return txt;
      if (hasS && !seasonTxt) seasonTxt = txt;
      if (hasE && !episodeTxt) episodeTxt = txt;
    }
    if (seasonTxt && episodeTxt) return `${seasonTxt} ${episodeTxt}`;
    return "";
  }

  // Elige la URL de la carátula más grande de la lista de Media Session.
  function largestArtwork(list) {
    if (!Array.isArray(list) || !list.length) return undefined;
    let best = list[0];
    let bestArea = -1;
    for (const a of list) {
      const m = /(\d+)x(\d+)/.exec((a && a.sizes) || "");
      const area = m ? parseInt(m[1], 10) * parseInt(m[2], 10) : 0;
      if (area >= bestArea) {
        bestArea = area;
        best = a;
      }
    }
    return (best && best.src) || undefined;
  }

  // Ensambla un PlaybackSignal normalizado a partir de las señales crudas.
  // Prioridad Media-Session-first: si hay artist/album lo tratamos como serie
  // (show = artist/album, episodio = title); si no, es película (title).
  function buildPlaybackSignal(input) {
    const i = input || {};
    const ms = i.mediaSession || {};
    const hasSeries = Boolean(clean(ms.artist) || clean(ms.album));

    let se = {};
    for (const t of [i.seasonEpisodeText, i.subTitle, i.tabTitle]) {
      const r = parseSeasonEpisode(t || "");
      if (r && r.episode) {
        se = r;
        break;
      }
    }

    return {
      host: i.host,
      url: i.url,
      contentId: i.contentId || null,
      showName: hasSeries
        ? clean(ms.artist) || clean(ms.album)
        : i.showName || undefined,
      episodeName: hasSeries ? clean(ms.title) || undefined : i.episodeName || undefined,
      movieTitle: hasSeries ? undefined : clean(ms.title) || i.movieTitle || undefined,
      season: se.season,
      episode: se.episode,
      seasonEpisodeText: i.seasonEpisodeText || undefined,
      tabTitle: i.tabTitle || undefined,
      artworkUrl: largestArtwork(ms.artwork),
      durationSec: i.durationSec,
      positionSec: i.positionSec,
    };
  }

  // Extrae señal de título de los DATOS ESTRUCTURADOS JSON-LD (schema.org) que
  // Prime Video, Max/HBO y muchas plataformas incluyen en la FICHA. A diferencia de
  // los selectores CSS (frágiles y por plataforma), esto es un estándar estable y,
  // para un episodio, da el nombre de la SERIE (partOfSeries) + temporada/episodio
  // — justo lo que falta para resolver episodios en Prime/Max (causa nº1 del 404).
  // `doc` se inyecta para poder testear. Devuelve un objeto normalizado o null.
  function detectFromJsonLd(doc) {
    let nodes;
    try {
      nodes = doc.querySelectorAll('script[type="application/ld+json"]');
    } catch (e) {
      return null;
    }
    const flatten = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data.flatMap(flatten);
      if (Array.isArray(data["@graph"])) return data["@graph"].flatMap(flatten);
      return [data];
    };
    for (const node of nodes) {
      let data;
      try {
        data = JSON.parse(node.textContent || node.innerText || "");
      } catch (e) {
        continue;
      }
      for (const it of flatten(data)) {
        if (!it || typeof it !== "object") continue;
        const type = String(it["@type"] || "").toLowerCase();
        const name = clean(it.name);
        if (type.includes("tvepisode")) {
          const series =
            clean(it.partOfSeries && it.partOfSeries.name) ||
            clean(
              it.partOfSeason &&
                it.partOfSeason.partOfSeries &&
                it.partOfSeason.partOfSeries.name,
            );
          const seasonNum = Number(
            (it.partOfSeason && it.partOfSeason.seasonNumber) ??
              it.seasonNumber,
          );
          const episodeNum = Number(it.episodeNumber);
          if (!series && !name) continue;
          return {
            mediaType: "tv",
            showName: series || undefined,
            episodeName: name || undefined,
            season: Number.isFinite(seasonNum) ? seasonNum : null,
            episode: Number.isFinite(episodeNum) ? episodeNum : null,
          };
        }
        if ((type.includes("tvseries") || type.includes("tvseason")) && name) {
          return { mediaType: "tv", showName: name };
        }
        if ((type.includes("movie") || type === "videoobject") && name) {
          return { mediaType: "movie", movieTitle: name };
        }
      }
    }
    return null;
  }

  // og:title / twitter:title de la ficha. Último recurso (puede quedar algo
  // obsoleto en SPAs), pero mejor que el título crudo de la pestaña para Prime/Max
  // cuando los selectores propios fallan. `doc` inyectable para testear.
  function detectFromMeta(doc) {
    try {
      const node =
        doc.querySelector('meta[property="og:title"]') ||
        doc.querySelector('meta[name="twitter:title"]');
      if (!node) return "";
      const content = node.getAttribute
        ? node.getAttribute("content")
        : node.content;
      return clean(content);
    } catch (e) {
      return "";
    }
  }

  // Construye la URL de la página de detalles de The Show Verse a partir de lo que
  // devuelve el sync ({tmdbId, mediaType, season, episode}). Serie con episodio →
  // página del episodio; serie sin episodio → página de la serie; película → su
  // página. Devuelve "" si no hay id resuelto.
  function buildDetailsUrl(origin, synced) {
    if (!origin || !synced || !synced.tmdbId) return "";
    const base = String(origin).replace(/\/+$/, "");
    const type = synced.mediaType === "tv" ? "tv" : "movie";
    const id = Number(synced.tmdbId);
    if (!id) return "";
    if (
      type === "tv" &&
      synced.season != null &&
      synced.episode != null
    ) {
      return `${base}/details/tv/${id}/season/${synced.season}/episode/${synced.episode}`;
    }
    return `${base}/details/${type}/${id}`;
  }

  return {
    clean,
    parseSeasonEpisode,
    stripPlatformPrefix,
    findSeasonEpisodeBadge,
    largestArtwork,
    buildPlaybackSignal,
    buildDetailsUrl,
    detectFromJsonLd,
    detectFromMeta,
    SE_SEASON_RE,
    SE_EPISODE_RE,
  };
});
