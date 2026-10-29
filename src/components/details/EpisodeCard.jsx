"use client";

// Tarjeta de un episodio en la sección «Episodios» de la ficha de la temporada
// (SeasonDetailsClient), uno por fila. Es la misma tarjeta que la de las
// temporadas en la ficha de la serie (SeasonCard) con dos cambios: la imagen
// es el fotograma del episodio (horizontal, como un backdrop) y, en vez de la
// barra de progreso, un icono dice si el episodio está visto o no. Sin el
// número grande de fondo y con fecha y duración en una fila; debajo de las
// notas, la sinopsis. La tarjeta mide lo que la imagen (o los datos, si son
// más altos) más el mismo margen por los cuatro lados. En el teléfono no hay
// sinopsis: junto a una imagen de 160px no cabe y la tarjeta queda compacta.

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
  // Sinopsis del episodio (TMDb), solo desde `sm`. Sin ella no se pinta nada.
  overview = null,
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
  const synopsis = typeof overview === "string" ? overview.trim() : "";

  return (
    <Link
      href={href}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      // Cristal de TARJETA compartido, sin sombra: van apiladas (ver SeasonCard).
      className={`group relative isolate block w-full transform-gpu overflow-hidden rounded-2xl p-3 text-left ${LIQUID_GLASS_CARD} transition-all lg:hover:-translate-y-1 lg:hover:brightness-110`}
      aria-label={`Ver episodio ${episodeNumber}: ${title}`}
    >
      <LiquidGlassOpticalLayers />

      {/* Visto / sin ver en la esquina superior derecha, con el mismo margen
          que la imagen (`p-3`): los datos van centrados en alto y, dentro de
          su columna, el icono quedaba flotando a media tarjeta. */}
      {watched != null ? (
        <span className="absolute right-3 top-3 z-20 flex">
          {watched ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-label="Visto" role="img" />
          ) : (
            <Circle className="h-5 w-5 text-zinc-500" aria-label="Sin ver" role="img" />
          )}
        </span>
      ) : null}

      <span className="relative z-10 flex gap-4">
        <span
          // `self-stretch` con `aspect-video` como mínimo: la imagen mide 16:9 y,
          // si los datos son más altos (en el móvil, fecha y duración no caben en
          // una fila), se estira hasta ellos. Así el margen del recuadro es el
          // mismo (`p-3`) por los cuatro lados.
          className="relative aspect-video w-40 shrink-0 sm:w-[46%] sm:max-w-80 self-stretch overflow-hidden rounded-xl bg-zinc-900 shadow-lg shadow-black/40"
        >
          {stillPath ? (
            <OptimizedImage
              src={`https://image.tmdb.org/t/p/w780${stillPath}`}
              srcSet={tmdbSrcSet(stillPath, "backdrop")}
              // 160px en el móvil; desde sm, el 46% de la tarjeta (hasta 320px).
              // Se pide ~1,5× para que se vea nítida.
              sizes="(min-width: 640px) 480px, 240px"
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

        {/* `pr-6`: sitio para el icono de la esquina si el texto llega arriba. */}
        <span className={`relative flex min-w-0 flex-1 flex-col justify-center ${watched != null ? "pr-6" : ""}`}>
          <span className="block text-xs font-bold text-zinc-400">
            Episodio {episodeNumber}
          </span>
          {/* Una línea en el móvil: con dos la tarjeta crecería más que la
              imagen. En el ordenador la imagen es lo bastante alta para dos. */}
          <span className="mt-0.5 line-clamp-1 lg:line-clamp-2 text-base font-bold leading-tight text-white" title={title}>
            {title}
          </span>

          {/* Fecha y duración en una fila; debajo, las notas. */}
          {airDate || minutes ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-zinc-400">
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
            </span>
          ) : null}
          {tmdbScore != null || imdbScore != null ? (
            <span className="mt-2 flex items-center gap-3 text-sm font-bold text-white">
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
          {synopsis ? (
            <span className="mt-3 hidden text-sm leading-relaxed text-zinc-300 sm:line-clamp-2 lg:line-clamp-3">
              {synopsis}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
