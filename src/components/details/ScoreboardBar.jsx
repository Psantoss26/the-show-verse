// src/components/details/ScoreboardBar.jsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Loader2,
  Eye,
  Play,
  List,
  Heart,
  Star as StarIcon,
} from "lucide-react";
import { formatVoteCount } from "@/lib/details/formatters";
import { offlineMutationFetch } from "@/lib/offline/syncQueue";

function CompactBadge({
  logo,
  logoClassName = "h-4",
  logoWrapClassName = "w-6",
  value,
  suffix,
  sub,
  href,
  tooltip,
}) {
  const inner = (
    <div className="flex items-center gap-2">
      <span
        className={`grid h-6 shrink-0 place-items-center ${logoWrapClassName}`}
      >
        <img
          src={logo}
          alt=""
          draggable="false"
          className={`${logoClassName} max-h-6 max-w-6 w-auto object-contain opacity-95`}
        />
      </span>
      <div className="leading-tight">
        <div className="text-white font-black text-sm sm:text-base">
          {value != null ? value : "—"}
          {value != null && suffix ? suffix : ""}
        </div>
        {sub ? (
          <div className="text-[10px] sm:text-[11px] text-zinc-400">{sub}</div>
        ) : null}
      </div>
    </div>
  );

  const baseClass =
    "relative group/badge shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/10 hover:border-white/20 transition";

  const tooltipEl = tooltip ? (
    <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/badge:scale-100 group-hover/badge:opacity-100 group-hover/badge:delay-[2000ms]">
      {tooltip}
    </div>
  ) : null;

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      className={baseClass}
      aria-label={tooltip || "Abrir enlace"}
    >
      {inner}
      {tooltipEl}
    </a>
  ) : (
    <div className={baseClass} aria-label={tooltip}>
      {inner}
      {tooltipEl}
    </div>
  );
}

function MiniStat({ icon: Icon, value, tooltip }) {
  return (
    <div
      className="relative group/ministat flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 transition-colors"
      aria-label={tooltip}
    >
      <Icon className="h-3.5 w-3.5 text-zinc-500 transition-colors group-hover/ministat:text-zinc-300" />
      <span className="font-mono font-semibold leading-none tracking-tight text-zinc-300 transition-colors group-hover/ministat:text-zinc-100 [text-box:trim-both_cap_alphabetic]">
        {value}
      </span>
      {tooltip && (
        <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/ministat:scale-100 group-hover/ministat:opacity-100 group-hover/ministat:delay-[2000ms]">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function StarRating10({ rating, loading, connected, onConnect, onRate }) {
  const [hover, setHover] = useState(null);

  const effective = hover != null ? hover : rating;

  const clickStar = (v) => {
    if (!connected) return onConnect?.();
    // toggle: si pulsas la misma, borra
    if (rating === v) return onRate?.(null);
    onRate?.(v);
  };

  return (
    <div className="flex items-center gap-2">
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-white/60" />
      ) : (
        <div className="flex items-center gap-1">
          {Array.from({ length: 10 }).map((_, i) => {
            const v = i + 1;
            const active = effective != null && v <= effective;
            return (
              <button
                key={v}
                type="button"
                onMouseEnter={() => setHover(v)}
                onMouseLeave={() => setHover(null)}
                onClick={() => clickStar(v)}
                className="p-0.5 relative group/starbtn"
                aria-label={!connected ? "Conectar Trakt" : `Puntuar ${v}/10`}
              >
                <StarIcon
                  className={`h-4 w-4 transition ${active ? "text-yellow-400 fill-yellow-400" : "text-white/25"}`}
                />
                <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/starbtn:scale-100 group-hover/starbtn:opacity-100 group-hover/starbtn:delay-[2000ms]">
                  {!connected ? "Conectar Trakt" : `Puntuar ${v}/10`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!connected && !loading ? (
        <button
          type="button"
          onClick={() => onConnect?.()}
          className="ml-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
        >
          Conectar Trakt
        </button>
      ) : null}
    </div>
  );
}

function buildScoreboardUrl(params) {
  const sp = new URLSearchParams();
  sp.set("type", params.type);
  sp.set("tmdbId", String(params.tmdbId));
  if (params.season != null) sp.set("season", String(params.season));
  if (params.episode != null) sp.set("episode", String(params.episode));
  return `/api/trakt/scoreboard?${sp.toString()}`;
}

export default function ScoreboardBar({
  tmdb, // { value: number|null, votes?: number|null, href?: string }
  traktParams, // { type:'season'|'episode', tmdbId:number, season:number, episode?:number }
  imdb, // { id?: string, rating?: number|null, votes?: string|null }
}) {
  const [tScoreboard, setTScoreboard] = useState({
    loading: true,
    found: false,
  });
  const [userRating, setUserRating] = useState(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [traktConnected, setTraktConnected] = useState(true);

  const traktUrl = tScoreboard?.traktUrl || null;

  const traktCommunityPct = useMemo(() => {
    const r = tScoreboard?.community?.rating;
    if (typeof r !== "number") return null;
    return Math.round(r * 10);
  }, [tScoreboard]);

  const traktVotes = tScoreboard?.community?.votes ?? null;

  const traktIdForUserRating = useMemo(() => {
    if (traktParams?.type === "season")
      return tScoreboard?.ids?.season?.trakt ?? null;
    if (traktParams?.type === "episode")
      return tScoreboard?.ids?.episode?.trakt ?? null;
    return null;
  }, [tScoreboard, traktParams]);

  // 1) Fetch scoreboard
  useEffect(() => {
    let alive = true;
    const url = buildScoreboardUrl(traktParams);

    setTScoreboard({ loading: true, found: false });
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json?.found) setTScoreboard({ loading: false, ...json });
        else setTScoreboard({ loading: false, found: false });
      })
      .catch(() => {
        if (!alive) return;
        setTScoreboard({ loading: false, found: false });
      });

    return () => {
      alive = false;
    };
  }, [traktParams]);

  // 2) Fetch user rating (requires traktId)
  useEffect(() => {
    let alive = true;
    if (!traktIdForUserRating) return;

    setRatingBusy(true);
    fetch(
      `/api/trakt/ratings?type=${traktParams.type}&traktId=${traktIdForUserRating}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (r.status === 401) {
          setTraktConnected(false);
          return { rating: null };
        }
        return r.json();
      })
      .then((json) => {
        if (!alive) return;
        setTraktConnected(true);
        setUserRating(json?.rating ?? null);
      })
      .catch(() => {
        if (!alive) return;
      })
      .finally(() => {
        if (!alive) return;
        setRatingBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [traktIdForUserRating, traktParams?.type]);

  const onConnect = useCallback(() => {
    // Construir URL de retorno basada en traktParams
    let nextPath = "/";
    if (
      traktParams?.type === "episode" &&
      traktParams?.tmdbId &&
      traktParams?.season != null &&
      traktParams?.episode != null
    ) {
      nextPath = `/details/tv/${traktParams.tmdbId}/season/${traktParams.season}/episode/${traktParams.episode}`;
    } else if (
      traktParams?.type === "season" &&
      traktParams?.tmdbId &&
      traktParams?.season != null
    ) {
      nextPath = `/details/tv/${traktParams.tmdbId}/season/${traktParams.season}`;
    } else if (traktParams?.type && traktParams?.tmdbId) {
      nextPath = `/details/${traktParams.type}/${traktParams.tmdbId}`;
    }
    window.location.href = `/api/trakt/auth/start?next=${encodeURIComponent(nextPath)}`;
  }, [traktParams]);

  const onRate = useCallback(
    async (val) => {
      if (!traktIdForUserRating) return;
      setRatingBusy(true);
      const prev = userRating;
      setUserRating(val);

      try {
        const r = await offlineMutationFetch(
          "/api/trakt/ratings",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              type: traktParams.type,
              ids: { trakt: traktIdForUserRating },
              rating: val,
            }),
          },
          {
            label: val == null ? "Quitar valoracion" : "Guardar valoracion",
            dedupeKey: `trakt:scoreboard-rating:${traktParams.type}:${traktIdForUserRating}`,
          },
        );

        if (r.status === 401) {
          setTraktConnected(false);
          setUserRating(prev);
          onConnect();
          return;
        }

        if (!r.ok) {
          setUserRating(prev);
        }
      } catch {
        setUserRating(prev);
      } finally {
        setRatingBusy(false);
      }
    },
    [traktIdForUserRating, traktParams?.type, userRating, onConnect],
  );

  const imdbHref = imdb?.id ? `https://www.imdb.com/title/${imdb.id}` : null;

  return (
    <div className="relative isolate w-full overflow-visible rounded-2xl bg-black/[0.04] bg-gradient-to-br from-white/10 via-transparent to-black/10 shadow-none backdrop-blur-[28px] mb-6">
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
        style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
      />
      <div
        className="
          relative z-10
          py-3
          pl-[calc(1rem+env(safe-area-inset-left))]
          pr-[calc(1.25rem+env(safe-area-inset-right))]
          sm:px-4
          flex items-center gap-3 sm:gap-4
          overflow-x-clip sm:overflow-visible overscroll-none [touch-action:pan-y]
        "
      >
        {/* A) Ratings */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="w-4 h-4 shrink-0">
            {tScoreboard.loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : null}
          </div>

          <CompactBadge
            logo="/logo-TMDb.png"
            logoClassName="h-4"
            value={tmdb?.value != null ? Number(tmdb.value).toFixed(1) : null}
            sub={
              tmdb?.votes != null
                ? `${formatVoteCount(tmdb.votes)} votes`
                : null
            }
            href={tmdb?.href}
            tooltip={tmdb?.href ? "Ver en TMDb" : "TMDb"}
          />

          {traktCommunityPct != null ? (
            <>
              <div className="sm:hidden">
                <CompactBadge
                  logo="/logo-Trakt.png"
                  value={traktCommunityPct}
                  sub={
                    traktVotes != null
                      ? `${formatVoteCount(traktVotes)} votes`
                      : null
                  }
                  href={traktUrl}
                  tooltip={traktUrl ? "Ver en Trakt" : "Trakt"}
                />
              </div>
              <div className="hidden sm:block">
                <CompactBadge
                  logo="/logo-Trakt.png"
                  value={traktCommunityPct}
                  suffix="%"
                  sub={
                    traktVotes != null
                      ? `${formatVoteCount(traktVotes)} votes`
                      : null
                  }
                  href={traktUrl}
                  tooltip={traktUrl ? "Ver en Trakt" : "Trakt"}
                />
              </div>
            </>
          ) : null}

          {imdb?.rating != null || imdb?.id ? (
            <CompactBadge
              logo="/logo-IMDb.svg"
              logoWrapClassName="min-w-[28px]"
              logoClassName="!h-5 sm:!h-[22px] !max-h-none !max-w-[34px]"
              value={
                imdb?.rating != null ? Number(imdb.rating).toFixed(1) : null
              }
              sub={imdb?.votes ? `${formatVoteCount(imdb.votes)} votes` : null}
              href={imdbHref}
              tooltip={imdbHref ? "Ver en IMDb" : "IMDb"}
            />
          ) : null}
        </div>

        {/* Separador */}
        <div className="w-px h-6 bg-white/10 shrink-0" />

        {/* B) User rating */}
        <div className="flex items-center gap-3 shrink-0">
          <StarRating10
            rating={userRating}
            loading={ratingBusy}
            connected={traktConnected}
            onConnect={onConnect}
            onRate={onRate}
          />
        </div>
      </div>

      {/* Footer stats (si hay) */}
      {!tScoreboard.loading && tScoreboard?.stats ? (
        <div className="relative z-10 rounded-b-2xl border-t border-white/5 bg-black/[0.04]">
          <div
            className="
              overflow-x-clip sm:overflow-visible overscroll-none [touch-action:pan-y]
              py-2
              pl-[calc(1rem+env(safe-area-inset-left))]
              pr-[calc(1rem+env(safe-area-inset-right))]
            "
          >
            <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:gap-3">
              <div className="shrink-0">
                <MiniStat
                  icon={Eye}
                  value={formatVoteCount(tScoreboard?.stats?.watchers ?? 0)}
                  tooltip="Watchers"
                />
              </div>
              <div className="shrink-0">
                <MiniStat
                  icon={Play}
                  value={formatVoteCount(tScoreboard?.stats?.plays ?? 0)}
                  tooltip="Plays"
                />
              </div>
              <div className="shrink-0">
                <MiniStat
                  icon={List}
                  value={formatVoteCount(tScoreboard?.stats?.lists ?? 0)}
                  tooltip="Lists"
                />
              </div>
              <div className="shrink-0">
                <MiniStat
                  icon={Heart}
                  value={formatVoteCount(tScoreboard?.stats?.favorited ?? 0)}
                  tooltip="Favorited"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
