import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getBackendBaseUrl,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  matchEpisodeCandidates,
} from "@/lib/netflix/streamingResolve";
import { normalizeText } from "@/lib/netflix/resolve";
import { createRequestCache } from "@/lib/netflix/requestCache";
import { buildRankedQueryVariants } from "@/lib/netflix/queryVariants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporada y episodio en los formatos e idiomas que usan las plataformas:
// "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 · Episode 1", "Cap. 1".
// Ambos exigen que delante haya un límite (principio o carácter no alfabético):
// sin esa guarda, "PARTE3" o "SUITE3" casaban su "E3" interior como episodio 3.
const SEASON_TEXT_RE =
  /(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i;
const EPISODE_TEXT_RE =
  /(?:^|[^a-z])(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i;

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";
const metadataCache = createRequestCache();

async function searchTmdbDirectLang(query, mediaType, language) {
  const url = new URL(`${TMDB_API}/search/${mediaType}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", language);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return [];

  const json = await response.json().catch(() => null);
  return Array.isArray(json?.results) ? json.results : [];
}

// Busca en TMDb en español E inglés y fusiona (sin duplicados por id). Los
// servicios de streaming suelen exponer el título ORIGINAL (a menudo en inglés)
// en la Media Session, y la búsqueda es-ES de una cadena inglesa suele no
// devolver nada: la causa nº1 del 404. Buscar también en en-US lo resuelve.
async function searchTmdbDirect(query, mediaType) {
  if (!TMDB_API_KEY) return [];
  const [es, en] = await Promise.all([
    searchTmdbDirectLang(query, mediaType, "es-ES"),
    searchTmdbDirectLang(query, mediaType, "en-US"),
  ]);
  const byId = new Map();
  for (const item of [...es, ...en]) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

async function searchTmdbCandidates(backendRequest, query, mediaType) {
  return searchTmdbCandidatesWithFallback({
    mediaType,
    backendSearch: async (type) => {
      const result = await backendRequest(
        `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=${type}`,
      );
      if (!result.ok) {
        console.warn("[Extension Sync] Backend TMDb search unavailable:", {
          query,
          mediaType: type,
          status: result.status,
          error: result.error,
        });
        return [];
      }
      return Array.isArray(result.json?.results) ? result.json.results : [];
    },
    directSearch: (type) => searchTmdbDirect(query, type),
  });
}

// Limpia el nombre del episodio quitando marcadores del principio ("E5", "T4:E5",
// "Episodio 5:", "Capítulo 5 -") para poder casarlo con el título en TMDb.
function cleanEpisodeName(name) {
  return String(name || "")
    .replace(
      /^\s*(?:T\s*\d+\s*[:x]?\s*)?(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\.?\s*\d+\s*[:.\-–·]?\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tmdbJson(url) {
  return metadataCache(url, async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  });
}

// Localiza la temporada buscando el episodio en TODAS las temporadas de la serie.
// Necesario para Netflix web (muestra el episodio pero NO la temporada) y para
// HBO Max/Prime (serie + nombre de episodio sin números). Escalera, de más a
// menos fiable — y ante AMBIGÜEDAD (varias temporadas casan) devuelve null en
// vez de fijar una temporada al azar (antes: "la primera ascendente", que en
// series largas solía ser la equivocada):
//   1) `episodeNumber` conocido: temporadas cuyo episodio Nº N casa por nombre.
//   2) Nombre EXACTO único entre todas las temporadas.
//   3) Nombre por inclusión fiable (endurecida) único.
//   4) `episodeNumber` conocido y UNA SOLA temporada tiene ≥N episodios.
// Devuelve {season, episode} o null.
async function findSeasonByEpisodeName(tmdbId, episodeName, episodeNumber = null) {
  if (!tmdbId || !TMDB_API_KEY) return null;
  const clean = cleanEpisodeName(episodeName);
  const epNum = Number.isInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : null;
  if ((!clean || clean.length < 2) && !epNum) return null;

  const showData = await tmdbJson(
    `${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
  );
  const realSeasons = (Array.isArray(showData?.seasons) ? showData.seasons : [])
    .filter((s) => s && Number(s.season_number) > 0)
    .sort((a, b) => Number(a.season_number) - Number(b.season_number))
    .slice(0, 30); // cota de seguridad para series con muchas temporadas
  const seasonNums = realSeasons.map((s) => Number(s.season_number));
  if (!seasonNums.length) return null;

  const allEpisodes = (
    await Promise.all(
      seasonNums.map(async (n) => {
        const [es, en] = await Promise.all([
          tmdbJson(`${TMDB_API}/tv/${tmdbId}/season/${n}?api_key=${TMDB_API_KEY}&language=es-ES`),
          tmdbJson(`${TMDB_API}/tv/${tmdbId}/season/${n}?api_key=${TMDB_API_KEY}&language=en-US`),
        ]);
        return [
          ...(Array.isArray(es?.episodes) ? es.episodes : []),
          ...(Array.isArray(en?.episodes) ? en.episodes : []),
        ];
      }),
    )
  ).flat();

  // 1) Número de episodio conocido: ¿en qué temporadas casa el NOMBRE del
  //    episodio Nº epNum? Único → fijado con máxima fiabilidad.
  if (epNum && clean) {
    const q = normalizeText(clean);
    const seasonsMatching = new Set();
    for (const e of allEpisodes) {
      if (Number(e?.episode_number) !== epNum) continue;
      const n = normalizeText(e?.name);
      if (n && q && (n === q || (n.length >= 6 && q.length >= 6 && (n.includes(q) || q.includes(n))))) {
        seasonsMatching.add(Number(e.season_number));
      }
    }
    if (seasonsMatching.size === 1) {
      return { season: [...seasonsMatching][0], episode: epNum };
    }
  }

  // 2-3) Por nombre en todas las temporadas: exactos primero, inclusión después;
  //      solo si el resultado es ÚNICO (sin ambigüedad).
  if (clean) {
    const { exact, partial } = matchEpisodeCandidates({
      episodeName: clean,
      seasonEpisodes: allEpisodes,
    });
    if (exact.length === 1) return exact[0];
    if (exact.length === 0 && partial.length === 1) return partial[0];
    if (exact.length > 1 || partial.length > 1) {
      console.warn(
        `[Extension Sync] Episodio "${clean}" ambiguo entre temporadas (${exact.length} exactos, ${partial.length} parciales); no se fija temporada.`,
      );
    }
  }

  // 4) Último recurso con número: una sola temporada tiene ≥ epNum episodios.
  if (epNum) {
    const seasonsWithEnough = realSeasons.filter(
      (s) => Number(s.episode_count) >= epNum,
    );
    if (seasonsWithEnough.length === 1) {
      return { season: Number(seasonsWithEnough[0].season_number), episode: epNum };
    }
  }

  return null;
}

export async function POST(request) {
  let backendResult = null;
  const backendRequest = async (path, init) => {
    const result = await backendFetchJson(request, path, { signal: AbortSignal.timeout(8000), ...init });
    if (result?.refreshedTokens) backendResult = result;
    return result;
  };
  const respond = (body, init) => {
    const response = NextResponse.json(body, init);
    setBackendAuthCookies(response, backendResult, {
      secure: getCookieSecure(request),
    });
    return response;
  };

  try {
    const {
      mainTitle,
      subTitle,
      videoId,
      contentId,
      platform = "netflix",
      season: seasonIn,
      episode: episodeIn,
      // Señales enriquecidas (PlaybackSignal) — opcionales, con retrocompat.
      showName,
      episodeName,
      // Título de una PELÍCULA según el cliente. Su presencia (sin ningún campo de
      // serie) es la clasificación que ya hizo el reproductor y el servidor debe
      // respetar: los números de su título no son temporadas ni episodios.
      movieTitle,
      seasonEpisodeText,
      // Título de la pestaña/app (p. ej. "Stranger Things - Netflix"): fuente más
      // fiable del nombre de la SERIE cuando la plataforma no expone artist/album.
      tabTitle,
      // Fuentes adicionales del nombre de la SERIE en Android: el título de la cola
      // de reproducción, el "album artist" y los EXTRAS de la notificación (algunas
      // apps —Netflix— no exponen la serie en la MediaSession pero sí en su
      // notificación) cuando `title` es el episodio.
      queueTitle,
      albumArtist,
      notifTitle,
      notifText,
      notifSubText,
      // Duración real (segundos) de la reproducción en curso, si se conoce
      // (viene de la MediaSession en Android/extensión). Se usa para desempatar
      // película/serie cuando el título coincide exacto en ambas (ver
      // `resolveStreamingEntity`/`decideByDuration`) -- p. ej. "X-Men" existe
      // como película Y como serie animada con el mismo título exacto.
      durationSec,
      // El nombre de la SERIE no lo ha dicho la reproducción: viene de la ficha que
      // el usuario tenía abierta antes (app Android, apps que no exponen la serie en
      // la MediaSession). Es un dato prestado, así que rebaja la confianza.
      seriesFromHint,
      // Modo "solo resolver": para el indicador en la FICHA del título (navegando,
      // sin reproducir). Resuelve el título pero NO lo inserta en el historial.
      resolveOnly,
      recordProgress,
      positionSec,
      estimated,
      eventId,
      observedAt,
    } = await request.json().catch(() => ({}));
    const durationSecNum = Number(durationSec);
    const safeDurationSec = Number.isFinite(durationSecNum) && durationSecNum > 0
      ? durationSecNum
      : null;
    const resolvedVideoId = videoId || contentId || null;
    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (recordProgress && (!syncToken || !eventId || !observedAt)) {
      return respond({ error: "Authenticated eventId and observedAt are required" }, { status: syncToken ? 400 : 401 });
    }
    if (!mainTitle && !showName && !movieTitle) {
      return respond({ error: "mainTitle is required" }, { status: 400 });
    }

    console.log(`[Extension Sync] ${platform} watch detected: "${mainTitle}" - "${subTitle}" (Content ID: ${resolvedVideoId})`);

    // 1. Clasificar película/serie y detectar temporada/episodio.
    //
    // REGLA: solo cuentan como evidencia de EPISODIO los campos que el reproductor
    // dedica a ello — el nombre de la serie (`showName`), el del episodio
    // (`episodeName`/`subTitle`) y el badge de temporada/episodio
    // (`seasonEpisodeText`). El TÍTULO PRINCIPAL no vale nunca para clasificar,
    // porque hay películas que llevan un número de "capítulo" en su propio nombre:
    // "John Wick: Capítulo 2" hacía saltar el patrón de episodio, la película se
    // buscaba SOLO como serie y acababa registrada como el episodio 2 de una serie
    // sin ninguna relación. Es la misma regla que ya aplica el cliente en
    // `detection-core.js` (buildPlaybackSignal) y que el servidor deshacía.
    const episodeEvidence = [subTitle, episodeName, seasonEpisodeText]
      .filter(Boolean)
      .join(" ");
    const numberFrom = (text, re) => {
      const match = String(text || "").match(re);
      const value = match ? parseInt(match[1], 10) : NaN;
      return Number.isInteger(value) && value > 0 ? value : null;
    };
    const seasonFromEvidence = numberFrom(episodeEvidence, SEASON_TEXT_RE);
    const episodeFromEvidence = numberFrom(episodeEvidence, EPISODE_TEXT_RE);

    // El cliente ya clasificó: mandó `movieTitle` y ningún campo de serie. Los
    // números que aparezcan en ese título no son temporadas ni episodios.
    const clientSaysMovie =
      Boolean(movieTitle) && !showName && !episodeName && !seasonEpisodeText;
    // El reproductor NOMBRA la serie o el episodio (evidencia textual, no numérica).
    const namedSeriesEvidence = Boolean(showName) || Boolean(episodeName) || Boolean(subTitle);
    // Duración de largometraje: ningún episodio con nombre llega aquí sin que además
    // se conozca su serie, así que una pieza tan larga sin serie ni nombre de
    // episodio es una película, por muchos números que traiga el título.
    const runsLikeAFilm = safeDurationSec != null && safeDurationSec >= 70 * 60;

    let isTv =
      Boolean(showName) ||
      Boolean(episodeName) ||
      episodeFromEvidence != null ||
      seasonFromEvidence != null;
    if (!isTv && !clientSaysMovie) {
      // Números ya parseados por el cliente (extensión / app Android).
      isTv =
        (Number.isInteger(episodeIn) && episodeIn > 0) ||
        (Number.isInteger(seasonIn) && seasonIn > 0);
    }
    // La duración solo desempata cuando la clasificación de serie se apoya SOLO en
    // un número suelto que mandó el cliente, sin ningún campo dedicado detrás: ese
    // es el caso de "John Wick: Capítulo 2", donde el número vive en el nombre de
    // la película. Un badge "T4:E5" sí es evidencia dedicada, y hay episodios que
    // pasan de 70 minutos: ahí la duración no puede mandar.
    if (
      isTv &&
      !namedSeriesEvidence &&
      episodeFromEvidence == null &&
      seasonFromEvidence == null &&
      runsLikeAFilm
    ) {
      isTv = false;
    }

    let season = null;
    let episode = null;
    if (isTv) {
      episode =
        Number.isInteger(episodeIn) && episodeIn > 0 ? episodeIn : episodeFromEvidence;
      // La temporada NUNCA se asume 1 (antes se registraba T1 al ver la T4): usa
      // la enviada por el cliente o la del texto; si no hay, queda null y más
      // abajo se decide (T1 solo si la serie tiene 1 temporada, o nivel serie).
      season =
        Number.isInteger(seasonIn) && seasonIn > 0 ? seasonIn : seasonFromEvidence;
      // Con la clasificación de serie ya establecida por un campo dedicado, el
      // título principal SÍ puede aportar los números ("Stranger Things T4:E5").
      if (episode == null && namedSeriesEvidence) {
        episode = numberFrom(mainTitle, EPISODE_TEXT_RE);
        if (season == null) season = numberFrom(mainTitle, SEASON_TEXT_RE);
      }
    }

    // 2. Construir variantes de consulta (nombre de serie/principal, nombre de la
    // serie extraído del título de la pestaña, parte antes de ":" para "Serie:
    // Episodio", y sin sufijos de edición) para maximizar la resolución. En series
    // se prioriza el nombre de la SERIE (no el del episodio) — clave para que los
    // episodios no fallen cuando la plataforma no expone artist/album.
    const rankedVariants = buildRankedQueryVariants({
      showName,
      mainTitle,
      movieTitle,
      tabTitle,
      queueTitle,
      albumArtist,
      // El título de la notificación de Android suele ser el nombre de la SERIE
      // cuando la MediaSession no lo expone (Netflix): fuente fiable.
      showCandidates: [notifTitle],
      // Campos de RELLENO: traen el episodio, su descripción o el badge "T1:E1".
      // Algunas apps (HBO Max) sí esconden ahí el nombre de la serie, así que se
      // prueban — pero solo se aceptan si dan una coincidencia EXACTA en TMDb.
      weakCandidates: [notifText, notifSubText, subTitle, seasonEpisodeText],
      isSeries: isTv,
    });
    if (!rankedVariants.length) {
      return respond({ error: "Empty title after cleanup" }, { status: 422 });
    }

    let tmdbId = null;
    let mediaType = isTv ? "tv" : "movie";
    let resolvedTitle = "";
    let posterPath = "";
    let confidence = null;
    let query = rankedVariants[0].query;

    // 3. Resolver contra el proxy backend y, si falla o no devuelve resultados,
    // contra TMDb directamente (es-ES + en-US). Cuando no hay números de episodio
    // comparamos coincidencias exactas de película y serie para no confundir una
    // serie con una película derivada.
    //
    // Se prueban las variantes en orden de fiabilidad y gana la primera con título
    // EXACTO. Una coincidencia APROXIMADA solo se acepta de una fuente fiable y
    // solo si ninguna otra variante da una exacta: antes valía la primera variante
    // que resolviese cualquier cosa, así que el texto de una notificación o un
    // badge podía "resolver" por relevancia de búsqueda libre un título sin
    // relación y era ese el que se guardaba.
    // ES UN EPISODIO Y NO SABEMOS DE QUÉ SERIE. Entonces ninguna consulta vale
    // como aproximación: todas salen del nombre del EPISODIO, del subtítulo o del
    // badge, que es texto ruidoso. Buscar eso en el catálogo de series devuelve
    // casi siempre algo, y el filtro de parecido lo da por bueno en cuanto el
    // título del candidato aparece DENTRO de la consulta — así es como un
    // "Capítulo cinco: La Nina" acababa registrado como la serie "La Niña", que no
    // tiene nada que ver. Es justo lo que manda Netflix en Android, que nunca
    // publica la serie.
    //
    // Sin el nombre de la serie solo se acepta una coincidencia EXACTA (que sí
    // puede llegar, p. ej. si el título de la notificación es la serie). Si no la
    // hay, mejor no registrar nada: un episodio ajeno en el historial cuesta más
    // de deshacer que una sincronización perdida.
    //
    // Se mira la EVIDENCIA de episodio, no la clasificación final: da igual que la
    // duración haya acabado tratándolo como película, porque el resolutor sigue
    // pudiendo devolver una serie por parecido. Y no afecta a las películas, que
    // no traen ningún número de episodio.
    const hasEpisodeNumber =
      episodeFromEvidence != null || (Number.isInteger(episodeIn) && episodeIn > 0);
    const requireExactMatch = !showName && (isTv || hasEpisodeNumber);
    let resolution = null;
    let fallback = null;
    for (const variant of rankedVariants) {
      const candidate = await resolveStreamingEntity({
        query: variant.query,
        expectedMediaType: episode != null ? "tv" : null,
        preferTv: isTv,
        durationSec: safeDurationSec,
        search: (type) => searchTmdbCandidates(backendRequest, variant.query, type),
      });
      if (!candidate) continue;
      if (candidate.exact) {
        resolution = candidate;
        query = variant.query;
        break;
      }
      if (!requireExactMatch && variant.strong && !fallback) {
        fallback = { candidate, query: variant.query };
      }
    }
    if (!resolution && fallback) {
      resolution = fallback.candidate;
      query = fallback.query;
    }

    if (resolution?.kind === "resolved") {
      const entity = resolution.entity;
      tmdbId = entity.id;
      mediaType = resolution.mediaType;
      isTv = resolution.mediaType === "tv";
      if (!isTv) {
        season = null;
        episode = null;
      }
      resolvedTitle =
        resolution.mediaType === "tv" ? entity.name : entity.title;
      posterPath = entity.poster_path;
      confidence = resolution.confidence || "high";
    } else if (resolution?.kind === "show_level") {
      // Serie reconocida sin episodio fijado: en vez de descartar, registramos
      // a nivel serie (confianza baja). Antes intentamos fijar el episodio por
      // NOMBRE contra los episodios de TMDb de la temporada detectada.
      const entity = resolution.entity;
      tmdbId = entity.id;
      mediaType = "tv";
      isTv = true;
      resolvedTitle = entity.name || entity.original_name || query;
      posterPath = entity.poster_path;
      episode = null;
      confidence = "low";

      if (episodeName && season && TMDB_API_KEY) {
        try {
          const seUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=es-ES`;
          const seRes = await fetch(seUrl, { signal: AbortSignal.timeout(8000) });
          if (seRes.ok) {
            const seData = await seRes.json();
            const hit = matchEpisodeByName({
              episodeName,
              seasonEpisodes: seData?.episodes,
            });
            if (hit) {
              season = hit.season;
              episode = hit.episode;
              confidence = "medium";
              console.log(
                `[Extension Sync] Episodio fijado por nombre: "${episodeName}" → T${season}E${episode}`,
              );
            }
          }
        } catch (e) {
          console.warn("[Extension Sync] episode-by-name lookup failed:", e?.message);
        }
      }

      // Serie reconocida por el subtítulo (HBO Max: serie en dSub, episodio en
      // title, SIN número de temporada). Con el nombre del episodio pero sin
      // temporada, lo localizamos por NOMBRE en TODAS las temporadas para fijar T/E.
      if (episode == null && episodeName && TMDB_API_KEY) {
        const hit = await findSeasonByEpisodeName(tmdbId, episodeName);
        if (hit) {
          season = hit.season;
          episode = hit.episode;
          confidence = "medium";
          console.log(
            `[Extension Sync] T/E fijado por nombre de episodio (show_level): "${episodeName}" → T${season}E${episode}`,
          );
        }
      }

      if (episode == null) {
        // Nivel serie puro: sin temporada/episodio concretos.
        season = null;
      }
    }

    // Serie con episodio pero SIN temporada conocida (típico de Netflix web, que
    // muestra el episodio pero no la temporada). NO inventamos T1:
    if (isTv && tmdbId && episode != null && season == null && TMDB_API_KEY) {
      // 1. Serie de una sola temporada → esa.
      const showData = await tmdbJson(
        `${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
      );
      const realSeasons = (Array.isArray(showData?.seasons) ? showData.seasons : [])
        .filter((s) => s && Number(s.season_number) > 0);
      if (realSeasons.length === 1) {
        season = Number(realSeasons[0].season_number) || 1;
      }

      // 2. Varias temporadas: localizar la temporada por el NOMBRE del episodio,
      //    apoyándose también en el NÚMERO conocido (episodio Nº N cuyo nombre
      //    casa, o única temporada con ≥N episodios).
      //
      //    Se intenta también SIN nombre de episodio: con solo el número, la última
      //    escalera de `findSeasonByEpisodeName` aún puede acertar cuando una sola
      //    temporada tiene suficientes episodios. Antes hacía falta el nombre, así
      //    que un reproductor que solo muestra "E7" se quedaba a nivel serie y el
      //    episodio no llegaba nunca a "Continuar viendo".
      if (season == null) {
        const hit = await findSeasonByEpisodeName(tmdbId, episodeName, episode);
        if (hit) {
          season = hit.season;
          episode = hit.episode;
          confidence = "medium";
          console.log(
            `[Extension Sync] Temporada fijada para el episodio "${episodeName || `E${episode}`}" → T${season}E${episode}`,
          );
        }
      }

      // 3. Sin suerte: nivel serie (no inventamos temporada).
      if (season == null) {
        console.warn(
          `[Extension Sync] Temporada desconocida para "${resolvedTitle || query}"; se registra a nivel serie.`,
        );
        episode = null;
        confidence = "low";
      }
    }

    // Nombre canónico del episodio en TMDb (solo con episodio concreto). Se expone
    // APARTE (synced.episodeName) por si algún cliente quiere mostrarlo, pero NO se
    // concatena al título que se guarda en el historial: un episodio debe guardarse
    // como la SERIE ("La casa del dragón" + T1·E1), igual que al marcarlo a mano
    // desde el modal. Antes se guardaba "Serie: Nombre del episodio". (El nombre va
    // en una variable propia para no colisionar con `episodeName` del body.)
    let tmdbEpisodeName = null;
    if (isTv && tmdbId && episode != null && season != null && TMDB_API_KEY) {
      try {
        const epUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=es-ES`;
        const epRes = await fetch(epUrl, { signal: AbortSignal.timeout(8000) });
        if (epRes.ok) {
          const epData = await epRes.json();
          if (epData.name) tmdbEpisodeName = epData.name;
        }
      } catch (e) {
        console.error("[Extension Sync] Failed to fetch episode name:", e);
      }
    }

    // Serie tomada de una ficha ajena a la reproducción: por buena que fuera la
    // coincidencia en TMDb, el dato de partida no lo dio el reproductor. Nunca
    // "high", para que el historial distinga lo seguro de lo deducido.
    if (seriesFromHint && confidence === "high") confidence = "medium";

    if (!tmdbId) {
      console.error("[Extension Sync] Could not resolve TMDb entity for:", query);
      return respond({ error: `Could not resolve TMDb entity for: ${query}` }, { status: 404 });
    }

    // Observación guardada sin conexión: resolver y aplicar el punto original,
    // usando la misma identidad de evento en cada reintento.
    if (recordProgress) {
      if (!syncToken) return respond({ error: "Sync token is required" }, { status: 401 });
      const baseUrl = getBackendBaseUrl();
      if (!baseUrl) return respond({ error: "Backend unavailable" }, { status: 503 });
      const response = await fetch(`${baseUrl}/v1/auth/netflix/progress`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${syncToken}` },
        body: JSON.stringify({
          tmdbId, mediaType, season: season ?? 0, episode: episode ?? 0,
          title: resolvedTitle, posterPath: posterPath || null, platform, confidence,
          positionSeconds: Math.max(0, Math.round(Number(positionSec) || 0)),
          runtimeSeconds: Math.max(0, Math.round(safeDurationSec || 0)),
          estimated: estimated === true, eventId, observedAt,
        }),
      });
      const progress = await response.json().catch(() => ({}));
      return respond(progress, { status: response.status });
    }

    // Modo "solo resolver" (indicador en la ficha, sin reproducir): devolvemos la
    // entidad resuelta SIN insertar nada en el historial.
    if (resolveOnly) {
      return respond({
        success: true,
        resolveOnly: true,
        synced: {
          tmdbId,
          mediaType,
          season: isTv ? season : null,
          episode: isTv ? episode : null,
          title: resolvedTitle,
          episodeName: isTv ? (tmdbEpisodeName || episodeName || null) : null,
          posterPath,
          // La confianza viaja también en modo "solo resolver": el cliente la
          // devuelve en los pings de progreso y es la que se guarda si el
          // contenido llega a completarse.
          confidence,
        },
      });
    }

    // 3. Insert into history
    const body = {
      tmdbId,
      mediaType,
      watchedAt: new Date().toISOString(),
    };

    if (resolvedTitle) body.title = resolvedTitle;
    if (posterPath) body.posterPath = posterPath;
    if (isTv && season != null) body.season = season;
    if (isTv && episode != null) body.episode = episode;
    if (confidence) body.confidence = confidence;

    console.log("[Extension Sync] Submitting Netflix sync body to backend:", JSON.stringify({
      ...body,
      netflixVideoId: resolvedVideoId || null,
    }));

    let historyRes;
    if (syncToken) {
      const baseUrl = getBackendBaseUrl();
      if (!baseUrl) {
        return respond({ error: "Backend base URL is not configured" }, { status: 503 });
      }

      const syncUrl = `${baseUrl}/v1/auth/netflix/sync`;
      console.log(`[Extension Sync] POST -> ${syncUrl}`);
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          ...body,
          platform,
          netflixVideoId: resolvedVideoId || undefined,
          netflixTitle: mainTitle || showName || resolvedTitle,
        }),
      });
      const json = await res.json().catch(() => ({}));
      historyRes = {
        ok: res.ok,
        status: res.status,
        json,
        error: json?.error || json?.message || `Backend HTTP ${res.status}`,
      };
    } else {
      historyRes = await backendRequest("/v1/history", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    if (!historyRes.ok) {
      console.error("[Extension Sync] Backend history insert failed:", {
        status: historyRes.status,
        error: historyRes.error,
        json: historyRes.json
      });
      return respond({
        error: historyRes.error || "Failed to add history entry",
        issues: historyRes.json?.issues 
      }, { status: historyRes.status || 500 });
    }

    return respond({
      success: true,
      synced: {
        tmdbId,
        mediaType,
        season,
        episode,
        title: resolvedTitle,
        episodeName: isTv ? (tmdbEpisodeName || episodeName || null) : null,
        posterPath,
        confidence,
        duplicate: Boolean(historyRes.json?.duplicate),
      },
    });
  } catch (error) {
    return respond({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
