"use client";

// src/components/details/DetailsScoreboardPanel.jsx
//
// Componente PRESENTACIONAL compartido para el "scoreboard" de puntuaciones +
// estadísticas de comunidad. Es la ÚNICA fuente de verdad del bloque, para que
// la ficha completa (DetailsClient) y el modal del dashboard (DetailModal) se
// vean IDÉNTICOS.
//
// El markup (clases/wrappers/orden de los badges) es VERBATIM del bloque
// original de DetailsClient; solo los DATOS se parametrizan por props.
//
// Interfaz de props (todo opcional; cada pieza se oculta si su dato es null):
//   loading:     boolean  -> spinner (placeholder invisible, igual que la ficha)
//   tmdb:        { value, sub, href } | null   (badge TMDb)
//   trakt:       { value, sub, href } | null   (badge Trakt "conectado")
//   traktPublic: { value, sub } | null         (badge Trakt público sin conexión)
//   imdb:        { value, sub, href } | null    (badge IMDb)
//   rt:          { value } | null               (badge Rotten Tomatoes, solo >= sm)
//   mc:          { value } | null               (badge Metacritic, solo >= sm)
//   stats:       { watchers, plays, lists, favorited } | null  (fila de stats)
//
// `value`/`sub` se pasan ya formateados por el llamante (mismos formatters que la
// ficha: formatCountShort para los sub-labels). Las stats se formatean aquí con
// formatShortNumber para garantizar que ambos consumidores rindan igual.

import { motion } from "framer-motion";
import { Eye, Play, List, Heart } from "lucide-react";

import { CompactBadge } from "@/components/details/DetailHeaderBits";
import { formatShortNumber } from "@/lib/details/formatters";

// Badge de estadística de Trakt (Watchers, Plays, Lists, Favorited).
// Movido VERBATIM desde DetailsClient para compartirlo con el modal.
function TraktStatBadge({ icon: Icon, value, label, tooltip }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -1 }}
      className="relative flex items-center gap-2 select-none shrink-0 group/statbadge py-1 px-1.5 transition-colors duration-200"
      aria-label={tooltip || label}
    >
      <Icon className="h-5 w-5 text-zinc-400 transition-colors duration-200 group-hover/statbadge:text-zinc-200" />
      <div className="flex flex-col min-w-0 justify-center">
        <span className="text-xs sm:text-sm font-bold tracking-tight text-white/90 leading-tight">
          {value || "-"}
        </span>
        <span className="hidden sm:block text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-zinc-500 mt-0.5 leading-none transition-colors duration-200 group-hover/statbadge:text-zinc-400">
          {label}
        </span>
      </div>
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full mb-2.5 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1.2 text-[10px] font-bold text-white opacity-0 shadow-2xl transition-all duration-200 ease-out group-hover/statbadge:scale-100 group-hover/statbadge:opacity-100 group-hover/statbadge:delay-[1500ms]">
          {tooltip}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// A. RATINGS - Fila de badges de puntuaciones (TMDb, Trakt, IMDb, RT, Metacritic)
//    Markup VERBATIM del bloque original; los datos vienen por props.
// ---------------------------------------------------------------------------
export function DetailsRatingsBadges({
  loading = false,
  tmdb = null,
  trakt = null,
  traktPublic = null,
  imdb = null,
  rt = null,
  mc = null,
}) {
  return (
    <div className="flex items-center gap-4 sm:gap-5 shrink-0">
      {/* Indicador de carga mientras se obtienen las puntuaciones de Trakt */}
      <div className="absolute opacity-0 pointer-events-none w-4 h-4">
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        ) : null}
      </div>

      {/* Badge de TMDb - Muestra la puntuación promedio y número de votos */}
      {tmdb && (
        <CompactBadge
          logo="/logo-TMDb.png"
          logoClassName="h-5 sm:h-5"
          value={tmdb.value}
          sub={tmdb.sub}
          href={tmdb.href}
          disableHoverLift
          tooltip={tmdb.href ? "Ver en TMDb" : "TMDb"}
        />
      )}

      {/* Badge de Trakt - Muestra puntuación en formato decimal cuando el usuario está conectado */}
      {trakt && (
        <CompactBadge
          logo="/logo-Trakt.png"
          value={trakt.value}
          sub={trakt.sub}
          href={trakt.href}
          animateOnMount={false}
          disableHoverLift
          onClick={undefined}
          tooltip={trakt.href ? "Ver en Trakt" : "Trakt"}
        />
      )}

      {/* Badge de Trakt alternativo cuando no hay conexión pero existe score público */}
      {traktPublic && (
        <CompactBadge
          logo="/logo-Trakt.png"
          value={traktPublic.value}
          sub={traktPublic.sub}
          animateOnMount={false}
          disableHoverLift
          onClick={undefined}
          tooltip="Ver en Trakt"
        />
      )}

      {/* Badge de IMDb - Muestra rating y votos, enlaza al título en IMDb */}
      {imdb && (
        <CompactBadge
          logo="/logo-IMDb.svg"
          logoWrapClassName="min-w-[28px]"
          logoClassName="!h-5 sm:!h-[22px] !max-h-none !max-w-[34px]"
          value={imdb.value}
          sub={imdb.sub}
          href={imdb.href}
          disableHoverLift
          tooltip={imdb.href ? "Ver en IMDb" : "IMDb"}
        />
      )}

      {/* Badge de Rotten Tomatoes - Solo visible en desktop (>= sm) */}
      {rt && (
        <div className="hidden sm:block">
          <CompactBadge
            logo="/logo-RottenTomatoes.png"
            value={rt.value}
            suffix="%"
            tooltip="Rotten Tomatoes"
          />
        </div>
      )}

      {/* Badge de Metacritic - Solo visible en desktop (>= sm) */}
      {mc && (
        <div className="hidden sm:block">
          <CompactBadge
            logo="/logo-Metacritic.png"
            value={mc.value}
            suffix="/100"
            tooltip="Metacritic"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// B. FOOTER DE ESTADÍSTICAS (Watchers, Plays, Lists, Favorited)
//    Markup VERBATIM del bloque original; los datos vienen por props.
// ---------------------------------------------------------------------------
export function DetailsStatsRow({ stats = null }) {
  // Mostrar cuando hay stats numéricas (incluyendo de cache stale)
  const hasStats = Object.values(stats || {}).some(
    (v) => typeof v === "number",
  );
  if (!hasStats) return null;

  return (
    <div className="relative z-10 border-t border-white/5 bg-black/[0.04] rounded-b-2xl">
      {/* Scroller con padding + safe-area para que no se recorte en bordes */}
      <div
        className="
        overflow-x-auto scrollbar-hide overscroll-x-contain [touch-action:pan-x]
        py-2.5
        pl-[calc(1rem+env(safe-area-inset-left))]
        pr-[calc(1rem+env(safe-area-inset-right))]
        md:overflow-x-visible
      "
      >
        {/* Contenedor interno con flex-wrap para que se distribuya en línea y optimice el espacio */}
        <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1.5">
          {/* Watchers - Usuarios que siguen este contenido */}
          <TraktStatBadge
            icon={Eye}
            value={formatShortNumber(
              stats?.watchers ?? 0,
            )?.toUpperCase() || "0"}
            label="SEGUIDORES"
            tooltip="Seguidores"
          />

          {/* Plays - Número de reproducciones totales */}
          <TraktStatBadge
            icon={Play}
            value={formatShortNumber(
              stats?.plays ?? 0,
            )?.toUpperCase() || "0"}
            label="REPRODUCCIONES"
            tooltip="Reproducciones"
          />

          {/* Lists - Cantidad de listas que incluyen este contenido */}
          <TraktStatBadge
            icon={List}
            value={formatShortNumber(
              stats?.lists ?? 0,
            )?.toUpperCase() || "0"}
            label="LISTAS"
            tooltip="En listas"
          />

          {/* Favorited - Usuarios que lo han marcado como favorito */}
          <TraktStatBadge
            icon={Heart}
            value={formatShortNumber(
              stats?.favorited ?? 0,
            )?.toUpperCase() || "0"}
            label="FAVORITOS"
            tooltip="Favoritos"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel compuesto: contenedor + fila de ratings + fila de stats + `children`.
// Reproduce la tarjeta de DetailsClient para usarse en el modal del dashboard.
// `children` se renderiza al final (p. ej. la fila de "plataformas disponibles").
// ---------------------------------------------------------------------------
export default function DetailsScoreboardPanel({
  loading = false,
  tmdb = null,
  trakt = null,
  traktPublic = null,
  imdb = null,
  rt = null,
  mc = null,
  stats = null,
  className = "",
  children = null,
}) {
  const hasRatings = !!(tmdb || trakt || traktPublic || imdb || rt || mc);
  const hasStats = Object.values(stats || {}).some(
    (v) => typeof v === "number",
  );

  if (!hasRatings && !hasStats && !children) return null;

  return (
    <div
      className={`relative isolate w-full overflow-hidden rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 shadow-none backdrop-blur-[4px] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
        style={{
          WebkitMaskImage: "-webkit-radial-gradient(white, black)",
        }}
      />

      {hasRatings && (
        <div
          className="
      relative z-10
      py-3
      pl-[calc(1rem+env(safe-area-inset-left))]
      pr-[calc(1.25rem+env(safe-area-inset-right))]
      sm:px-4
      flex items-center gap-3 sm:gap-4
      overflow-x-clip sm:overflow-visible overscroll-none [touch-action:pan-y]
    "
        >
          <DetailsRatingsBadges
            loading={loading}
            tmdb={tmdb}
            trakt={trakt}
            traktPublic={traktPublic}
            imdb={imdb}
            rt={rt}
            mc={mc}
          />
        </div>
      )}

      <DetailsStatsRow stats={stats} />

      {children}
    </div>
  );
}
