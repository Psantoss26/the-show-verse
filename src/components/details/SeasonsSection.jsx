"use client";

// Sección «Temporadas» de la ficha completa (DetailsClient), con dos vistas:
//   - Tarjetas: las tarjetas completas (SeasonCard) en rejilla, como máximo
//     dos filas (6 temporadas) y un botón para ver el resto.
//   - Pósters: solo el póster de cada temporada en fila horizontal, como los
//     carruseles de Reparto y Recomendaciones.
//
// La vista elegida y el desplegado viven AQUÍ y no en DetailsClient: cambiar
// de vista solo re-renderiza esta sección, no la ficha entera. La vista se
// recuerda en el navegador.

import { useEffect, useState } from "react";
import { SwiperSlide } from "swiper/react";
import { ChevronDown, ChevronUp, GalleryHorizontalEnd, Layers, LayoutGrid, Loader2 } from "lucide-react";
import DetailsArrowCarousel from "@/components/details/DetailsArrowCarousel";
import SectionTitle from "@/components/details/SectionTitle";
import SeasonCard, { SeasonPosterCard } from "@/components/details/SeasonCard";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_BAR } from "@/lib/ui/liquidGlass";

const VIEW_KEY = "showverse:details:seasonsView";
const VIEWS = [
  { id: "cards", label: "Tarjetas", icon: LayoutGrid },
  { id: "posters", label: "Pósters", icon: GalleryHorizontalEnd },
];
// Dos filas de la rejilla de escritorio (3 columnas).
const COLLAPSED_CARDS = 6;

function readSavedView() {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.some((view) => view.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

export default function SeasonsSection({ items = [], loading = false, onOpenAll }) {
  const [view, setView] = useState("cards");
  const [expanded, setExpanded] = useState(false);
  // Tras montar: el servidor no conoce la vista guardada.
  useEffect(() => {
    const saved = readSavedView();
    if (saved) setView(saved);
  }, []);

  const chooseView = (next) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sin almacenamiento: la vista vale para esta visita.
    }
  };

  const hiddenCount = Math.max(0, items.length - COLLAPSED_CARDS);
  const visibleCards = expanded ? items : items.slice(0, COLLAPSED_CARDS);

  return (
    <section className="mb-12 group/section">
      <div className="flex w-full items-start justify-between gap-3">
        <SectionTitle
          title="Temporadas"
          icon={Layers}
          onOpen={onOpenAll}
          className="!mb-5 sm:!mb-8 !w-auto flex-1 min-w-0 pr-4 sm:pr-6"
        />
        <div
          role="group"
          aria-label="Vista de las temporadas"
          className={`relative isolate flex shrink-0 items-center gap-1 self-start overflow-hidden rounded-full p-1 ${LIQUID_GLASS_BAR}`}
        >
          {/* Mismo selector solo de iconos que el de episodios de SeasonDetails. */}
          <LiquidGlassOpticalLayers />
          {VIEWS.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseView(option.id)}
                aria-pressed={active}
                aria-label={`Vista ${option.label.toLowerCase()}`}
                title={`Vista ${option.label.toLowerCase()}`}
                className={[
                  "relative z-10 grid h-9 w-9 place-items-center rounded-full transition-[color,background-color,box-shadow,transform] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300",
                  active
                    ? "bg-white/[0.16] text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.9)]"
                    : "text-white/65 hover:bg-white/[0.08] hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-white/50" aria-label="Cargando temporadas" />
        </div>
      ) : view === "posters" ? (
        <DetailsArrowCarousel
          spaceBetween={12}
          slidesPerView={3}
          breakpoints={{
            500: { slidesPerView: 3, spaceBetween: 14 },
            768: { slidesPerView: 4, spaceBetween: 16 },
            1024: { slidesPerView: 5, spaceBetween: 18 },
            1280: { slidesPerView: 6, spaceBetween: 20 },
          }}
          className="pb-8 !overflow-visible"
        >
          {items.map(({ key, ...season }) => (
            <SwiperSlide key={key}>
              <SeasonPosterCard {...season} />
            </SwiperSlide>
          ))}
        </DetailsArrowCarousel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCards.map(({ key, ...season }) => (
              <SeasonCard key={key} {...season} />
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 px-5 text-sm font-bold text-zinc-200 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur-[50px] transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
              >
                {expanded ? (
                  <>
                    Ver menos
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Ver {hiddenCount} {hiddenCount === 1 ? "temporada más" : "temporadas más"}
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
