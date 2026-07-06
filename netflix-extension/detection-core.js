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

  return {
    clean,
    parseSeasonEpisode,
    stripPlatformPrefix,
    findSeasonEpisodeBadge,
    largestArtwork,
    buildPlaybackSignal,
    SE_SEASON_RE,
    SE_EPISODE_RE,
  };
});
