const g = globalThis;
g.__showverseTranslationCache = g.__showverseTranslationCache || new Map();

const translationCache = g.__showverseTranslationCache;

const EXACT_EN_ES = {
  "Overly long with pacing issues":
    "Demasiado larga, con problemas de ritmo",
  "Final act becomes confusing and implausible":
    "El acto final se vuelve confuso e inverosímil",
  "Sound mixing makes dialogue difficult to understand":
    "La mezcla de sonido hace que el diálogo sea difícil de entender",
  "Scientific accuracy sacrificed for emotional plot points":
    "La precisión científica se sacrifica por puntos emocionales de la trama",
  "Visually stunning with breathtaking space cinematography and effects":
    "Visualmente impresionante, con una fotografía espacial y efectos sobrecogedores",
  "Hans Zimmer's soundtrack creates an emotionally powerful experience":
    "La banda sonora de Hans Zimmer crea una experiencia emocionalmente poderosa",
  "Deeply moving father-daughter relationship story":
    "Una historia profundamente conmovedora sobre la relación entre padre e hija",
  "Compelling blend of scientific concepts with human emotion":
    "Una mezcla fascinante de conceptos científicos y emoción humana",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function fallbackTranslateEnToEs(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (EXACT_EN_ES[raw]) return EXACT_EN_ES[raw];

  const replacements = [
    [/\boverly long\b/gi, "demasiado larga"],
    [/\btoo long\b/gi, "demasiado larga"],
    [/\bwith pacing issues\b/gi, "con problemas de ritmo"],
    [/\bpacing issues\b/gi, "problemas de ritmo"],
    [/\bfinal act\b/gi, "acto final"],
    [/\bbecomes confusing\b/gi, "se vuelve confuso"],
    [/\bconfusing\b/gi, "confuso"],
    [/\bimplausible\b/gi, "inverosímil"],
    [/\bsound mixing\b/gi, "mezcla de sonido"],
    [/\bdialogue\b/gi, "diálogo"],
    [/\bdifficult to understand\b/gi, "difícil de entender"],
    [/\bscientific accuracy\b/gi, "precisión científica"],
    [/\bsacrificed\b/gi, "sacrificada"],
    [/\bemotional plot points\b/gi, "puntos emocionales de la trama"],
    [/\bvisually stunning\b/gi, "visualmente impresionante"],
    [/\bbreathtaking\b/gi, "sobrecogedor"],
    [/\bspace cinematography\b/gi, "fotografía espacial"],
    [/\bcinematography\b/gi, "fotografía"],
    [/\beffects\b/gi, "efectos"],
    [/\bsoundtrack\b/gi, "banda sonora"],
    [/\bcreates\b/gi, "crea"],
    [/\bemotionally powerful experience\b/gi, "experiencia emocionalmente poderosa"],
    [/\bdeeply moving\b/gi, "profundamente conmovedora"],
    [/\bfather-daughter relationship\b/gi, "relación entre padre e hija"],
    [/\bstory\b/gi, "historia"],
    [/\bcompelling blend\b/gi, "mezcla fascinante"],
    [/\bscientific concepts\b/gi, "conceptos científicos"],
    [/\bhuman emotion\b/gi, "emoción humana"],
    [/\bmasterful\b/gi, "magistral"],
    [/\bcharacter development\b/gi, "desarrollo de personajes"],
    [/\bacting performances\b/gi, "interpretaciones actorales"],
    [/\bconsistently high quality\b/gi, "calidad constantemente alta"],
    [/\bwriting\b/gi, "guion"],
    [/\bstorytelling\b/gi, "narrativa"],
    [/\bslow paced\b/gi, "ritmo lento"],
    [/\bboring\b/gi, "aburrido"],
    [/\bunrealistic\b/gi, "poco realista"],
    [/\blater seasons\b/gi, "temporadas posteriores"],
    [/\bmiddle seasons\b/gi, "temporadas centrales"],
    [/\bdrag\b/gi, "se alargan"],
    [/\brepetitive storylines\b/gi, "tramas repetitivas"],
    [/\band\b/gi, "y"],
    [/\bwith\b/gi, "con"],
    [/\bfor\b/gi, "para"],
    [/\bfrom\b/gi, "de"],
  ];

  let translated = raw;
  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement);
  }

  return translated.charAt(0).toUpperCase() + translated.slice(1);
}

async function translateWithGoogle(value, { signal } = {}) {
  const text = normalizeText(value);
  if (!text) return "";

  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, {
    cache: "force-cache",
    signal,
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Translation HTTP ${res.status}`);

  const json = await res.json();
  const translated = Array.isArray(json?.[0])
    ? json[0].map((part) => part?.[0] || "").join("")
    : "";

  return normalizeText(translated);
}

export async function translateEnglishToSpanish(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const cacheKey = `en:es:${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const translated = await translateWithGoogle(text, {
      signal: controller.signal,
    });
    const result = translated || fallbackTranslateEnToEs(text);
    translationCache.set(cacheKey, result);
    return result;
  } catch {
    const fallback = fallbackTranslateEnToEs(text);
    translationCache.set(cacheKey, fallback);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
