"use client";

// Tarjeta de un episodio en la vista «Recuadros» de la sección «Episodios» de
// la ficha de la temporada (SeasonDetailsClient). Es la misma tarjeta que la
// de las temporadas en la ficha de la serie (SeasonCard) con dos cambios: la
// imagen es el fotograma del episodio (horizontal, como un backdrop) y, en vez
// de la barra de progreso, un icono dice si el episodio está visto o no.

import Link from "next/link";
import { CalendarDays, CheckCircle2, Circle, Clock, ImageOff } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_CARD } from "@/lib/ui/liquidGlass";
import { tmdbSrcSet } from "@/lib/tmdb/imageSrcSet";

export default function EpisodeCard({
  href,
  episodeNumber,
  name = null,
  stillPath = null,
  // Fecha de emisión ya formateada («12 de marzo de 2024»).
  airDate = null,
  runtime = null,
  // Nota media de TMDb del episodio (`vote_average`; 0 = sin votos).
  tmdbRating = null,
  // Nota de IMDb del episodio (SeriesGraph).
  imdbRating = null,
  // `true`/`false` con el historial de Trakt cargado; `null` si no se sabe
  // (sin Trakt o aún cargando): entonces no se enseña el indicador.
  watched = null,
  onPrefetch,
}) {
  const title = name || `Episodio ${episodeNumber}`;
  const minutes = Number(runtime) > 0 ? Number(runtime) : null;
  const tmdbScore = Number(tmdbRating) > 0 ? Number(tmdbRating) : null;
  const imdbScore = Number(imdbRating) > 0 ? Number(imdbRating) : null;

  return (
    <Link
      href={href}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      // Cristal de TARJETA compartido, sin sombra: van en rejilla (ver SeasonCard).
      className={`group relative isolate flex w-full transform-gpu gap-4 overflow-hidden rounded-2xl p-3 text-left ${LIQUID_GLASS_CARD} transition-all lg:hover:-translate-y-1 lg:hover:brightness-110`}
      aria-label={`Ver episodio ${episodeNumber}: ${title}`}
    >
      <LiquidGlassOpticalLayers />
      {/* Número del episodio en grande al fondo, como el de la temporada. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 top-1/2 z-0 -translate-y-1/2 select-none text-[110px] font-black leading-none text-white/5 transition-colors group-hover:text-white/10"
      >
        {episodeNumber}
      </span>

      <span
        // `self-center`: la imagen es horizontal y la columna de datos suele
        // ser más alta; centrada no deja un hueco solo por debajo.
        className="relative z-10 aspect-video w-40 shrink-0 self-center overflow-hidden rounded-xl bg-zinc-900 shadow-lg shadow-black/40 sm:w-44 lg:w-48"
      >
        {stillPath ? (
          <OptimizedImage
            src={`https://image.tmdb.org/t/p/w780${stillPath}`}
            srcSet={tmdbSrcSet(stillPath, "backdrop")}
            // Imagen de 160–192px: se pide ~1,5× para que se vea nítida.
            sizes="(min-width: 1024px) 288px, (min-width: 640px) 264px, 240px"
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-6 w-6 text-zinc-600" aria-hidden="true" />
          </span>
        )}
      </span>

      <span className="relative z-10 flex min-w-0 flex-1 flex-col py-1 pr-1">
        <span className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Episodio {episodeNumber}
        </span>
        <span className="mt-0.5 line-clamp-2 text-base font-bold leading-tight text-white">{title}</span>

        {/* Una fila por dato: fecha, duración y notas. */}
        <span className="mt-2 flex flex-col gap-1.5 text-xs font-bold text-zinc-400">
          {airDate ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
              {airDate}
            </span>
          ) : null}
          {minutes ? (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
              {minutes} min
            </span>
          ) : null}
          {tmdbScore != null || imdbScore != null ? (
            <span className="flex items-center gap-3 pt-0.5 text-sm text-white">
              {tmdbScore != null ? (
                <span className="flex items-center gap-1.5" title="Nota en TMDb">
                  <OptimizedImage src="/logo-TMDb.png" alt="TMDb" className="h-3.5 w-auto" />
                  {tmdbScore.toFixed(1)}
                </span>
              ) : null}
              {imdbScore != null ? (
                <span className="flex items-center gap-1.5" title="Nota en IMDb">
                  <OptimizedImage src="/logo-IMDb.svg" alt="IMDb" className="h-4 w-auto" />
                  {imdbScore.toFixed(1)}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>

        {/* Visto / sin ver, abajo del todo (donde la temporada lleva la barra
            de progreso) para que todas las tarjetas lo alineen. */}
        {watched != null ? (
          <span
            className={`mt-auto flex items-center gap-1.5 pt-3 text-xs font-bold ${
              watched ? "text-emerald-400" : "text-zinc-500"
            }`}
          >
            {watched ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {watched ? "Visto" : "Sin ver"}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
