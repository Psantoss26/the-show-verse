import { ShieldOff, Sparkles } from "lucide-react";

// Insignia del plan de pago de un usuario, junto a su nombre (perfil y filas
// de miembros). El plan gratis no lleva: así solo destaca quien paga. Los
// colores son los acentos de las tarjetas de /planes (PlanPicker).
const BADGES = {
  pro: {
    label: "Pro",
    title: "Miembro Pro",
    icon: Sparkles,
    className: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  },
  adfree: {
    label: "Sin anuncios",
    title: "Miembro sin anuncios",
    icon: ShieldOff,
    className: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  },
};

// `collapse`: en pantallas estrechas solo el icono (filas de miembros, donde
// el texto se comía el nombre); el plan sigue en el tooltip y para lectores.
export default function PlanBadge({ plan, size = "sm", collapse = false, className = "" }) {
  const badge = BADGES[plan];
  if (!badge) return null;
  const Icon = badge.icon;
  const sizing =
    size === "md"
      ? "h-6 gap-1.5 px-2.5 text-[11px]"
      : collapse
        ? "h-5 w-5 justify-center text-[10px] sm:w-auto sm:gap-1 sm:px-2"
        : "h-5 gap-1 px-2 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      title={badge.title}
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase leading-none tracking-wider ring-1 ring-inset ${sizing} ${badge.className} ${className}`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      <span className="sr-only">Plan </span>
      <span className={collapse ? "sr-only sm:not-sr-only" : undefined}>{badge.label}</span>
    </span>
  );
}
