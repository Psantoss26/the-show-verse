import { NextResponse } from "next/server";
import { backendFetchJson, getBackendBaseUrl } from "@/lib/backend/server";
import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  matchEpisodeCandidates,
} from "@/lib/netflix/streamingResolve";
import { normalizeText } from "@/lib/netflix/resolve";
import { buildQueryVariants } from "@/lib/netflix/queryVariants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";

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

async function searchTmdbCandidates(request, query, mediaType) {
  return searchTmdbCandidatesWithFallback({
    mediaType,
    backendSearch: async (type) => {
      const result = await backendFetchJson(
        request,
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

async function tmdbJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
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
      // Modo "solo resolver": para el indicador en la FICHA del título (navegando,
      // sin reproducir). Resuelve el título pero NO lo inserta en el historial.
      resolveOnly,
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

    if (!mainTitle && !showName) {
      return NextResponse.json({ error: "mainTitle is required" }, { status: 400 });
    }

    console.log(`[Extension Sync] ${platform} watch detected: "${mainTitle}" - "${subTitle}" (Content ID: ${resolvedVideoId})`);

    // 1. Detectar temporada/episodio. La extensión puede enviarlos ya parseados;
    // si no, los inferimos del título completo (main + subtítulo) en varios
    // formatos: "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 Episode 1".
    const combined = `${mainTitle || showName || ""} ${subTitle || episodeName || ""} ${seasonEpisodeText || ""}`;
    let isTv = false;
    let season = null;
    let episode = null;

    const sMatch = combined.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
    const eMatch = combined.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);
    const seasonFromText = sMatch ? parseInt(sMatch[1], 10) : null;

    if (Number.isInteger(episodeIn) && episodeIn > 0) {
      isTv = true;
      episode = episodeIn;
      // La temporada NUNCA se asume 1 (antes se registraba T1 al ver la T4): usa
      // la enviada por el cliente o la del texto; si no hay, queda null y más
      // abajo se decide (T1 solo si la serie tiene 1 temporada, o nivel serie).
      season = Number.isInteger(seasonIn) && seasonIn > 0 ? seasonIn : seasonFromText;
    } else if (eMatch) {
      isTv = true;
      episode = parseInt(eMatch[1], 10);
      season = seasonFromText;
    } else if (sMatch) {
      // Temporada sin episodio identificable: se resolverá a nivel serie.
      season = seasonFromText;
    }

    // 2. Construir variantes de consulta (nombre de serie/principal, nombre de la
    // serie extraído del título de la pestaña, parte antes de ":" para "Serie:
    // Episodio", y sin sufijos de edición) para maximizar la resolución. En series
    // se prioriza el nombre de la SERIE (no el del episodio) — clave para que los
    // episodios no fallen cuando la plataforma no expone artist/album.
    const isSeries = isTv || Boolean(episodeName) || Number.isInteger(seasonIn);
    const queryVariants = buildQueryVariants({
      showName,
      mainTitle,
      tabTitle,
      queueTitle,
      albumArtist,
      // subTitle y seasonEpisodeText como candidatos de respaldo del nombre de la
      // SERIE: algunas apps (HBO Max) esconden ahí el nombre de la serie cuando el
      // `title` es el episodio. Van al final (baja prioridad) para no pisar las
      // fuentes fiables cuando existen.
      showCandidates: [notifTitle, notifText, notifSubText, subTitle, seasonEpisodeText],
      isSeries,
    });
    if (!queryVariants.length) {
      return NextResponse.json({ error: "Empty title after cleanup" }, { status: 422 });
    }

    let tmdbId = null;
    let mediaType = isTv ? "tv" : "movie";
    let resolvedTitle = "";
    let posterPath = "";
    let confidence = null;
    let query = queryVariants[0];

    // 3. Resolver contra el proxy backend y, si falla o no devuelve resultados,
    // contra TMDb directamente (es-ES + en-US). Cuando no hay números de episodio
    // comparamos coincidencias exactas de película y serie para no confundir una
    // serie con una película derivada. Se prueban EN ORDEN las variantes de
    // consulta hasta que una resuelve, de la más específica a la más agresiva.
    let resolution = null;
    for (const variant of queryVariants) {
      resolution = await resolveStreamingEntity({
        query: variant,
        expectedMediaType: isTv ? "tv" : null,
        preferTv: Boolean(subTitle || episodeName || showName),
        durationSec: safeDurationSec,
        search: (type) => searchTmdbCandidates(request, variant, type),
      });
      if (resolution) {
        query = variant;
        break;
      }
    }

    if (resolution?.kind === "resolved") {
      const entity = resolution.entity;
      tmdbId = entity.id;
      mediaType = resolution.mediaType;
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
      if (season == null && episodeName) {
        const hit = await findSeasonByEpisodeName(tmdbId, episodeName, episode);
        if (hit) {
          season = hit.season;
          episode = hit.episode;
          confidence = "medium";
          console.log(
            `[Extension Sync] Temporada fijada por nombre de episodio: "${episodeName}" → T${season}E${episode}`,
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
        const epRes = await fetch(epUrl);
        if (epRes.ok) {
          const epData = await epRes.json();
          if (epData.name) tmdbEpisodeName = epData.name;
        }
      } catch (e) {
        console.error("[Extension Sync] Failed to fetch episode name:", e);
      }
    }

    if (!tmdbId) {
      console.error("[Extension Sync] Could not resolve TMDb entity for:", query);
      return NextResponse.json({ error: `Could not resolve TMDb entity for: ${query}` }, { status: 404 });
    }

    // Modo "solo resolver" (indicador en la ficha, sin reproducir): devolvemos la
    // entidad resuelta SIN insertar nada en el historial.
    if (resolveOnly) {
      return NextResponse.json({
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
        return NextResponse.json({ error: "Backend base URL is not configured" }, { status: 503 });
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
      historyRes = await backendFetchJson(request, "/v1/history", {
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
      return NextResponse.json({ 
        error: historyRes.error || "Failed to add history entry",
        issues: historyRes.json?.issues 
      }, { status: historyRes.status || 500 });
    }

    return NextResponse.json({
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
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
