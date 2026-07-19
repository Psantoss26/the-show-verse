"use client";

// /src/components/dashboard/useDetailModalData.js
// Hook que, al cambiar `item` a un valor no nulo, descarga el conjunto (ahora
// más rico) de datos de la ficha rápida del dashboard. Devuelve { loading, data }.
// Nunca lanza: captura errores y degrada campo a campo.
//
// Estrategia: detalles + créditos + recomendaciones en paralelo (contenido
// principal) y, en segundo plano y de forma independiente, IDs externos -> OMDb
// (premios) + IMDb (nota), y la comunidad de Trakt (sentimientos + scoreboard).
// Se cancela con un flag al desmontar o cambiar de item.

import { useEffect, useState } from "react";

import {
  getDetails,
  getCredits,
  getRecommendations,
  getExternalIds,
  resolveEpisodeImdbId,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import {
  extractOmdbExtraScores,
  extractOmdbImdbScore,
} from "@/lib/details/omdbCache";
import { formatDateEs } from "@/lib/details/formatters";
import { traktGetSentiments, traktGetScoreboard } from "@/lib/api/traktClient";
import {
  yearOf,
  ratingOf,
  formatRuntime,
  GENRES,
  getMediaTypeForItem,
  fetchBestLogo,
  fetchBestPosterNoLang,
  fetchBestBackdropNoLang,
  preloadImage,
  buildImg,
} from "@/lib/dashboard/media";
import { dedupeStreamingProviders } from "@/lib/streaming/providers";

// Mapa estado (TMDb) -> etiqueta ES, espejo de `getStatusLabel` en DetailsClient.
function statusLabelEs(status) {
  const map = {
    Released: "Estrenada",
    Ended: "Finalizada",
    "Returning Series": "En emisión",
    Canceled: "Cancelada",
    "In Production": "En producción",
    "Post Production": "Postproducción",
    Planned: "Planificada",
    Rumored: "Rumoreada",
    Pilot: "Piloto",
  };
  return map[status] || status || null;
}

// Espejo de `isMainDirectorCredit` + `getMovieDirectorsFromCrew` +
// `formatCreditNames` en DetailsClient: nombres de los directores (job "Director"
// / "Co-Director") del equipo de créditos, unidos con ", ".
const isMainDirectorCredit = (credit) =>
  credit?.job === "Director" || credit?.job === "Co-Director";

function movieDirectorNames(crew) {
  const list = Array.isArray(crew) ? crew.filter(isMainDirectorCredit) : [];
  return list.length
    ? list.map((p) => p?.name).filter(Boolean).join(", ")
    : null;
}

// Deduplica y recorta la lista de sentimientos de Trakt usando `sentiment_es`
// (espejo de `formatTraktSentimentList` en DetailsClient).
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function formatSentimentList(items = [], max = 4) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = String(item?.sentiment_es || "").trim();
    const key = text
      .normalize("NFD")
      .replace(DIACRITICS_RE, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function formatEpisodeRuntimePerEpisode(source) {
  const values = Array.isArray(source?.episode_run_time)
    ? source.episode_run_time
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const formatMinutes = (value) => {
    const total = Number(value);
    return Number.isFinite(total) && total > 0
      ? `${Math.round(total)} min`
      : null;
  };

  if (uniqueValues.length === 1) {
    const value = formatMinutes(uniqueValues[0]);
    return value;
  }

  if (uniqueValues.length > 1) {
    const min = formatMinutes(uniqueValues[0]);
    const max = formatMinutes(uniqueValues[uniqueValues.length - 1]);
    return min && max ? `${min}-${max}` : null;
  }

  const lastEpisodeRuntime = formatMinutes(
    source?.last_episode_to_air?.runtime,
  );
  return lastEpisodeRuntime;
}

const EMPTY_PRODUCTION = {
  companies: [],
  networks: [],
  countries: [],
  status: null,
  originalLanguage: null,
};

const EMPTY_SENTIMENT = { pros: [], cons: [] };

const EMPTY_DATA = {
  mediaType: null,
  // Preview de EPISODIO: cuando true, el modal pinta la variante de episodio
  // (still, T{n}·E{n}·fecha·duración, secciones Reparto + navegador). `episodeMeta`
  // lleva los datos propios del episodio para la cabecera y el enlace a ficha.
  isEpisode: false,
  episodeMeta: null,
  title: null,
  homepage: null,
  logoPath: null,
  // ¿Ha TERMINADO ya la búsqueda del logo? La cabecera solo debe caer al
  // título de texto cuando sepamos que no hay logo, nunca mientras carga:
  // con `logoPath` a null no se distingue "aún no llegó" de "no existe".
  logoResolved: false,
  overview: null,
  backdropPath: null,
  posterPath: null,
  heroPosterPath: null,
  // Backdrop FINAL del hero (textless), fijado UNA sola vez y ya precargado. El
  // hero lo usa en exclusiva: hasta que existe muestra el esqueleto (nunca la
  // backdrop de la semilla), así se ve solo la imagen final (sin parpadeo).
  heroBackdropPath: null,
  year: null,
  runtime: null,
  seasonEpisodeValue: null,
  episodeRuntimeValue: null,
  genres: [],
  genreObjects: [],
  status: null,
  // Campos que alimentan las pestañas compartidas <DetailsInfoTabs>
  originalTitle: null,
  numberOfSeasons: null,
  numberOfEpisodes: null,
  releaseDateValue: null,
  lastAirDateValue: null,
  budgetValue: null,
  revenueValue: null,
  director: null,
  creators: null,
  network: null,
  productionText: null,
  tagline: null,
  tmdbRating: null,
  tmdbVotes: null,
  tmdbRatingResolved: false,
  imdbRating: null,
  imdbVotes: null,
  imdbId: null,
  imdbRatingResolved: false,
  rtScore: null,
  mcScore: null,
  awards: null,
  cast: [],
  recommendations: [],
  production: EMPTY_PRODUCTION,
  sentiment: EMPTY_SENTIMENT,
  scoreboard: null,
  scoreboardResolved: false,
  providers: [],
  seasons: [],
  showReleaseDate: null,
};

function mergeModalProviders(...lists) {
  const merged = [];

  for (const list of lists) {
    for (const provider of Array.isArray(list) ? list : []) {
      if (provider) merged.push(provider);
    }
  }

  const providers = dedupeStreamingProviders(merged);
  const plexProvider = providers.find((provider) => provider?.isPlex);
  const regularProviders = providers.filter((provider) => !provider?.isPlex);

  if (!plexProvider) return regularProviders.slice(0, 6);
  return [...regularProviders.slice(0, 5), plexProvider];
}

function buildPlexProvider(plexUrl) {
  if (!plexUrl) return null;
  return {
    provider_id: "plex",
    provider_name: "Plex",
    name: "Plex",
    logo_path: "/logo-Plex.png",
    url: plexUrl,
    isPlex: true,
  };
}

// Normaliza la respuesta de /api/streaming (JustWatch) a la forma mínima que
// consume la ficha rápida: { name, logo_path, url }. Dedupe por nombre y recorta
// a los primeros ~6. `logo_path` viene como ruta de TMDb (p. ej. "/abc.jpg").
function normalizeProviders(list, max = 6) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    const name = p?.provider_name || p?.name || null;
    const url = typeof p?.url === "string" && p.url ? p.url : null;
    if (!name || !url) continue;
    const key = String(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      provider_id: p?.provider_id ?? name,
      provider_name: name,
      name,
      logo_path: p?.logo_path || p?.logo || null,
      url,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function useDetailModalData(item) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(EMPTY_DATA);

  useEffect(() => {
    if (!item || item.id == null) {
      setData(EMPTY_DATA);
      setLoading(false);
      return undefined;
    }

    // ===================== RAMA EPISODIO (aditiva) =====================
    // Datos propios del episodio (still, nombre, fecha, duración, sinopsis,
    // valoración), reparto + invitados, temporadas de la serie (para el navegador)
    // y nota IMDb del episodio. El camino movie/tv de abajo NO se toca.
    if (item.media_type === "episode") {
      const showId = item.showId ?? item.id;
      const seasonNumber = item.seasonNumber;
      const episodeNumber = item.episodeNumber;
      let cancelledEp = false;

      setLoading(true);
      setData({
        ...EMPTY_DATA,
        mediaType: "tv",
        isEpisode: true,
        title: item.name || item.title || null,
        // Semilla: solo el still del episodio si viene en el item (NO el backdrop
        // de la serie, que provocaría un salto cuando llega el still real).
        backdropPath: item.still_path || null,
        episodeMeta: {
          showId,
          seasonNumber,
          episodeNumber,
          showName: item.showName || null,
          airDate: null,
          runtime: null,
        },
      });

      (async () => {
        try {
          const [showDetails, epRes, epCreditsRes] = await Promise.all([
            getDetails("tv", showId).catch(() => null),
            fetch(
              `/api/tmdb/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
              { cache: "no-store" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            fetch(
              `/api/tmdb/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}/credits`,
              { cache: "no-store" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ]);
          if (cancelledEp) return;

          const ep = epRes || {};
          const showName = showDetails?.name || item.showName || null;
          // Reparto del episodio = cast + invitados (mismo criterio que EpisodeDetails).
          const cast = [
            ...(Array.isArray(epCreditsRes?.cast) ? epCreditsRes.cast : []),
            ...(Array.isArray(epCreditsRes?.guest_stars)
              ? epCreditsRes.guest_stars
              : []),
          ].slice(0, 20);

          const tmdbRatingStr = ratingOf(ep);
          const tmdbRating = tmdbRatingStr !== "–" ? tmdbRatingStr : null;
          const tmdbVotes =
            typeof ep?.vote_count === "number" && ep.vote_count > 0
              ? ep.vote_count
              : null;
          const runtime = formatRuntime(ep?.runtime) || null;

          setData((prev) => ({
            ...prev,
            mediaType: "tv",
            isEpisode: true,
            title: ep?.name || item.name || `Episodio ${episodeNumber}`,
            overview:
              (typeof ep?.overview === "string" && ep.overview.trim()) || null,
            backdropPath:
              ep?.still_path ||
              showDetails?.backdrop_path ||
              item.still_path ||
              null,
            // Los episodios no tienen póster propio: usamos el de la SERIE, para
            // que la preview (hero móvil centrado) siempre tenga imagen tipo poster.
            // `heroPosterPath`/`heroBackdropPath` se fijan aparte, ya precargados.
            posterPath: showDetails?.poster_path || null,
            year: ep?.air_date ? String(ep.air_date).slice(0, 4) : null,
            runtime,
            tmdbRating,
            tmdbVotes,
            tmdbRatingResolved: true,
            cast,
            seasons: Array.isArray(showDetails?.seasons)
              ? showDetails.seasons
              : [],
            episodeMeta: {
              showId,
              seasonNumber,
              episodeNumber,
              showName,
              airDate: ep?.air_date ? formatDateEs(ep.air_date) : null,
              runtime,
            },
          }));

          // Arte FINAL del hero (precargado, fijado una vez, sin parpadeo):
          //  - desktop: still del episodio (o backdrop de la serie de respaldo).
          //  - móvil: póster de la serie textless (o el normal de respaldo).
          const stillForHero =
            ep?.still_path || showDetails?.backdrop_path || null;
          if (stillForHero) {
            preloadImage(buildImg(stillForHero, "w1280"))
              .catch(() => {})
              .then(() => {
                if (!cancelledEp) {
                  setData((prev) => ({ ...prev, heroBackdropPath: stillForHero }));
                }
              });
          }
          (async () => {
            const finalPoster =
              (await fetchBestPosterNoLang(showId, "tv", {
                fallbackToAny: false,
              }).catch(() => null)) ||
              showDetails?.poster_path ||
              null;
            if (!finalPoster || cancelledEp) return;
            await preloadImage(buildImg(finalPoster, "w780")).catch(() => {});
            if (!cancelledEp) {
              setData((prev) => ({ ...prev, heroPosterPath: finalPoster }));
            }
          })();
        } catch {
          // degradamos: nos quedamos con la semilla
          if (!cancelledEp) {
            setData((prev) => ({ ...prev, tmdbRatingResolved: true }));
          }
        } finally {
          if (!cancelledEp) setLoading(false);
        }
      })();

      // Nota IMDb del episodio (independiente, en paralelo).
      (async () => {
        try {
          const imdb = await resolveEpisodeImdbId(
            showId,
            seasonNumber,
            episodeNumber,
          ).catch(() => null);
          if (!imdb || cancelledEp) {
            if (!cancelledEp) {
              setData((prev) => ({ ...prev, imdbRatingResolved: true }));
            }
            return;
          }
          const [omdb, imdbDataset] = await Promise.all([
            fetchOmdbByImdb(imdb).catch(() => null),
            fetchImdbRatingByImdb(imdb).catch(() => null),
          ]);
          if (cancelledEp) return;
          const datasetRating =
            typeof imdbDataset?.rating === "number" ? imdbDataset.rating : null;
          const datasetVotes =
            typeof imdbDataset?.votes === "number" ? imdbDataset.votes : null;
          const { imdbRating: omdbImdbRating, imdbVotes: omdbImdbVotes } =
            extractOmdbImdbScore(omdb);
          setData((prev) => ({
            ...prev,
            imdbId: imdb ?? prev.imdbId,
            imdbRating: (datasetRating ?? omdbImdbRating) ?? prev.imdbRating,
            imdbVotes: (datasetVotes ?? omdbImdbVotes) ?? prev.imdbVotes,
            imdbRatingResolved: true,
          }));
        } catch {
          // sin nota IMDb del episodio
          if (!cancelledEp) {
            setData((prev) => ({ ...prev, imdbRatingResolved: true }));
          }
        }
      })();

      // Logo GENERAL de la serie para la cabecera del episodio (best-effort).
      (async () => {
        try {
          const logoPath = await fetchBestLogo(showId, "tv", ["en", null, "es"]);
          if (!cancelledEp) {
            setData((prev) => ({
              ...prev,
              logoPath: logoPath || prev.logoPath,
              logoResolved: true,
            }));
          }
        } catch {
          // Ver nota en la rama de película/serie: se marca resuelto aunque falle.
          if (!cancelledEp) {
            setData((prev) => ({ ...prev, logoResolved: true }));
          }
        }
      })();


      // Comunidad de Trakt del EPISODIO: rating + stats (seguidores/repro/listas).
      (async () => {
        try {
          const sb = await traktGetScoreboard({
            type: "episode",
            tmdbId: showId,
            season: seasonNumber,
            episode: episodeNumber,
          });
          if (cancelledEp) return;
          if (!sb?.found) {
            setData((prev) => ({ ...prev, scoreboardResolved: true }));
            return;
          }
          const rating =
            typeof sb?.community?.rating === "number"
              ? sb.community.rating
              : null;
          const votes =
            typeof sb?.community?.votes === "number"
              ? sb.community.votes
              : null;
          const st = sb?.stats || {};
          const stats = {
            watchers: typeof st.watchers === "number" ? st.watchers : null,
            plays: typeof st.plays === "number" ? st.plays : null,
            lists: typeof st.lists === "number" ? st.lists : null,
            favorited: typeof st.favorited === "number" ? st.favorited : null,
          };
          const hasStats = Object.values(stats).some(
            (v) => typeof v === "number",
          );
          if (rating != null || votes != null || hasStats) {
            setData((prev) => ({
              ...prev,
              scoreboard: { rating, votes, stats },
              scoreboardResolved: true,
            }));
          } else {
            setData((prev) => ({ ...prev, scoreboardResolved: true }));
          }
        } catch {
          // sin scoreboard del episodio
          if (!cancelledEp) {
            setData((prev) => ({ ...prev, scoreboardResolved: true }));
          }
        }
      })();

      // Plataformas de la SERIE (los episodios se ven en las mismas).
      (async () => {
        try {
          const showDetails = await getDetails("tv", showId).catch(() => null);
          const streamTitle = (
            showDetails?.name ||
            item.showName ||
            ""
          ).trim();
          if (!streamTitle || cancelledEp) return;
          const params = new URLSearchParams({ title: streamTitle, type: "tv" });
          const y = showDetails?.first_air_date
            ? String(showDetails.first_air_date).slice(0, 4)
            : null;
          if (y) params.append("year", y);
          params.append("tmdbId", String(showId));
          const streamRes = await fetch(`/api/streaming?${params.toString()}`);
          if (!streamRes.ok || cancelledEp) return;
          const streamJson = await streamRes.json();
          const providers = normalizeProviders(streamJson?.providers, 10);
          if (!cancelledEp && providers.length) {
            setData((prev) => ({
              ...prev,
              providers: mergeModalProviders(providers, prev.providers),
            }));
          }
        } catch {
          // sin plataformas
        }
      })();

      return () => {
        cancelledEp = true;
      };
    }
    // =================== FIN RAMA EPISODIO ===================

    let cancelled = false;
    const mediaType = getMediaTypeForItem(item);
    const id = item.id;
    const seedLogoPath = item.logoPath || item.logo_path || null;
    const detailsPromise = getDetails(mediaType, id).catch(() => null);

    setLoading(true);
    // Semilla inmediata con lo que ya trae el item (evita salto en cabecera).
    setData({
      ...EMPTY_DATA,
      mediaType,
      title: item.title || item.name || null,
      logoPath: seedLogoPath,
      // Si el item ya traía logo, no hay nada que esperar.
      logoResolved: Boolean(seedLogoPath),
      backdropPath: item.backdrop_path || null,
      posterPath: item.poster_path || null,
      year: yearOf(item) || null,
    });

    (async () => {
      let details = null;
      try {
        const [detailsRes, credits, recs] = await Promise.all([
          detailsPromise,
          getCredits(mediaType, id).catch(() => null),
          getRecommendations(mediaType, id).catch(() => null),
        ]);
        if (cancelled) return;

        details = detailsRes;
        const source = details || item;

        const title =
          source?.title || source?.name || item?.title || item?.name || null;
        const overview =
          (typeof source?.overview === "string" && source.overview.trim()) ||
          null;
        // No pisar el backdrop de la semilla con el de getDetails (evita el flash).
        // El backdrop FINAL (textless) se fija aparte y YA PRECARGADO más abajo.
        const backdropPath =
          item?.backdrop_path || source?.backdrop_path || null;
        const posterPath = source?.poster_path || item?.poster_path || null;
        const year = yearOf(source) || yearOf(item) || null;

        // Etiquetas meta: duración real para películas; temporadas/episodios
        // para series en la cabecera, y duración media para "Duración".
        let runtime = null;
        let seasonEpisodeValue = null;
        let episodeRuntimeValue = null;
        if (mediaType === "tv") {
          if (source?.number_of_seasons) {
            seasonEpisodeValue = `${source.number_of_seasons} Temp.`;
            if (source?.number_of_episodes) {
              seasonEpisodeValue += ` · ${source.number_of_episodes} Eps.`;
            }
          }
          episodeRuntimeValue = formatEpisodeRuntimePerEpisode(source);
        } else {
          runtime = formatRuntime(source?.runtime) || null;
        }

        // Nombres de género: desde `genres` [{id,name}] o `genre_ids` -> GENRES.
        let genres = [];
        if (Array.isArray(source?.genres) && source.genres.length) {
          genres = source.genres.map((g) => g?.name).filter(Boolean);
        } else {
          const ids = source?.genre_ids || item?.genre_ids || [];
          genres = (Array.isArray(ids) ? ids : [])
            .map((gid) => GENRES[gid])
            .filter(Boolean);
        }

        // Objetos de género { id, name } para <DetailsMetaGenresRow>, que llama
        // internamente translateGenre(genre.name). Mismo origen que `genres`.
        let genreObjects = [];
        if (Array.isArray(source?.genres) && source.genres.length) {
          genreObjects = source.genres
            .filter((g) => g && g.name)
            .map((g) => ({ id: g.id ?? g.name, name: g.name }));
        } else {
          const ids = source?.genre_ids || item?.genre_ids || [];
          genreObjects = (Array.isArray(ids) ? ids : [])
            .map((gid) => (GENRES[gid] ? { id: gid, name: GENRES[gid] } : null))
            .filter(Boolean);
        }

        const tmdbRatingStr = ratingOf(source);
        const tmdbRating = tmdbRatingStr !== "–" ? tmdbRatingStr : null;
        const tmdbVotes =
          typeof source?.vote_count === "number" && source.vote_count > 0
            ? source.vote_count
            : null;

        const cast = Array.isArray(credits?.cast)
          ? credits.cast.slice(0, 12)
          : [];
        const recommendations = Array.isArray(recs?.results)
          ? recs.results
          : [];

        // Producción: derivable de getDetails (production_companies, networks,
        // production_countries, status, original_language).
        const production = {
          companies: Array.isArray(details?.production_companies)
            ? details.production_companies.map((c) => c?.name).filter(Boolean)
            : [],
          networks: Array.isArray(details?.networks)
            ? details.networks.map((n) => n?.name).filter(Boolean)
            : [],
          countries: Array.isArray(details?.production_countries)
            ? details.production_countries.map((c) => c?.name).filter(Boolean)
            : [],
          status: statusLabelEs(details?.status),
          originalLanguage: details?.original_language || null,
        };

        // Campos que alimentan las pestañas compartidas <DetailsInfoTabs>,
        // derivados IGUAL que en DetailsClient (mismos formatters).
        const originalTitle =
          mediaType === "movie"
            ? source?.original_title || null
            : source?.original_name || null;

        const numberOfSeasons =
          typeof source?.number_of_seasons === "number"
            ? source.number_of_seasons
            : null;
        const numberOfEpisodes =
          typeof source?.number_of_episodes === "number"
            ? source.number_of_episodes
            : null;

        const releaseDateValue =
          mediaType === "movie"
            ? formatDateEs(source?.release_date)
            : formatDateEs(source?.first_air_date);
        const lastAirDateValue =
          mediaType === "tv" ? formatDateEs(source?.last_air_date) : null;

        const budgetValue =
          mediaType === "movie" && source?.budget > 0
            ? `$${(source.budget / 1_000_000).toFixed(1)}M`
            : null;
        const revenueValue =
          mediaType === "movie" && source?.revenue > 0
            ? `$${(source.revenue / 1_000_000).toFixed(1)}M`
            : null;

        const director =
          mediaType === "movie" ? movieDirectorNames(credits?.crew) : null;
        const creators =
          mediaType === "tv" &&
          Array.isArray(details?.created_by) &&
          details.created_by.length
            ? details.created_by.map((d) => d.name).join(", ")
            : null;

        const network =
          mediaType === "tv"
            ? details?.networks?.[0]?.name ||
              details?.networks?.[0]?.original_name ||
              null
            : null;

        const productionText =
          (Array.isArray(details?.production_companies)
            ? details.production_companies
                .slice(0, 3)
                .map((c) => c?.name)
                .join(", ")
            : "") || null;

        const tagline =
          (typeof source?.tagline === "string" && source.tagline.trim()) ||
          null;

        setData((prev) => ({
          ...prev,
          mediaType,
          title,
          homepage: source?.homepage || null,
          overview,
          backdropPath,
          posterPath,
          year,
          runtime,
          seasonEpisodeValue,
          episodeRuntimeValue,
          genres,
          genreObjects,
          status: details?.status || null,
          originalTitle,
          numberOfSeasons,
          numberOfEpisodes,
          releaseDateValue,
          lastAirDateValue,
          budgetValue,
          revenueValue,
          director,
          creators,
          network,
          productionText,
          tagline,
          tmdbRating,
          tmdbVotes,
          tmdbRatingResolved: true,
          cast,
          recommendations,
          production,
          // Datos crudos para el modal de episodios vistos (solo TV): array de
          // temporadas de TMDb y fecha de estreno ISO sin formatear.
          seasons: Array.isArray(source?.seasons) ? source.seasons : [],
          showReleaseDate:
            source?.first_air_date || source?.release_date || null,
        }));
      } catch {
        // Degradamos en silencio: nos quedamos con la semilla del item.
        if (!cancelled) {
          setData((prev) => ({ ...prev, tmdbRatingResolved: true }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

    })();

    // Nota IMDb (rating + votos) + premios (OMDb) + RT/MC. INDEPENDIENTE y en
    // PARALELO con la carga principal (no encadenado tras los detalles), igual
    // que DetailsClient: IMDb y OMDb se piden a la vez, y el dataset rápido de
    // IMDb aporta también el número de votos. OMDb es respaldo de rating/votos.
    (async () => {
      try {
        let imdb = item?.imdb_id || null;
        if (!imdb) {
          const ext = await getExternalIds(mediaType, id).catch(() => null);
          imdb = ext?.imdb_id || null;
        }
        if (!imdb || cancelled) {
          if (!cancelled) {
            setData((prev) => ({ ...prev, imdbRatingResolved: true }));
          }
          return;
        }

        const [omdb, imdbDataset] = await Promise.all([
          fetchOmdbByImdb(imdb).catch(() => null),
          fetchImdbRatingByImdb(imdb).catch(() => null),
        ]);
        if (cancelled) return;

        // Cadena CRUDA de premios (OMDb); la preview/panel la formatea.
        const rawAwards = String(omdb?.Awards || "").trim();
        const awards = !rawAwards || rawAwards === "N/A" ? null : rawAwards;

        // IMDb: preferimos el dataset rápido (rating + votos); OMDb de respaldo.
        const datasetRating =
          typeof imdbDataset?.rating === "number" ? imdbDataset.rating : null;
        const datasetVotes =
          typeof imdbDataset?.votes === "number" ? imdbDataset.votes : null;
        // Rotten Tomatoes + Metacritic + rating/votos IMDb desde el array
        // `Ratings` de OMDb (mismos parsers que DetailsClient).
        const { rtScore, mcScore } = extractOmdbExtraScores(omdb);
        const { imdbRating: omdbImdbRating, imdbVotes: omdbImdbVotes } =
          extractOmdbImdbScore(omdb);

        const imdbRating = datasetRating ?? omdbImdbRating;
        const imdbVotes = datasetVotes ?? omdbImdbVotes;

        setData((prev) => ({
          ...prev,
          awards: awards ?? prev.awards,
          imdbRating: imdbRating ?? prev.imdbRating,
          imdbVotes: imdbVotes ?? prev.imdbVotes,
          imdbId: imdb ?? prev.imdbId,
          rtScore: rtScore ?? prev.rtScore,
          mcScore: mcScore ?? prev.mcScore,
          imdbRatingResolved: true,
        }));
      } catch {
        // sin premios / sin nota IMDb: se queda como está
        if (!cancelled) {
          setData((prev) => ({ ...prev, imdbRatingResolved: true }));
        }
      }
    })();

    // Comunidad de Trakt (best-effort, en paralelo, no bloquea): sentimientos.
    (async () => {
      try {
        const s = await traktGetSentiments({ type: mediaType, tmdbId: id });
        if (cancelled || !s) return;
        const pros = formatSentimentList(s?.good, 4);
        const cons = formatSentimentList(s?.bad, 4);
        if (pros.length || cons.length) {
          setData((prev) => ({ ...prev, sentiment: { pros, cons } }));
        }
      } catch {
        // sin sentimientos: se omite la sección
      }
    })();

    // Comunidad de Trakt (best-effort, en paralelo, no bloquea): scoreboard.
    (async () => {
      try {
        const sb = await traktGetScoreboard({ type: mediaType, tmdbId: id });
        if (cancelled) return;
        if (!sb?.found) {
          setData((prev) => ({ ...prev, scoreboardResolved: true }));
          return;
        }
        const rating =
          typeof sb?.community?.rating === "number" ? sb.community.rating : null;
        const votes =
          typeof sb?.community?.votes === "number" ? sb.community.votes : null;
        const st = sb?.stats || {};
        const stats = {
          watchers: typeof st.watchers === "number" ? st.watchers : null,
          plays: typeof st.plays === "number" ? st.plays : null,
          lists: typeof st.lists === "number" ? st.lists : null,
          favorited: typeof st.favorited === "number" ? st.favorited : null,
        };
        const hasStats = Object.values(stats).some((v) => typeof v === "number");
        if (rating != null || votes != null || hasStats) {
          setData((prev) => ({
            ...prev,
            scoreboard: { rating, votes, stats },
            scoreboardResolved: true,
          }));
        } else {
          setData((prev) => ({ ...prev, scoreboardResolved: true }));
        }
      } catch {
        // sin scoreboard: se degrada, no se muestra
        if (!cancelled) {
          setData((prev) => ({ ...prev, scoreboardResolved: true }));
        }
      }
    })();

    // Logo del título (arte) para la cabecera (best-effort, no bloquea).
    // Priorizamos SIEMPRE el logo en INGLÉS; si no existe, caemos a uno sin
    // idioma (neutro) y, como último recurso, al español.
    (async () => {
      try {
        const logoPath = await fetchBestLogo(id, mediaType, ["en", null, "es"]);
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            logoPath: logoPath || prev.logoPath,
            logoResolved: true,
          }));
        }
      } catch {
        // Sin logo: la cabecera cae al título de texto. Se marca resuelto
        // IGUALMENTE; si no, el título no aparecería nunca en los títulos que de
        // verdad no tienen logo.
        if (!cancelled) {
          setData((prev) => ({ ...prev, logoResolved: true }));
        }
      }
    })();

    // Póster para el hero móvil: textless si existe, si no el del item. Precargado
    // y fijado una vez (el hero móvil lo usa en exclusiva, sin parpadeo).
    (async () => {
      try {
        const [detailsForArt, bestPoster] = await Promise.all([
          detailsPromise,
          fetchBestPosterNoLang(id, mediaType, {
            fallbackToAny: false,
          }).catch(() => null),
        ]);
        const finalPoster =
          bestPoster || item?.poster_path || detailsForArt?.poster_path || null;
        if (cancelled || !finalPoster) return;
        await preloadImage(buildImg(finalPoster, "w780"));
        if (cancelled) return;
        setData((prev) => ({ ...prev, heroPosterPath: finalPoster }));
      } catch {
        // sin póster: el hero móvil mantiene el esqueleto
      }
    })();

    // Backdrop FINAL del hero: textless (el logo va superpuesto) o, si no hay, el
    // del propio item. Se PRECARGA y se fija en `heroBackdropPath` (que el hero usa
    // en exclusiva), así aparece de una sola vez, sin parpadeo de una imagen previa.
    (async () => {
      try {
        const [detailsForArt, bestBackdrop] = await Promise.all([
          detailsPromise,
          fetchBestBackdropNoLang(id, mediaType).catch(() => null),
        ]);
        const finalBackdrop =
          bestBackdrop ||
          item?.backdrop_path ||
          detailsForArt?.backdrop_path ||
          null;
        if (cancelled || !finalBackdrop) return;
        await preloadImage(buildImg(finalBackdrop, "w1280"));
        if (cancelled) return;
        setData((prev) => ({ ...prev, heroBackdropPath: finalBackdrop }));
      } catch {
        // sin backdrop: el hero mantiene el esqueleto
      }
    })();

    // Plataformas de streaming disponibles (JustWatch vía /api/streaming). Se usa
    // el título/año semilla del item (equivalen a los de TMDb). Best-effort:
    // nunca lanza; si falla, providers se queda en [] y no se pinta la fila.
    (async () => {
      try {
        const streamTitle = (item.title || item.name || "").trim();
        if (!streamTitle) return;
        const params = new URLSearchParams({
          title: streamTitle,
          type: mediaType === "tv" ? "tv" : "movie",
        });
        const y = yearOf(item);
        if (y) params.append("year", String(y));
        params.append("tmdbId", String(id));

        const res = await fetch(`/api/streaming?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const providers = normalizeProviders(json?.providers, 10);
        if (!cancelled && providers.length) {
          setData((prev) => ({
            ...prev,
            providers: mergeModalProviders(providers, prev.providers),
          }));
        }
      } catch {
        // sin plataformas: no se muestra la fila
      }
    })();

    // Plex local: mismo endpoint que DetailsClient. Si está disponible, se
    // combina con JustWatch reservándole hueco para que no desaparezca si hay
    // muchos providers externos.
    (async () => {
      try {
        const streamTitle = (item.title || item.name || "").trim();
        if (!streamTitle) return;
        const params = new URLSearchParams({
          title: streamTitle,
          type: mediaType === "tv" ? "tv" : "movie",
          tmdbId: String(id),
        });
        const y = yearOf(item);
        if (y) params.append("year", String(y));
        if (item.imdb_id) params.append("imdbId", item.imdb_id);

        const res = await fetch(`/api/plex?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const result = await res.json();
        if (!result?.available) return;

        const plexProvider = buildPlexProvider({
          web: result.plexUrl || null,
          mobile: result.plexMobileUrl || null,
          mobileAlt: result.plexMobileAltUrl || null,
          mobileRaw: result.plexMobileRawUrl || null,
          play: result.plexPlayUrl || null,
          playLegacy: result.plexPlayLegacyUrl || null,
          playRaw: result.plexPlayRawUrl || null,
          androidIntent: result.plexAndroidIntentUrl || null,
          androidIntentPlay: result.plexAndroidIntentPlayUrl || null,
          universal: result.plexUniversalUrl || null,
          slug: result.plexSlugUrl || null,
          androidSlugIntent: result.plexAndroidSlugIntentUrl || null,
        });

        if (!cancelled && plexProvider) {
          setData((prev) => ({
            ...prev,
            providers: mergeModalProviders(prev.providers, [plexProvider]),
          }));
        }
      } catch {
        // Plex es best-effort: si no está conectado/disponible, se omite.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item]);

  return { loading, data };
}
