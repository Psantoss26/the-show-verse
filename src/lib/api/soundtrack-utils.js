export const SOUNDTRACK_WORDS = [
  "soundtrack", "score", "original score", "original motion picture",
  "motion picture soundtrack", "original soundtrack", "television soundtrack",
  "tv soundtrack", "ost", "music from", "music from and inspired",
  "music inspired", "banda sonora", "musica original", "colonna sonora",
  "bande originale", "filmmusik", "series soundtrack",
];

export const BAD_MATCH_WORDS = [
  "karaoke", "tribute", "cover", "covers", "remix", "remixes",
  "music box", "lullaby", "lofi", "lo-fi", "workout", "ringtone",
  "in the style of", "piano tribute", "trailer music", "piano versions",
  "made famous by", "as made famous",
];

export const GENERIC_WORDS = new Set([
  "a", "an", "and", "de", "del", "el", "en", "la", "las", "le", "les",
  "los", "of", "on", "the", "to", "un", "una", "y",
]);

export function norm(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function tokens(v) {
  const n = norm(v);
  return n ? n.split(" ") : [];
}

export function sigTokens(title) {
  return tokens(title).filter((t) => t.length > 1 && !GENERIC_WORDS.has(t));
}

export function unique(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

export function getYear(v) {
  const y = Number(String(v ?? "").slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

export function containsAny(text, words) {
  return words.some((w) => text.includes(norm(w)));
}

export function names(list) {
  return Array.isArray(list) ? list.map((i) => i?.name).filter(Boolean) : [];
}

export function primaryImage(images) {
  return Array.isArray(images) && images.length ? images[0]?.url ?? "" : "";
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function titleScore(text, title) {
  const tp = tokens(title);
  const tg = tokens(text);
  if (!tp.length || !tg.length) return 0;

  const tgSet = new Set(tg);
  const hasPhrase = tg.some((_, i) =>
    tp.every((t, j) => tg[i + j] === t),
  );
  if (hasPhrase) return 70;

  const sig = sigTokens(title);
  if (!sig.length) return 0;

  const hits = sig.filter((t) => tgSet.has(t)).length;
  const ratio = hits / sig.length;

  const textSig = sigTokens(text);
  let inversePenalty = 0;
  if (textSig.length > sig.length * 1.5 && hits < textSig.length * 0.5) {
    inversePenalty = Math.round((textSig.length - hits) * 6);
  }

  if (ratio >= 1) return Math.max(50 - inversePenalty, 10);
  if (ratio >= 0.75) return Math.max(34 - inversePenalty, 8);
  if (ratio >= 0.5 && sig.length >= 3) return Math.max(22 - inversePenalty, 6);
  if (sig.length === 1 && tgSet.has(sig[0])) return Math.max(22 - inversePenalty, 8);
  return 0;
}

export function bestTitleScore(text, titles) {
  return Math.max(...titles.map((t) => titleScore(text, t)), 0);
}

export function yearScore(releaseDate, titleYear, mediaType) {
  if (!titleYear) return 0;
  const ry = getYear(releaseDate);
  if (!ry) return 0;
  const diff = ry - titleYear;
  if (diff === 0) return 14;
  if (diff === 1) return 9;
  if (diff === -1) return 6;
  if (mediaType === "tv" && diff >= 0 && diff <= 5) return 7;
  return -10;
}

export function soundtrackBonus(text) {
  let s = 0;
  if (containsAny(text, SOUNDTRACK_WORDS)) s += 34;
  if (/playlist|songs|music/.test(text)) s += 8;
  if (containsAny(text, BAD_MATCH_WORDS)) s -= 55;
  return s;
}
