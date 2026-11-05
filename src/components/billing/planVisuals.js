import { AdFreePlanIcon, FreePlanIcon, ProPlanIcon, VipPlanIcon } from "@/components/billing/planIcons";

// Logo y colores de cada plan: los comparten las tarjetas de /planes
// (PlanPicker) y la insignia del perfil y de las filas de miembros
// (PlanBadge), para que cada plan se reconozca igual en toda la app.
//
// Insignia: píldora con un degradado suave (sin borde) y, a la izquierda, una
// medalla con el logo (`pillSm`: la misma píldora solo desde sm, para la
// insignia plegada); Pro lleva además un brillo y el nombre en degradado.
//
// VIP no es un plan que se contrate (no está en /planes): es la insignia de
// las cuentas del equipo (VIP_USERNAMES en el backend). Oro con corona, un
// difuminado dorado por dentro (sin canto marcado) y más brillo que Pro, para que se lea como un rango y no
// como otra tarifa. Lleva su propio `name` porque no está en PLANS.
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
  vip: {
    name: "VIP",
    icon: VipPlanIcon,
    tile: "bg-amber-400/15 text-amber-300",
    check: "text-amber-300",
    pill: "bg-gradient-to-r from-amber-300/[0.30] via-yellow-200/[0.12] to-orange-300/[0.05] shadow-[inset_0_0_10px_rgba(252,211,77,0.22),0_0_22px_-8px_rgba(251,191,36,0.95)]",
    pillSm: "sm:bg-gradient-to-r sm:from-amber-300/[0.30] sm:via-yellow-200/[0.12] sm:to-orange-300/[0.05] sm:shadow-[inset_0_0_10px_rgba(252,211,77,0.22),0_0_22px_-8px_rgba(251,191,36,0.95)]",
    medal: "bg-gradient-to-br from-yellow-100 via-amber-300 to-orange-400 text-amber-950 shadow-[0_0_10px_-2px_rgba(251,191,36,0.9)]",
    label: "bg-gradient-to-r from-yellow-100 via-amber-200 to-amber-300 bg-clip-text text-transparent",
  },
};
