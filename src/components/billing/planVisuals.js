import { ShieldOff, Sparkles, Tv } from "lucide-react";

// Logo y colores de cada plan: los comparten las tarjetas de /planes
// (PlanPicker) y la insignia del perfil y de las filas de miembros
// (PlanBadge), para que cada plan se reconozca igual en toda la app.
export const PLAN_VISUALS = {
  free: {
    icon: Tv,
    tile: "bg-white/[0.06] text-zinc-300",
    check: "text-zinc-300",
    badge: "bg-white/[0.06] text-zinc-300 ring-1 ring-inset ring-white/[0.12]",
  },
  adfree: {
    icon: ShieldOff,
    tile: "bg-sky-400/10 text-sky-300",
    check: "text-sky-300",
    badge: "bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/30",
  },
  pro: {
    icon: Sparkles,
    tile: "bg-emerald-400/15 text-emerald-300",
    check: "text-emerald-400",
    // Pro es el único relleno: destaca sin necesitar más tamaño.
    badge: "bg-gradient-to-r from-emerald-400 to-teal-300 text-black shadow-[0_0_18px_-6px_rgba(52,211,153,0.8)]",
  },
};
