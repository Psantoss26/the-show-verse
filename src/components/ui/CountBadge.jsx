// Insignia redonda con un número: la de las píldoras de los filtros
// (SheetOption) y la de las pestañas del menú de secciones del Perfil.
// `tone`: "glass" (sobre fondo oscuro), "onLight" (sobre una píldora blanca)
// o "active" (pestaña elegida sobre fondo oscuro).
// `size`: "md" (20 px, cifra de 11 px) o "tab": en las pestañas del Perfil,
// mientras el menú es estrecho (móvil), la misma insignia en pequeño (14 px,
// cifra de 8 px) para que quepa en la fila del título dentro de su cuarto de
// menú; desde 640 px de ancho del contenedor `detail-page`, la de siempre.
// `pt-px`: las cifras de PT Sans quedan 1 px por encima del centro de su línea
// (medido: 5,5 px de hueco arriba y 6,5 abajo); así quedan centradas. En la
// insignia pequeña de "tab" (cifra de 8 px) basta medio píxel, y la insignia
// sube 0,6 px para quedar centrada con las mayúsculas del título (medido en
// píxeles pintados a 2×, 3× y 4×: no hay más de 1 px de dispositivo de error).
const SIZES = {
  md: "min-h-5 min-w-5 px-1.5 text-[11px]",
  tab: "min-h-3.5 min-w-3.5 -translate-y-[0.6px] px-1 !pt-[0.5px] text-[8px] @[640px]/detail-page:translate-y-0 @[640px]/detail-page:!pt-px @[640px]/detail-page:min-h-5 @[640px]/detail-page:min-w-5 @[640px]/detail-page:px-1.5 @[640px]/detail-page:text-[11px]",
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
