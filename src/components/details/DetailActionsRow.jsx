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
    <>
      {/* VISTA MÓVIL EXCLUSIVA PARA SERIES COMBINADAS (DESPLAZAMIENTO FLUIDO SIN DEFORMACIÓN DE FORMA) */}
      {shouldCombineMedia && (
        <div className="block sm:hidden w-full">
          <div
            className={`flex flex-nowrap items-center justify-between w-full ${mobileGapClass} [&>*:not(.separator)]:flex-1 [&>*:not(.separator)]:min-w-[34px] [&>*:not(.separator)]:max-w-[60px]`}
          >
            {/* 1. Botón Disparador Principal (Play -> X al expandir) */}
            <motion.div
              layout="position"
              key="trigger-slot"
              className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
            >
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
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mediaExpanded ? "close" : "play"}
                    initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
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
            </motion.div>

            {/* 2 & 3. Botones Tráiler y Soundtrack (Se muestran al expandir sin deformar la forma) */}
            <AnimatePresence mode="popLayout">
              {mediaExpanded && (
                <>
                  {/* Ver Tráiler */}
                  <motion.div
                    layout="position"
                    key="m-trailer-btn"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
                  >
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
                  </motion.div>

                  {/* Soundtrack */}
                  <motion.div
                    layout="position"
                    key="m-soundtrack-btn"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
                  >
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
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* 4. Valoración de episodios */}
            {onEpisodeRatings && (
              <motion.div
                layout="position"
                key="m-ratings-slot"
                className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
              >
                <LiquidButton
                  onClick={onEpisodeRatings}
                  active
                  activeColor="yellow"
                  groupId="details-actions"
                  className="!bg-white !text-black !w-full !h-auto aspect-square"
                  title="Valoración de episodios"
                  aria-label="Abrir valoración de episodios"
                  aria-haspopup="dialog"
                  aria-expanded={episodeRatingsOpen}
                >
                  <BarChart3 />
                </LiquidButton>
              </motion.div>
            )}

            {/* 5. Trakt Watched Control (Episodios Vistos) */}
            {trakt && (
              <motion.div
                layout="position"
                key="m-trakt-slot"
                className="flex-1 min-w-[34px] max-w-[60px]"
              >
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
              </motion.div>
            )}

            {/* 6. Star Rating */}
            {rate && (
              <motion.div
                layout="position"
                key="m-rate-slot"
                className="flex-1 min-w-[34px] max-w-[60px]"
              >
                <StarRating
                  rating={rate.rating}
                  max={rate.max}
                  loading={rate.loading}
                  onRate={rate.onRate}
                  connected={rate.connected}
                  onConnect={rate.onConnect}
                />
              </motion.div>
            )}

            {/* 7. Favorito */}
            {onToggleFavorite && (
              <motion.div
                layout="position"
                key="m-fav-slot"
                className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
              >
                <LiquidButton
                  onClick={onToggleFavorite}
                  disabled={favoriteLoading}
                  active={favorite}
                  activeColor="red"
                  groupId="details-actions"
                  className="!w-full !h-auto aspect-square"
                  title={
                    favoriteLoading
                      ? "Cargando estado de favoritos..."
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
              </motion.div>
            )}

            {/* 8. Pendiente (Watchlist) */}
            {onToggleWatchlist && (
              <motion.div
                layout="position"
                key="m-watchlist-slot"
                className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
              >
                <LiquidButton
                  onClick={onToggleWatchlist}
                  disabled={watchlistLoading}
                  active={watchlist}
                  activeColor="blue"
                  groupId="details-actions"
                  className="!w-full !h-auto aspect-square"
                  title={
                    watchlistLoading
                      ? "Cargando estado de pendientes..."
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
              </motion.div>
            )}

            {/* 9 & 10. Añadir a Lista y Reseñas (Ocultos al expandir con popLayout sin deformar la forma) */}
            <AnimatePresence mode="popLayout">
              {!mediaExpanded && (
                <>
                  {onAddToList && (
                    <motion.div
                      layout="position"
                      key="m-list-slot"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
                    >
                      <LiquidButton
                        onClick={onAddToList}
                        disabled={listBusy}
                        active={listActive}
                        activeColor="emerald"
                        groupId="details-actions"
                        className={`!w-full !h-auto aspect-square ${
                          listActive ? "!bg-white !text-black" : ""
                        }`}
                        title={
                          listBusy
                            ? "Comprobando listas..."
                            : listActive
                              ? "Gestionar en listas"
                              : "Añadir a lista"
                        }
                      >
                        {listBusy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <ListVideo />
                        )}
                      </LiquidButton>
                    </motion.div>
                  )}

                  {showComments && (
                    <motion.div
                      layout="position"
                      key="m-comments-slot"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="flex-1 min-w-[34px] max-w-[60px] aspect-square"
                    >
                      <LiquidButton
                        onClick={onComments}
                        active={commentsActive}
                        activeColor="violet"
                        groupId="details-actions"
                        className={`!w-full !h-auto aspect-square ${
                          commentsActive ? "!bg-white !text-black" : ""
                        }`}
                        title={
                          commentsActive
                            ? "Ver reseñas de la comunidad (tienes reseñas)"
                            : "Ver reseñas de la comunidad"
                        }
                      >
                        <MessageSquare />
                      </LiquidButton>
                    </motion.div>
                  )}
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* VISTA ESTÁNDAR (ESCRITORIO Y PELÍCULAS) */}
      <div className={shouldCombineMedia ? `hidden sm:flex ${rowClass}` : rowClass}>
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
          <div className="hidden sm:block w-px h-8 bg-white/35 mx-1 sm:mx-2 shrink-0 separator" />
        )}

        {/* Control de visto/no visto en Trakt */}
        {trakt && (
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

        {/* Puntuación con estrellas */}
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

        {/* Favoritos */}
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

        {/* Pendientes */}
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

        {/* Reseñas / Comentarios */}
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
    </>
  );
}
