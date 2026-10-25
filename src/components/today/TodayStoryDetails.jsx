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
// que no hay otra forma de calcular nada de esto. Se PRECARGA en cuanto la
// historia del título está a la vista (`active`) y avisa con `onReadyChange`
// cuando ya está TODO (detalles, notas, stats, opinión y el fondo descargado):
// el reproductor no da la vuelta a la tarjeta hasta entonces, así la ficha
// aparece completa y no se van pintando datos después.

import { useEffect, useMemo, useRef, useState } from "react";
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
// Espera a saber el idioma original (`languageKnown`) para elegir con la
// escalera completa, y no da el fondo por listo hasta tenerlo DESCARGADO.
function useLanguageBackdrop(media, originalLanguage, languageKnown, active) {
  const [state, setState] = useState({ path: null, ready: false });
  useEffect(() => {
    setState({ path: null, ready: false });
    if (!active || !media?.tmdbId || !languageKnown) return undefined;
    let vigente = true;
    (async () => {
      let best = null;
      try {
        const images = await fetchTmdbImages(media.type === "tv" ? "tv" : "movie", media.tmdbId, { originalLanguage });
        best = pickLadderBackdrop(images?.backdrops || [], { originalLanguage })?.file_path || null;
      } catch {
        // Sin galería: el fondo que ya trae la historia.
      }
      const path = best || media.backdropPath || null;
      if (path) {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = tmdbImage(path, "w780");
        });
      }
      if (vigente) setState({ path, ready: true });
    })();
    return () => {
      vigente = false;
    };
  }, [active, media?.type, media?.tmdbId, media?.backdropPath, originalLanguage, languageKnown]);
  return state;
}

// ESCALA. La ficha va a su tamaño NATURAL (letra de 13 px, marcador como en
// la ficha móvil) mientras quepa: en una tarjeta más grande no se agranda nada,
// solo sobra aire abajo. Si no cabe (tarjeta estrecha o baja, o un título con
// textos largos), se reduce con `zoom` lo justo: el contenido se maqueta a
// tamaño de tarjeta / zoom y `zoom` lo devuelve a su sitio. `zoom` vuelve a
// maquetar (no estira una imagen como `transform`), así el texto se pinta
// nítido.
//
// Cuánto hace falta se MIDE (alto real del contenido) y no se supone: cada
// título trae sinopsis y opiniones de distinta longitud. El ajuste solo baja
// (un tope que se recalcula al cambiar la tarjeta o el título), así no oscila:
// al reducir, el contenido se maqueta más ancho y queda igual o más bajo.
const MIN_LAYOUT_W = 400;

function useFitZoom(contentKey) {
  const ref = useRef(null);
  const contentRef = useRef(null);
  const [box, setBox] = useState({ width: MIN_LAYOUT_W, height: MIN_LAYOUT_W * 1.5 });
  const [cap, setCap] = useState(1);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        setCap(1);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setCap(1), [contentKey]);

  const zoom = Math.min(1, box.width / MIN_LAYOUT_W, cap);
  const layoutH = box.height / zoom;
  useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const check = () => {
      const needed = node.offsetHeight;
      if (needed > layoutH + 1) setCap((prev) => Math.min(prev, zoom * (layoutH / needed) * 0.995));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [zoom, layoutH]);

  return [ref, contentRef, { zoom, width: box.width / zoom, height: layoutH }];
}

// Positivo y negativo con las MISMAS tarjetas que DetailsClient («Análisis de
// sentimientos»): tinte esmeralda o rosa, cuadradito del icono en color y un
// punto luminoso por frase. Una fila para lo positivo y otra para lo negativo,
// en versión compacta (dos frases por lado a dos líneas) para que la ficha
// quepa entera sin desplazar.
const SENTIMENT_TONES = {
  pros: {
    Icon: ThumbsUp,
    label: "Positivo",
    card: "from-emerald-500/15 via-emerald-500/[0.04]",
    box: "bg-emerald-500 shadow-emerald-500/20",
    title: "text-emerald-100",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  },
  cons: {
    Icon: ThumbsDown,
    label: "Negativo",
    card: "from-rose-500/15 via-rose-500/[0.04]",
    box: "bg-rose-500 shadow-rose-500/20",
    title: "text-rose-100",
    dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]",
  },
};

function SentimentCard({ items, tone }) {
  if (!items?.length) return null;
  const t = SENTIMENT_TONES[tone];
  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-gradient-to-br ${t.card} to-transparent p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-white shadow-lg ${t.box}`}>
          <t.Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className={`text-[13px] font-bold tracking-wide ${t.title}`}>{t.label}</span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 2).map((text) => (
          <li key={text} className="flex items-start gap-2 text-[12.5px] leading-[18px] text-zinc-300">
            <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
            <span className="line-clamp-2">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TodayStoryDetails({ media, active, onReadyChange }) {
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
  const sameTitle = data.detailsKey === `${media?.type === "tv" ? "tv" : "movie"}:${media?.tmdbId}`;
  const { path: backdrop, ready: backdropReady } = useLanguageBackdrop(
    media,
    data.production?.originalLanguage,
    sameTitle && data.detailsResolved,
    active,
  );
  const ready = Boolean(
    active &&
      sameTitle &&
      data.detailsResolved &&
      data.tmdbRatingResolved &&
      data.imdbRatingResolved &&
      data.scoreboardResolved &&
      data.sentimentResolved &&
      backdropReady,
  );
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

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
  const [fitRef, contentRef, fit] = useFitZoom(`${media?.type}:${media?.tmdbId}`);

  return (
    <div ref={fitRef} className="h-full w-full overflow-hidden bg-zinc-950">
    <div className="overflow-hidden" style={{ width: fit.width, height: fit.height, zoom: fit.zoom }}>
    <div ref={contentRef} className="flex flex-col">
      <div className="relative aspect-[9/4] w-full shrink-0 bg-zinc-900">
        {backdrop ? (
          <OptimizedImage src={tmdbImage(backdrop, "w780")} alt="" className="h-full w-full object-cover" />
        ) : null}
        {/* Fundido SOLO en el último cuarto, hacia el fondo de la ficha: que no
            se vea el corte entre la imagen y los datos, sin oscurecerla. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-transparent to-zinc-950" />
      </div>

      {/* Los datos empiezan debajo del fondo, no encima de la imagen. */}
      <div className="relative space-y-3 px-4 pb-4 pt-3">
        <div>
          {/* El título ya va en el fondo con idioma: aquí solo para lectores
              de pantalla. */}
          <h3 className="sr-only">{data.title || media?.title}</h3>
          {meta.length ? (
            <p className="truncate text-[13px] text-zinc-400">{meta.join(" · ")}</p>
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
          <p className="line-clamp-3 text-[13px] leading-[19px] text-zinc-200">{data.overview}</p>
        ) : data.detailsResolved ? null : (
          <div className="space-y-2" aria-hidden="true">
            <p className="h-3.5 rounded bg-white/[0.06]" />
            <p className="h-3.5 w-11/12 rounded bg-white/[0.06]" />
            <p className="h-3.5 w-4/5 rounded bg-white/[0.06]" />
          </div>
        )}

        {hasSentiment ? (
          <section aria-label="Opinión">
            <div className="space-y-2">
              <SentimentCard items={sentiment.pros} tone="pros" />
              <SentimentCard items={sentiment.cons} tone="cons" />
            </div>
          </section>
        ) : null}
      </div>
    </div>
    </div>
    </div>
  );
}
