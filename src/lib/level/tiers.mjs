// src/lib/level/tiers.mjs
// Traducción de un rango de nivel a su vestimenta visual.
//
// El backend decide los números y los nombres (backend/src/level/curve.js) y
// manda el rango con un `color` que es un token, no una clase. Aquí vive la única
// traducción a la paleta del proyecto, para que la insignia, el chip y la barra
// no puedan desincronizarse entre sí.
//
// Los hex se usan en el SVG de la insignia (un `stroke` no puede depender de una
// clase que Tailwind podría no generar); las clases, en los elementos normales.

export const LEVEL_TIER_VISUALS = Object.freeze({
  espectador: {
    name: "Espectador",
    hex: "#a1a1aa",
    hexDeep: "#3f3f46",
    chip: "border-zinc-400/25 bg-zinc-400/10 text-zinc-200",
    bar: "from-zinc-500 to-zinc-300",
    accent: "text-zinc-300",
  },
  aficionado: {
    name: "Aficionado",
    hex: "#38bdf8",
    hexDeep: "#0c4a6e",
    chip: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    bar: "from-sky-600 to-sky-300",
    accent: "text-sky-300",
  },
  cinefilo: {
    name: "Cinéfilo",
    hex: "#34d399",
    hexDeep: "#064e3b",
    chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    bar: "from-emerald-600 to-emerald-300",
    accent: "text-emerald-300",
  },
  critico: {
    name: "Crítico",
    hex: "#2dd4bf",
    hexDeep: "#134e4a",
    chip: "border-teal-400/25 bg-teal-400/10 text-teal-200",
    bar: "from-teal-600 to-teal-300",
    accent: "text-teal-300",
  },
  coleccionista: {
    name: "Coleccionista",
    hex: "#a78bfa",
    hexDeep: "#4c1d95",
    chip: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    bar: "from-violet-600 to-violet-300",
    accent: "text-violet-300",
  },
  archivista: {
    name: "Archivista",
    hex: "#e879f9",
    hexDeep: "#701a75",
    chip: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200",
    bar: "from-fuchsia-600 to-fuchsia-300",
    accent: "text-fuchsia-300",
  },
  maestro: {
    name: "Maestro",
    hex: "#fbbf24",
    hexDeep: "#78350f",
    chip: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    bar: "from-amber-600 to-amber-300",
    accent: "text-amber-300",
  },
  leyenda: {
    name: "Leyenda",
    hex: "#fcd34d",
    hexDeep: "#713f12",
    chip: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
    bar: "from-yellow-500 via-amber-200 to-yellow-400",
    accent: "text-yellow-200",
  },
});

const FALLBACK_TIER = "espectador";

/**
 * Vestimenta de un rango. Acepta el objeto que manda la API (`{ id, name }`) o
 * el id a secas. El nombre de la API gana: es la fuente de verdad.
 */
export function tierVisual(tier) {
  const id = typeof tier === "string" ? tier : tier?.id;
  const visual = LEVEL_TIER_VISUALS[id] || LEVEL_TIER_VISUALS[FALLBACK_TIER];
  const apiName = typeof tier === "object" && tier?.name ? tier.name : null;
  return apiName ? { ...visual, name: apiName } : visual;
}

// La rareza de un logro se lee sobre todo por su etiqueta, no por el color: en
// una rejilla de 38 tarjetas, ocho colores serían ruido.
export const RARITY_VISUALS = Object.freeze({
  comun: { label: "Común", ring: "ring-white/10", accent: "text-zinc-300" },
  raro: { label: "Raro", ring: "ring-sky-400/25", accent: "text-sky-300" },
  epico: { label: "Épico", ring: "ring-violet-400/30", accent: "text-violet-300" },
  legendario: { label: "Legendario", ring: "ring-yellow-300/40", accent: "text-yellow-200" },
});

export function rarityVisual(rarity) {
  return RARITY_VISUALS[rarity] || RARITY_VISUALS.comun;
}

export const ACHIEVEMENT_FAMILY_LABELS = Object.freeze({
  visionado: "Visionado",
  series: "Series",
  critica: "Crítica",
  coleccion: "Colección",
  social: "Social",
  constancia: "Constancia",
  rareza: "Rareza",
});

/** XP con separador de miles español. */
export function formatXp(xp) {
  const n = Number(xp);
  return new Intl.NumberFormat("es-ES").format(Number.isFinite(n) ? Math.trunc(n) : 0);
}
