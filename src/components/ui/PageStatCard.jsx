import Link from "next/link";
import StatSwap from "@/components/ui/StatSwap";

const SWAP_CARD_STAGGER = 0.05;
const SWAP_PIECE_STAGGER = 0.035;

// Tarjeta de información de la cabecera de las páginas de usuario. Es la ÚNICA
// versión: Favoritos, Pendientes, Biblioteca, Dashboard, Listas, Historial,
// En progreso, Continuar viendo, Perfil y Social la usan tal cual, para que no
// vuelvan a separarse.
//
// DOS TAMAÑOS
//  - Móvil (< md): MINI TARJETA de ~50px de alto. Icono pequeño y cifra en una
//    línea, etiqueta debajo en UNA sola línea (`shortLabel` si no cabe).
//    Ocupa la mitad que la grande y deja ver el contenido nada más abrir la
//    página; caben cuatro en 390px.
//  - Desde md: la tarjeta de siempre (icono encima, cifra grande, etiqueta),
//    con las mismas medidas que antes de existir el modo compacto.
// El salto va por VIEWPORT y no por contenedor a propósito: así se comportan
// igual las páginas que están dentro del contenedor del drawer y las que no.
//
// `className` añade lo que depende de la rejilla de cada página (p. ej.
// `flex-1 lg:flex-none` cuando la tarjeta es el hijo directo de la fila, o las
// alturas mínimas de escritorio de Historial). Con `href` la tarjeta es un
// enlace (Perfil y Social: seguidores, seguidos…).
//
// Con `animateChanges` la tarjeta se queda montada cuando la página cambia lo
// que muestra (p. ej. las pestañas de Listas) y solo se relevan, animados, el
// icono, la cifra y la etiqueta que cambian (`StatSwap`). `iconKey` identifica
// el icono (y su color) para saber cuándo ha cambiado.
//
// `dense` (solo desde md) achica la tarjeta grande —menos relleno, icono y
// cifra más pequeños, sin ancho mínimo— para cabeceras donde comparte fila con
// el nombre y no cabe todo (el Perfil con el panel lateral abierto). La mini
// tarjeta de móvil no cambia.
//
// `swapGroup` identifica la sección que se muestra (la pestaña de Listas, la
// página de Historial o Continuar viendo…): al cambiar, se relevan TODAS las
// piezas de todas las tarjetas, también las que coinciden («Películas»), para
// que el cambio de sección se lea entero. `swapIndex` (posición de la tarjeta
// en la fila) escalona el relevo de izquierda a derecha.
export default function PageStatCard({
  label,
  // Etiqueta de la mini tarjeta (móvil), que va SIEMPRE en una línea: para
  // las que no caben enteras ("Progreso medio" → "Progreso").
  shortLabel,
  value,
  icon: Icon,
  colorClass = "text-white",
  iconClassName = "",
  loading = false,
  href,
  title,
  prefetch,
  focusRingClass = "focus-visible:ring-white/60",
  glass = true,
  className = "",
  animateChanges = false,
  iconKey,
  swapGroup = "",
  swapIndex = 0,
  dense = false,
}) {
  // Escalonado: por tarjeta y, dentro de ella, icono → cifra → etiqueta.
  const swap = (key, content, swapClassName, piece) =>
    animateChanges ? (
      <StatSwap
        swapKey={`${swapGroup}|${key}`}
        className={swapClassName}
        delay={swapIndex * SWAP_CARD_STAGGER + piece * SWAP_PIECE_STAGGER}
      >
        {content}
      </StatSwap>
    ) : (
      content
    );

  const interactive = href
    ? `transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07] focus-visible:outline-none focus-visible:ring-2 ${focusRingClass}`
    : "";
  const size = dense
    ? "rounded-2xl md:rounded-[1.5rem] px-2 py-2 md:px-3 md:py-3"
    : "lg:min-w-[120px] rounded-2xl md:rounded-[2rem] px-2 py-2 md:px-5 md:py-4";
  const classes = `relative overflow-hidden w-full h-full min-w-0 ${size} bg-gradient-to-br from-white/10 to-white/5 ${glass ? "backdrop-blur-lg" : ""} shadow-lg flex flex-col items-center justify-center gap-1.5 md:gap-1 text-center ${interactive} ${className}`;

  const body = (
    <>
      {/* En móvil icono y cifra comparten línea; desde md vuelven a apilarse
          (el `mb-1` del icono + el hueco reproducen la separación original). */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 md:flex-col md:gap-1">
        <span className={`inline-flex md:mb-1 ${colorClass}`}>
          {swap(
            `${iconKey ?? label}|${colorClass}`,
            <Icon
              className={`w-4 h-4 ${dense ? "md:w-5 md:h-5" : "md:w-7 md:h-7"} shrink-0 ${iconClassName}`}
              aria-hidden="true"
            />,
            "inline-flex",
            0,
          )}
        </span>
        <span className={`block text-base max-md:leading-none ${dense ? "md:text-xl lg:text-2xl" : "md:text-2xl lg:text-3xl"} font-black text-white tracking-tight drop-shadow-md`}>
          {swap(
            loading ? "loading" : `value:${value}`,
            loading ? (
              <span className="block h-4 w-8 md:h-8 md:w-14 lg:h-9 rounded-md md:rounded-lg bg-white/10 animate-pulse" />
            ) : (
              value
            ),
            "block",
            1,
          )}
        </span>
      </div>
      <span className="relative z-10 block max-w-full text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight max-md:truncate">
        {swap(
          `${shortLabel ?? ""}|${label}`,
          shortLabel ? (
            <>
              <span className="md:hidden">{shortLabel}</span>
              <span className="max-md:hidden">{label}</span>
            </>
          ) : (
            label
          ),
          "block max-w-full max-md:truncate",
          2,
        )}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} prefetch={prefetch} className={classes} title={title}>
        {body}
      </Link>
    );
  }
  return (
    <div className={classes} title={title}>
      {body}
    </div>
  );
}
