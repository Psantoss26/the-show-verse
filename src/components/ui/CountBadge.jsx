// Insignia redonda con un número: la de las píldoras de los filtros
// (SheetOption) y la de las pestañas del menú de secciones del Perfil.
// `tone`: "glass" (sobre fondo oscuro), "onLight" (sobre una píldora blanca)
// o "active" (pestaña elegida sobre fondo oscuro).
// `pt-px`: las cifras de PT Sans quedan 1 px por encima del centro de su línea
// (medido: 5,5 px de hueco arriba y 6,5 abajo); así quedan centradas.
const TONES = {
  glass: "bg-white/[0.08] text-zinc-400",
  onLight: "bg-zinc-950/10 text-zinc-700",
  active: "bg-white/[0.14] text-white",
};

export default function CountBadge({ children, tone = "glass", className = "" }) {
  return (
    <span
      className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 pt-px text-[11px] font-bold normal-case tracking-normal tabular-nums leading-none ${
        TONES[tone] || TONES.glass
      } ${className}`}
    >
      {children}
    </span>
  );
}
