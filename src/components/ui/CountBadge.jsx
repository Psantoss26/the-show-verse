// Insignia redonda con un número: la de las píldoras de los filtros
// (SheetOption) y la de las pestañas del menú de secciones del Perfil.
// `tone`: "glass" (sobre fondo oscuro), "onLight" (sobre una píldora blanca)
// o "active" (pestaña elegida sobre fondo oscuro).
// `size`: "md" (20 px, cifra de 11 px) o "tab": en las pestañas del Perfil,
// mientras el menú es estrecho (móvil), la misma insignia algo menor (18 px,
// cifra de 10 px) para que quepa en la fila del título; desde 640 px de ancho
// del contenedor `detail-page`, la de siempre.
// `pt-px`: las cifras de PT Sans quedan 1 px por encima del centro de su línea
// (medido: 5,5 px de hueco arriba y 6,5 abajo); así quedan centradas.
const SIZES = {
  md: "min-h-5 min-w-5 px-1.5 text-[11px]",
  tab: "min-h-[18px] min-w-[18px] px-[5px] text-[10px] @[640px]/detail-page:min-h-5 @[640px]/detail-page:min-w-5 @[640px]/detail-page:px-1.5 @[640px]/detail-page:text-[11px]",
};

const TONES = {
  glass: "bg-white/[0.08] text-zinc-400",
  onLight: "bg-zinc-950/10 text-zinc-700",
  active: "bg-white/[0.14] text-white",
};

export default function CountBadge({ children, tone = "glass", size = "md", className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full pt-px font-bold normal-case tracking-normal tabular-nums leading-none ${SIZES[size] || SIZES.md} ${
        TONES[tone] || TONES.glass
      } ${className}`}
    >
      {children}
    </span>
  );
}
