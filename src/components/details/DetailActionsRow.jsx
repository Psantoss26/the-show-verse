"use client";

// /src/components/details/DetailActionsRow.jsx
// Fila de botones de acción principal de la ficha (tráiler, soundtrack, valoración
// de episodios, control de visto en Trakt, puntuación, favorito, pendiente, listas
// y reseñas). Componente 100% PRESENTACIONAL: toda la lógica/estado vive en el
// consumidor (DetailsClient o DetailModal), que pasa handlers + flags por props.
//
// Se extrajo VERBATIM de DetailsClient para que ambas superficies (ficha completa
// y ficha rápida del dashboard) rendericen la MISMA fila con idéntico estilo.
// Cada botón se renderiza SOLO si se le pasa su handler/flag correspondiente, de
// modo que DetailsClient muestra el set completo y el modal el subconjunto que
// desee, sin re-estilar nada.

import { useState, useRef, useEffect } from "react";
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

/**
 * Botón combinado de Tráiler + Soundtrack para la vista móvil de series.
 * Muestra el icono de tráiler y, al pulsarlo, cambia su icono a 'X' y despliega
 * de forma fluida una sección hacia la derecha albergando los botones de Tráiler y Soundtrack.
 */
function CombinedMediaButton({
  onTrailer,
  trailerAvailable,
  trailerLoading,
  trailerPlaying,
  onSoundtrack,
  soundtrackAvailable,
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [expanded]);

  const handleMainClick = () => {
    setExpanded((prev) => !prev);
  };

  const handleTrailerClick = (e) => {
    e.stopPropagation();
    setExpanded(false);
    if (onTrailer) onTrailer();
  };

  const handleSoundtrackClick = (e) => {
    e.stopPropagation();
    setExpanded(false);
    if (onSoundtrack) onSoundtrack();
  };

  return (
    <div
      ref={containerRef}
      className="relative block sm:hidden flex-1 min-w-[34px] max-w-[60px] aspect-square"
    >
      {/* Sección desplegada HACIA LA DERECHA */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, x: -12, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12, scale: 0.88 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-[calc(100%+6px)] top-1/2 -translate-y-1/2 z-[100] flex items-center gap-1.5 p-1 rounded-2xl bg-black/80 bg-gradient-to-r from-white/15 via-white/5 to-black/80 backdrop-blur-xl border border-white/15 shadow-[0_8px_28px_rgba(0,0,0,0.75)]"
          >
            {/* Botón Ver Tráiler */}
            <LiquidButton
              onClick={handleTrailerClick}
              disabled={!trailerAvailable}
              active={!!trailerAvailable}
              loading={trailerLoading}
              activeColor="yellow"
              groupId="details-actions"
              className={`!w-9 !h-9 aspect-square ${
                trailerAvailable ? "!bg-white !text-black shadow-md" : ""
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
                <X className="w-4 h-4" />
              ) : (
                <Play className={`w-4 h-4 ${trailerAvailable ? "ml-0.5" : ""}`} />
              )}
            </LiquidButton>

            {/* Botón Soundtrack */}
            <LiquidButton
              onClick={handleSoundtrackClick}
              disabled={!soundtrackAvailable}
              active={!!soundtrackAvailable}
              activeColor="yellow"
              groupId="details-actions"
              className={`!w-9 !h-9 aspect-square ${
                soundtrackAvailable ? "!bg-white !text-black shadow-md" : ""
              }`}
              title={
                soundtrackAvailable
                  ? "Reproducir soundtrack"
                  : "Sin soundtrack"
              }
            >
              <Music2 className="w-4 h-4" />
            </LiquidButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botón principal inicial (Tráiler -> pasa a 'X' al desplegar) */}
      <LiquidButton
        onClick={handleMainClick}
        disabled={!trailerAvailable && !soundtrackAvailable}
        active={!!trailerAvailable || !!soundtrackAvailable}
        loading={trailerLoading}
        activeColor="yellow"
        groupId="details-actions"
        className={`!w-full !h-auto aspect-square ${
          trailerAvailable || soundtrackAvailable ? "!bg-white !text-black" : ""
        } ${
          expanded
            ? "ring-2 ring-yellow-400/90 shadow-[0_0_14px_rgba(250,204,21,0.6)]"
            : ""
        }`}
        title={
          expanded
            ? "Cerrar opciones multimedia"
            : "Opciones multimedia (Tráiler y Soundtrack)"
        }
        aria-expanded={expanded}
        aria-haspopup="true"
      >
        {expanded ? (
          <X />
        ) : trailerPlaying ? (
          <X />
        ) : (
          <Play className={trailerAvailable ? "ml-0.5" : ""} />
        )}
      </LiquidButton>
    </div>
  );
}

// Contenedor con el mismo escalado responsivo (container queries) que la fila
// original de DetailsClient. Se mantiene idéntico para no re-estilar.
// NOTA: los selectores excluyen `.labeled` además de `.separator`. Un botón
// "labeled" (p. ej. el tráiler con texto en la preview del dashboard) no debe
// heredar el tamaño cuadrado/tope de ancho de los botones-icono. Si no hay
// ningún hijo `.labeled` el comportamiento es idéntico al anterior.
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
 *
 * @param {object}   props
 * @param {string}   [props.className]        Clase extra a añadir al contenedor.
 * @param {boolean}  [props.showSeparator=true] Muestra el separador vertical.
 *
 * @param {Function} [props.onTrailer]        Click en "Ver tráiler".
 * @param {boolean}  [props.trailerAvailable] ¿Hay tráiler? (habilita/estiliza).
 * @param {boolean}  [props.trailerLoading]   Estado de carga del tráiler (opcional).
 *
 * @param {Function} [props.onSoundtrack]     Click en soundtrack.
 * @param {boolean}  [props.soundtrackAvailable] ¿Hay soundtrack?
 *
 * @param {Function} [props.onEpisodeRatings] Click en "Valoración de episodios" (TV).
 * @param {boolean}  [props.episodeRatingsOpen] aria-expanded del botón anterior.
 *
 * @param {object}   [props.trakt]            TraktWatchedControl:
 *                                            { connected, watched, plays, badge, busy, loading, onOpen }.
 * @param {object}   [props.rate]             StarRating (Puntuar):
 *                                            { rating, max, loading, onRate, connected, onConnect }.
 *
 * @param {boolean}  [props.favorite]         Estado favorito.
 * @param {boolean}  [props.favoriteLoading]  Cargando favorito.
 * @param {Function} [props.onToggleFavorite] Alternar favorito.
 *
 * @param {boolean}  [props.watchlist]        Estado pendiente.
 * @param {boolean}  [props.watchlistLoading] Cargando pendiente.
 * @param {Function} [props.onToggleWatchlist] Alternar pendiente.
 *
 * @param {Function} [props.onAddToList]      Abrir "Añadir a lista".
 * @param {boolean}  [props.listBusy]         Cargando presencia en listas.
 * @param {boolean}  [props.listActive]       ¿Está en alguna lista?
 *
 * @param {boolean}  [props.showComments]     Mostrar botón de reseñas (Trakt conectado).
 * @param {boolean}  [props.commentsActive]   ¿El usuario ya tiene reseñas?
 * @param {Function} [props.onComments]       Abrir modal de reseñas.
 */
export default function DetailActionsRow({
  className = "",
  showSeparator = true,
  // En móvil, por defecto cada botón se limita a 60px (evita botones enormes en
  // la ficha completa). Con `fillMobile` se quita ese tope para que los botones
  // crezcan y ocupen TODO el ancho disponible (usado en el modal del dashboard,
  // más ancho, donde con el tope quedaban centrados dejando huecos laterales).
  fillMobile = false,
  // Separación entre botones en móvil (en sm+ siempre es gap-3). Por defecto
  // gap-1 (como DetailsClient); el modal la sube un poco para no verlos pegados.
  mobileGapClass = "gap-1",
  // Tamaño de los botones-icono en modo "labeled-row" (píldora de tráiler +
  // iconos): "md" es el tamaño original de las previews del dashboard; "lg" los
  // agranda (usado en FeaturedHero, una superficie grande).
  size = "md",

  onTrailer,
  trailerAvailable = false,
  trailerLoading,
  // Si se pasa, el botón de tráiler se muestra como PÍLDORA con texto (icono +
  // etiqueta) en vez de icono-only. Solo lo usa la preview del dashboard;
  // DetailModal y DetailsClient lo omiten y mantienen el icono.
  trailerLabel = null,
  // Estado "reproduciendo": cambia el botón a X + "Ocultar" mientras el tráiler
  // se está reproduciendo (la preview del dashboard lo pasa = showTrailer).
  trailerPlaying = false,

  // Píldora de REPRODUCCIÓN (Continuar viendo): { label, onPlay, title }. Ocupa el
  // MISMO slot que el tráiler (mutuamente excluyente con onTrailer): en vez de "Ver
  // tráiler" muestra "Reproducir T·E" y reproduce el episodio/película en curso.
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
  // Tamaño de los botones-icono en labeled-row (w-10/h-10 por defecto; w-12/h-12
  // + icono mayor en "lg"). Se aplica solo cuando la fila es labeled-row.
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

      {/* Botón combinado Tráiler + Soundtrack para la vista móvil de series */}
      {shouldCombineMedia && (
        <CombinedMediaButton
          onTrailer={onTrailer}
          trailerAvailable={trailerAvailable}
          trailerLoading={trailerLoading}
          trailerPlaying={trailerPlaying}
          onSoundtrack={onSoundtrack}
          soundtrackAvailable={soundtrackAvailable}
        />
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

      {/* Botón de música/soundtrack - Abre canciones encontradas en Spotify */}
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

      {/* Control de visto/no visto en Trakt - Muestra estado de visualización y plays */}
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

      {/* Componente de puntuación con estrellas - Rating unificado TMDb + Trakt */}
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

      {/* Botón de Favoritos - Añade o quita el contenido de la lista de favoritos del usuario */}
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
            <Heart className={`${favorite ? "fill-current" : ""}`} />
          )}
        </LiquidButton>
      )}

      {/* Botón de Watchlist - Añade o quita el contenido de la lista de pendientes */}
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
                ? "Quitar de pendientes"
                : "Añadir a pendientes"
          }
          aria-label={
            watchlistLoading
              ? "Cargando estado de pendientes"
              : watchlist
                ? "Quitar de pendientes"
                : "Añadir a pendientes"
          }
        >
          {watchlistLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <BookmarkPlus className={`${watchlist ? "fill-current" : ""}`} />
          )}
        </LiquidButton>
      )}

      {/* Botón de añadir a listas personalizadas - Solo visible si el usuario tiene acceso a listas */}
      {onAddToList && (
        <LiquidButton
          onClick={onAddToList}
          disabled={listBusy}
          active={listActive}
          activeColor="purple"
          groupId="details-actions"
          title="Añadir a lista"
        >
          {listBusy ? <Loader2 className="animate-spin" /> : <ListVideo />}
        </LiquidButton>
      )}

      {/* Botón de Reseñas / Comentarios en Trakt */}
      {showComments && onComments && (
        <LiquidButton
          onClick={onComments}
          active={commentsActive}
          activeColor="orange"
          groupId="details-actions"
          title="Escribir reseña en Trakt"
          aria-label="Escribir reseña en Trakt"
        >
          <MessageSquare />
        </LiquidButton>
      )}
    </div>
  );
}
