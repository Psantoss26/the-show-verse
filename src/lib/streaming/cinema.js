// Disponibilidad en cines (España).
//
// JustWatch publica ofertas `CINEMA` por cadena (Cinesa, Yelmo, Kinépolis,
// Odeon…) con el enlace de compra de entradas. Esas ofertas aparecen tanto
// para películas en cartelera como para estrenos en preventa: por sí solas no
// distinguen «en cines» de «próximamente». Por eso el estado se decide con la
// fecha de estreno en cines en España de TMDb (`release_dates`, tipo 3 o, si
// falta, tipo 2 limitado) y la fecha de hoy en Madrid.

// Entradas.com: agregador de entradas de casi todos los cines. Su página de la
// película lista todas las salas, así que es el mejor enlace único.
export const CINEMA_AGGREGATOR_PACKAGE_ID = 1970;

const JUSTWATCH_IMAGES_URL = "https://images.justwatch.com";

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    // Yelmo sigue publicando sus fichas en http; se sube a https (su web lo
    // sirve igual) para no enlazar contenido sin cifrar.
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cinemaIconUrl(icon) {
  if (!icon || typeof icon !== "string") return null;
  return `${JUSTWATCH_IMAGES_URL}${icon.replace("{profile}", "s100").replace("{format}", "png")}`;
}

// Cadenas con oferta de cine, una por paquete, con el agregador al final: es
// un vendedor de entradas, no un cine.
export function mapCinemaOffers(offers) {
  const chains = new Map();

  for (const offer of Array.isArray(offers) ? offers : []) {
    if (offer?.monetizationType !== "CINEMA" || !offer?.package) continue;

    const id = offer.package.packageId;
    const url = safeWebUrl(offer.standardWebURL);
    if (id == null || !url || chains.has(id)) continue;

    chains.set(id, {
      id,
      name: offer.package.clearName || "Cine",
      url,
      icon: cinemaIconUrl(offer.package.icon),
      isAggregator: id === CINEMA_AGGREGATOR_PACKAGE_ID,
    });
  }

  return Array.from(chains.values()).sort(
    (a, b) => Number(a.isAggregator) - Number(b.isAggregator),
  );
}

// Fecha (AAAA-MM-DD) del estreno en cines en España según TMDb.
export function pickSpainTheatricalDate(releaseDatesResults) {
  const spain = (Array.isArray(releaseDatesResults) ? releaseDatesResults : [])
    .find((entry) => entry?.iso_3166_1 === "ES");
  const dates = Array.isArray(spain?.release_dates) ? spain.release_dates : [];

  for (const type of [3, 2]) {
    const earliest = dates
      .filter((d) => d?.type === type && typeof d.release_date === "string")
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0];
    if (earliest) return earliest;
  }

  return null;
}

export function todayInMadrid(now = new Date()) {
  // en-CA formatea como AAAA-MM-DD, comparable como texto.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// `cinema` es lo que devuelve /api/streaming: { chains, releaseDate }.
// Devuelve null si no hay cines, o { status: "now" | "upcoming", ... }.
export function resolveCinemaStatus(cinema, today = todayInMadrid()) {
  const chains = Array.isArray(cinema?.chains) ? cinema.chains : [];
  if (chains.length === 0) return null;

  const releaseDate = cinema?.releaseDate || null;
  const status = releaseDate && releaseDate > today ? "upcoming" : "now";
  // Enlace único: el agregador si existe (lista todas las salas); si no, la
  // primera cadena.
  const primary = chains.find((c) => c.isAggregator) || chains[0];

  return { status, releaseDate, chains, href: primary.url };
}

// "2026-12-18" -> "18 dic" (sin pasar por Date en UTC, que restaría un día).
export function formatCinemaDate(isoDate) {
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
    .format(new Date(y, m - 1, d))
    .replace(".", "");
}

// Textos compartidos por la baldosa de escritorio y el modal móvil.
export function describeCinemaStatus(status) {
  if (!status) return null;
  const cinemaNames = status.chains
    .filter((c) => !c.isAggregator)
    .map((c) => c.name);
  const where = cinemaNames.length > 0 ? cinemaNames.join(", ") : "Entradas.com";

  if (status.status === "upcoming") {
    const date = formatCinemaDate(status.releaseDate);
    return {
      label: date ? `En cines el ${date}` : "Próximamente en cines",
      detail: `Preventa · ${where}`,
    };
  }

  return { label: "En cines", detail: where };
}

// Una fila por cadena para el modal «Plataformas disponibles».
export function createCinemaPlatformItems(status) {
  const text = describeCinemaStatus(status);
  if (!text) return [];
  return status.chains.map((chain) => ({
    key: `cinema-${chain.id}`,
    id: `cinema-${chain.id}`,
    title: chain.name,
    detail: status.status === "upcoming" ? text.label : "En cines · comprar entradas",
    icon: chain.icon,
    href: chain.url,
    target: "_blank",
    rel: "noreferrer",
    isCinema: true,
  }));
}
