"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Layers, MonitorPlay, Pencil, Play } from "lucide-react";
import BaseLiquidButton from "@/components/LiquidButton";
import StarRating from "@/components/StarRating";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { isSubrouteHref, navigateSubrouteHolding } from "@/lib/navigation/subrouteHoldTransition";
import { prefetchSubrouteFull } from "@/lib/navigation/useWarmSubrouteNeighbors";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import {
  DETAIL_ACTION_DESKTOP_SIZE_CLASS,
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
  ${MOBILE_ACTION_BUTTON_CLASS}
  ${DETAIL_ACTION_DESKTOP_SIZE_CLASS}`;

// ACCIONES PRINCIPALES (Ver tráiler, Serie, Temporada): el MISMO botón que
// «Ver tráiler» en la fila de DetailsClient —LiquidButton de cristal, blanco
// con el icono negro, ondas, partículas y resplandor amarillo en hover/clic, y
// el mismo grupo para que reaccionen a los botones vecinos—. Anterior /
// Siguiente siguen en cristal.
// OJO: LiquidButton reparte sus props al final, así que un `onMouseEnter`
// pisaría el suyo (el del hover). Por eso la precarga va en `onPointerEnter`.
function PrimaryAction({ title, onClick, onPointerEnter, disabled = false, loading = false, children }) {
  return (
    <BaseLiquidButton
      liquidGlass
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      disabled={disabled}
      active={!disabled}
      loading={loading}
      activeColor="yellow"
      groupId="details-actions"
      className={disabled ? "" : "!bg-white !text-black"}
      title={title}
    >
      {children}
    </BaseLiquidButton>
  );
}

// Volver a la serie / a la temporada: navegación con el botón principal (un
// <button> no puede ir dentro de un <Link>). Se precarga al pasar el ratón,
// como haría el enlace.
function PrimaryNavigationAction({ href, label, children }) {
  const router = useRouter();
  return (
    <PrimaryAction
      title={label}
      onClick={() => router.push(href)}
      onPointerEnter={() => router.prefetch?.(href)}
    >
      {children}
    </PrimaryAction>
  );
}

function NavigationAction({ href, label, primary = false, children }) {
  const router = useRouter();
  if (primary && href) {
    return (
      <PrimaryNavigationAction href={href} label={label}>
        {children}
      </PrimaryNavigationAction>
    );
  }

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
      // Al apuntar, la página entera (no solo hasta el loading): si la
      // precarga en reposo no ha llegado aún, se adelanta aquí.
      onPointerEnter={() => {
        if (isSubrouteHref(href)) prefetchSubrouteFull(router, href);
      }}
      onClick={(event) => {
        // Clic normal: la ficha actual se queda a la vista hasta que llega la
        // nueva, sin pasar por la superficie oscura de carga. Con
        // modificadores, lo nativo del enlace (pestaña nueva…).
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !isSubrouteHref(href)
        ) {
          return;
        }
        event.preventDefault();
        void navigateSubrouteHolding({ href, navigate: router.push }).catch(() => {});
      }}
      data-liquid-button="true"
      className={`relative isolate flex !h-auto !w-full aspect-square items-center justify-center overflow-hidden rounded-full text-zinc-200 transition-[transform,color,background-color] duration-300 hover:scale-105 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 ${LIQUID_GLASS_SURFACE_CARD} ${LIQUID_GLASS_ELEVATION}`}
    >
      <LiquidGlassOpticalLayers />
      <span className="relative z-10">{children}</span>
    </Link>
  );
}

// Acción que abre algo en la página (p. ej. «Editar portada»): el mismo cristal
// que la navegación, como botón.
function ButtonAction({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-haspopup="dialog"
      data-liquid-button="true"
      className={`relative isolate flex !h-auto !w-full aspect-square items-center justify-center overflow-hidden rounded-full text-zinc-200 transition-[transform,color,background-color] duration-300 hover:scale-105 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 ${LIQUID_GLASS_SURFACE_CARD} ${LIQUID_GLASS_ELEVATION}`}
    >
      <LiquidGlassOpticalLayers />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

// «Ver tráiler»: sin vídeos va apagado (el mismo estado que «Sin tráiler» en
// la ficha) y no abre nada; mientras se buscan, el spinner del propio botón.
function TrailerAction({ available, loading, onOpen }) {
  return (
    <PrimaryAction
      title={loading ? "Buscando vídeos" : available ? "Ver tráiler" : "No hay vídeos disponibles"}
      onClick={onOpen}
      disabled={!available && !loading}
      loading={loading}
    >
      <Play className={`fill-current ${available ? "ml-0.5 sm:ml-1" : ""}`} />
    </PrimaryAction>
  );
}

/**
 * `trailer`: { available, loading, onOpen } — «Ver tráiler» con los vídeos de
 * esa temporada o episodio (apagado si no hay).
 *
 * Acciones de las fichas de temporada y episodio. `onEditCover`: «Editar
 * portada» (temporadas), como «Editar colección» en las colecciones. Conserva los controles
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
  onEditCover = null,
  trailer = null,
}) {
  return (
    <div className={ROW_CLASS}>
      <NavigationAction href={previousHref} label="Anterior">
        <ArrowLeft />
      </NavigationAction>

      {trailer ? (
        <TrailerAction
          available={trailer.available}
          loading={trailer.loading}
          onOpen={trailer.onOpen}
        />
      ) : null}

      <NavigationAction primary href={seriesHref} label="Ver detalles de la serie">
        <MonitorPlay />
      </NavigationAction>

      {seasonHref ? (
        <NavigationAction primary href={seasonHref} label="Ver temporada">
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
          continueWatchingPercent={trakt.continueWatchingPercent}
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

      {onEditCover ? (
        <ButtonAction label="Editar portada" onClick={onEditCover}>
          <Pencil />
        </ButtonAction>
      ) : null}

      <NavigationAction href={nextHref} label="Siguiente">
        <ArrowRight />
      </NavigationAction>
    </div>
  );
}
