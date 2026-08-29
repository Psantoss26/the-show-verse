"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Layers, MonitorPlay } from "lucide-react";
import StarRating from "@/components/StarRating";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import {
  DETAIL_ACTION_ITEM_SIZING_CLASS,
  MOBILE_ACTION_BUTTON_CLASS,
} from "@/components/details/DetailActionsRow";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import {
  LIQUID_GLASS_ELEVATION,
  LIQUID_GLASS_SURFACE_CARD,
} from "@/lib/ui/liquidGlass";

const ROW_CLASS = `flex w-full flex-nowrap items-center justify-center gap-1 sm:justify-start sm:gap-3
  ${DETAIL_ACTION_ITEM_SIZING_CLASS}
  ${MOBILE_ACTION_BUTTON_CLASS}`;

function NavigationAction({ href, label, children }) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        title={label}
        className={`relative isolate flex !h-auto !w-full aspect-square items-center justify-center overflow-hidden rounded-full text-zinc-500 opacity-45 ${LIQUID_GLASS_SURFACE_CARD}`}
      >
        <span className="relative z-10">{children}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      data-liquid-button="true"
      className={`relative isolate flex !h-auto !w-full aspect-square items-center justify-center overflow-hidden rounded-full text-zinc-200 transition-[transform,color,background-color] duration-300 hover:scale-105 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 ${LIQUID_GLASS_SURFACE_CARD} ${LIQUID_GLASS_ELEVATION}`}
    >
      <LiquidGlassOpticalLayers />
      <span className="relative z-10">{children}</span>
    </Link>
  );
}

/**
 * Acciones de las fichas de temporada y episodio. Conserva los controles
 * funcionales de Trakt/puntuación y suma la navegación en el mismo cristal
 * líquido que la fila principal de DetailsClient.
 */
export default function SubrouteDetailsActionRow({
  seriesHref,
  seasonHref = null,
  previousHref = null,
  nextHref = null,
  trakt = null,
  rate = null,
}) {
  return (
    <div className={ROW_CLASS}>
      <NavigationAction href={previousHref} label="Anterior">
        <ArrowLeft />
      </NavigationAction>

      <NavigationAction href={seriesHref} label="Ver detalles de la serie">
        <MonitorPlay />
      </NavigationAction>

      {seasonHref ? (
        <NavigationAction href={seasonHref} label="Ver temporada">
          <Layers />
        </NavigationAction>
      ) : null}

      {trakt ? (
        <TraktWatchedControl
          liquidGlass
          connected={trakt.connected}
          watched={trakt.watched}
          plays={trakt.plays}
          badge={trakt.badge}
          busy={trakt.busy}
          loading={trakt.loading}
          onOpen={trakt.onOpen}
        />
      ) : null}

      {rate ? (
        <StarRating
          liquidGlass
          rating={rate.rating}
          loading={rate.loading}
          connected={rate.connected}
          onConnect={rate.onConnect}
          onRate={rate.onRate}
          onClear={rate.onClear}
          min={rate.min}
          max={rate.max}
          step={rate.step}
        />
      ) : null}

      <NavigationAction href={nextHref} label="Siguiente">
        <ArrowRight />
      </NavigationAction>
    </div>
  );
}
