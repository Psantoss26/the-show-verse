import { PLAN_VISUALS } from "@/components/billing/planVisuals";
import { planName } from "@/lib/billing/plans";

// Insignia del plan de un usuario, junto a su nombre: logo y nombre del plan
// con los colores de las tarjetas de /planes (planVisuals). El backend envía
// siempre el plan público (`publicPlanBadge`: el que se paga o 'free'),
// también con la facturación apagada.
//
// `showFree`: el plan Gratis solo se enseña donde se pide (título del
// perfil); en las listas de miembros llevaría insignia casi todo el mundo y
// solo destaca quien paga.
// `collapse`: en pantallas estrechas solo el logo (filas de miembros, donde el
// texto se comía el nombre); el plan sigue en el tooltip y para lectores.
// `size`: "sm" (filas), "md" y "title" (junto al nombre grande del perfil;
// crece con el contenedor `detail-page`).
const SIZES = {
  sm: { box: "h-5 gap-1 px-2 text-[10px]", icon: "h-3 w-3" },
  md: { box: "h-6 gap-1.5 px-2.5 text-[11px]", icon: "h-3.5 w-3.5" },
  title: {
    box: "h-6 gap-1.5 px-2.5 text-[11px] @[640px]/detail-page:h-7 @[640px]/detail-page:px-3 @[640px]/detail-page:text-xs",
    icon: "h-3.5 w-3.5 @[640px]/detail-page:h-4 @[640px]/detail-page:w-4",
  },
};

export default function PlanBadge({ plan, size = "sm", collapse = false, showFree = false, className = "", ...rest }) {
  const visuals = PLAN_VISUALS[plan];
  if (!visuals || (plan === "free" && !showFree)) return null;
  const Icon = visuals.icon;
  const name = planName(plan);
  const sizing = collapse ? "h-5 w-5 justify-center text-[10px] sm:w-auto sm:gap-1 sm:px-2" : SIZES[size].box;
  const iconSize = collapse ? SIZES.sm.icon : SIZES[size].icon;
  return (
    <span
      title={`Plan ${name}`}
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase leading-none tracking-wider ${sizing} ${visuals.badge} ${className}`}
      {...rest}
    >
      <Icon className={`shrink-0 ${iconSize}`} aria-hidden="true" />
      <span className="sr-only">Plan </span>
      <span className={collapse ? "sr-only sm:not-sr-only" : undefined}>{name}</span>
    </span>
  );
}
