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
//   showFavoritedStat: boolean                  (oculta Favoritos cuando no aplica)
//   toolbarActions: ReactNode | null            (acciones inline al final)
//
// `value`/`sub` se pasan ya formateados por el llamante (mismos formatters que la
// ficha: formatCountShort para los sub-labels). Las stats se formatean aquí con
// formatShortNumber para garantizar que ambos consumidores rindan igual.

import { Fragment } from "react";
import { motion } from "framer-motion";
import NextImage from "next/image";
import { Eye, Play, List, Heart, MoreHorizontal } from "lucide-react";

import {
  CompactBadge,
  ExternalLinkButton,
  ActionShareButton,
} from "@/components/details/DetailHeaderBits";
import { formatShortNumber } from "@/lib/details/formatters";
import { LIQUID_GLASS_BAR } from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";

// Badge de estadística de Trakt (Watchers, Plays, Lists, Favorited).
// Movido VERBATIM desde DetailsClient para compartirlo con el modal.
function TraktStatBadge({ icon: Icon, value, label, tooltip }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -1 }}
      className="relative flex min-w-0 items-center justify-start select-none group/statbadge py-1 px-0.5 transition-colors duration-200 sm:shrink-0 sm:px-1.5"
      aria-label={tooltip || label}
    >
      <div className="grid min-w-0 grid-cols-[1rem_auto] grid-rows-[auto_auto] items-center gap-x-1 sm:grid-cols-[1.25rem_auto] sm:gap-x-2">
        <Icon className="col-start-1 row-start-1 h-4 w-4 shrink-0 self-center text-zinc-400 transition-colors duration-200 group-hover/statbadge:text-zinc-200 sm:h-5 sm:w-5" />
        <span className="col-start-2 row-start-1 block self-center text-[11px] font-bold leading-none tracking-tight text-white/90 [font-variant-numeric:tabular-nums] [text-box:trim-both_cap_alphabetic] sm:text-sm">
          {value || "-"}
        </span>
        <span className="col-start-2 row-start-2 mt-1 hidden text-[8px] font-bold uppercase leading-none tracking-widest text-zinc-500 transition-colors duration-200 group-hover/statbadge:text-zinc-400 [text-box:trim-both_cap_alphabetic] sm:block sm:text-[9px]">
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
  const isPendingScore = (score) =>
    !!score && score.pending === true && score.value == null;
  const resolvedValue = (score) =>
    score?.value === undefined ? null : score?.value;
  const scoreStateKey = (name, score) =>
    `${name}-${score?.value == null ? "empty" : "ready"}`;

  return (
    <div className="flex items-center gap-3 sm:gap-5 shrink-0">
      {/* Indicador de carga mientras se obtienen las puntuaciones de Trakt */}
      <div className="absolute opacity-0 pointer-events-none w-4 h-4">
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        ) : null}
      </div>

      {/* Badge de TMDb - Muestra la puntuación promedio y número de votos */}
      {tmdb && !isPendingScore(tmdb) && (
        <CompactBadge
          key={scoreStateKey("tmdb", tmdb)}
          logo="/logo-TMDb.png"
          logoClassName="h-5 sm:h-5"
          value={resolvedValue(tmdb)}
          sub={tmdb.sub}
          href={tmdb.href}
          disableHoverLift
          tooltip={tmdb.href ? "Ver en TMDb" : "TMDb"}
        />
      )}

      {/* Badge de Trakt - Muestra puntuación en formato decimal cuando el usuario está conectado */}
      {trakt && !isPendingScore(trakt) && (
        <CompactBadge
          key={scoreStateKey("trakt", trakt)}
          logo="/logo-Trakt.png"
          value={resolvedValue(trakt)}
          sub={trakt.sub}
          href={trakt.href}
          disableHoverLift
          onClick={undefined}
          tooltip={trakt.href ? "Ver en Trakt" : "Trakt"}
        />
      )}

      {/* Badge de Trakt alternativo cuando no hay conexión pero existe score público */}
      {traktPublic && !isPendingScore(traktPublic) && (
        <CompactBadge
          key={scoreStateKey("trakt-public", traktPublic)}
          logo="/logo-Trakt.png"
          value={resolvedValue(traktPublic)}
          sub={traktPublic.sub}
          disableHoverLift
          onClick={undefined}
          tooltip="Ver en Trakt"
        />
      )}

      {/* Badge de IMDb - Muestra rating y votos, enlaza al título en IMDb */}
      {imdb && !isPendingScore(imdb) && (
        <CompactBadge
          key={scoreStateKey("imdb", imdb)}
          logo="/logo-IMDb.svg"
          logoWrapClassName="min-w-[28px]"
          logoClassName="!h-5 sm:!h-[22px] !max-h-none !max-w-[34px]"
          value={resolvedValue(imdb)}
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
export function DetailsStatsRow({ stats = null, showFavoritedStat = true }) {
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
        overflow-x-auto scrollbar-hide overscroll-x-contain [touch-action:pan-y]
        py-2.5
        pl-[calc(1.25rem+env(safe-area-inset-left))]
        pr-[calc(0.75rem+env(safe-area-inset-right))]
        sm:pl-[calc(1.5rem+env(safe-area-inset-left))]
        sm:pr-[calc(1.25rem+env(safe-area-inset-right))]
        md:overflow-x-visible
      "
      >
        <div className="flex w-max min-w-0 flex-nowrap items-center justify-start gap-x-4 gap-y-1.5 sm:w-full sm:flex-wrap">
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

          {showFavoritedStat && (
            <TraktStatBadge
              icon={Heart}
              value={formatShortNumber(
                stats?.favorited ?? 0,
              )?.toUpperCase() || "0"}
              label="FAVORITOS"
              tooltip="Favoritos"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C. Región de acciones de la barra: separador + enlaces externos + separador +
//    botón de compartir. Markup VERBATIM del bloque original de DetailsClient.
//    - `externalLinks`: array de descriptores { icon, href, title?, fallbackHref?,
//       wrapperClassName?, key? }. Si está vacío/ausente no se pinta la región de
//       enlaces (equivale al modo backdrop de DetailsClient).
//    - `onMoreLinks`: callback del botón "..." móvil (solo se pinta si se pasa).
//    - `share`: { title, text?, url? } -> <ActionShareButton>. Se ancla a la
//       derecha con ml-auto (siempre visible si se pasa).
// ---------------------------------------------------------------------------
// Exportado: DetailsClient lo reutiliza para separar plataformas de enlaces
// externos en el modo de portada backdrop, y así la línea es la MISMA en ambos
// sitios en vez de dos copias que puedan divergir.
export function ToolbarSeparator({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`h-6 w-px shrink-0 bg-white/20 ${className}`}
    />
  );
}

function StreamingProviderButton({ provider }) {
  if (!provider?.icon || !provider?.href) return null;

  return (
    <motion.a
      href={provider.href}
      target="_blank"
      rel="noreferrer"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.1 }}
      aria-label={provider.title}
      title={provider.title}
      className="group/stream relative block shrink-0 transition hover:brightness-110"
    >
      <span className="relative block h-7 w-7 overflow-hidden rounded-xl bg-black/20 shadow-lg lg:h-8 lg:w-8">
        <NextImage
          src={provider.icon}
          alt=""
          fill
          sizes="32px"
          className="object-cover"
          loading="lazy"
        />
      </span>

      <div className="pointer-events-none absolute top-full left-1/2 z-[100] mt-2 -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/stream:scale-100 group-hover/stream:opacity-100 group-hover/stream:delay-[2000ms]">
        {provider.title}
      </div>
    </motion.a>
  );
}

function DetailsToolbarActions({
  externalLinks = null,
  streamingProviders = null,
  onMoreLinks,
  share = null,
  toolbarActions = null,
}) {
  const hasExternalLinks =
    Array.isArray(externalLinks) && externalLinks.length > 0;
  const hasStreamingProviders =
    Array.isArray(streamingProviders) && streamingProviders.length > 0;
  const hasInlineActions = hasExternalLinks || hasStreamingProviders;

  return (
    <>
      {/* ========== Separador vertical 1 + ENLACES EXTERNOS / STREAMING ========== */}
      {hasInlineActions && (
        <>
          <div className="flex flex-1 items-center justify-center sm:block sm:flex-none">
            <ToolbarSeparator />
          </div>

          <div className="min-w-0 flex flex-none items-center justify-end gap-2.5 sm:flex-1 sm:gap-3">
            {/* Versión Desktop: plataformas primero, enlaces externos después */}
            <div className="hidden sm:flex items-center gap-2.5 sm:gap-3">
              {hasStreamingProviders && (
                <div className="flex items-center gap-2.5 sm:gap-3">
                  {streamingProviders.map((provider, i) => (
                    <StreamingProviderButton
                      key={provider.key ?? `${provider.title}-${i}`}
                      provider={provider}
                    />
                  ))}
                </div>
              )}

              {hasStreamingProviders && hasExternalLinks && (
                <ToolbarSeparator className="mx-0.5" />
              )}

              {hasExternalLinks && (
                <>
                  {externalLinks.map((link, i) => {
                    const key = link.key ?? `${link.icon}-${i}`;
                    const btn = (
                      <ExternalLinkButton
                        icon={link.icon}
                        title={link.title}
                        href={link.href}
                        fallbackHref={link.fallbackHref}
                      />
                    );
                    return link.wrapperClassName ? (
                      <div key={key} className={link.wrapperClassName}>
                        {btn}
                      </div>
                    ) : (
                      <Fragment key={key}>{btn}</Fragment>
                    );
                  })}
                </>
              )}
            </div>

            {/* Versión Móvil: botón "..." que abre modal de enlaces */}
            {onMoreLinks && (
              <button
                type="button"
                onClick={onMoreLinks}
                className="sm:hidden flex isolate transform-gpu items-center justify-center w-10 h-10 rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200 transition-all duration-300 hover:text-white hover:bg-white/10"
                title="Enlaces"
                aria-label="Abrir enlaces externos"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            )}
          </div>

          {share && <ToolbarSeparator className="hidden md:block" />}
        </>
      )}

      {/* ========== Botón de Compartir (anclado a la derecha con ml-auto) ========== */}
      {share && (
        <div className="shrink-0 sm:ml-auto max-sm:[&>button]:!grid max-sm:[&>button]:!place-items-center max-sm:[&>button]:!isolate max-sm:[&>button]:!transform-gpu max-sm:[&>button]:!overflow-hidden max-sm:[&>button]:!w-10 max-sm:[&>button]:!h-10 max-sm:[&>button]:!p-0 max-sm:[&>button]:!rounded-full max-sm:[&>button]:!border-0 max-sm:[&>button]:!ring-0 max-sm:[&>button]:!outline-none max-sm:[&>button]:[-webkit-tap-highlight-color:transparent] max-sm:[&>button]:!bg-black/[0.04] max-sm:[&>button]:!bg-gradient-to-br max-sm:[&>button]:!from-white/10 max-sm:[&>button]:!via-transparent max-sm:[&>button]:!to-black/10 max-sm:[&>button]:!backdrop-blur-[6px] max-sm:[&>button]:!shadow-none max-sm:[&>button]:!text-zinc-200 max-sm:[&>button]:!transition-all max-sm:[&>button]:!duration-300 hover:max-sm:[&>button]:!text-white hover:max-sm:[&>button]:!bg-white/[0.08] hover:max-sm:[&>button]:!-translate-y-0.5 hover:max-sm:[&>button]:!border-0 hover:max-sm:[&>button]:!ring-0 focus:max-sm:[&>button]:!outline-none focus:max-sm:[&>button]:!border-0 focus:max-sm:[&>button]:!ring-0 active:max-sm:[&>button]:!border-0 active:max-sm:[&>button]:!ring-0 max-sm:[&>button>span]:!hidden max-sm:[&>button>svg]:!block max-sm:[&>button>svg]:!h-5 max-sm:[&>button>svg]:!w-5 max-sm:[&>button>svg]:!shrink-0">
          <ActionShareButton
            title={share.title}
            text={share.text}
            url={share.url}
          />
        </div>
      )}

      {toolbarActions && (
        <>
          <ToolbarSeparator />
          <div className="flex-1 min-w-0" />
          <ToolbarSeparator className="hidden sm:block" />
          <div className="flex shrink-0 items-center gap-3 [&_[data-liquid-button]_.text-xl]:!text-[22px] [&_[data-liquid-button]_svg]:!h-[22px] [&_[data-liquid-button]_svg]:!w-[22px]">
            {toolbarActions}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel compuesto: contenedor + barra (ratings + enlaces/compartir) + stats +
// `children`. Reproduce la tarjeta de DetailsClient; la usan tanto la ficha
// (DetailsClient) como el modal del dashboard.
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
  showFavoritedStat = true,
  externalLinks = null,
  streamingProviders = null,
  onMoreLinks,
  share = null,
  toolbarActions = null,
  className = "",
  children = null,
}) {
  const hasRatings = !!(tmdb || trakt || traktPublic || imdb || rt || mc);
  const hasStats = Object.values(stats || {}).some(
    (v) => typeof v === "number",
  );
  const hasExternalLinks =
    Array.isArray(externalLinks) && externalLinks.length > 0;
  const hasStreamingProviders =
    Array.isArray(streamingProviders) && streamingProviders.length > 0;
  const hasToolbar =
    hasRatings ||
    hasExternalLinks ||
    hasStreamingProviders ||
    !!share ||
    !!toolbarActions;

  if (!hasToolbar && !hasStats && !children) return null;

  return (
    <div
      className={`relative isolate w-full overflow-hidden rounded-2xl ${LIQUID_GLASS_BAR} ${className}`}
    >
      {/* Refracción, reflejo especular y luz difusa compartidos con InfoTabs. */}
      <LiquidGlassOpticalLayers />

      {hasToolbar && (
        <div
          className="
      relative z-10
      py-3
      pl-[calc(1.25rem+env(safe-area-inset-left))]
      pr-[calc(0.75rem+env(safe-area-inset-right))]
      sm:pl-[calc(1.5rem+env(safe-area-inset-left))]
      sm:pr-[calc(1.25rem+env(safe-area-inset-right))]
      flex items-center gap-2.5 sm:gap-4
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

          <DetailsToolbarActions
            externalLinks={externalLinks}
            streamingProviders={streamingProviders}
            onMoreLinks={onMoreLinks}
            share={share}
            toolbarActions={toolbarActions}
          />
        </div>
      )}

      <DetailsStatsRow stats={stats} showFavoritedStat={showFavoritedStat} />

      {children}
    </div>
  );
}
