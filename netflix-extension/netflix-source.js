/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// netflix-source.js — Netflix desde su reproductor y sus metadatos, no desde el DOM.
//
// El título del reproductor de Netflix es texto que Netflix retira del DOM
// mientras se reproduce, y la temporada sale de un badge «T4:E5» que hay que
// separar del nombre de la serie. El propio reproductor sabe qué vídeo suena
// (`playerApp.getState()`), y con ese id la API de metadatos de Netflix devuelve
// la serie, la temporada y el episodio ya numerados (`seq`), o la película con
// su año. Este módulo (puro, patrón UMD como detection-core.js) contiene:
//   - lo que lee el script de la página (netflix-page.js, mundo MAIN);
//   - la validación de su mensaje en el content script;
//   - las URLs y el análisis de los metadatos;
//   - la fusión con la señal: los metadatos mandan sobre el DOM, y sin ellos la
//     señal del DOM queda intacta.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVNetflix = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PLAYER_MESSAGE = "tsv-netflix-player";
  const HOST_RE = /(^|\.)netflix\.com$/i;
  const WATCH_PATH_RE = /^\/watch\/(\d+)/;
  const ID_RE = /^\d{1,15}$/;

  const idString = (value) => {
    const id = value == null ? "" : String(value);
    return ID_RE.test(id) ? id : null;
  };

  /**
   * Estado del reproductor a partir de `window.netflix` (lo ejecuta la página).
   * Prefiere la sesión que suena, luego la no pausada; ignora las que no tienen
   * duración (todavía cargando).
   */
  function readPlayerState(netflix) {
    let sessions = null;
    try {
      const state = netflix?.appContext?.state?.playerApp?.getState?.();
      sessions = state?.videoPlayer?.playbackStateBySessionId || null;
    } catch {
      return null;
    }
    if (!sessions || typeof sessions !== "object") return null;
    const all = Object.keys(sessions).map((k) => sessions[k]).filter((s) => s && Number(s.duration) > 0);
    const session = all.find((s) => s.playing) || all.find((s) => !s.paused) || all[0];
    const videoId = idString(session?.videoId);
    if (!videoId) return null;
    let buildId = null;
    try {
      const value = netflix?.reactContext?.models?.serverDefs?.data?.BUILD_IDENTIFIER;
      if (typeof value === "string" && /^[\w.-]{1,80}$/.test(value)) buildId = value;
    } catch {
      /* sin BUILD_IDENTIFIER: se usan las URLs que no lo necesitan */
    }
    return { videoId, paused: Boolean(session.paused), buildId };
  }

  /** Mensaje del script de la página validado, o null. */
  function parsePlayerMessage(data) {
    if (!data || data.source !== PLAYER_MESSAGE) return null;
    const videoId = idString(data.videoId);
    if (!videoId) return null;
    const buildId = typeof data.buildId === "string" && /^[\w.-]{1,80}$/.test(data.buildId) ? data.buildId : null;
    return { videoId, paused: Boolean(data.paused), buildId };
  }

  /** Id del vídeo de la URL del reproductor (`/watch/<id>`), o null. */
  function watchIdFromPath(pathname) {
    return (String(pathname || "").match(WATCH_PATH_RE) || [])[1] || null;
  }

  /**
   * URLs de metadatos a probar, en orden. `release` y `mre` no necesitan el
   * BUILD_IDENTIFIER; con él se prueban también las versionadas.
   */
  function metadataUrls(videoId, buildId) {
    const id = idString(videoId);
    if (!id) return [];
    const bases = ["https://www.netflix.com/nq/website/memberapi/release"];
    if (buildId) {
      bases.push(`https://www.netflix.com/nq/website/memberapi/${buildId}`);
      bases.push(`https://www.netflix.com/api/shakti/${buildId}`);
    }
    bases.push("https://www.netflix.com/api/shakti/mre");
    return bases.map((base) => `${base}/metadata?languages=en-US&movieid=${id}`);
  }

  const cleanText = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300) : "");
  const positiveInt = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  /**
   * Metadatos de un vídeo, o null si la respuesta no sirve.
   * Serie: { type:'show', videoId, showTitle, year, season, episode, episodeTitle, hiddenEpisodeNumbers }
   * Película: { type:'movie', videoId, title, year }
   * En las colecciones (`hiddenEpisodeNumbers`) la numeración de Netflix no es la
   * de TMDb: temporada y episodio quedan null y vale el nombre del episodio.
   */
  function parseMetadata(json, videoId) {
    const video = json?.video;
    if (!video || typeof video !== "object") return null;
    const year = positiveInt(video.year);
    if (video.type === "movie") {
      const title = cleanText(video.title);
      return title ? { type: "movie", videoId: idString(videoId) || idString(video.id), title, year } : null;
    }
    if (video.type !== "show") return null;
    const showTitle = cleanText(video.title);
    if (!showTitle) return null;
    const wanted = idString(video.currentEpisode) || idString(videoId);
    for (const season of Array.isArray(video.seasons) ? video.seasons : []) {
      for (const episode of Array.isArray(season?.episodes) ? season.episodes : []) {
        if (idString(episode?.id) !== wanted) continue;
        const hidden = Boolean(video.hiddenEpisodeNumbers);
        return {
          type: "show",
          videoId: wanted,
          showTitle,
          year,
          season: hidden ? null : positiveInt(season.seq),
          episode: hidden ? null : positiveInt(episode.seq),
          episodeTitle: cleanText(episode.title) || null,
          hiddenEpisodeNumbers: hidden,
        };
      }
    }
    return null;
  }

  /**
   * La señal con la identidad de los metadatos. Posición, duración, Media Session
   * y demás campos del reproductor se conservan.
   */
  function applyMetadata(signal, meta) {
    if (!signal || !meta) return signal;
    const out = { ...signal, contentId: meta.videoId || signal.contentId, identitySource: "netflix_metadata" };
    if (meta.year) out.releaseYear = meta.year;
    if (meta.type === "movie") {
      out.movieTitle = meta.title;
      delete out.showName;
      delete out.episodeName;
      delete out.seasonEpisodeText;
      out.season = null;
      out.episode = null;
      return out;
    }
    delete out.movieTitle;
    out.showName = meta.showTitle;
    if (meta.episodeTitle) out.episodeName = meta.episodeTitle;
    out.season = meta.season;
    out.episode = meta.episode;
    // El badge del DOM no puede contradecir los números de los metadatos (ni
    // aportar los de Netflix en una colección, que no son los de TMDb).
    if (meta.season && meta.episode) out.seasonEpisodeText = `T${meta.season}:E${meta.episode}`;
    else delete out.seasonEpisodeText;
    return out;
  }

  return {
    PLAYER_MESSAGE,
    HOST_RE,
    readPlayerState,
    parsePlayerMessage,
    watchIdFromPath,
    metadataUrls,
    parseMetadata,
    applyMetadata,
  };
});
