"use client";

// src/components/today/TodayStoryDetails.jsx
//
// Ficha del título que aparece al pasar el ratón por el cartel de una historia
// (como el hover de las historias de Trakt). De arriba abajo:
//   - backdrop CON idioma, con el mismo criterio que DetailsClient al pasar a
//     «Backdrop»: escalera inglés → español → original → sin idioma
//     (`pickLadderBackdrop`);
//   - título y fila de año · formato/duración · estado · géneros;
//   - el marcador compacto de la ficha móvil (puntuaciones + stats de Trakt,
//     `DetailsScoreboardPanel` con `mobileScoresOnly`);
//   - sinopsis;
//   - lo positivo y lo negativo de la comunidad.
//
// Los datos salen del mismo hook que la ficha rápida (useDetailModalData), así
// que no hay otra forma de calcular nada de esto. Solo se pide cuando `active`
// (el ratón está encima): pasar historias sin mirar no lanza peticiones.

import { useEffect, useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import { useDetailModalData } from "@/components/dashboard/useDetailModalData";
import { buildImdbHref, buildTmdbHref, buildTraktHref } from "@/lib/details/ratingLinks";
import { formatCountShort } from "@/lib/details/formatters";
import { pickLadderBackdrop } from "@/lib/details/tmdbImages";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";
import { tmdbImage } from "./todayUi";

// Backdrop con idioma, como DetailsClient. Mientras se resuelve (o si no hay
// ninguno en la escalera) se usa el que ya trae la historia.
function useLanguageBackdrop(media, originalLanguage, active) {
  const [path, setPath] = useState(null);
  useEffect(() => {
    setPath(null);
    if (!active || !media?.tmdbId) return undefined;
    let vigente = true;
    fetchTmdbImages(media.type === "tv" ? "tv" : "movie", media.tmdbId, { originalLanguage })
      .then((images) => {
        const best = pickLadderBackdrop(images?.backdrops || [], { originalLanguage })?.file_path;
        if (vigente && best) setPath(best);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [active, media?.type, media?.tmdbId, originalLanguage]);
  return path || media?.backdropPath || null;
}

function SentimentList({ items, tone }) {
  if (!items?.length) return null;
  const Icon = tone === "pros" ? ThumbsUp : ThumbsDown;
  const color = tone === "pros" ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="flex gap-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-label={tone === "pros" ? "Positivo" : "Negativo"} />
      <ul className="space-y-1 text-sm leading-snug text-zinc-200">
        {items.slice(0, 3).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

export default function TodayStoryDetails({ media, active }) {
  const item = useMemo(
    () => (active && media?.tmdbId
      ? {
          id: media.tmdbId,
          media_type: media.type === "tv" ? "tv" : "movie",
          title: media.title,
          name: media.title,
          poster_path: media.posterPath,
          backdrop_path: media.backdropPath,
        }
      : null),
    [active, media?.tmdbId, media?.type, media?.title, media?.posterPath, media?.backdropPath],
  );
  const { data } = useDetailModalData(item);
  const backdrop = useLanguageBackdrop(media, data.production?.originalLanguage, active);

  const meta = [
    data.year,
    media?.type === "tv" ? data.seasonEpisodeValue : data.runtime,
    data.production?.status,
    ...(data.genres || []).slice(0, 3),
  ].filter(Boolean);
  const scoreboard = data.scoreboard;
  const sentiment = data.sentiment || {};
  const hasSentiment = sentiment.pros?.length > 0 || sentiment.cons?.length > 0;
  const mediaType = media?.type === "tv" ? "tv" : "movie";

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain bg-zinc-950 [scrollbar-width:none]">
      <div className="relative aspect-[16/8] w-full shrink-0 bg-zinc-900">
        {backdrop ? (
          <OptimizedImage src={tmdbImage(backdrop, "w780")} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/30 to-zinc-950" />
      </div>

      <div className="relative -mt-10 space-y-4 px-4 pb-5">
        <div>
          <h3 className="text-xl font-bold leading-tight text-white">{data.title || media?.title}</h3>
          {meta.length ? (
            <p className="mt-1 text-sm text-zinc-400">{meta.join(" · ")}</p>
          ) : (
            <p className="mt-1 h-5 w-2/3 rounded bg-white/[0.06]" aria-hidden="true" />
          )}
        </div>

        <DetailsScoreboardPanel
          loading={!data.detailsResolved}
          statsPending={!data.scoreboardResolved}
          tmdb={{
            value: data.tmdbRating != null ? data.tmdbRating : data.tmdbRatingResolved ? null : undefined,
            sub: data.tmdbRating != null ? formatCountShort(data.tmdbVotes) : undefined,
            href: buildTmdbHref({ type: mediaType, tmdbId: media?.tmdbId }),
            pending: !data.tmdbRatingResolved && data.tmdbRating == null,
          }}
          trakt={{
            value: typeof scoreboard?.rating === "number" ? Number(scoreboard.rating).toFixed(1) : data.scoreboardResolved ? null : undefined,
            sub: scoreboard?.votes ? formatCountShort(scoreboard.votes) : undefined,
            href: buildTraktHref({ href: scoreboard?.traktUrl, title: data.title || media?.title }),
            pending: !data.scoreboardResolved && typeof scoreboard?.rating !== "number",
          }}
          imdb={{
            value: typeof data.imdbRating === "number" ? data.imdbRating.toFixed(1) : data.imdbRatingResolved ? null : undefined,
            sub: typeof data.imdbRating === "number" ? formatCountShort(data.imdbVotes) : undefined,
            href: buildImdbHref({ imdbId: data.imdbId, title: data.title || media?.title }),
            pending: !data.imdbRatingResolved && typeof data.imdbRating !== "number",
          }}
          stats={scoreboard?.stats || {}}
          mobileScoresOnly
          phoneLayout
          className="!mx-0 !w-full"
        />

        {data.overview ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-zinc-200">{data.overview}</p>
        ) : data.detailsResolved ? null : (
          <div className="space-y-2" aria-hidden="true">
            <p className="h-3.5 rounded bg-white/[0.06]" />
            <p className="h-3.5 w-11/12 rounded bg-white/[0.06]" />
            <p className="h-3.5 w-4/5 rounded bg-white/[0.06]" />
          </div>
        )}

        {hasSentiment ? (
          <section aria-label="Opinión" className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Opinión</h4>
            <SentimentList items={sentiment.pros} tone="pros" />
            <SentimentList items={sentiment.cons} tone="cons" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
