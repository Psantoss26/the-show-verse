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
import { Eye, Play, List, Heart, MoreHorizontal, MonitorPlay } from "lucide-react";

import {
  CompactBadge,
  ExternalLinkButton,
  ActionShareButton,
} from "@/components/details/DetailHeaderBits";
import { formatShortNumber } from "@/lib/details/formatters";
import { LIQUID_GLASS_SURFACE } from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";

// Badge de estadística de Trakt (Watchers, Plays, Lists, Favorited).
// Movido VERBATIM desde DetailsClient para compartirlo con el modal.
function TraktStatBadge({ icon: Icon, value, label, tooltip, pending = false }) {
  return (
    <motion.div
      // Ver la nota de DetailAtoms: nada de entrada propia, o el panel se ve
      // vacío mientras sus estadísticas hacen el fundido.
      initial={false}
      whileHover={{ y: -1 }}
      className="relative flex min-w-0 items-center justify-start select-none group/statbadge py-1 px-0.5 transition-colors duration-200 sm:shrink-0 sm:px-1.5"
      aria-label={tooltip || label}
    >
      <div className="grid min-w-0 grid-cols-[1rem_auto] grid-rows-[auto_auto] items-center gap-x-1 sm:grid-cols-[1.25rem_auto] sm:gap-x-2">
        <Icon className="col-start-1 row-start-1 h-4 w-4 shrink-0 self-center text-zinc-400 transition-colors duration-200 group-hover/statbadge:text-zinc-200 sm:h-5 sm:w-5" />
        <span className="col-start-2 row-start-1 block self-center text-[11px] font-bold leading-none tracking-tight text-white/90 [font-variant-numeric:tabular-nums] [text-box:trim-both_cap_alphabetic] sm:text-sm">
          {/* CARGANDO ≠ SIN DATO. Mientras la consulta está en vuelo el hueco
              se reserva con un valor INVISIBLE: ocupa lo mismo, pero no afirma
              nada. El guion queda para cuando ya se sabe que no hay dato. */}
          {pending ? (
            <span className="invisible" aria-hidden="true">
              0
            </span>
          ) : (
            value || "-"
          )}
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
export function DetailsStatsRow({
  stats = null,
  // Variante para entidades que no proceden de Trakt (listas, colecciones,
  // perfiles…). Conserva exactamente la pieza visual del marcador, pero evita
  // inventar "seguidores" o "reproducciones" cuando esos datos no existen.
  // Cada entrada: { icon, value, label, tooltip? }.
  statItems = null,
  showFavoritedStat = true,
  // `pending`: las stats de Trakt todavía vienen de camino. La fila se monta
  // igualmente para RESERVAR SU ALTO. Puede hacerse con exactitud porque el
  // markup es fijo -- siempre las mismas insignias, cambian solo los números--,
  // así que reservado y definitivo miden lo mismo. Sin esto, el pie aparecía al
  // llegar la respuesta, el panel crecía y empujaba hacia abajo todo lo que va
  // debajo.
  pending = false,
}) {
  const customStatItems = Array.isArray(statItems)
    ? statItems.filter((item) => item?.label && item?.value != null)
    : [];
  const hasCustomStats = customStatItems.length > 0;
  // Mostrar cuando hay stats numéricas (incluyendo de cache stale)
  const hasStats = Object.values(stats || {}).some(
    (v) => typeof v === "number",
  );
  if (!hasCustomStats && !hasStats && !pending) return null;

  if (hasCustomStats) {
    return (
      <div className="relative z-10 border-t border-white/5 bg-black/[0.04] rounded-b-2xl">
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
            {customStatItems.map((item, index) => (
              <TraktStatBadge
                key={item.key || `${item.label}-${index}`}
                icon={item.icon || List}
                value={
                  typeof item.value === "number"
                    ? formatShortNumber(item.value)?.toUpperCase() || "0"
                    : String(item.value)
                }
                label={item.label}
                tooltip={item.tooltip}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Con `pending` no se pasa valor: la insignia reserva el hueco con un
  // marcador invisible. Un "0" sería un dato ("no lo sigue nadie") y un guion
  // sería "no hay dato"; durante la carga no se sabe ninguna de las dos cosas.
  const statValue = (value) =>
    hasStats ? formatShortNumber(value ?? 0)?.toUpperCase() || "0" : null;

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
            value={statValue(stats?.watchers)}
            pending={!hasStats && pending}
            label="SEGUIDORES"
            tooltip="Seguidores"
          />

          {/* Plays - Número de reproducciones totales */}
          <TraktStatBadge
            icon={Play}
            value={statValue(stats?.plays)}
            pending={!hasStats && pending}
            label="REPRODUCCIONES"
            tooltip="Reproducciones"
          />

          {/* Lists - Cantidad de listas que incluyen este contenido */}
          <TraktStatBadge
            icon={List}
            value={statValue(stats?.lists)}
            pending={!hasStats && pending}
            label="LISTAS"
            tooltip="En listas"
          />

          {showFavoritedStat && (
            <TraktStatBadge
              icon={Heart}
              value={statValue(stats?.favorited)}
            pending={!hasStats && pending}
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
//    - `onMoreLinks`: callback del botón "..." que abre el modal de enlaces.
//    - `onMorePlatforms`: sustituye en móvil el acceso a enlaces por el de
//       plataformas, sin modificar la composición de escritorio.
//    - `externalLinksMenuOnly`: mantiene esos enlaces en el botón también en
//       escritorio, en vez de desplegarlos como iconos individuales.
//    - `showExternalLinksLabel`: muestra la etiqueta del botón desde `sm`.
//    - `share`: { title, text?, url? } -> <ActionShareButton>. Se ancla a la
//       derecha con ml-auto (siempre visible si se pasa).
// ---------------------------------------------------------------------------
// Separador compartido de las regiones del marcador.
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
      initial={false}
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
  onMorePlatforms,
  externalLinksMenuOnly = false,
  showExternalLinksLabel = false,
  share = null,
  shareIconOnly = false,
  toolbarActions = null,
}) {
  const hasExternalLinks =
    Array.isArray(externalLinks) && externalLinks.length > 0;
  const hasStreamingProviders =
    Array.isArray(streamingProviders) && streamingProviders.length > 0;
  const hasMobilePlatformAction = typeof onMorePlatforms === "function";
  const hasInlineActions =
    hasExternalLinks || hasStreamingProviders || hasMobilePlatformAction;

  return (
    <>
      {/* ========== Separador vertical 1 + ENLACES EXTERNOS / STREAMING ========== */}
      {hasInlineActions && (
        <>
          <div className="flex flex-1 items-center justify-center sm:block sm:flex-none">
            <ToolbarSeparator />
          </div>

          <div className="min-w-0 flex flex-none items-center justify-end gap-2.5 sm:flex-1 sm:gap-3">
            {/* Versión Desktop: plataformas primero, enlaces externos después. */}
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

              {hasStreamingProviders && hasExternalLinks && !externalLinksMenuOnly && (
                <ToolbarSeparator className="mx-0.5" />
              )}

              {hasExternalLinks && !externalLinksMenuOnly && (
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

            {/* En móvil, y en variantes compactas, el botón "..." abre el
                modal de enlaces para no recargar la barra. */}
            {onMoreLinks && (
              <button
                type="button"
                onClick={onMoreLinks}
                className={`${hasMobilePlatformAction ? "hidden sm:flex" : externalLinksMenuOnly ? "" : "sm:hidden"} relative isolate h-10 w-10 shrink-0 transform-gpu items-center justify-center overflow-hidden rounded-full bg-black/[0.04] bg-gradient-to-br from-white/10 via-transparent to-black/10 text-zinc-200 shadow-none backdrop-blur-[6px] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30 ${showExternalLinksLabel ? "sm:h-auto sm:w-auto sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2" : ""}`}
                title="Enlaces"
                aria-label="Abrir enlaces externos"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
                />
                <MoreHorizontal className="relative z-10 h-5 w-5" />
                {showExternalLinksLabel && (
                  <span className="relative z-10 hidden text-sm font-medium sm:block">
                    Enlaces
                  </span>
                )}
              </button>
            )}

            {hasMobilePlatformAction && (
              <button
                type="button"
                onClick={onMorePlatforms}
                className="relative isolate flex h-10 w-10 shrink-0 transform-gpu items-center justify-center overflow-hidden rounded-full bg-black/[0.04] bg-gradient-to-br from-white/10 via-transparent to-black/10 text-zinc-200 shadow-none backdrop-blur-[6px] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30 sm:hidden"
                title="Plataformas"
                aria-label="Abrir plataformas disponibles"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
                />
                <MonitorPlay className="relative z-10 h-5 w-5" />
              </button>
            )}
          </div>

          {share && !externalLinksMenuOnly && (
            <ToolbarSeparator className="hidden md:block" />
          )}
        </>
      )}

      {/* ========== Botón de Compartir (anclado a la derecha con ml-auto) ========== */}
      {share && (
        <div className="ml-auto shrink-0 max-sm:[&>button]:!grid max-sm:[&>button]:!place-items-center max-sm:[&>button]:!isolate max-sm:[&>button]:!transform-gpu max-sm:[&>button]:!overflow-hidden max-sm:[&>button]:!w-10 max-sm:[&>button]:!h-10 max-sm:[&>button]:!p-0 max-sm:[&>button]:!rounded-full max-sm:[&>button]:!border-0 max-sm:[&>button]:!ring-0 max-sm:[&>button]:!outline-none max-sm:[&>button]:[-webkit-tap-highlight-color:transparent] max-sm:[&>button]:!bg-black/[0.04] max-sm:[&>button]:!bg-gradient-to-br max-sm:[&>button]:!from-white/10 max-sm:[&>button]:!via-transparent max-sm:[&>button]:!to-black/10 max-sm:[&>button]:!backdrop-blur-[6px] max-sm:[&>button]:!shadow-none max-sm:[&>button]:!text-zinc-200 max-sm:[&>button]:!transition-all max-sm:[&>button]:!duration-300 hover:max-sm:[&>button]:!text-white hover:max-sm:[&>button]:!bg-white/[0.08] hover:max-sm:[&>button]:!-translate-y-0.5 hover:max-sm:[&>button]:!border-0 hover:max-sm:[&>button]:!ring-0 focus:max-sm:[&>button]:!outline-none focus:max-sm:[&>button]:!border-0 focus:max-sm:[&>button]:!ring-0 active:max-sm:[&>button]:!border-0 active:max-sm:[&>button]:!ring-0 max-sm:[&>button>span]:!hidden max-sm:[&>button>svg]:!block max-sm:[&>button>svg]:!h-5 max-sm:[&>button>svg]:!w-5 max-sm:[&>button>svg]:!shrink-0">
          <ActionShareButton
            title={share.title}
            text={share.text}
            url={share.url}
            iconOnly={shareIconOnly}
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
  statItems = null,
  showFavoritedStat = true,
  // Las stats de Trakt aún no han llegado. El panel se pinta ya con su ALTO
  // DEFINITIVO (pie de estadísticas incluido) en vez de crecer al recibirlas y
  // empujar hacia abajo lo que tenga debajo. Es opcional: quien no la pase
  // conserva el comportamiento anterior.
  statsPending = false,
  externalLinks = null,
  streamingProviders = null,
  onMoreLinks,
  onMorePlatforms,
  externalLinksMenuOnly = false,
  showExternalLinksLabel = false,
  share = null,
  // Modo de portada backdrop: el marcador comparte fila con las puntuaciones y
  // las estadísticas, así que "Compartir" va sin texto para no comerse el ancho.
  shareIconOnly = false,
  toolbarActions = null,
  className = "",
  children = null,
}) {
  // Una puntuación PENDIENTE (objeto presente pero aún sin valor) no pinta
  // nada: su badge se omite más abajo. Contarla como contenido hacía que, al
  // recargar la ficha, se dibujara la CÁSCARA del panel —cristal, sombra y
  // separadores— completamente vacía hasta que llegaban los datos. Aquí solo
  // cuenta lo que de verdad se va a ver.
  const hasVisibleScore = (score) =>
    !!score && !(score.pending === true && score.value == null);
  const hasRatings = [tmdb, trakt, traktPublic, imdb, rt, mc].some(
    hasVisibleScore,
  );
  const hasStats = Object.values(stats || {}).some(
    (v) => typeof v === "number",
  );
  const hasCustomStats = Array.isArray(statItems) && statItems.some(
    (item) => item?.label && item?.value != null,
  );
  const hasExternalLinks =
    Array.isArray(externalLinks) && externalLinks.length > 0;
  const hasStreamingProviders =
    Array.isArray(streamingProviders) && streamingProviders.length > 0;
  const hasToolbar =
    hasRatings ||
    hasExternalLinks ||
    hasStreamingProviders ||
    typeof onMorePlatforms === "function" ||
    !!share ||
    !!toolbarActions;

  // `statsPending` cuenta como contenido: si no, el panel entero no se montaría
  // hasta que llegasen las stats y aparecería de golpe, que es justo el salto
  // que se quiere evitar.
  if (!hasToolbar && !hasStats && !hasCustomStats && !statsPending && !children) return null;

  return (
    <div
      className={`w-full rounded-2xl ${LIQUID_GLASS_SURFACE} ${className}`}
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
            onMorePlatforms={onMorePlatforms}
            externalLinksMenuOnly={externalLinksMenuOnly}
            showExternalLinksLabel={showExternalLinksLabel}
            share={share}
            shareIconOnly={shareIconOnly}
            toolbarActions={toolbarActions}
          />
        </div>
      )}

      <DetailsStatsRow
        stats={stats}
        statItems={statItems}
        showFavoritedStat={showFavoritedStat}
        pending={statsPending}
      />

      {children}
    </div>
  );
}
