// src/lib/streaming/platformWordmark.js
//
// Resuelve el "wordmark" (logo de texto, *-text.png en /public) de una
// plataforma de streaming a partir de un provider de TMDb, para mostrar
// "Ver en {wordmark}". Si la plataforma no tiene wordmark disponible, se
// devuelve solo el nombre para pintarlo como texto.
//
// La detección de plataforma sigue el mismo criterio (provider_id + nombre) que
// `canonicalPlatformFromProvider` en Watchlist/Favorites, para ser consistentes.

const norm = (value) => String(value || "").toLowerCase().trim();

// Wordmarks (*-text.png) disponibles en /public, por clave de plataforma.
const WORDMARK_BY_KEY = {
  netflix: "/netflix-text.png",
  prime: "/amazonprimevideo-text.png",
  "hbo-max": "/hbomax-text.png",
  crunchyroll: "/crunchyroll-text.png",
  movistar: "/movistar-text.png",
  disney: "/disney-text.png",
};

// Color del botón de reproducir según la plataforma (clase de fondo Tailwind +
// color del "glow" del box-shadow). Netflix rojo, Prime azul, Crunchyroll
// naranja, Max morado, Disney azul oscuro. El resto usa el morado por defecto.
const COLOR_BY_KEY = {
  netflix: { className: "bg-red-600", glow: "rgba(220,38,38,0.9)" },
  prime: { className: "bg-blue-600", glow: "rgba(37,99,235,0.9)" },
  crunchyroll: { className: "bg-orange-500", glow: "rgba(249,115,22,0.9)" },
  "hbo-max": { className: "bg-violet-600", glow: "rgba(139,92,246,0.9)" },
  disney: { className: "bg-blue-900", glow: "rgba(30,58,138,0.95)" },
  movistar: { className: "bg-sky-500", glow: "rgba(14,165,233,0.9)" },
};
const DEFAULT_COLOR = { className: "bg-violet-600", glow: "rgba(139,92,246,0.9)" };

/**
 * Clave canónica de plataforma a partir del provider de TMDb (o null).
 */
export function platformKeyFromProvider(provider) {
  const id = Number(provider?.provider_id);
  const name = norm(provider?.provider_name);

  if (id === 8 || name.includes("netflix")) return "netflix";
  if (
    id === 119 ||
    name.includes("amazon prime video") ||
    name === "prime video"
  )
    return "prime";
  if (id === 384 || id === 1899 || name === "max" || name.includes("hbo max"))
    return "hbo-max";
  if (id === 283 || name.includes("crunchyroll")) return "crunchyroll";
  if (id === 149 || id === 2241 || name.includes("movistar")) return "movistar";
  if (id === 337 || name.includes("disney")) return "disney";
  if (name.includes("plex")) return "plex";
  return null;
}

// Orden de prioridad de plataformas para elegir cuál se muestra como principal
// en el overlay de la portada (la primera disponible según este orden).
const PLATFORM_PRIORITY = [
  "netflix",
  "prime",
  "crunchyroll",
  "hbo-max",
  "disney",
  "movistar",
];

/**
 * Elige el proveedor principal de una lista según PLATFORM_PRIORITY (solo los
 * que tengan URL http válida). Si ninguno está en la lista de prioridad, cae al
 * primero disponible (respetando el orden recibido). Devuelve null si no hay.
 */
export function pickPrimaryProvider(providers) {
  if (!Array.isArray(providers)) return null;

  const withUrl = providers.filter(
    (p) => typeof p?.url === "string" && p.url.startsWith("http"),
  );
  if (!withUrl.length) return null;

  const rank = (provider) => {
    const key = platformKeyFromProvider(provider);
    const idx = key ? PLATFORM_PRIORITY.indexOf(key) : -1;
    // En prioridad: 0..N. Fuera de prioridad: al final, conservando orden.
    return idx === -1 ? PLATFORM_PRIORITY.length : idx;
  };

  let best = withUrl[0];
  let bestRank = rank(best);
  for (let i = 1; i < withUrl.length; i += 1) {
    const r = rank(withUrl[i]);
    if (r < bestRank) {
      best = withUrl[i];
      bestRank = r;
    }
  }
  return best;
}

/**
 * Devuelve { key, wordmarkSrc, name } para pintar "Ver en {wordmark|name}".
 * `wordmarkSrc` es null cuando la plataforma no tiene *-text.png (fallback a
 * `name` como texto).
 */
export function platformWordmark(provider) {
  const key = platformKeyFromProvider(provider);
  const wordmarkSrc = key ? WORDMARK_BY_KEY[key] || null : null;
  const name = provider?.provider_name || "la plataforma";
  const color = (key && COLOR_BY_KEY[key]) || DEFAULT_COLOR;
  return { key, wordmarkSrc, name, color };
}
