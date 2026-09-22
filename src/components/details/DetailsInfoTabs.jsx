"use client";

// Sección de "info tabs" compartida (Detalles · Producción · Sinopsis · Premios).
// Extraída VERBATIM desde DetailsClient para que la ficha completa y la ficha
// rápida del dashboard (DetailModal) rendericen EXACTAMENTE las mismas tarjetas.
//
// Es dueña de su propio estado `activeTab` (por defecto "details") y pinta el
// menú <DetailsTabsMenu> + los cuerpos de pestaña dentro de <AnimatePresence>.
// TODOS los datos entran por props. `variant` reproduce la ÚNICA diferencia entre
// los dos renders de DetailsClient (layout normal vs. `isBackdropPoster`):
//   - "normal":   Presupuesto/Recaudación/Canal se muestran SIEMPRE (fallback "—")
//                 y el tagline usa comillas tipográficas “ ”.
//   - "backdrop": Presupuesto/Recaudación/Canal se muestran SOLO si hay valor
//                 y el tagline usa comillas rectas " ".

import { useId, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  CalendarIcon,
  FilmIcon,
  BadgeDollarSignIcon,
  MonitorPlay,
  TrendingUp,
  Layers,
  Users,
  Building2,
  Trophy,
  Tags,
  BadgeCheck,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

import {
  VisualMetaCard,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
import AwardsPanel from "@/components/details/AwardsPanel";
import { translateGenre } from "@/lib/details/formatters";
import OptimizedImage from "@/components/OptimizedImage";
import { ExternalLinkButton } from "@/components/details/DetailHeaderBits";
import { getStatusLabel } from "@/components/details/DetailsMetaGenresRow";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_SURFACE } from "@/lib/ui/liquidGlass";
import useHorizontalSwipe from "@/hooks/useHorizontalSwipe";

function InfoGlassPanel({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl ${LIQUID_GLASS_SURFACE} ${className}`}
    >
      <LiquidGlassOpticalLayers />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// Clases de la FILA de tarjetas y de cada tarjeta.
//
// La variante ancha por defecto es una fila que NO envuelve y se desplaza en
// horizontal (`lg:flex-nowrap` + `lg:overflow-x-auto`). Funciona en la ficha
// completa, que tiene toda la página de ancho, pero en el drawer —que ahora se
// puede estrechar bastante— las últimas tarjetas quedaban FUERA, escondidas a
// la derecha y solo alcanzables desplazando algo que no parece desplazable.
//
// Con `wrapCards` la fila envuelve: las tarjetas se reparten en las líneas que
// hagan falta y ninguna se esconde. `12rem` de base las deja en dos o tres por
// línea según el ancho del panel, en vez de estirarse una sola por fila.
export const infoCardsRowClass = ({ mobileLayout, wrapCards }) => {
  if (mobileLayout) return "flex flex-col gap-3";
  // El reparto lo lleva `.sv-info-cards` en globals.css, con un container
  // query: desde CSS se puede mirar el ancho REAL de la fila, que es lo que
  // decide si las tarjetas caben todas o tienen que ir de dos en dos.
  if (wrapCards) return "sv-info-cards";
  return "flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]";
};

// ¿El título original necesita la fila entera?
//
// En modo parejas cada tarjeta se lleva media fila, y ahí caben unos 30
// caracteres antes de que el texto se recorte. Pasado eso, la tarjeta se queda
// sola en su fila y Estreno, Presupuesto y Recaudación se reparten la
// siguiente: esas tres son cortas por naturaleza —una fecha y dos cifras— y no
// se quedan estrechas por juntarse.
//
// Se mide por LONGITUD DEL TEXTO y no por el ancho real del elemento a
// propósito: medir exigiría un observador que se dispararía en cada fotograma
// del arrastre del panel, justo el trabajo que se le ha quitado.
const LONG_ORIGINAL_TITLE_CHARS = 30;

export const isLongOriginalTitle = (value) =>
  typeof value === "string" && value.trim().length > LONG_ORIGINAL_TITLE_CHARS;

export const infoCardClass = ({ mobileLayout, wrapCards, wide = false }) => {
  if (mobileLayout) return "w-full";
  // Las tarjetas de `.sv-info-cards` se dimensionan desde la hoja de estilos:
  // aquí solo hace falta permitir que se encojan por debajo de su contenido, y
  // marcar la que pide fila propia.
  if (wrapCards) return wide ? "min-w-0 sv-info-card--wide" : "min-w-0";
  return "w-full lg:w-auto lg:flex-auto lg:shrink-0";
};

function CustomInfoCards({ cards = [], mobileLayout = false, wrapCards = false }) {
  const availableCards = cards.filter((card) => card?.label && card?.value);
  if (!availableCards.length) return null;

  return (
    <div className={infoCardsRowClass({ mobileLayout, wrapCards })}>
      {availableCards.map((card, index) => (
        <VisualMetaCard
          key={card.key || `${card.label}-${index}`}
          icon={card.icon}
          iconContent={card.iconContent}
          label={card.label}
          value={card.value}
          className={infoCardClass({ mobileLayout, wrapCards })}
        />
      ))}
    </div>
  );
}

export default function DetailsInfoTabs({
  variant = "normal",
  layoutId = "detailsTabInline",
  mediaType,
  originalTitle,
  formatValue,
  durationValue,
  releaseDateValue,
  status,
  lastAirDateValue,
  budgetValue,
  revenueValue,
  director,
  creators,
  network,
  productionText,
  tagline,
  overview,
  awards,
  awardItems = [],
  showAwardsTab = true,
  genres = [],
  metadataLoading = false,
  mobileLayout = false,
  // Las tarjetas ENVUELVEN en vez de irse a una fila que se desplaza. Lo pide
  // el drawer de DetailModal: al estrecharlo, las últimas quedaban fuera de
  // vista a la derecha. La ficha completa no lo usa y conserva su fila.
  wrapCards = false,
  // El cambio de pestaña mediante gesto se configura por separado del layout:
  // SeasonDetails comparte este componente entre móvil y escritorio, mientras
  // que EpisodeDetails renderiza una instancia exclusiva para móvil.
  enableMobileTabSwipe = false,
  // Menú de pestañas en disposición de teléfono aunque la ventana sea ancha.
  // Solo lo pide la ficha de teléfono del drawer (en tablet); la ficha completa
  // decide por el viewport y no lo pasa.
  phoneMenu = false,
  platforms = [],
  platformLinks = [],
  showPlatformsTab = mobileLayout,
  externalLinks = [],
  showExternalLinksTab = false,
  awardsValue,
  // Las subfichas de episodios no reciben un agregado de premios propio; no
  // deben enseñar una tarjeta vacía dentro de Producción.
  showAwardsProductionCard = true,
  // Listas y colecciones comparten la navegación y las tarjetas, pero no los
  // campos propios de una película. Estas dos colecciones permiten expresar
  // únicamente los metadatos que realmente existen sin falsear etiquetas.
  detailCards = null,
  productionCards = null,
  showDetailsTab = true,
  showProductionTab = true,
  // Las fichas que solo tienen sinopsis no necesitan una navegación de una
  // única opción: muestran el panel directamente.
  showTabsMenu = true,
  // Las listas pueden incluir descripciones muy extensas. Se muestran
  // inicialmente de forma compacta y se expanden bajo demanda, sin crear un
  // segundo scroll dentro de la página.
  expandableSynopsis = false,
}) {
  const [activeTab, setActiveTab] = useState(() =>
    showDetailsTab ? "details" : showProductionTab ? "production" : "synopsis",
  );
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const synopsisId = useId();
  const isBackdrop = variant === "backdrop";
  const hasAwardItems = awardItems.length > 0;
  const hasAwardsTab = showAwardsTab && (awards || hasAwardItems);
  const hasPlatformsTab = showPlatformsTab;
  const hasExternalLinksTab = showExternalLinksTab;
  const synopsisText = typeof overview === "string" ? overview.trim() : "";
  const synopsisIsExpandable = expandableSynopsis && synopsisText.length > 420;
  const hasCustomDetailCards = Array.isArray(detailCards);
  const hasCustomProductionCards = Array.isArray(productionCards);

  // UNA sola lista de pestañas: la pinta el menú y la recorre el gesto de
  // deslizar. Si cada uno tuviera la suya se desincronizarían en cuanto una
  // pestaña condicional (Plataformas, Premios) entra o sale.
  const tabs = useMemo(
    () => [
      ...(showDetailsTab ? [{ id: "details", label: "Detalles" }] : []),
      ...(showProductionTab ? [{ id: "production", label: "Producción" }] : []),
      { id: "synopsis", label: "Sinopsis" },
      ...(hasPlatformsTab ? [{ id: "platforms", label: "Plataformas" }] : []),
      ...(hasExternalLinksTab ? [{ id: "links", label: "Enlaces" }] : []),
      ...(hasAwardsTab ? [{ id: "awards", label: "Premios" }] : []),
    ],
    [
      showDetailsTab,
      showProductionTab,
      hasPlatformsTab,
      hasExternalLinksTab,
      hasAwardsTab,
    ],
  );

  // En móvil se cambia de sección deslizando sobre el menú, sin tener que
  // apuntar a la etiqueta. Sin ciclo: en la primera y en la última el gesto no
  // hace nada, que es justo lo que está prometiendo la posición del subrayado.
  const goToAdjacentTab = (step) => {
    setActiveTab((current) => {
      const index = tabs.findIndex((tab) => tab.id === current);
      if (index < 0) return current;
      const next = index + step;
      return next >= 0 && next < tabs.length ? tabs[next].id : current;
    });
  };

  const tabSwipeHandlers = useHorizontalSwipe({
    enabled: enableMobileTabSwipe,
    onSwipeLeft: () => goToAdjacentTab(1),
    onSwipeRight: () => goToAdjacentTab(-1),
  });
  // El navegador global de páginas cede el gesto a estas pestañas cuando su
  // propio swipe está activo, igual que hace con los carruseles.
  const swipeHandlers = enableMobileTabSwipe
    ? { ...tabSwipeHandlers, "data-mobile-page-swipe-ignore": "" }
    : tabSwipeHandlers;

  const genresValue = Array.isArray(genres)
    ? genres
        .filter(Boolean)
        .map((genre) => translateGenre(genre.name || genre))
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="contents">
      {/* ========== MENÚ DE NAVEGACIÓN DE TABS ========== */}
      {showTabsMenu ? (
        <DetailsTabsMenu
          tabs={tabs}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          layoutId={layoutId}
          swipeHandlers={swipeHandlers}
          phone={phoneMenu}
        />
      ) : null}

      {/* ========== ÁREA DE CONTENIDO DE TABS ========== */}
      {/* El gesto vive también sobre las tarjetas: en móvil se puede cambiar
          de sección sin volver primero al menú. `touch-pan-y` mantiene el
          desplazamiento vertical de la página como comportamiento nativo. */}
      <div
        {...swipeHandlers}
        className="relative min-h-[100px] touch-pan-y sm:touch-auto"
      >
        <AnimatePresence mode="wait">
          {/* ===== TAB: SINOPSIS ===== */}
          {activeTab === "synopsis" && (
            <div key="synopsis">
              <InfoGlassPanel className="p-5 sm:p-6">
                {tagline && (
                  <div className="mb-3 font-serif text-lg italic text-yellow-500/80">
                    {isBackdrop ? `"${tagline}"` : `“${tagline}”`}
                  </div>
                )}
                <div>
                  <p
                    id={synopsisId}
                    className={`whitespace-pre-line text-justify text-base leading-relaxed text-zinc-200 md:text-lg ${
                      synopsisIsExpandable && !showFullSynopsis
                        ? "line-clamp-4 mask-fade-bottom"
                        : ""
                    }`}
                  >
                    {overview || "No hay descripción disponible."}
                  </p>
                  {synopsisIsExpandable && (
                    <button
                      type="button"
                      onClick={() => setShowFullSynopsis((value) => !value)}
                      aria-expanded={showFullSynopsis}
                      aria-controls={synopsisId}
                      className="mt-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-purple-400 transition-colors hover:text-purple-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
                    >
                      {showFullSynopsis ? "Ver menos" : "Ver más"}
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${
                          showFullSynopsis ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </InfoGlassPanel>
            </div>
          )}

          {/* ===== TAB: DETALLES ===== */}
          {activeTab === "details" && (
            <div key="details" className="sv-info-cards-scope">
              {hasCustomDetailCards ? (
                <CustomInfoCards
                  cards={detailCards}
                  mobileLayout={mobileLayout}
                  wrapCards={wrapCards}
                />
              ) : mobileLayout ? (
                <div className="flex flex-col gap-3">
                  <VisualMetaCard
                    icon={mediaType === "movie" ? FilmIcon : MonitorPlay}
                    label="Título original"
                    value={metadataLoading ? null : originalTitle || "—"}
                    isLoading={metadataLoading}
                    className="w-full"
                  />
                  {mediaType === "movie" ? (
                    <VisualMetaCard
                      icon={CalendarIcon}
                      label="Estreno"
                      value={metadataLoading ? null : releaseDateValue || "—"}
                      isLoading={metadataLoading}
                      className="w-full"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <VisualMetaCard
                        icon={CalendarIcon}
                        label="Inicio"
                        value={metadataLoading ? null : releaseDateValue || "—"}
                        isLoading={metadataLoading}
                        className="min-w-0"
                      />
                      <VisualMetaCard
                        icon={CalendarIcon}
                        label="Finalización"
                        value={metadataLoading ? null : lastAirDateValue || "—"}
                        isLoading={metadataLoading}
                        className="min-w-0"
                      />
                    </div>
                  )}
                  {mediaType === "movie" ? (
                    <VisualMetaCard
                      icon={Layers}
                      label="Duración"
                      value={metadataLoading ? null : formatValue || "—"}
                      isLoading={metadataLoading}
                      className="w-full"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <VisualMetaCard
                        icon={Layers}
                        label="Formato"
                        value={metadataLoading ? null : formatValue || "—"}
                        isLoading={metadataLoading}
                        className="min-w-0"
                      />
                      <VisualMetaCard
                        icon={Layers}
                        label="Duración"
                        value={metadataLoading ? null : durationValue || "—"}
                        isLoading={metadataLoading}
                        className="min-w-0"
                      />
                    </div>
                  )}
                  <VisualMetaCard
                    icon={BadgeCheck}
                    label="Estado"
                    value={metadataLoading ? null : getStatusLabel(status) || "—"}
                    isLoading={metadataLoading}
                    className="w-full"
                  />
                  <VisualMetaCard
                    icon={Tags}
                    label="Géneros"
                    value={metadataLoading ? null : genresValue || "—"}
                    isLoading={metadataLoading}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className={infoCardsRowClass({ mobileLayout, wrapCards })}>
                  {/* Título Original */}
                  {/* Misma puerta que el resto de la fila. Sin ella conservaba
                      el valor del título ANTERIOR durante el cambio, así que se
                      quedaba sola en el contenedor flex y se llevaba todo el
                      ancho -- el mismo efecto que tenía Duración. Todas las
                      tarjetas de esta fila aparecen juntas, y por eso cada una
                      nace ya con su ancho definitivo. */}
                  <VisualMetaCard
                    icon={mediaType === "movie" ? FilmIcon : MonitorPlay}
                    label="Título Original"
                    value={metadataLoading ? null : originalTitle}
                    isLoading={metadataLoading}
                    expanded={true}
                    className={infoCardClass({
                      mobileLayout,
                      wrapCards,
                      wide: isLongOriginalTitle(originalTitle),
                    })}
                  />

                  <VisualMetaCard
                    icon={Tags}
                    label="Géneros"
                    value={metadataLoading ? null : genresValue || "—"}
                    isLoading={metadataLoading}
                    expanded={true}
                    className="w-full sm:hidden"
                  />

                  {/* Duración (solo series).
                      Era la ÚNICA tarjeta de esta fila sin puerta de carga: sus
                      vecinas devuelven `null` mientras `metadataLoading`, así
                      que esta se quedaba sola en un contenedor flex y su
                      `lg:flex-auto` le daba TODO el ancho, hasta que llegaban
                      las demás y la encogían a su tamaño real. Con la puerta
                      aparece a la vez que el resto, ya en su sitio. */}
                  {mediaType !== "movie" ? (
                    <VisualMetaCard
                      icon={Layers}
                      label="Duración"
                      value={metadataLoading ? null : formatValue}
                      isLoading={metadataLoading}
                      className={infoCardClass({ mobileLayout, wrapCards })}
                    />
                  ) : null}

                  {/* Estreno / Inicio */}
                  <VisualMetaCard
                    icon={CalendarIcon}
                    label={mediaType === "movie" ? "Estreno" : "Inicio"}
                    value={metadataLoading ? null : releaseDateValue || "—"}
                    isLoading={metadataLoading}
                    className={infoCardClass({ mobileLayout, wrapCards })}
                  />

                  {/* Finalización / Última emisión (solo series).
                      `!metadataLoading` por el mismo motivo que sus vecinas:
                      durante el cambio de título `lastAirDateValue` aún guarda
                      el valor del anterior, así que sin la puerta esta tarjeta
                      se quedaría sola en la fila y se estiraría. */}
                  {mediaType !== "movie" && !metadataLoading && lastAirDateValue && (
                    <VisualMetaCard
                      icon={CalendarIcon}
                      label={
                        status === "Ended" ? "Finalización" : "Última emisión"
                      }
                      value={
                        isBackdrop
                          ? lastAirDateValue
                          : lastAirDateValue || "En emisión"
                      }
                      className={infoCardClass({ mobileLayout, wrapCards })}
                    />
                  )}

                  {/* Presupuesto y Recaudación (solo películas) */}
                  {mediaType === "movie" &&
                    (isBackdrop ? (
                      <>
                        {budgetValue && (
                          <VisualMetaCard
                            icon={BadgeDollarSignIcon}
                            label="Presupuesto"
                            value={budgetValue}
                            className={infoCardClass({ mobileLayout, wrapCards })}
                          />
                        )}
                        {revenueValue && (
                          <VisualMetaCard
                            icon={TrendingUp}
                            label="Recaudación"
                            value={revenueValue}
                            className={infoCardClass({ mobileLayout, wrapCards })}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <VisualMetaCard
                          icon={BadgeDollarSignIcon}
                          label="Presupuesto"
                          value={metadataLoading ? null : budgetValue || "—"}
                          isLoading={metadataLoading}
                          className={infoCardClass({ mobileLayout, wrapCards })}
                        />
                        <VisualMetaCard
                          icon={TrendingUp}
                          label="Recaudación"
                          value={metadataLoading ? null : revenueValue || "—"}
                          isLoading={metadataLoading}
                          className={infoCardClass({ mobileLayout, wrapCards })}
                        />
                      </>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: PRODUCCIÓN Y EQUIPO ===== */}
          {activeTab === "production" && (
            <div key="production" className="sv-info-cards-scope">
              {hasCustomProductionCards ? (
                <CustomInfoCards
                  cards={productionCards}
                  mobileLayout={mobileLayout}
                  wrapCards={wrapCards}
                />
              ) : mobileLayout ? (
                <div className="flex flex-col gap-3">
                  <VisualMetaCard
                    icon={Users}
                    label={mediaType === "movie" ? "Director" : "Creadores"}
                    value={
                      mediaType === "movie"
                        ? director || "Desconocido"
                        : creators || "Desconocido"
                    }
                    isLoading={metadataLoading}
                    className="w-full"
                  />
                  {showAwardsProductionCard && (
                    <VisualMetaCard
                      icon={Trophy}
                      label="Premios"
                      value={metadataLoading ? null : awardsValue || "—"}
                      isLoading={metadataLoading}
                      className="w-full"
                    />
                  )}
                  {mediaType === "movie" ? (
                    <>
                      <VisualMetaCard
                        icon={BadgeDollarSignIcon}
                        label="Presupuesto"
                        value={metadataLoading ? null : budgetValue || "—"}
                        isLoading={metadataLoading}
                        className="w-full"
                      />
                      <VisualMetaCard
                        icon={TrendingUp}
                        label="Recaudación"
                        value={metadataLoading ? null : revenueValue || "—"}
                        isLoading={metadataLoading}
                        className="w-full"
                      />
                    </>
                  ) : (
                    <VisualMetaCard
                      icon={MonitorPlay}
                      label="Canal"
                      value={metadataLoading ? null : network || "—"}
                      isLoading={metadataLoading}
                      className="w-full"
                    />
                  )}
                  <VisualMetaCard
                    icon={Building2}
                    label="Producción"
                    value={metadataLoading ? null : productionText || "—"}
                    isLoading={metadataLoading}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className={infoCardsRowClass({ mobileLayout, wrapCards })}>
                  {/* Director (Cine) / Creadores (TV) */}
                  <VisualMetaCard
                    icon={Users}
                    label={mediaType === "movie" ? "Director" : "Creadores"}
                    value={
                      mediaType === "movie"
                        ? director || "Desconocido"
                        : creators || "Desconocido"
                    }
                    expanded={true}
                    className={infoCardClass({ mobileLayout, wrapCards })}
                  />

                  {/* Canal (solo TV) */}
                  {mediaType !== "movie" &&
                    (isBackdrop
                      ? network && (
                          <VisualMetaCard
                            icon={MonitorPlay}
                            label="Canal"
                            value={network}
                            className={infoCardClass({ mobileLayout, wrapCards })}
                          />
                        )
                      : (
                          <VisualMetaCard
                            icon={MonitorPlay}
                            label="Canal"
                            value={metadataLoading ? null : network || "—"}
                            className={infoCardClass({ mobileLayout, wrapCards })}
                          />
                        ))}

                  {/* Producción (ambos) */}
                  <VisualMetaCard
                    icon={Building2}
                    label="Producción"
                    value={metadataLoading ? null : productionText || "—"}
                    expanded={true}
                    className={infoCardClass({ mobileLayout, wrapCards })}
                  />
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: PLATAFORMAS ===== */}
          {activeTab === "platforms" && hasPlatformsTab && (
            <div key="platforms">
              <div className="flex flex-col gap-3">
                {platforms.length > 0 ? (
                  platforms.map((platform, index) => (
                    <a
                      key={platform.key ?? `${platform.title}-${index}`}
                      href={platform.href}
                      target={platform.target}
                      rel={platform.rel}
                      aria-label={platform.title}
                      className="group/provider block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                    >
                      <VisualMetaCard
                        iconContent={
                          <span className="relative block h-10 w-10">
                            <OptimizedImage
                              src={platform.icon}
                              alt=""
                              className="h-10 w-10 rounded-xl bg-white/5 object-contain shadow-lg"
                            />
                            {platform.isPlexProvider && (
                              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-black" />
                            )}
                          </span>
                        }
                        label="Plataforma"
                        value={platform.title}
                        className="w-full transition-colors group-hover/provider:from-white/15 group-hover/provider:to-black/5"
                      />
                    </a>
                  ))
                ) : (
                  <VisualMetaCard
                    icon={MonitorPlay}
                    label="Plataformas"
                    value="No hay plataformas disponibles."
                    className="w-full"
                  />
                )}
                {platformLinks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    {platformLinks.map((link) => (
                      <ExternalLinkButton
                        key={link.key}
                        icon={link.icon}
                        title={link.title}
                        href={link.href}
                        fallbackHref={link.fallbackHref}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== TAB: ENLACES EXTERNOS ===== */}
          {activeTab === "links" && hasExternalLinksTab && (
            <div key="links">
              <div className="flex flex-col gap-3">
                {externalLinks.length > 0 ? (
                  externalLinks.map((link, index) => (
                    <a
                      key={link.id ?? link.key ?? `${link.label}-${index}`}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir ${link.label || "enlace externo"}`}
                      className="group/link block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                    >
                      <VisualMetaCard
                        iconContent={
                          link.icon ? (
                            <OptimizedImage
                              src={link.icon}
                              alt=""
                              className="h-10 w-10 rounded-xl bg-white/5 object-contain shadow-lg"
                            />
                          ) : (
                            <ExternalLink className="h-6 w-6 text-zinc-300" />
                          )
                        }
                        label="Enlace externo"
                        value={link.label || "Enlace"}
                        className="w-full transition-colors group-hover/link:from-white/15 group-hover/link:to-black/5"
                      />
                    </a>
                  ))
                ) : (
                  <VisualMetaCard
                    icon={ExternalLink}
                    label="Enlaces externos"
                    value="No hay enlaces disponibles."
                    className="w-full"
                  />
                )}
              </div>
            </div>
          )}

          {/* ===== TAB: PREMIOS ===== */}
          {activeTab === "awards" && hasAwardsTab && (
            <div key="awards">
              {awards ? (
                <AwardsPanel awards={awards} />
              ) : (
                <InfoGlassPanel className="p-5 sm:p-6">
                  <div className="pointer-events-none absolute -right-6 -top-6 z-10 h-32 w-32 rounded-full bg-yellow-500/10 blur-3xl" />
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-xl bg-yellow-500/10 p-3 text-yellow-500">
                      <Trophy className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-2 text-lg font-bold text-white">
                        Premios y nominaciones
                      </h3>
                      <p className="text-base leading-relaxed text-zinc-200">
                        {
                          awardItems.filter((a) => a.result === "winner").length
                        }{" "}
                        premios y{" "}
                        {
                          awardItems.filter((a) => a.result === "nominee").length
                        }{" "}
                        nominaciones
                      </p>
                    </div>
                  </div>
                </InfoGlassPanel>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
