import { AdFreePlanIcon, FreePlanIcon, ProPlanIcon } from "@/components/billing/planIcons";

// Logo y colores de cada plan: los comparten las tarjetas de /planes
// (PlanPicker) y la insignia del perfil y de las filas de miembros
// (PlanBadge), para que cada plan se reconozca igual en toda la app.
//
// Insignia: píldora con un degradado suave (sin borde) y, a la izquierda, una
// medalla con el logo (`pillSm`: la misma píldora solo desde sm, para la
// insignia plegada); Pro lleva además un brillo y el nombre en degradado.
export const PLAN_VISUALS = {
  free: {
    icon: FreePlanIcon,
    tile: "bg-white/[0.06] text-zinc-300",
    check: "text-zinc-300",
    pill: "bg-gradient-to-r from-white/[0.10] to-white/[0.03] text-zinc-200",
    pillSm: "sm:bg-gradient-to-r sm:from-white/[0.10] sm:to-white/[0.03] text-zinc-200",
    medal: "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-900",
    label: "",
  },
  adfree: {
    icon: AdFreePlanIcon,
    tile: "bg-sky-400/10 text-sky-300",
    check: "text-sky-300",
    pill: "bg-gradient-to-r from-sky-400/[0.22] to-indigo-400/[0.06] text-sky-100",
    pillSm: "sm:bg-gradient-to-r sm:from-sky-400/[0.22] sm:to-indigo-400/[0.06] text-sky-100",
    medal: "bg-gradient-to-br from-sky-300 to-indigo-400 text-sky-950",
    label: "",
  },
  pro: {
    icon: ProPlanIcon,
    tile: "bg-emerald-400/15 text-emerald-300",
    check: "text-emerald-400",
    pill: "bg-gradient-to-r from-emerald-400/[0.26] to-teal-300/[0.06] shadow-[0_0_20px_-8px_rgba(52,211,153,0.9)]",
    pillSm: "sm:bg-gradient-to-r sm:from-emerald-400/[0.26] sm:to-teal-300/[0.06] sm:shadow-[0_0_20px_-8px_rgba(52,211,153,0.9)]",
    medal: "bg-gradient-to-br from-emerald-300 via-teal-300 to-cyan-300 text-emerald-950 shadow-[0_0_10px_-2px_rgba(45,212,191,0.8)]",
    label: "bg-gradient-to-r from-emerald-200 to-teal-100 bg-clip-text text-transparent",
  },
};
