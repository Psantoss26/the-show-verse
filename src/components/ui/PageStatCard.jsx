import Link from "next/link";

// Tarjeta de información de la cabecera de las páginas de usuario. Es la ÚNICA
// versión: Favoritos, Pendientes, Biblioteca, Dashboard, Listas, Historial,
// En progreso, Continuar viendo, Perfil y Social la usan tal cual, para que no
// vuelvan a separarse.
//
// DOS TAMAÑOS
//  - Móvil (< md): MINI TARJETA de ~52px de alto. Icono pequeño y cifra en una
//    línea, etiqueta debajo. Ocupa la mitad que la grande y deja ver el
//    contenido nada más abrir la página; caben cuatro en 390px.
//  - Desde md: la tarjeta de siempre (icono encima, cifra grande, etiqueta),
//    con las mismas medidas que antes de existir el modo compacto.
// El salto va por VIEWPORT y no por contenedor a propósito: así se comportan
// igual las páginas que están dentro del contenedor del drawer y las que no.
//
// `className` añade lo que depende de la rejilla de cada página (p. ej.
// `flex-1 lg:flex-none` cuando la tarjeta es el hijo directo de la fila, o las
// alturas mínimas de escritorio de Historial). Con `href` la tarjeta es un
// enlace (Perfil y Social: seguidores, seguidos…).
export default function PageStatCard({
  label,
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
}) {
  const interactive = href
    ? `transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07] focus-visible:outline-none focus-visible:ring-2 ${focusRingClass}`
    : "";
  const classes = `relative overflow-hidden w-full h-full min-w-0 lg:min-w-[120px] rounded-2xl md:rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 ${glass ? "backdrop-blur-lg" : ""} shadow-lg px-2 py-2 md:px-5 md:py-4 flex flex-col items-center justify-center gap-0.5 md:gap-1 text-center ${interactive} ${className}`;

  const body = (
    <>
      {/* En móvil icono y cifra comparten línea; desde md vuelven a apilarse
          (el `mb-1` del icono + el hueco reproducen la separación original). */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 md:flex-col md:gap-1">
        <span className={`inline-flex md:mb-1 ${colorClass}`}>
          <Icon
            className={`w-4 h-4 md:w-7 md:h-7 shrink-0 ${iconClassName}`}
            aria-hidden="true"
          />
        </span>
        <span className="block text-base max-md:leading-none md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
          {loading ? (
            <span className="block h-4 w-8 md:h-8 md:w-14 lg:h-9 rounded-md md:rounded-lg bg-white/10 animate-pulse" />
          ) : (
            value
          )}
        </span>
      </div>
      <span className="relative z-10 block max-w-full text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
        {label}
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
