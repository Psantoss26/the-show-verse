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

import { useState } from "react";
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
} from "lucide-react";

import {
  VisualMetaCard as BaseVisualMetaCard,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
import AwardsPanel from "@/components/details/AwardsPanel";
import { translateGenre } from "@/lib/details/formatters";
import OptimizedImage from "@/components/OptimizedImage";
import { ExternalLinkButton } from "@/components/details/DetailHeaderBits";
import { getStatusLabel } from "@/components/details/DetailsMetaGenresRow";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_BAR } from "@/lib/ui/liquidGlass";

function VisualMetaCard(props) {
  return <BaseVisualMetaCard {...props} liquidGlass />;
}

function InfoGlassPanel({ children, className = "" }) {
  return (
    <div
      className={`relative isolate overflow-hidden rounded-xl ${LIQUID_GLASS_BAR} ${className}`}
    >
      <LiquidGlassOpticalLayers />
      <div className="relative z-10">{children}</div>
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
  platforms = [],
  platformLinks = [],
  awardsValue,
}) {
  const [activeTab, setActiveTab] = useState("details");
  const isBackdrop = variant === "backdrop";
  const hasAwardItems = awardItems.length > 0;
  const hasAwardsTab = showAwardsTab && (awards || hasAwardItems);
  const hasPlatformsTab = mobileLayout;
  const genresValue = Array.isArray(genres)
    ? genres
        .filter(Boolean)
        .map((genre) => translateGenre(genre.name || genre))
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      {/* ========== MENÚ DE NAVEGACIÓN DE TABS ========== */}
      <DetailsTabsMenu
        tabs={[
          { id: "details", label: "Detalles" },
          { id: "production", label: "Producción" },
          { id: "synopsis", label: "Sinopsis" },
          ...(hasPlatformsTab ? [{ id: "platforms", label: "Plataformas" }] : []),
          ...(hasAwardsTab ? [{ id: "awards", label: "Premios" }] : []),
        ]}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        layoutId={layoutId}
      />

      {/* ========== ÁREA DE CONTENIDO DE TABS ========== */}
      <div className="relative min-h-[100px]">
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
                <p className="whitespace-pre-line text-justify text-base leading-relaxed text-zinc-200 md:text-lg">
                  {overview || "No hay descripción disponible."}
                </p>
              </InfoGlassPanel>
            </div>
          )}

          {/* ===== TAB: DETALLES ===== */}
          {activeTab === "details" && (
            <div key="details">
              {mobileLayout ? (
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
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
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
                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
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
                      className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                    />
                  ) : null}

                  {/* Estreno / Inicio */}
                  <VisualMetaCard
                    icon={CalendarIcon}
                    label={mediaType === "movie" ? "Estreno" : "Inicio"}
                    value={metadataLoading ? null : releaseDateValue || "—"}
                    isLoading={metadataLoading}
                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
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
                      className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
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
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        )}
                        {revenueValue && (
                          <VisualMetaCard
                            icon={TrendingUp}
                            label="Recaudación"
                            value={revenueValue}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
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
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                        <VisualMetaCard
                          icon={TrendingUp}
                          label="Recaudación"
                          value={metadataLoading ? null : revenueValue || "—"}
                          isLoading={metadataLoading}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      </>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: PRODUCCIÓN Y EQUIPO ===== */}
          {activeTab === "production" && (
            <div key="production">
              {mobileLayout ? (
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
                  <VisualMetaCard
                    icon={Trophy}
                    label="Premios"
                    value={metadataLoading ? null : awardsValue || "—"}
                    isLoading={metadataLoading}
                    className="w-full"
                  />
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
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
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
                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                  />

                  {/* Canal (solo TV) */}
                  {mediaType !== "movie" &&
                    (isBackdrop
                      ? network && (
                          <VisualMetaCard
                            icon={MonitorPlay}
                            label="Canal"
                            value={network}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        )
                      : (
                          <VisualMetaCard
                            icon={MonitorPlay}
                            label="Canal"
                            value={metadataLoading ? null : network || "—"}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        ))}

                  {/* Producción (ambos) */}
                  <VisualMetaCard
                    icon={Building2}
                    label="Producción"
                    value={metadataLoading ? null : productionText || "—"}
                    expanded={true}
                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                  />
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: PLATAFORMAS (solo diseño móvil de DetailsClient) ===== */}
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
    </>
  );
}
