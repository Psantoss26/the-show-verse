"use client";

import { Heart, Loader2 } from "lucide-react";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_CARD } from "@/lib/ui/liquidGlass";
import { COMMENT_TABS } from "@/lib/details/commentFilters";

// Barra de filtros de la sección de comentarios (ficha y vista de teléfono):
// pestañas «Populares» / «Recientes» y, junto a ellas, «Más likes» (solo el
// corazón), que reordena la pestaña por me gusta. Mismo cristal que las
// pestañas activas.
const PILL_BASE =
  "relative isolate flex shrink-0 transform-gpu items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold transition-all";
const PILL_IDLE = "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white";

export default function CommentFilterBar({
  tab,
  byLikes = false,
  onTabChange,
  onLikesChange,
  loading = false,
  controlsId,
}) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-2 border-b border-transparent bg-white/5 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2" role="group" aria-label="Filtrar comentarios">
        {COMMENT_TABS.map((option) => {
          const active = tab === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onTabChange?.(option.id)}
              aria-pressed={active}
              aria-controls={controlsId}
              className={`${PILL_BASE} ${active ? `${LIQUID_GLASS_CARD} text-white` : PILL_IDLE}`}
            >
              {active ? <LiquidGlassOpticalLayers /> : null}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
        {/* «Más likes», solo con el icono: el nombre lo dan aria-label y title. */}
        <button
          type="button"
          onClick={() => onLikesChange?.(!byLikes)}
          aria-pressed={byLikes}
          aria-controls={controlsId}
          aria-label="Ordenar por likes"
          title={byLikes ? "Quitar el orden por likes" : "Ordenar por likes"}
          className={`${PILL_BASE} !px-0 h-[30px] w-[30px] ${byLikes ? `${LIQUID_GLASS_CARD} text-white` : PILL_IDLE}`}
        >
          {byLikes ? <LiquidGlassOpticalLayers /> : null}
          <Heart
            className={`relative z-10 h-3.5 w-3.5 ${byLikes ? "fill-pink-400 text-pink-400" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-hidden="true" /> : null}
    </div>
  );
}
