// Utilidades para animar SOLO las tarjetas que caben en pantalla al entrar
// (en vez de un tope fijo). Mismo criterio que las secciones de Perfil: se
// sobreestima ligeramente (animar de más es inofensivo; animar de menos deja
// tarjetas visibles sin animar). Se calcula en tiempo de render a partir del
// viewport y de las columnas de la vista actual, para que la decisión de
// animar/no-animar sea correcta ya en el primer pintado (framer-motion fija el
// estado inicial en el montaje).

// Elige el nº de columnas según el ancho actual imitando los breakpoints de
// Tailwind. `colsByBp` = { base, sm, md, lg, xl } (los que falten heredan del
// breakpoint inferior).
export function pickResponsiveColumns(colsByBp = {}) {
  if (typeof window === "undefined") return colsByBp.base ?? 3;
  const width = window.innerWidth;
  const chain =
    width >= 1280 ? ["xl", "lg", "md", "sm", "base"]
    : width >= 1024 ? ["lg", "md", "sm", "base"]
    : width >= 768 ? ["md", "sm", "base"]
    : width >= 640 ? ["sm", "base"]
    : ["base"];
  for (const key of chain) {
    if (colsByBp[key] != null) return colsByBp[key];
  }
  return colsByBp.base ?? 3;
}

// Nº de tarjetas a animar = las que cubren el viewport (con ~2 filas de margen).
// `aspect` = alto/ancho de la tarjeta (póster ≈ 1.5, backdrop ≈ 0.5625).
export function estimateVisibleCards({ columns, aspect = 1.5, cap = 200 } = {}) {
  if (typeof window === "undefined" || !columns) return 30;
  const containerWidth = Math.min(window.innerWidth, 1600) * 0.94;
  const gap = 12;
  const cardWidth = (containerWidth - gap * (columns - 1)) / Math.max(1, columns);
  const rowHeight = cardWidth * aspect + gap;
  const rows = Math.ceil(window.innerHeight / Math.max(70, rowHeight)) + 2;
  return Math.min(cap, Math.max(columns * 2, rows * columns));
}

// Favoritos y Pendientes: columnas de cada vista (las mismas que sus rejillas).
function userPageColumns(viewMode, imageMode) {
  if (viewMode === "list") return { base: 1, xl: 2 };
  if (viewMode === "compact") {
    return imageMode === "backdrop"
      ? { base: 2, sm: 3, md: 4, lg: 4, xl: 4 }
      : { base: 4, sm: 5, md: 6, lg: 7, xl: 8 };
  }
  return imageMode === "backdrop"
    ? { base: 2, sm: 2, md: 3, lg: 3, xl: 3 }
    : { base: 3, sm: 4, md: 5, lg: 6, xl: 6 };
}

// Columnas de la rejilla de Favoritos/Pendientes (y Descubrir) en la vista
// actual, sin medir el DOM.
export function estimateUserPageColumns({ viewMode, imageMode } = {}) {
  return pickResponsiveColumns(userPageColumns(viewMode, imageMode));
}

// Tarjetas que cubren la pantalla en Favoritos/Pendientes. Sirve para las dos
// decisiones de la entrada: cuántas se ANIMAN y cuántas se MONTAN en la primera
// tanda. Si se montaban menos de las que se ven (antes, 24 fijas: tres filas en
// la vista compacta de escritorio), el resto llegaba tras la espera de la
// siguiente tanda y aparecía de golpe, sin animar.
export function estimateUserPageEntranceCount({ viewMode, imageMode } = {}) {
  return estimateVisibleCards({
    columns: pickResponsiveColumns(userPageColumns(viewMode, imageMode)),
    aspect: viewMode === "list" || imageMode === "backdrop" ? 0.5625 : 1.5,
  });
}
