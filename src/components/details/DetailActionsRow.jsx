"use client";

// /src/components/details/DetailActionsRow.jsx
// Fila de botones de acción principal de la ficha (tráiler, soundtrack, valoración
// de episodios, control de visto en Trakt, puntuación, favorito, pendiente, listas
// y reseñas). Componente 100% PRESENTACIONAL: toda la lógica/estado vive en el
// consumidor (DetailsClient o DetailModal), que pasa handlers + flags por props.

import { useServerOnline } from "@/context/ServerStatusContext";
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BaseLiquidButton from "@/components/LiquidButton";
import StarRating from "@/components/StarRating";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import {
  Play,
  X,
  Music2,
  BarChart3,
  Loader2,
  Heart,
  BookmarkPlus,
  ListVideo,
  MessageSquare,
} from "lucide-react";

// Limita el nuevo acabado a las acciones de ficha. Así todas sus variantes
// (DetailsClient, DetailModal, héroes y filas responsive) comparten el mismo
// cristal sin reestilizar otros LiquidButton de navegación o configuración.
function LiquidButton(props) {
  return <BaseLiquidButton {...props} liquidGlass />;
}

// Normaliza cualquier LiquidButton descendiente, incluidos los controles
// compuestos (TraktWatchedControl y StarRating), para que siempre rellene la
// celda que le corresponde y escale su icono con el mismo criterio.
// Se exporta para que otras superficies con fila de acciones propia (la baraja
// de Recomendaciones) usen EXACTAMENTE el mismo dimensionado, en vez de copiar
// estas clases y que acaben divergiendo.
//
// `forceMobile` (ver el prop del mismo nombre) necesita la mitad MÓVIL de estas
// clases por separado: en la ficha de teléfono del drawer el ancho de móvil lo
// pone el panel, no la ventana, así que los `sm:` —que miran el viewport, y en
// un escritorio SIEMPRE casan— devolverían los iconos al tamaño fijo de
// escritorio justo donde no toca. De ahí la separación en dos constantes.
const MOBILE_ACTION_BUTTON_BASE = `
                [&_[data-liquid-button]:not(.labeled)]:!w-full [&_[data-liquid-button]:not(.labeled)]:!h-auto [&_[data-liquid-button]:not(.labeled)]:aspect-square [&_[data-liquid-button]:not(.labeled)]:[container-type:inline-size]
                [&_[data-liquid-button]:not(.labeled)_svg]:!w-[46cqw] [&_[data-liquid-button]:not(.labeled)_svg]:!h-[46cqw]
                [&_[data-liquid-button]:not(.labeled)_.text-xl]:!text-[42cqw]
                [&_[data-liquid-button]:not(.labeled)_.text-2xl]:!text-[46cqw]
                [&_[data-liquid-button]:not(.labeled)_.text-lg]:!text-[38cqw]
                [&_[data-liquid-button]:not(.labeled)_.text-xs]:!text-[22cqw]`;

const DESKTOP_ACTION_BUTTON_OVERRIDES = `
                sm:[&_[data-liquid-button]:not(.labeled)_svg]:!w-[22px] sm:[&_[data-liquid-button]:not(.labeled)_svg]:!h-[22px]
                sm:[&_[data-liquid-button]:not(.labeled)_.text-xl]:!text-[22px]
                sm:[&_[data-liquid-button]:not(.labeled)_.text-2xl]:!text-[24px]
                sm:[&_[data-liquid-button]:not(.labeled)_.text-lg]:!text-[18px]
                sm:[&_[data-liquid-button]:not(.labeled)_.text-xs]:!text-[12px]`;

export const MOBILE_ACTION_BUTTON_CLASS = `${MOBILE_ACTION_BUTTON_BASE} ${DESKTOP_ACTION_BUTTON_OVERRIDES}`;

// Contrato de tamaño de las acciones circulares de una ficha. Es deliberadamente
// independiente del número de acciones: ocupan el espacio disponible hasta el
// tope de DetailsClient (56px en móvil y 48px desde `sm`) y, a partir de ahí,
// la fila se centra. El `!` protege este límite frente a wrappers de controles
// compuestos, como TraktWatchedControl.
//
// Se exporta porque episodio, temporada y listas comparten el mismo lenguaje
// visual. Tener el límite en una única clase evita que esas rutas crezcan con
// menos botones mientras DetailsClient se mantiene compacto.
const DETAIL_ACTION_ITEM_FLEX_CLASS =
  "[&>*:not(.separator):not(.labeled)]:!flex-[1_1_0%] [&>*:not(.separator):not(.labeled)]:min-w-[34px]";
const DETAIL_ACTION_ITEM_CAP_MOBILE_CLASS =
  "[&>*:not(.separator):not(.labeled)]:!max-w-[56px]";
const DETAIL_ACTION_ITEM_CAP_CLASS = `${DETAIL_ACTION_ITEM_CAP_MOBILE_CLASS} sm:[&>*:not(.separator):not(.labeled)]:!max-w-[48px]`;
export const DETAIL_ACTION_ITEM_SIZING_CLASS = `
                ${DETAIL_ACTION_ITEM_FLEX_CLASS} ${DETAIL_ACTION_ITEM_CAP_CLASS}`;

// Contenedor con el mismo escalado responsivo (container queries) que la fila
// original de DetailsClient. Se mantiene idéntico para no re-estilar.
const buildBaseRowClass = (forceMobile) => `flex flex-nowrap items-center justify-center w-full ${
                  forceMobile ? "" : "sm:justify-start sm:gap-3"
                }
                ${DETAIL_ACTION_ITEM_FLEX_CLASS}
                [&.labeled-row>*:not(.separator):not(.labeled)]:!flex-none
                ${forceMobile ? MOBILE_ACTION_BUTTON_BASE : MOBILE_ACTION_BUTTON_CLASS}`;

// Las previews tienen menos ancho que la ficha: centrar la fila y permitir
// que los círculos se reduzcan por igual, manteniendo su proporción cuadrada.
const FIT_ACTION_ROW_CLASS = `flex flex-nowrap items-center justify-center w-full gap-3
                [&>*:not(.separator):not(.labeled)]:!flex-[0_1_40px]
                [&>*:not(.separator):not(.labeled)]:!min-w-0
                [&>*:not(.separator):not(.labeled)]:!max-w-10
                [&>*:not(.separator):not(.labeled)]:!h-auto
                [&>*:not(.separator):not(.labeled)]:aspect-square
                ${MOBILE_ACTION_BUTTON_BASE}`;

// Retardo entre celdas para que el cambio se lea de izquierda a derecha, en orden.
const SLOT_STAGGER = 0.03;
const SLOT_FADE = 0.22;

// Una celda de la fila de acciones móvil combinada (solo series). Alterna su
// contenido según `expanded` con un cross-fade de SOLO opacidad: sin escala, así
// el botón NO cambia de tamaño. Entrante y saliente se solapan (ambos absolutos
// sobre la misma celda, sin `mode="wait"`), por lo que NO hay ningún instante en
// blanco; el retardo por índice hace que la conmutación recorra la fila en orden
// de izquierda a derecha. La celda mantiene tamaño fijo (aspect-square), así que
// la fila nunca se deforma ni cambia el tamaño de los botones.
function ActionSlot({
  index = 0,
  expanded,
  expandedContent,
  collapsedContent,
}) {
  const delay = index * SLOT_STAGGER;

  return (
    <div className="relative flex-1 min-w-[34px] max-w-[56px] aspect-square">
      <AnimatePresence initial={false}>
        <motion.div
          key={expanded ? "expanded" : "collapsed"}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: SLOT_FADE, ease: "easeOut", delay },
          }}
          exit={{
            opacity: 0,
            // El saliente deja de recibir clics en cuanto empieza a irse, para
            // que durante el solape no intercepte pulsaciones del entrante.
            pointerEvents: "none",
            transition: { duration: SLOT_FADE, ease: "easeIn", delay },
          }}
          className="absolute inset-0"
        >
          {expanded ? expandedContent : collapsedContent}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Fila de acciones presentacional. Cada elemento aparece solo si su
 * handler/flag correspondiente está presente.
 */
export default function DetailActionsRow({
  className = "",
  showSeparator = true,
  fillMobile = false,
  fitToContainer = false,
  // PÍLDORA ADAPTABLE (vistas previas del dashboard). Si la fila no cabe entera
  // en su ancho, la píldora con texto —"Reproducir" / "Ver tráiler"— pasa a
  // ser un botón redondo solo con el icono, como el resto; si vuelve a caber,
  // recupera el texto. Sin esto, en series (que llevan un botón más) los últimos
  // botones quedaban cortados por el borde de la tarjeta.
  compactLabelWhenTight = false,
  // La ficha de TELÉFONO del drawer (DetailModal con `contentView === "mobile"`)
  // mide entre 320 y 639px de ANCHO DE PANEL, pero vive en una ventana de
  // escritorio: los `sm:` de esta fila miran el viewport, así que allí casan
  // SIEMPRE y devolvían la disposición de escritorio dentro del teléfono
  // (separador visible, botones alineados a la izquierda con gap-3, iconos a
  // 22px fijos y, en series, la fila combinada `sm:hidden` directamente
  // ausente). Con `forceMobile` la fila se compone con su mitad móvil, que es
  // exactamente la misma que se ve en un teléfono real.
  forceMobile = false,
  mobileGapClass = "gap-1",
  size = "md",

  onTrailer,
  trailerAvailable = false,
  trailerLoading,
  trailerLabel = null,
  trailerPlaying = false,

  play = null,

  onSoundtrack,
  soundtrackAvailable = false,

  onEpisodeRatings,
  episodeRatingsOpen = false,

  combineTrailerSoundtrack,

  trakt,
  rate,

  favorite = false,
  favoriteLoading = false,
  onToggleFavorite,

  watchlist = false,
  watchlistLoading = false,
  onToggleWatchlist,

  onAddToList,
  listBusy = false,
  listActive = false,

  showComments = false,
  commentsActive = false,
  onComments,
}) {
  const serverOnline = useServerOnline();
  const [mediaExpanded, setMediaExpanded] = useState(false);

  // --- Píldora adaptable (ver `compactLabelWhenTight`).
  const hasLabelButton = Boolean(play || trailerLabel);
  const rowRef = useRef(null);
  const [labelCompact, setLabelCompact] = useState(false);
  // Ancho que necesitaba la fila CON texto la última vez que no cabía: con la
  // píldora compacta la fila ya cabe, así que para saber si se puede volver al
  // texto hay que compararse con lo que ocupaba entonces.
  const neededWidthRef = useRef(0);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!compactLabelWhenTight || !hasLabelButton || !row) {
      setLabelCompact(false);
      return undefined;
    }
    // La fila puede ocupar también el margen interior derecho de la tarjeta
    // (menos un poco de aire): es lo que ya se veía bien cuando todo cabía.
    const slack = () => {
      for (let el = row.parentElement, i = 0; el && i < 4; el = el.parentElement, i += 1) {
        const pad = parseFloat(window.getComputedStyle(el).paddingRight) || 0;
        if (pad > 0) return Math.max(0, pad - 4);
      }
      return 0;
    };
    const measure = () => {
      const available = row.clientWidth + slack();
      if (!row.clientWidth) return;
      setLabelCompact((compact) => {
        if (!compact) {
          if (row.scrollWidth > available + 1) {
            neededWidthRef.current = row.scrollWidth;
            return true;
          }
          return false;
        }
        return available + 1 < neededWidthRef.current;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [compactLabelWhenTight, hasLabelButton]);
  const showLabel = !labelCompact;
  const trailerTextShown = Boolean(trailerLabel) && showLabel;

  const shouldCombineMedia =
    (combineTrailerSoundtrack !== undefined
      ? combineTrailerSoundtrack
      : Boolean(onEpisodeRatings)) &&
    Boolean(onTrailer) &&
    Boolean(onSoundtrack) &&
    !play &&
    !trailerLabel;

  // Tope de tamaño de botón en móvil: por defecto 56px; con fillMobile sin tope.
  const mobileCapClass = fillMobile
    ? ""
    : forceMobile
      ? DETAIL_ACTION_ITEM_CAP_MOBILE_CLASS
      : DETAIL_ACTION_ITEM_CAP_CLASS;
  // Tamaño de los botones-icono en labeled-row
  const labeledSizeClass =
    size === "lg"
      ? "[&.labeled-row>*:not(.separator):not(.labeled)]:!w-12 [&.labeled-row>*:not(.separator):not(.labeled)]:!h-12 [&.labeled-row_[data-liquid-button]:not(.labeled)_svg]:!h-6 [&.labeled-row_[data-liquid-button]:not(.labeled)_svg]:!w-6"
      : "[&.labeled-row>*:not(.separator):not(.labeled)]:!w-10 [&.labeled-row>*:not(.separator):not(.labeled)]:!h-10";
  const rowClass = [
    fitToContainer ? FIT_ACTION_ROW_CLASS : buildBaseRowClass(forceMobile),
    !fitToContainer && labeledSizeClass,
    !fitToContainer && mobileGapClass,
    !fitToContainer && mobileCapClass,
    trailerLabel || play ? "labeled-row" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Contenidos de la fila móvil combinada. Al expandir, cada control se DESPLAZA
  // una celda a la derecha para dejar sitio a tráiler y soundtrack, así que el
  // mismo botón se usa en dos celdas distintas: se define una sola vez aquí.
  const episodeRatingsButton = onEpisodeRatings ? (
    <LiquidButton
      onClick={onEpisodeRatings}
      active
      activeColor="yellow"
      groupId="details-actions"
      className="!bg-white !text-black !w-full !h-auto aspect-square"
      title="Valoración de episodios"
    >
      <BarChart3 />
    </LiquidButton>
  ) : null;

  const traktControl = trakt ? (
    <TraktWatchedControl
      liquidGlass
      connected={trakt.connected}
      watched={trakt.watched}
      plays={trakt.plays}
      badge={trakt.badge}
      busy={!!trakt.busy}
      loading={trakt.loading}
      onOpen={trakt.onOpen}
      progressOverride={trakt.progressOverride}
    />
  ) : null;

  const rateControl = rate ? (
    <StarRating
      liquidGlass
      rating={rate.rating}
      max={rate.max}
      loading={rate.loading}
      onRate={rate.onRate}
      connected={rate.connected}
      onConnect={rate.onConnect}
    />
  ) : null;

  const favoriteButton = onToggleFavorite ? (
    <LiquidButton
      onClick={onToggleFavorite}
      data-online-only="true"
      readOnly={!serverOnline}
      disabled={favoriteLoading}
      active={favorite}
      activeColor="red"
      groupId="details-actions"
      className="!w-full !h-auto aspect-square"
      title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
    >
      {favoriteLoading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Heart className={favorite ? "fill-current" : ""} />
      )}
    </LiquidButton>
  ) : null;

  const watchlistButton = onToggleWatchlist ? (
    <LiquidButton
      onClick={onToggleWatchlist}
      data-online-only="true"
      readOnly={!serverOnline}
      disabled={watchlistLoading}
      active={watchlist}
      activeColor="blue"
      groupId="details-actions"
      className="!w-full !h-auto aspect-square"
      title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
    >
      {watchlistLoading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <BookmarkPlus className={watchlist ? "fill-current" : ""} />
      )}
    </LiquidButton>
  ) : null;

  const addToListButton = onAddToList ? (
    <LiquidButton
      onClick={onAddToList}
      data-online-only="true"
      readOnly={!serverOnline}
      disabled={listBusy}
      active={listActive}
      activeColor="purple"
      groupId="details-actions"
      className="!w-full !h-auto aspect-square"
      title={listActive ? "Gestionar en listas" : "Añadir a lista"}
    >
      {listBusy ? <Loader2 className="animate-spin" /> : <ListVideo />}
    </LiquidButton>
  ) : null;

  const commentsButton = showComments ? (
    <LiquidButton
      onClick={onComments}
      active={commentsActive}
      activeColor="orange"
      groupId="details-actions"
      className="!w-full !h-auto aspect-square"
      title="Ver reseñas de la comunidad"
    >
      <MessageSquare />
    </LiquidButton>
  ) : null;

  return (
    <>
      {/* VISTA MÓVIL EXCLUSIVA PARA SERIES COMBINADAS (8 SLOTS PERMANENTES PARA ZERO DEFORMACIÓN Y CONMUTACIÓN PERFECTA) */}
      {shouldCombineMedia && (
        // Una SOLA capa, sin envoltorio intermedio: la animación de entrada de
        // la ficha móvil (`.sv-mobile-actions-reveal > * > *`) escalona los
        // NIETOS del contenedor. Con un div de más, quien recibía la animación
        // era la fila entera y las series entraban de golpe como un bloque, en
        // vez de botón a botón como en las películas.
        <div
          // `justify-center`, igual que la fila estándar (películas), y NO
          // `justify-between`: ambas capan sus botones a 56px, así que en
          // cuanto la fila es más ancha que los ocho botones más sus huecos
          // sobra sitio, y `between` lo repartía ENTRE los botones. Resultado:
          // las series se veían más separadas que las películas con exactamente
          // los mismos botones. Centrando, el sobrante se va a los extremos y
          // las dos filas quedan idénticas.
          className={`flex ${forceMobile ? "" : "sm:hidden"} flex-nowrap items-center justify-center w-full ${mobileGapClass} [&>*:not(.separator)]:flex-1 [&>*:not(.separator)]:min-w-[34px] [&>*:not(.separator)]:max-w-[56px] ${forceMobile ? MOBILE_ACTION_BUTTON_BASE : MOBILE_ACTION_BUTTON_CLASS}`}
        >
          {/* Slot 1: Trigger Principal (Play -> X) */}
          <div className="flex-1 min-w-[34px] max-w-[56px] aspect-square">
            <LiquidButton
              onClick={() => setMediaExpanded((v) => !v)}
              disabled={!trailerAvailable && !soundtrackAvailable}
              active={!!trailerAvailable || !!soundtrackAvailable}
              loading={trailerLoading}
              activeColor="yellow"
              groupId="details-actions"
              className={`!w-full !h-auto aspect-square ${
                trailerAvailable || soundtrackAvailable
                  ? "!bg-white !text-black"
                  : ""
              } ${
                mediaExpanded
                  ? "ring-2 ring-yellow-400/90 shadow-[0_0_14px_rgba(250,204,21,0.6)]"
                  : ""
              }`}
              title={
                mediaExpanded
                  ? "Cerrar opciones multimedia"
                  : "Opciones multimedia (Tráiler y Soundtrack)"
              }
              aria-expanded={mediaExpanded}
            >
              {/* Icono Play <-> X: cross-fade solapado (sin `mode="wait"`), así
                    el botón nunca se queda vacío a mitad de la transición. */}
              <span className="relative flex w-full h-full items-center justify-center">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={mediaExpanded ? "close" : "play"}
                    initial={{ opacity: 0, rotate: -30 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 30 }}
                    transition={{ duration: SLOT_FADE, ease: "easeOut" }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {mediaExpanded ? (
                      <X />
                    ) : trailerPlaying ? (
                      <X />
                    ) : (
                      <Play className={trailerAvailable ? "ml-0.5" : ""} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
            </LiquidButton>
          </div>

          {/* Slot 2: Ver Tráiler (Expandido) <-> Valoración de episodios (Replegado) */}
          <ActionSlot
            index={1}
            expanded={mediaExpanded}
            expandedContent={
              <LiquidButton
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaExpanded(false);
                  if (onTrailer) onTrailer();
                }}
                disabled={!trailerAvailable}
                active={!!trailerAvailable}
                loading={trailerLoading}
                activeColor="yellow"
                groupId="details-actions"
                className={`!w-full !h-auto aspect-square ${
                  trailerAvailable ? "!bg-white !text-black" : ""
                }`}
                title={
                  trailerPlaying
                    ? "Ocultar tráiler"
                    : trailerAvailable
                      ? "Ver Tráiler"
                      : "Sin Tráiler"
                }
              >
                {trailerPlaying ? (
                  <X />
                ) : (
                  <Play className={trailerAvailable ? "ml-0.5" : ""} />
                )}
              </LiquidButton>
            }
            collapsedContent={episodeRatingsButton}
          />

          {/* Slot 3: Soundtrack (Expandido) <-> Episodios vistos / Trakt (Replegado) */}
          <ActionSlot
            index={2}
            expanded={mediaExpanded}
            expandedContent={
              <LiquidButton
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaExpanded(false);
                  if (onSoundtrack) onSoundtrack();
                }}
                disabled={!soundtrackAvailable}
                active={!!soundtrackAvailable}
                activeColor="yellow"
                groupId="details-actions"
                className={`!w-full !h-auto aspect-square ${
                  soundtrackAvailable ? "!bg-white !text-black" : ""
                }`}
                title={
                  soundtrackAvailable
                    ? "Reproducir soundtrack"
                    : "Sin soundtrack"
                }
              >
                <Music2 />
              </LiquidButton>
            }
            collapsedContent={traktControl}
          />

          {/* Slot 4: Valoración de episodios (Expandido) <-> Puntuación estrellas (Replegado) */}
          <ActionSlot
            index={3}
            expanded={mediaExpanded}
            expandedContent={episodeRatingsButton}
            collapsedContent={rateControl}
          />

          {/* Slot 5: Episodios vistos / Trakt (Expandido) <-> Favorito (Replegado) */}
          <ActionSlot
            index={4}
            expanded={mediaExpanded}
            expandedContent={traktControl}
            collapsedContent={favoriteButton}
          />

          {/* Slot 6: Puntuación estrellas (Expandido) <-> Pendientes (Replegado) */}
          <ActionSlot
            index={5}
            expanded={mediaExpanded}
            expandedContent={rateControl}
            collapsedContent={watchlistButton}
          />

          {/* Slot 7: Favoritos (Expandido) <-> Añadir a lista (Replegado) */}
          <ActionSlot
            index={6}
            expanded={mediaExpanded}
            expandedContent={favoriteButton}
            collapsedContent={addToListButton}
          />

          {/* Slot 8: Pendientes (Expandido) <-> Reseñas (Replegado) */}
          <ActionSlot
            index={7}
            expanded={mediaExpanded}
            expandedContent={watchlistButton}
            collapsedContent={commentsButton}
          />
        </div>
      )}

      {/* VISTA ESTÁNDAR (ESCRITORIO Y PELÍCULAS) */}
      <div
        ref={rowRef}
        className={
          shouldCombineMedia
            ? `hidden ${forceMobile ? "" : "sm:flex"} ${rowClass}`
            : rowClass
        }
      >
        {/* Píldora de REPRODUCCIÓN (Continuar viendo) */}
        {play && (
          <LiquidButton
            onClick={play.onPlay}
            active
            activeColor="yellow"
            groupId="details-actions"
            className={
              showLabel
                ? `labeled shrink-0 !aspect-auto !w-auto !max-w-none !bg-white !text-black ${
                    size === "lg" ? "!h-12 px-5" : "!h-10 px-4"
                  }`
                : "shrink-0 !bg-white !text-black"
            }
            title={play.title || play.label || "Reproducir"}
          >
            <Play
              className={`fill-current ${
                showLabel
                  ? size === "lg"
                    ? "mr-2 h-5 w-5"
                    : "mr-2 h-4 w-4"
                  : "ml-0.5 sm:ml-1"
              }`}
            />
            {showLabel && (
              <span
                className={`whitespace-nowrap font-bold ${
                  size === "lg" ? "text-sm sm:text-base" : "text-[13px]"
                }`}
              >
                {play.label}
              </span>
            )}
          </LiquidButton>
        )}

        {/* Botón de reproducción de tráiler */}
        {onTrailer && (
          <LiquidButton
            onClick={onTrailer}
            disabled={!trailerAvailable}
            active={!!trailerAvailable}
            loading={trailerLoading}
            activeColor="yellow"
            groupId="details-actions"
            className={[
              trailerAvailable ? "!bg-white !text-black" : "",
              trailerTextShown
                ? `labeled shrink-0 !aspect-auto !w-auto !max-w-none ${
                    size === "lg" ? "!h-12 px-5" : "!h-10 px-4"
                  }`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={
              trailerPlaying
                ? "Ocultar tráiler"
                : trailerAvailable
                  ? "Ver Tráiler"
                  : "Sin Tráiler"
            }
          >
            {trailerPlaying ? (
              <X
                className={
                  trailerTextShown
                    ? size === "lg"
                      ? "mr-2 h-5 w-5"
                      : "mr-2 h-4 w-4"
                    : ""
                }
              />
            ) : (
              <Play
                className={`fill-current ${
                  trailerTextShown
                    ? size === "lg"
                      ? "mr-2 h-5 w-5"
                      : "mr-2 h-4 w-4"
                    : trailerAvailable
                      ? "ml-0.5 sm:ml-1"
                      : ""
                }`}
              />
            )}
            {trailerTextShown && (
              <span
                className={`whitespace-nowrap font-bold ${
                  size === "lg" ? "text-sm sm:text-base" : "text-[13px]"
                }`}
              >
                {trailerPlaying ? "Ocultar" : trailerLabel}
              </span>
            )}
          </LiquidButton>
        )}

        {/* Botón de música/soundtrack */}
        {onSoundtrack && (
          <LiquidButton
            onClick={onSoundtrack}
            disabled={!soundtrackAvailable}
            active={!!soundtrackAvailable}
            activeColor="yellow"
            groupId="details-actions"
            className={soundtrackAvailable ? "!bg-white !text-black" : ""}
            title={
              soundtrackAvailable ? "Reproducir soundtrack" : "Sin soundtrack"
            }
          >
            <Music2 />
          </LiquidButton>
        )}

        {/* Valoración de episodios */}
        {onEpisodeRatings && (
          <LiquidButton
            onClick={onEpisodeRatings}
            active
            activeColor="yellow"
            groupId="details-actions"
            className="!bg-white !text-black"
            title="Valoración de episodios"
            aria-label="Abrir valoración de episodios"
            aria-haspopup="dialog"
            aria-expanded={episodeRatingsOpen}
          >
            <BarChart3 />
          </LiquidButton>
        )}

        {showSeparator && (
          <div className={`hidden ${forceMobile ? "" : "sm:block"} w-px h-8 bg-white/35 mx-1 sm:mx-2 shrink-0 separator`} />
        )}

        {/* Control de visto/no visto en Trakt */}
        {trakt && (
          <TraktWatchedControl
            liquidGlass
            connected={trakt.connected}
            watched={trakt.watched}
            plays={trakt.plays}
            badge={trakt.badge}
            busy={!!trakt.busy}
            loading={trakt.loading}
            onOpen={trakt.onOpen}
            progressOverride={trakt.progressOverride}
          />
        )}

        {/* Puntuación con estrellas */}
        {rate && (
          <StarRating
            liquidGlass
            rating={rate.rating}
            max={rate.max}
            loading={rate.loading}
            onRate={rate.onRate}
            connected={rate.connected}
            onConnect={rate.onConnect}
          />
        )}

        {/* Favoritos */}
        {onToggleFavorite && (
          <LiquidButton
            onClick={onToggleFavorite}
            data-online-only="true"
      readOnly={!serverOnline}
      disabled={favoriteLoading}
            active={favorite}
            activeColor="red"
            groupId="details-actions"
            title={
              favoriteLoading
                ? "Cargando estado de favoritos..."
                : favorite
                  ? "Quitar de favoritos"
                  : "Añadir a favoritos"
            }
            aria-label={
              favoriteLoading
                ? "Cargando estado de favoritos"
                : favorite
                  ? "Quitar de favoritos"
                  : "Añadir a favoritos"
            }
          >
            {favoriteLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Heart className={favorite ? "fill-current" : ""} />
            )}
          </LiquidButton>
        )}

        {/* Pendientes */}
        {onToggleWatchlist && (
          <LiquidButton
            onClick={onToggleWatchlist}
            data-online-only="true"
      readOnly={!serverOnline}
      disabled={watchlistLoading}
            active={watchlist}
            activeColor="blue"
            groupId="details-actions"
            title={
              watchlistLoading
                ? "Cargando estado de pendientes..."
                : watchlist
                  ? "Quitar de lista de pendientes"
                  : "Añadir a lista de pendientes"
            }
            aria-label={
              watchlistLoading
                ? "Cargando estado de pendientes"
                : watchlist
                  ? "Quitar de lista de pendientes"
                  : "Añadir a lista de pendientes"
            }
          >
            {watchlistLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <BookmarkPlus className={watchlist ? "fill-current" : ""} />
            )}
          </LiquidButton>
        )}

        {/* Añadir a lista */}
        {onAddToList && (
          <LiquidButton
            onClick={onAddToList}
            data-online-only="true"
      readOnly={!serverOnline}
      disabled={listBusy}
            active={listActive}
            activeColor="purple"
            groupId="details-actions"
            title={
              listBusy
                ? "Comprobando listas..."
                : listActive
                  ? "Gestionar en listas"
                  : "Añadir a lista"
            }
            aria-label="Añadir o gestionar en listas de reproducción"
          >
            {listBusy ? <Loader2 className="animate-spin" /> : <ListVideo />}
          </LiquidButton>
        )}

        {/* Reseñas / Comentarios */}
        {showComments && (
          <LiquidButton
            onClick={onComments}
            active={commentsActive}
            activeColor="orange"
            groupId="details-actions"
            title={
              commentsActive
                ? "Ver reseñas de la comunidad (tienes reseñas)"
                : "Ver reseñas de la comunidad"
            }
            aria-label="Ver reseñas de la comunidad"
          >
            <MessageSquare />
          </LiquidButton>
        )}
      </div>
    </>
  );
}
