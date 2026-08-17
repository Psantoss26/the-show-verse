// backend/src/level/curve.js
// Curva de nivel y rangos. Módulo puro: no toca base de datos ni red.
//
// La curva es cuadrática para que los primeros niveles lleguen rápido (el
// usuario nuevo ve movimiento el primer día) y los últimos cuesten años de
// biblioteca. Calibrada contra cuentas reales: ~9.500 XP (290 películas, 643
// episodios, 341 puntuaciones) caen en el nivel 13, con el 40 lejos pero
// alcanzable.

export const MAX_LEVEL = 40;

// XP acumulada necesaria para alcanzar el nivel n.
const CURVE_QUADRATIC = 50;
const CURVE_LINEAR = 100;

// Ocho rangos de cinco niveles. `color` es un token, no una clase de Tailwind:
// el frontend lo traduce a su paleta en src/lib/level/tiers.js para que la API
// no dependa del sistema de diseño.
export const TIERS = Object.freeze([
  { id: 'espectador', name: 'Espectador', minLevel: 1, maxLevel: 5, color: 'zinc' },
  { id: 'aficionado', name: 'Aficionado', minLevel: 6, maxLevel: 10, color: 'sky' },
  { id: 'cinefilo', name: 'Cinéfilo', minLevel: 11, maxLevel: 15, color: 'emerald' },
  { id: 'critico', name: 'Crítico', minLevel: 16, maxLevel: 20, color: 'teal' },
  { id: 'coleccionista', name: 'Coleccionista', minLevel: 21, maxLevel: 25, color: 'violet' },
  { id: 'archivista', name: 'Archivista', minLevel: 26, maxLevel: 30, color: 'fuchsia' },
  { id: 'maestro', name: 'Maestro', minLevel: 31, maxLevel: 35, color: 'amber' },
  { id: 'leyenda', name: 'Leyenda', minLevel: 36, maxLevel: MAX_LEVEL, color: 'gold' },
].map((tier) => Object.freeze(tier)));

function clampLevel(level) {
  const n = Math.trunc(Number(level));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_LEVEL);
}

function safeXp(xp) {
  const n = Number(xp);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** XP acumulada necesaria para alcanzar `level`. El nivel 1 es gratis. */
export function xpForLevel(level) {
  const n = clampLevel(level);
  const steps = n - 1;
  return CURVE_QUADRATIC * steps * steps + CURVE_LINEAR * steps;
}

/** Nivel que corresponde a una XP acumulada. Inversa de `xpForLevel`. */
export function levelForXp(xp) {
  const total = safeXp(xp);
  // La curva es corta (40 tramos) y esta función se llama una vez por lectura de
  // perfil: recorrerla es más claro que invertir la cuadrática y redondear.
  let level = 1;
  while (level < MAX_LEVEL && total >= xpForLevel(level + 1)) level += 1;
  return level;
}

/** Rango al que pertenece un nivel. Siempre devuelve un rango. */
export function tierForLevel(level) {
  const n = clampLevel(level);
  return TIERS.find((tier) => n >= tier.minLevel && n <= tier.maxLevel) ?? TIERS.at(-1);
}

/**
 * Estado completo de progreso para una XP dada: es lo que consumen la barra de
 * la cabecera de perfil y el chip de nivel.
 */
export function progressForXp(xp) {
  const total = safeXp(xp);
  const level = levelForXp(total);
  const isMax = level >= MAX_LEVEL;
  const levelXp = xpForLevel(level);
  const nextLevelXp = isMax ? null : xpForLevel(level + 1);

  const xpIntoLevel = total - levelXp;
  const xpForNextLevel = isMax ? 0 : nextLevelXp - levelXp;
  const xpToNextLevel = isMax ? 0 : nextLevelXp - total;
  const percent = isMax
    ? 100
    : Math.round((xpIntoLevel / xpForNextLevel) * 100);

  return {
    xp: total,
    level,
    tier: tierForLevel(level),
    levelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel,
    percent,
    isMax,
    maxLevel: MAX_LEVEL,
  };
}
