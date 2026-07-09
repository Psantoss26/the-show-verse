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

import LiquidButton from "@/components/LiquidButton";
import StarRating from "@/components/StarRating";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import {
  Play,
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
const BASE_ROW_CLASS = `flex flex-nowrap items-center justify-center sm:justify-start gap-1.5 sm:gap-3 w-full
                [&>*:not(.separator)]:flex-1 [&>*:not(.separator)]:min-w-[34px] [&>*:not(.separator)]:max-w-[48px] sm:[&>*:not(.separator)]:max-w-[52px]
                [&_[data-liquid-button]]:!w-full [&_[data-liquid-button]]:!h-auto [&_[data-liquid-button]]:aspect-square [&_[data-liquid-button]]:[container-type:inline-size]
                [&_[data-liquid-button]_svg]:!w-[46cqw] [&_[data-liquid-button]_svg]:!h-[46cqw] sm:[&_[data-liquid-button]_svg]:!w-[22px] sm:[&_[data-liquid-button]_svg]:!h-[22px]
                [&_[data-liquid-button]_.text-xl]:!text-[42cqw] sm:[&_[data-liquid-button]_.text-xl]:!text-[22px]
                [&_[data-liquid-button]_.text-2xl]:!text-[46cqw] sm:[&_[data-liquid-button]_.text-2xl]:!text-[24px]
                [&_[data-liquid-button]_.text-lg]:!text-[38cqw] sm:[&_[data-liquid-button]_.text-lg]:!text-[18px]
                [&_[data-liquid-button]_.text-xs]:!text-[22cqw] sm:[&_[data-liquid-button]_.text-xs]:!text-[12px]`;

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

  onTrailer,
  trailerAvailable = false,
  trailerLoading,

  onSoundtrack,
  soundtrackAvailable = false,

  onEpisodeRatings,
  episodeRatingsOpen = false,

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
  return (
    <div className={className ? `${BASE_ROW_CLASS} ${className}` : BASE_ROW_CLASS}>
      {/* Botón de reproducción de tráiler - Solo habilitado si hay video disponible */}
      {onTrailer && (
        <LiquidButton
          onClick={onTrailer}
          disabled={!trailerAvailable}
          active={!!trailerAvailable}
          loading={trailerLoading}
          activeColor="yellow"
          groupId="details-actions"
          className={trailerAvailable ? "!bg-white !text-black" : ""}
          title={trailerAvailable ? "Ver Tráiler" : "Sin Tráiler"}
        >
          <Play
            className={`fill-current ${trailerAvailable ? "ml-0.5 sm:ml-1" : ""}`}
          />
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
          className={soundtrackAvailable ? "!bg-white !text-black" : ""}
          title={
            soundtrackAvailable ? "Reproducir soundtrack" : "Sin soundtrack"
          }
        >
          <Music2 />
        </LiquidButton>
      )}

      {/* Acceso rápido a la tabla de valoraciones, solo para series. */}
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

      {/* Separador vertical entre los controles multimedia y Trakt */}
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
