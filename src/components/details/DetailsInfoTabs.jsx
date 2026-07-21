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
} from "lucide-react";

import { VisualMetaCard, DetailsTabsMenu } from "@/components/details/DetailAtoms";
import AwardsPanel from "@/components/details/AwardsPanel";
import { translateGenre } from "@/lib/details/formatters";

export default function DetailsInfoTabs({
  variant = "normal",
  layoutId = "detailsTabInline",
  mediaType,
  originalTitle,
  formatValue,
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
}) {
  const [activeTab, setActiveTab] = useState("details");
  const isBackdrop = variant === "backdrop";
  const hasAwardItems = awardItems.length > 0;
  const hasAwardsTab = showAwardsTab && (awards || hasAwardItems);
  const genresValue = Array.isArray(genres)
    ? genres
        .filter(Boolean)
        .map((genre) => translateGenre(genre.name || genre))
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <>
      {/* ========== MENÚ DE NAVEGACIÓN DE TABS ========== */}
      <DetailsTabsMenu
        tabs={[
          { id: "details", label: "Detalles" },
          { id: "production", label: "Producción" },
          { id: "synopsis", label: "Sinopsis" },
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
              <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                {/* Capa de fondo suave */}
                <div
                  className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                  style={{
                    WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                  }}
                />
                <div className="relative z-10">
                  {tagline && (
                    <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                      {isBackdrop ? `"${tagline}"` : `“${tagline}”`}
                    </div>
                  )}
                  <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                    {overview || "No hay descripción disponible."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: DETALLES ===== */}
          {activeTab === "details" && (
            <div key="details">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                {/* Título Original */}
                <VisualMetaCard
                  icon={mediaType === "movie" ? FilmIcon : MonitorPlay}
                  label="Título Original"
                  value={originalTitle}
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

                {/* Duración (solo series) */}
                {mediaType !== "movie" ? (
                  <VisualMetaCard
                    icon={Layers}
                    label="Duración"
                    value={formatValue}
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

                {/* Finalización / Última emisión (solo series) */}
                {mediaType !== "movie" && lastAirDateValue && (
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
            </div>
          )}

          {/* ===== TAB: PRODUCCIÓN Y EQUIPO ===== */}
          {activeTab === "production" && (
            <div key="production">
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
                          value={network || "—"}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      ))}

                {/* Producción (ambos) */}
                <VisualMetaCard
                  icon={Building2}
                  label="Producción"
                  value={productionText || "—"}
                  expanded={true}
                  className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                />
              </div>
            </div>
          )}

          {/* ===== TAB: PREMIOS ===== */}
          {activeTab === "awards" && hasAwardsTab && (
            <div key="awards">
              {awards ? (
                <AwardsPanel awards={awards} />
              ) : (
                <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                  <div
                    className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                    style={{
                      WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                    }}
                  />
                  <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none z-10" />
                  <div className="relative z-10">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                        <Trophy className="w-8 h-8" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-white mb-2">
                          Premios y nominaciones
                        </h3>
                        <p className="text-base leading-relaxed text-zinc-200">
                          {
                            awardItems.filter((a) => a.result === "winner")
                              .length
                          }{" "}
                          premios y{" "}
                          {
                            awardItems.filter((a) => a.result === "nominee")
                              .length
                          }{" "}
                          nominaciones
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
