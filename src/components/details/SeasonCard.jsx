"use client";

// Tarjeta de una temporada en la sección «Temporadas» de la ficha completa
// (DetailsClient) y de la ficha de teléfono del drawer (PhoneDetailsSections).
// Póster de la temporada a la izquierda y, a la derecha, el título, año y
// episodios, la nota, el enlace a IMDb y el progreso de vistos.
//
// El póster es el mismo que enseña la ficha de la temporada: el elegido en
// «Editar portada» (lib/details/seasonArtwork) o el de TMDb de la temporada,
// y si no tiene, el de la serie.

import { useLayoutEffect, useState } from "react";
import { ExternalLink, Star } from "lucide-react";
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
  rating = null,
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
  const meta = [year, total != null ? `${total} episodios` : null].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      // Cristal de TARJETA compartido: van en rejilla, así que sin sombra propia
      // (varias sombras juntas forman una banda oscura detrás del grupo).
      className={`group relative isolate flex w-full transform-gpu gap-3.5 overflow-hidden rounded-2xl p-2.5 text-left sm:gap-4 ${LIQUID_GLASS_CARD} transition-all ${
        hoverLift ? "hover:-translate-y-1 hover:brightness-110" : ""
      }`}
      aria-label={`Ver ${title}${subtitle ? `: ${subtitle}` : ""}`}
    >
      <LiquidGlassOpticalLayers />

      <span className="relative z-10 aspect-[2/3] w-[5.25rem] shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-lg shadow-black/40 sm:w-24">
        {poster ? (
          <OptimizedImage
            src={`https://image.tmdb.org/t/p/w185${poster}`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-black text-white/15">
            {seasonNumber}
          </span>
        )}
      </span>

      <span className="relative z-10 flex min-w-0 flex-1 flex-col py-1 pr-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight text-white sm:text-lg">{title}</span>
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

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-zinc-400">
          {rating != null ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <Star className="h-3 w-3 fill-yellow-400" aria-hidden="true" />
              {rating.toFixed(1)}
            </span>
          ) : null}
          {meta.map((item, index) => (
            <span key={item} className="flex items-center gap-2">
              {index > 0 || rating != null ? <span className="text-zinc-600" aria-hidden="true">•</span> : null}
              {item}
            </span>
          ))}
        </span>

        {/* Progreso de vistos, abajo del todo para que todas las tarjetas lo
            alineen aunque el título ocupe una o dos líneas. */}
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
