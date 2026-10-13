"use client";

// Tarjeta de una temporada en la sección «Temporadas» de la ficha completa
// (DetailsClient) y de la ficha de teléfono del drawer (PhoneDetailsSections).
// Póster de la temporada a la izquierda y, a la derecha, en filas: título (y
// nombre propio), año, episodios, notas de TMDb e IMDb con sus logos y el
// progreso de vistos. El número de la temporada va en grande al fondo.
//
// El póster es el mismo que enseña la ficha de la temporada: el elegido en
// «Editar portada» (lib/details/seasonArtwork) o el de TMDb de la temporada,
// y si no tiene, el de la serie.

import { useLayoutEffect, useState } from "react";
import { CalendarDays, ExternalLink, Tv } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { useAuth } from "@/context/AuthContext";
import { readSeasonCustomPoster } from "@/lib/details/seasonArtwork";
import { LIQUID_GLASS_CARD } from "@/lib/ui/liquidGlass";

function seasonYear(airDate) {
  const year = Number(String(airDate || "").slice(0, 4));
  return Number.isInteger(year) && year > 1800 ? year : null;
}

export default function SeasonCard({
  seasonNumber,
  seasonId = null,
  name = null,
  posterPath = null,
  fallbackPosterPath = null,
  airDate = null,
  // Nota media de TMDb de la temporada (`vote_average`; 0 = sin votos).
  tmdbRating = null,
  // Nota de IMDb (o la media de sus episodios en SeriesGraph, que también es de IMDb).
  imdbRating = null,
  totalEpisodes = null,
  watchedEpisodes = 0,
  imdbUrl = null,
  onClick,
  onPrefetch,
  // Ficha completa con ratón: la tarjeta se eleva al pasar por encima.
  hoverLift = false,
}) {
  const { preferences } = useAuth();
  // La portada elegida vive en las preferencias del navegador: el servidor no
  // la conoce y pinta la automática. Se aplica tras montar (como la ficha de
  // la temporada) para no romper la hidratación.
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  const customPoster = mounted ? readSeasonCustomPoster(preferences, seasonId) : null;
  const poster = customPoster || posterPath || fallbackPosterPath || null;

  const title = `Temporada ${seasonNumber}`;
  // TMDb pone nombre propio a algunas temporadas («Libro uno: Agua»): se
  // enseña debajo cuando no es el genérico.
  const subtitle =
    name && name.trim() && name.trim().toLocaleLowerCase("es-ES") !== title.toLocaleLowerCase("es-ES")
      ? name.trim()
      : null;
  const year = seasonYear(airDate);
  const total = Number(totalEpisodes) || null;
  const watched = Math.max(0, Math.min(Number(watchedEpisodes) || 0, total || 0));
  const percentage = total ? Math.round((watched / total) * 100) : 0;
  const barColor = percentage === 100 ? "bg-emerald-500" : "bg-yellow-500";
  const tmdbScore = Number(tmdbRating) > 0 ? Number(tmdbRating) : null;
  const imdbScore = Number(imdbRating) > 0 ? Number(imdbRating) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      // Cristal de TARJETA compartido: van en rejilla, así que sin sombra propia
      // (varias sombras juntas forman una banda oscura detrás del grupo).
      className={`group relative isolate flex w-full transform-gpu gap-4 overflow-hidden rounded-2xl p-3 text-left ${LIQUID_GLASS_CARD} transition-all ${
        hoverLift ? "hover:-translate-y-1 hover:brightness-110" : ""
      }`}
      aria-label={`Ver ${title}${subtitle ? `: ${subtitle}` : ""}`}
    >
      <LiquidGlassOpticalLayers />
      {/* Número de la temporada en grande, al fondo, como en las tarjetas de
          antes: sale por el borde derecho y el borde lo recorta, pero centrado
          en vertical en vez de en la esquina superior. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 top-1/2 z-0 -translate-y-1/2 select-none text-[110px] font-black leading-none text-white/5 transition-colors group-hover:text-white/10"
      >
        {seasonNumber}
      </span>

      <span className="relative z-10 aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-lg shadow-black/40 sm:w-[7.5rem]">
        {poster ? (
          <OptimizedImage
            src={`https://image.tmdb.org/t/p/w342${poster}`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-black text-white/15">
            {seasonNumber}
          </span>
        )}
      </span>

      <span className="relative z-10 flex min-w-0 flex-1 flex-col py-1 pr-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-lg font-bold leading-tight text-white">{title}</span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs font-bold text-zinc-400">{subtitle}</span>
            ) : null}
          </span>

          {/* Enlace externo a IMDb (no navega a la ficha de la temporada). */}
          {imdbUrl ? (
            <a
              href={imdbUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                window.open(imdbUrl, "_blank", "noopener,noreferrer");
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20 text-zinc-400 transition hover:bg-white hover:text-black"
              aria-label="Ver temporada en IMDb"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </span>

        {/* Una fila por dato: año, episodios y notas. */}
        <span className="mt-2.5 flex flex-col gap-1.5 text-xs font-bold text-zinc-400">
          {year ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
              {year}
            </span>
          ) : null}
          {total != null ? (
            <span className="flex items-center gap-1.5">
              <Tv className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
              {total} episodios
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

        {/* Progreso de vistos, abajo del todo para que todas las tarjetas lo
            alineen aunque falte algún dato. */}
        {total != null ? (
          <span className="mt-auto block pt-3">
            <span className="mb-1.5 flex items-end justify-between text-xs font-bold">
              <span className={percentage > 0 ? "text-white" : "text-zinc-500"}>
                {watched} <span className="font-normal text-zinc-500">vistos</span>
              </span>
              <span className="text-zinc-500">{percentage}%</span>
            </span>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <span
                className={`block h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${percentage}%` }}
              />
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
