// Antetítulo con línea horizontal: línea de color en degradado que se apaga
// hacia el texto y etiqueta en mayúsculas muy espaciada. Es el de las páginas
// de usuario (UserPageHeading) y el que llevan encima de su título todas las
// secciones de los dashboards, para que ambos se lean igual.
//
// En el móvil se estrecha (línea más corta, menos espaciado). Las clases
// `sv-upage-eyebrow-*` solo animan dentro de `.sv-upage-heading[data-animate]`
// (globals.css); en las filas de los dashboards la entrada ya la da framer.

const ACCENTS = {
  red: { line: "from-red-500", text: "text-red-400" },
  blue: { line: "from-blue-500", text: "text-blue-400" },
  emerald: { line: "from-emerald-500", text: "text-emerald-400" },
  purple: { line: "from-purple-500", text: "text-purple-400" },
  pink: { line: "from-pink-500", text: "text-pink-400" },
  yellow: { line: "from-yellow-500", text: "text-yellow-400" },
  orange: { line: "from-orange-500", text: "text-orange-400" },
  amber: { line: "from-amber-500", text: "text-amber-400" },
  sky: { line: "from-sky-500", text: "text-sky-400" },
  fuchsia: { line: "from-fuchsia-500", text: "text-fuchsia-400" },
  rose: { line: "from-rose-500", text: "text-rose-400" },
  indigo: { line: "from-indigo-500", text: "text-indigo-400" },
};

// Centrado de la línea: NO con `items-center`. Eso la centra en la caja de
// línea entera (con el hueco de los descendentes y el interlineado), y como la
// etiqueta va en mayúsculas la línea quedaba ~1,5 px por debajo del centro de
// las letras. Se alinean por la línea base y la línea sube media altura de
// mayúscula (`0.5cap`, con el tamaño de letra del contenedor): queda en el
// centro de las mayúsculas a cualquier tamaño y fuente. Se sube con `bottom`
// (posición relativa), no con transform, que lo usa su animación de entrada.
export default function SectionEyebrow({ children, accent = "amber", className = "mb-1.5 md:mb-2" }) {
  const a = ACCENTS[accent] ?? ACCENTS.amber;
  return (
    <div className={`flex min-w-0 items-baseline gap-2.5 md:gap-3 text-[11px] md:text-xs ${className}`}>
      <span
        aria-hidden="true"
        className={`sv-upage-eyebrow-line relative bottom-[calc(0.5cap-0.5px)] h-px w-7 shrink-0 md:w-12 bg-gradient-to-r ${a.line} via-current to-transparent ${a.text}`}
      />
      <span
        className={`sv-upage-eyebrow-text min-w-0 truncate ${a.text} font-bold uppercase tracking-[0.16em] md:tracking-[0.28em]`}
      >
        {children}
      </span>
    </div>
  );
}
