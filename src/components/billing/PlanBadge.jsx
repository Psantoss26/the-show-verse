import { PLAN_VISUALS } from "@/components/billing/planVisuals";
import { planName } from "@/lib/billing/plans";

// Insignia del plan de un usuario, junto a su nombre: logo y nombre del plan
// con los colores de las tarjetas de /planes (planVisuals). El backend envía
// siempre el plan público (`publicPlanBadge`: el que se paga o 'free'),
// también con la facturación apagada.
//
// `showFree`: el plan Gratis solo se enseña donde se pide (cabecera del
// perfil); en las listas de miembros llevaría insignia casi todo el mundo y
// solo destaca quien paga.
// `collapse`: en pantallas estrechas solo la medalla (filas de miembros, donde
// el texto se comía el nombre); el plan sigue en el tooltip y para lectores.
// `size`: "sm" (filas de miembros) o "md" (bajo el nombre del perfil, junto
// al @usuario).
const SIZES = {
  sm: { pill: "h-5 gap-1 pl-0.5 pr-2 text-[10px]", medal: "h-4 w-4", glyph: "h-2.5 w-2.5" },
  md: { pill: "h-6 gap-1.5 pl-[3px] pr-2.5 text-[11px]", medal: "h-[18px] w-[18px]", glyph: "h-3 w-3" },
};

export default function PlanBadge({ plan, size = "sm", collapse = false, showFree = false, className = "", ...rest }) {
  const visuals = PLAN_VISUALS[plan];
  if (!visuals || (plan === "free" && !showFree)) return null;
  const Icon = visuals.icon;
  const name = planName(plan);
  const sizes = SIZES[size];
  // Plegada: en el móvil queda solo la medalla, sin píldora.
  const pill = collapse ? `h-5 text-[10px] sm:gap-1 sm:pl-0.5 sm:pr-2 ${visuals.pillSm}` : `${sizes.pill} ${visuals.pill}`;
  return (
    <span
      title={`Plan ${name}`}
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase leading-none tracking-wider ${pill} ${className}`}
      {...rest}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full ${collapse ? SIZES.sm.medal : sizes.medal} ${visuals.medal}`}>
        <Icon className={`shrink-0 ${collapse ? SIZES.sm.glyph : sizes.glyph}`} />
      </span>
      <span className="sr-only">Plan </span>
      <span className={`${collapse ? "sr-only sm:not-sr-only" : ""} ${visuals.label}`}>{name}</span>
    </span>
  );
}
