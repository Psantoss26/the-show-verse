"use client";

// /src/components/details/DetailActionsRow.jsx
// Fila de botones de acción principal de la ficha (tráiler, soundtrack, valoración
// de episodios, control de visto en Trakt, puntuación, favorito, pendiente, listas
// y reseñas). Componente 100% PRESENTACIONAL: toda la lógica/estado vive en el
// consumidor (DetailsClient o DetailModal), que pasa handlers + flags por props.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LiquidButton from "@/components/LiquidButton";
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

// Contenedor con el mismo escalado responsivo (container queries) que la fila
// original de DetailsClient. Se mantiene idéntico para no re-estilar.
const BASE_ROW_CLASS = `flex flex-nowrap items-center justify-center sm:justify-start sm:gap-3 w-full
                [&>*:not(.separator):not(.labeled)]:flex-1 [&>*:not(.separator):not(.labeled)]:min-w-[34px] sm:[&>*:not(.separator):not(.labeled)]:max-w-[52px]
                [&.labeled-row>*:not(.separator):not(.labeled)]:!flex-none
                [&_[data-liquid-button]:not(.labeled)]:!w-full [&_[data-liquid-button]:not(.labeled)]:!h-auto [&_[data-liquid-button]:not(.labeled)]:aspect-square [&_[data-liquid-button]:not(.labeled)]:[container-type:inline-size]
                [&_[data-liquid-button]:not(.labeled)_svg]:!w-[46cqw] [&_[data-liquid-button]:not(.labeled)_svg]:!h-[46cqw] sm:[&_[data-liquid-button]:not(.labeled)_svg]:!w-[22px] sm:[&_[data-liquid-button]:not(.labeled)_svg]:!h-[22px]
                [&_[data-liquid-button]:not(.labeled)_.text-xl]:!text-[42cqw] sm:[&_[data-liquid-button]:not(.labeled)_.text-xl]:!text-[22px]
                [&_[data-liquid-button]:not(.labeled)_.text-2xl]:!text-[46cqw] sm:[&_[data-liquid-button]:not(.labeled)_.text-2xl]:!text-[24px]
                [&_[data-liquid-button]:not(.labeled)_.text-lg]:!text-[38cqw] sm:[&_[data-liquid-button]:not(.labeled)_.text-lg]:!text-[18px]
                [&_[data-liquid-button]:not(.labeled)_.text-xs]:!text-[22cqw] sm:[&_[data-liquid-button]:not(.labeled)_.text-xs]:!text-[12px]`;

/**
 * Fila de acciones presentacional. Cada elemento aparece solo si su
 * handler/flag correspondiente está presente.
 */
export default function DetailActionsRow({
  className = "",
  showSeparator = true,
  fillMobile = false,
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
  const [mediaExpanded, setMediaExpanded] = useState(false);

  const shouldCombineMedia =
    (combineTrailerSoundtrack !== undefined
      ? combineTrailerSoundtrack
      : Boolean(onEpisodeRatings)) &&
    Boolean(onTrailer) &&
    Boolean(onSoundtrack) &&
    !play &&
    !trailerLabel;

  // Tope de tamaño de botón en móvil: por defecto 60px; con fillMobile sin tope.
  const mobileCapClass = fillMobile
    ? ""
    : "[&>*:not(.separator)]:max-w-[60px]";
  // Tamaño de los botones-icono en labeled-row
  const labeledSizeClass =
    size === "lg"
      ? "[&.labeled-row>*:not(.separator):not(.labeled)]:!w-12 [&.labeled-row>*:not(.separator):not(.labeled)]:!h-12 [&.labeled-row_[data-liquid-button]:not(.labeled)_svg]:!h-6 [&.labeled-row_[data-liquid-button]:not(.labeled)_svg]:!w-6"
      : "[&.labeled-row>*:not(.separator):not(.labeled)]:!w-10 [&.labeled-row>*:not(.separator):not(.labeled)]:!h-10";
  const rowClass = [
    BASE_ROW_CLASS,
    labeledSizeClass,
    mobileGapClass,
    mobileCapClass,
    trailerLabel || play ? "labeled-row" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      {/* Píldora de REPRODUCCIÓN (Continuar viendo) */}
      {play && (
        <LiquidButton
          onClick={play.onPlay}
          active
          activeColor="yellow"
          groupId="details-actions"
          className={`labeled shrink-0 !aspect-auto !w-auto !max-w-none !bg-white !text-black ${
            size === "lg" ? "!h-12 px-5" : "!h-10 px-4"
          }`}
          title={play.title || play.label || "Reproducir"}
        >
          <Play
            className={`fill-current ${
              size === "lg" ? "mr-2 h-5 w-5" : "mr-2 h-4 w-4"
            }`}
          />
          <span
            className={`whitespace-nowrap font-bold ${
              size === "lg" ? "text-sm sm:text-base" : "text-[13px]"
            }`}
          >
            {play.label}
          </span>
        </LiquidButton>
      )}

      {/* SLOT 1 (Móvil Series): Botón disparador multimedia (Play -> X al expandir) */}
      {shouldCombineMedia && (
        <LiquidButton
          onClick={() => setMediaExpanded((v) => !v)}
          disabled={!trailerAvailable && !soundtrackAvailable}
          active={!!trailerAvailable || !!soundtrackAvailable}
          loading={trailerLoading}
          activeColor="yellow"
          groupId="details-actions"
          className={`block sm:hidden ${
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mediaExpanded ? "close" : "play"}
              initial={{ scale: 0.6, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.6, opacity: 0, rotate: 45 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center w-full h-full"
            >
              {mediaExpanded ? (
                <X />
              ) : trailerPlaying ? (
                <X />
              ) : (
                <Play className={trailerAvailable ? "ml-0.5" : ""} />
              )}
            </motion.div>
          </AnimatePresence>
        </LiquidButton>
      )}

      {/* Botón de reproducción de tráiler (Desktop / Normal) */}
      {onTrailer && (
        <LiquidButton
          onClick={onTrailer}
          disabled={!trailerAvailable}
          active={!!trailerAvailable}
          loading={trailerLoading}
          activeColor="yellow"
          groupId="details-actions"
          className={[
            shouldCombineMedia ? "hidden sm:block" : "",
            trailerAvailable ? "!bg-white !text-black" : "",
            trailerLabel
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
                trailerLabel
                  ? size === "lg"
                    ? "mr-2 h-5 w-5"
                    : "mr-2 h-4 w-4"
                  : ""
              }
            />
          ) : (
            <Play
              className={`fill-current ${
                trailerLabel
                  ? size === "lg"
                    ? "mr-2 h-5 w-5"
                    : "mr-2 h-4 w-4"
                  : trailerAvailable
                    ? "ml-0.5 sm:ml-1"
                    : ""
              }`}
            />
          )}
          {trailerLabel && (
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

      {/* Botón de música/soundtrack (Desktop / Normal) */}
      {onSoundtrack && (
        <LiquidButton
          onClick={onSoundtrack}
          disabled={!soundtrackAvailable}
          active={!!soundtrackAvailable}
          activeColor="yellow"
          groupId="details-actions"
          className={[
            shouldCombineMedia ? "hidden sm:block" : "",
            soundtrackAvailable ? "!bg-white !text-black" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={
            soundtrackAvailable ? "Reproducir soundtrack" : "Sin soundtrack"
          }
        >
          <Music2 />
        </LiquidButton>
      )}

      {/* SLOT 2: Valoración de episodios en desktop / normal, o Ver Tráiler si en móvil series está desplegado */}
      {shouldCombineMedia && mediaExpanded ? (
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
          className={`block sm:hidden ${
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key="m-trailer"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center w-full h-full"
            >
              {trailerPlaying ? (
                <X />
              ) : (
                <Play className={trailerAvailable ? "ml-0.5" : ""} />
              )}
            </motion.div>
          </AnimatePresence>
        </LiquidButton>
      ) : null}

      {onEpisodeRatings && (!shouldCombineMedia || !mediaExpanded) && (
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
        <div className="hidden sm:block w-px h-8 bg-white/35 mx-1 sm:mx-2 shrink-0 separator" />
      )}

      {/* SLOT 3: TraktWatchedControl en desktop / normal, o Soundtrack si en móvil series está desplegado */}
      {shouldCombineMedia && mediaExpanded ? (
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
          className={`block sm:hidden ${
            soundtrackAvailable ? "!bg-white !text-black" : ""
          }`}
          title={
            soundtrackAvailable ? "Reproducir soundtrack" : "Sin soundtrack"
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key="m-soundtrack"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center w-full h-full"
            >
              <Music2 />
            </motion.div>
          </AnimatePresence>
        </LiquidButton>
      ) : null}

      {trakt && (!shouldCombineMedia || !mediaExpanded) && (
        <TraktWatchedControl
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

      {/* Componente de puntuación con estrellas */}
      {rate && (
        <StarRating
          rating={rate.rating}
          max={rate.max}
          loading={rate.loading}
          onRate={rate.onRate}
          connected={rate.connected}
          onConnect={rate.onConnect}
        />
      )}

      {/* Botón de Favoritos */}
      {onToggleFavorite && (
        <LiquidButton
          onClick={onToggleFavorite}
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

      {/* Botón de Pendientes (Watchlist) */}
      {onToggleWatchlist && (
        <LiquidButton
          onClick={onToggleWatchlist}
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
          disabled={listBusy}
          active={listActive}
          activeColor="emerald"
          groupId="details-actions"
          className={listActive ? "!bg-white !text-black" : ""}
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

      {/* Botón de Reseñas / Comentarios */}
      {showComments && (
        <LiquidButton
          onClick={onComments}
          active={commentsActive}
          activeColor="violet"
          groupId="details-actions"
          className={commentsActive ? "!bg-white !text-black" : ""}
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
  );
}
