// detectionFingerprint.js — Identidad de una detección de streaming para aprender
// de sus correcciones (ver backend/src/lib/detectionRules.js).
//
// La HUELLA es «plataforma|texto normalizado» del campo que IDENTIFICA el
// contenido: el nombre de la serie si el reproductor lo da, si no el de la
// película o, en último caso, el título principal. Los números de temporada y
// episodio NO entran: corregir el E1 de una serie debe valer para el E2.
//
// Un texto que no identifica nada (un nombre de episodio genérico como
// «Capítulo 3», el nombre de la plataforma, una o dos letras) no se aprende:
// una regla sobre él cambiaría la detección de contenidos sin relación.
import { normalizeText } from "./resolve.js";
import { isGenericEpisodeName } from "./streamingResolve.js";
import { isBarePlatformName } from "./queryVariants.js";

const MAX_TEXT = 300;

// La extensión y la app Android no nombran igual todas las plataformas (Prime
// Video es «prime» en una y «primevideo» en la otra). Lo aprendido en un cliente
// debe valer en el otro, así que la huella usa siempre el id canónico.
const PLATFORM_ALIASES = {
  prime: "primevideo",
  amazon: "primevideo",
  amazonprimevideo: "primevideo",
  hbomax: "max",
  hbo: "max",
  disneyplus: "disney",
  movistarplus: "movistar",
  appletvplus: "appletv",
};

/** Id de plataforma canónico ("Prime" → "primevideo"). */
export function canonicalPlatformId(platform) {
  const id = String(platform || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return PLATFORM_ALIASES[id] || id;
}

/** Texto que disparó la detección, tal cual lo leyó el cliente. */
export function detectionTriggerText({ showName, movieTitle, mainTitle } = {}) {
  const text = [showName, movieTitle, mainTitle]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);
  return (text || "").slice(0, MAX_TEXT);
}

/** Huella aprendible, o "" si el texto no sirve para aprender. */
export function detectionFingerprint(platform, triggerText) {
  const id = canonicalPlatformId(platform);
  const text = normalizeText(triggerText);
  if (!id || text.length < 3) return "";
  if (isGenericEpisodeName(triggerText) || isBarePlatformName(triggerText)) return "";
  return `${id}|${text}`.slice(0, 400);
}
