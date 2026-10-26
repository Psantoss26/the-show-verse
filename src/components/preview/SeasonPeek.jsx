"use client";

// /src/components/preview/SeasonPeek.jsx
// VISTA PREVIA DE UNA TEMPORADA (pulsación larga en la sección Temporadas de
// la ficha de una serie, ver MobileTitlePeek). La misma tarjeta flotante que
// los títulos (DetailPeekLayout) con lo de arriba de la ficha móvil de la
// temporada (SeasonDetailsClient):
//   - su portada (la elegida por el usuario o la de la escalera de idioma,
//     la misma que la tarjeta) y «Temporada N»;
//   - su fila de botones (tráiler, serie, vistos, puntuar), sin Anterior /
//     Siguiente, con los mismos modales;
//   - su marcador (TMDb, Trakt, IMDb y estadísticas), con las mismas consultas
//     y cachés (lib/details/seasonScores).
// Tocar la portada lleva a la ficha de la temporada.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DetailPeekLayout from "@/components/preview/DetailPeekLayout";
import SubrouteDetailsActionRow from "@/components/details/SubrouteDetailsActionRow";
import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import { useSeasonPoster } from "@/components/details/SeasonCard";
import VideoModal from "@/components/details/VideoModal";
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal";
import { getDetails } from "@/lib/api/tmdb";
import {
  traktGetShowWatched,
  traktSetSeasonWatched,
} from "@/lib/api/traktClient";
import { formatCountShort } from "@/lib/details/formatters";
import { buildImdbHref, buildTraktHref } from "@/lib/details/ratingLinks";
import {
  loadSeasonImdb,
  loadSeasonTraktScoreboard,
} from "@/lib/details/seasonScores";
import { loadSeasonVideos } from "@/lib/details/titleVideos";
import { useTraktEpisodesWatched } from "@/lib/hooks/useTraktEpisodesWatched";
import { offlineMutationFetch } from "@/lib/offline/syncQueue";
import { useRouter } from "@/lib/offline/useOfflineRouter";

const tmdbImg = (path, size) =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const seasonCache = new Map();

async function fetchSeason(showId, seasonNumber, signal) {
  const key = `${showId}:${seasonNumber}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const response = await fetch(
    `/api/tmdb/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(seasonNumber)}`,
    { signal },
  );
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.id) return null;
  seasonCache.set(key, json);
  return json;
}

// Votos de TMDb de la temporada: los suyos o, si no tiene, la suma de los de
// sus episodios (como la ficha).
function seasonTmdbVotes(season) {
  if (Number(season?.vote_count) > 0) return Number(season.vote_count);
  const sum = (Array.isArray(season?.episodes) ? season.episodes : []).reduce(
    (total, episode) => total + (Number(episode?.vote_count) || 0),
    0,
  );
  return sum > 0 ? sum : null;
}

export default function SeasonPeek({ item, origin, onClose, onOpenFull }) {
  const router = useRouter();
  const showId = Number(item?.showId ?? item?.id);
  const seasonNumber = Number(item?.seasonNumber);
  const seasonHref = `/details/tv/${showId}/season/${seasonNumber}`;
  const isSpecials = seasonNumber === 0;
  const seasonLabel = isSpecials ? "Especiales" : `Temporada ${seasonNumber}`;
  const scrollRef = useRef(null);

  // ---- Datos de TMDb: la temporada y la serie ----
  const [season, setSeason] = useState(
    () => seasonCache.get(`${showId}:${seasonNumber}`) || null,
  );
  const [seasonResolved, setSeasonResolved] = useState(!!season);
  const [show, setShow] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchSeason(showId, seasonNumber, controller.signal)
      .then((value) => {
        setSeason(value);
        setSeasonResolved(true);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSeasonResolved(true);
      });
    getDetails("tv", showId)
      .then((value) => {
        if (!controller.signal.aborted) setShow(value || null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [showId, seasonNumber]);

  const showName = show?.name || show?.original_name || "";
  const showImdbId = show?.imdb_id || show?.external_ids?.imdb_id || null;
  const totalEpisodes =
    Number(season?.episodes?.length || 0) ||
    Number(
      (show?.seasons || []).find(
        (entry) => Number(entry?.season_number) === seasonNumber,
      )?.episode_count || 0,
    );

  // ---- Portada: la misma que la tarjeta pulsada y la ficha (la elegida por
  // el usuario o la escalera de idioma; ya resuelta al pulsar) ----
  const { poster: posterPath } = useSeasonPoster({
    showId,
    seasonNumber,
    seasonId: season?.id ?? null,
    posterPath: season?.poster_path || null,
    fallbackPosterPath: seasonResolved ? show?.poster_path || null : null,
  });

  // ---- Marcador ----
  const [traktScore, setTraktScore] = useState({
    resolved: false,
    value: null,
  });
  const [imdbScore, setImdbScore] = useState({ resolved: false, value: null });
  // Sin señal de cancelación: estas consultas se comparten en vuelo con la
  // ficha (y con el doble montaje de desarrollo), y cancelar la de uno la
  // rompía para todos. Al desmontar solo se ignora la respuesta.
  useEffect(() => {
    let alive = true;
    loadSeasonTraktScoreboard({ showId, seasonNumber })
      .catch(() => null)
      .then((value) => {
        if (alive) setTraktScore({ resolved: true, value });
      });
    return () => {
      alive = false;
    };
  }, [showId, seasonNumber]);
  useEffect(() => {
    // Hace falta la serie (nombre, temporadas e id de IMDb).
    if (!show) return undefined;
    let alive = true;
    loadSeasonImdb({
      showId,
      showName,
      showImdbId,
      seasonNumber,
      tmdbSeasons: show?.seasons,
    })
      .catch(() => null)
      .then((value) => {
        if (alive) setImdbScore({ resolved: true, value });
      });
    return () => {
      alive = false;
    };
  }, [show, showId, showName, showImdbId, seasonNumber]);

  const tmdbVote =
    Number(season?.vote_average) > 0 ? season.vote_average : null;
  const tmdbVotes = seasonTmdbVotes(season);
  const trakt = traktScore.value;
  const traktValue =
    Number(trakt?.rating) > 0 ? Number(trakt.rating).toFixed(1) : undefined;
  const imdb = imdbScore.value;

  // ---- Tráiler: los vídeos de la temporada ----
  const [videos, setVideos] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadSeasonVideos(showId, seasonNumber).then((list) => {
      if (!cancelled) setVideos(Array.isArray(list) ? list : []);
    });
    return () => {
      cancelled = true;
    };
  }, [showId, seasonNumber]);

  // ---- Vistos (Trakt): el mismo modal de episodios que la ficha, con solo
  // esta temporada ----
  const [traktConnected, setTraktConnected] = useState(null);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [watchedBusy, setWatchedBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    traktGetShowWatched({ tmdbId: showId })
      .then((json) => {
        if (alive) setTraktConnected(json?.connected !== false);
      })
      .catch(() => {
        // Fallo pasajero: no es «sin conectar».
        if (alive) setTraktConnected((prev) => prev ?? true);
      });
    return () => {
      alive = false;
    };
  }, [showId]);
  const modalSeasons = useMemo(
    () => [
      {
        season_number: seasonNumber,
        episode_count: totalEpisodes,
        name: season?.name || seasonLabel,
      },
    ],
    [seasonNumber, totalEpisodes, season?.name, seasonLabel],
  );
  const episodesWatched = useTraktEpisodesWatched({
    mediaType: "tv",
    tmdbId: showId,
    title: showName,
    connected: !!traktConnected,
    seasons: modalSeasons,
    episodesModalOpen: episodesOpen,
  });
  const watchedCount = episodesWatched.getWatchedEpisodeCountForSeason(
    episodesWatched.watchedBySeason,
    seasonNumber,
    totalEpisodes || 0,
  );
  const fullyWatched = totalEpisodes > 0 && watchedCount >= totalEpisodes;
  const progressBadge =
    totalEpisodes > 0 && watchedCount > 0
      ? `${Math.min(100, Math.round((watchedCount / totalEpisodes) * 100))}%`
      : null;
  const loginHref = `/login?next=${seasonHref}`;

  const toggleSeasonWatched = useCallback(
    async (watchedAt) => {
      if (watchedBusy || seasonNumber <= 0) return;
      if (!traktConnected) {
        router.push(loginHref);
        return;
      }
      setWatchedBusy(true);
      try {
        await traktSetSeasonWatched({
          tmdbId: showId,
          season: seasonNumber,
          watched: watchedAt !== undefined ? watchedAt !== null : !fullyWatched,
          watchedAt: watchedAt || undefined,
        });
        await episodesWatched.loadTraktShowWatched();
      } catch (error) {
        if (/401|unauthorized/i.test(error?.message || ""))
          router.push(loginHref);
      } finally {
        setWatchedBusy(false);
      }
    },
    [
      watchedBusy,
      seasonNumber,
      traktConnected,
      router,
      loginHref,
      showId,
      fullyWatched,
      episodesWatched,
    ],
  );

  // ---- Puntuación (Trakt) ----
  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(true);
  const [ratingConnected, setRatingConnected] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setRatingLoading(true);
    fetch(
      `/api/trakt/ratings?type=season&tmdbId=${showId}&season=${seasonNumber}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (response.status === 401) {
          setRatingConnected(false);
          setUserRating(null);
          return;
        }
        const json = await response.json().catch(() => ({}));
        setRatingConnected(true);
        setUserRating(typeof json?.rating === "number" ? json.rating : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setRatingLoading(false);
      });
    return () => controller.abort();
  }, [showId, seasonNumber]);

  const handleRate = useCallback(
    async (value) => {
      try {
        setRatingLoading(true);
        const response = await offlineMutationFetch(
          "/api/trakt/ratings",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "season",
              tmdbId: showId,
              season: seasonNumber,
              rating: value ?? null,
              title: showName,
              posterPath,
            }),
          },
          {
            label:
              value == null
                ? "Quitar valoracion de temporada"
                : "Guardar valoracion de temporada",
            dedupeKey: `trakt:season-rating:${showId}:${seasonNumber}`,
          },
        );
        if (response.status === 401) {
          router.push(loginHref);
          return false;
        }
        if (!response.ok) return false;
        setUserRating(value ?? null);
        setRatingConnected(true);
        return true;
      } catch {
        return false;
      } finally {
        setRatingLoading(false);
      }
    },
    [showId, seasonNumber, showName, posterPath, router, loginHref],
  );

  // «Temporada N» encima de los botones, como en la ficha (el póster suele
  // traer el título impreso al pie).
  const actions = (
    <>
      <div className="mb-3 text-center text-[11px] font-bold uppercase leading-4 tracking-[0.14em] text-zinc-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        {seasonLabel}
      </div>
      <SubrouteDetailsActionRow
        sequence={false}
        seriesHref={`/details/tv/${showId}`}
        trailer={{
          available: Array.isArray(videos) && videos.length > 0,
          loading: false,
          onOpen: () => {
            if (videos?.[0]) setActiveVideo(videos[0]);
          },
        }}
        trakt={
          seasonNumber > 0
            ? {
                connected: !!traktConnected,
                watched: watchedCount > 0,
                plays: null,
                badge: progressBadge,
                busy: watchedBusy,
                loading:
                  traktConnected == null ||
                  (!!traktConnected && !episodesWatched.watchedBySeasonLoaded),
                onOpen: () => setEpisodesOpen(true),
              }
            : null
        }
        rate={{
          rating: userRating,
          loading: ratingLoading,
          connected: ratingConnected,
          onConnect: () => router.push(loginHref),
          onRate: handleRate,
          onClear: () => handleRate(null),
          min: 1,
          max: 10,
          step: 1,
        }}
      />
    </>
  );

  const scoreboard = (
    <DetailsScoreboardPanel
      mobileScoresOnly
      phoneLayout
      statsPending={!traktScore.resolved}
      tmdb={{
        value: tmdbVote?.toFixed(1),
        sub: tmdbVotes ? formatCountShort(tmdbVotes) : undefined,
        href: `https://www.themoviedb.org/tv/${showId}/season/${seasonNumber}`,
      }}
      trakt={{
        value: traktValue,
        pending: !traktScore.resolved,
        sub: trakt?.votes ? formatCountShort(trakt.votes) : undefined,
        href: buildTraktHref({
          href: trakt?.traktUrl,
          type: "tv",
          tmdbId: showId,
        }),
      }}
      imdb={{
        value:
          imdb?.rating != null ? Number(imdb.rating).toFixed(1) : undefined,
        pending: !imdbScore.resolved,
        sub: imdb?.votes ? formatCountShort(imdb.votes) : undefined,
        href: buildImdbHref({
          href: showImdbId
            ? `https://www.imdb.com/title/${showImdbId}/episodes/?season=${seasonNumber}`
            : null,
          title: showName,
        }),
      }}
      stats={trakt?.stats}
      showFavoritedStat={false}
    />
  );

  return (
    <DetailPeekLayout
      title={showName ? `${showName} · ${seasonLabel}` : seasonLabel}
      origin={origin}
      posterLowSrc={tmdbImg(posterPath, "w342")}
      posterSrc={tmdbImg(posterPath, "w780")}
      actions={actions}
      scoreboard={scoreboard}
      onBackdropClick={onClose}
      scrollRef={scrollRef}
      prefetchHref={seasonHref}
      onOpenFull={() => {
        if (onOpenFull) {
          onOpenFull(seasonHref);
          return;
        }
        onClose?.();
        router.push(seasonHref);
      }}
    >
      <VideoModal
        open={!!activeVideo && Array.isArray(videos) && videos.length > 0}
        video={activeVideo}
        videos={videos || []}
        onVideoChange={setActiveVideo}
        onClose={() => setActiveVideo(null)}
      />
      <TraktEpisodesWatchedModal
        open={episodesOpen}
        onClose={() => {
          setEpisodesOpen(false);
          episodesWatched.reconcileAfterClose();
        }}
        mediaType="tv"
        tmdbId={showId}
        title={showName}
        connected={!!traktConnected}
        seasons={modalSeasons}
        watchedBySeason={episodesWatched.watchedBySeason}
        busyKey={episodesWatched.episodeBusyKey}
        onToggleEpisodeWatched={episodesWatched.toggleEpisodeWatched}
        onToggleShowWatched={toggleSeasonWatched}
        showPlays={episodesWatched.showPlays}
        showReleaseDate={show?.first_air_date || null}
        onAddShowPlay={toggleSeasonWatched}
        rewatchRuns={episodesWatched.rewatchRuns}
        activeView={episodesWatched.activeEpisodesView}
        onChangeView={episodesWatched.changeEpisodesView}
        onCreateRewatchRun={episodesWatched.createRewatchRun}
        onDeleteRewatchRun={episodesWatched.deleteRewatchRun}
        rewatchStartAt={episodesWatched.rewatchStartAt}
        watchedBySeasonRewatch={episodesWatched.rewatchWatchedBySeason}
        onToggleEpisodeRewatch={episodesWatched.toggleEpisodeRewatch}
      />
    </DetailPeekLayout>
  );
}
