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
  "made famous by", "as made famous", "unofficial", "performed by",
  "tribute co", "the hit co", "hit co", "popcorn buckets",
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
    .replace(/['\u2018\u2019\u02bc\u02bb`´]/g, "")
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

export function buildSpotifyLikeSoundtrackQueries(ctx, limit = Infinity) {
  const titleList = unique([ctx.originalTitle, ...(ctx.titles || [])]);
  if (!titleList.length) return [];

  const queries = [];
  const used = new Set();

  const push = (q) => {
    const nq = norm(q);
    if (nq && !used.has(nq)) {
      queries.push(q);
      used.add(nq);
    }
  };

  for (let ti = 0; ti < titleList.length; ti++) {
    const title = titleList[ti];
    if (!title) continue;

    if (ti === 0) {
      push(title);

      if (ctx.mediaType === "movie") {
        if (ctx.year) push(`${title} ${ctx.year} motion picture soundtrack`);
        push(`${title} original motion picture soundtrack`);
        push(`${title} soundtrack`);
        push(`${title} playlist oficial`);
      } else {
        if (ctx.year) push(`${title} ${ctx.year} series soundtrack`);
        push(`${title} series soundtrack`);
        push(`${title} soundtrack`);
        push(`${title} season soundtrack`);
        push(`${title} soundtrack season`);
      }
    } else {
      push(title);
      const shortTitle = title.split(/[:：]/)[0]?.trim();
      if (shortTitle && shortTitle !== title) push(shortTitle);
    }
  }

  return queries.slice(0, limit);
}

export function primarySearchTitle(ctx) {
  return unique([ctx.originalTitle, ...(ctx.titles || [])])[0] ?? "";
}

export function titleComparisonVariants(value) {
  const normalized = norm(value);
  const variants = new Set([normalized]);
  variants.add(normalized.replace(/([a-z])7([a-z])/g, "$1v$2"));
  return [...variants].filter(Boolean);
}

export function hasLiteralTitlePhrase(text, title) {
  const textTokens = tokens(text);
  const titleTokens = tokens(title);
  if (!textTokens.length || !titleTokens.length) return false;

  return textTokens.some((_, index) =>
    titleTokens.every((token, offset) => textTokens[index + offset] === token),
  );
}

export function albumNameMatchesAnyTitle(name, titles) {
  if (!name) return false;
  const nameNorm = norm(name);
  return titles.some((title) => {
    if (!title) return false;

    for (const titleVariant of titleComparisonVariants(title)) {
      for (const nameVariant of titleComparisonVariants(nameNorm)) {
        if (hasLiteralTitlePhrase(nameVariant, titleVariant)) return true;
      }
    }

    const short = title.split(/[:：]/)[0]?.trim();
    if (short && short !== title) {
      for (const titleVariant of titleComparisonVariants(short)) {
        for (const nameVariant of titleComparisonVariants(nameNorm)) {
          if (hasLiteralTitlePhrase(nameVariant, titleVariant)) return true;
        }
      }
    }

    return false;
  });
}

export function hasDisallowedTitleSuffixForName(name, releaseDate, ctx) {
  const title = primarySearchTitle(ctx);
  if (!title || /\d/.test(norm(title))) return false;

  const releaseYear = getYear(releaseDate);
  if (ctx.year && releaseYear && Math.abs(releaseYear - Number(ctx.year)) <= 1) {
    return false;
  }

  const titleVariants = titleComparisonVariants(title);
  const albumTokens = tokens(name);

  return titleVariants.some((titleVariant) => {
    const titleTokens = tokens(titleVariant);
    if (!titleTokens.length) return false;

    return albumTokens.some((_, index) => {
      const matches = titleTokens.every(
        (token, offset) => albumTokens[index + offset] === token,
      );
      if (!matches) return false;

      const nextToken = albumTokens[index + titleTokens.length] ?? "";
      if (!nextToken) return false;
      return /^\d+$/.test(nextToken) || /^[ivx]+$/.test(nextToken);
    });
  });
}

export function canonicalSoundtrackBonus(text) {
  let score = 0;
  if (/original motion picture soundtrack/.test(text)) score += 95;
  if (/official movie soundtrack/.test(text)) score += 95;
  if (/official .*soundtrack|soundtrack oficial|banda sonora oficial/.test(text)) score += 68;
  if (/the soundtrack/.test(text)) score += 62;
  if (/original soundtrack/.test(text)) score += 55;
  if (/music from .*motion picture|music from .*film|music from .*movie/.test(text)) score += 48;
  if (/music from .*series|music from .*tv|music from .*television/.test(text)) score += 48;
  if (/original music from .*tv series|soundtrack from .*series/.test(text)) score += 48;
  if (/all seasons|all songs/.test(text) && /soundtrack/.test(text)) score += 44;
  if (/original motion picture score|original score/.test(text)) score += 42;
  if (/playlist oficial|oficial playlist/.test(text)) score += 44;
  return score;
}

export function isPrioritySoundtrackName(name, ctx) {
  const n = norm(name);
  if (!n || !albumNameMatchesAnyTitle(n, ctx.titles || [])) return false;
  if (containsAny(n, BAD_MATCH_WORDS)) return false;

  if (ctx.mediaType === "tv") {
    return (
      /soundtrack/.test(n) ||
      /original (music|score)/.test(n) ||
      /music from .*series/.test(n) ||
      /music from .*tv/.test(n) ||
      /music from .*television/.test(n) ||
      /music from .*hbo/.test(n) ||
      /soundtrack from .*series/.test(n) ||
      /all (seasons|songs)/.test(n)
    );
  }

  return (
    /original motion picture (score|soundtrack)/.test(n) ||
    /music from (the )?(motion picture|film|movie)/.test(n) ||
    /complete original score|original score/.test(n) ||
    /official .*soundtrack/.test(n) ||
    /soundtrack oficial|banda sonora oficial/.test(n)
  );
}

function titleFitStats(text, ctx) {
  const textTokens = tokens(text);
  const textSig = sigTokens(text);
  const textSet = new Set(textTokens);
  let best = {
    score: 0,
    hits: 0,
    ratio: 0,
    phrase: false,
    textSigCount: textSig.length,
  };

  for (const title of ctx.titles || []) {
    const titleTokens = tokens(title);
    const titleSig = sigTokens(title);
    if (!titleTokens.length || !titleSig.length) continue;

    const phrase = textTokens.some((_, i) =>
      titleTokens.every((token, j) => textTokens[i + j] === token),
    );
    const hits = titleSig.filter((token) => textSet.has(token)).length;
    const ratio = hits / titleSig.length;
    const score = (phrase ? 100 : 0) + ratio * 70 - Math.max(0, textSig.length - hits) * 2;

    if (score > best.score) {
      best = { score, hits, ratio, phrase, textSigCount: textSig.length };
    }
  }

  return best;
}

function titleFitBonus(name, ctx, strongSoundtrackContext) {
  const stats = titleFitStats(name, ctx);
  if (!stats.score) return -200;

  const extraTokens = Math.max(0, stats.textSigCount - stats.hits);
  let score = 0;

  if (stats.phrase && extraTokens <= 4) score += 36;
  else if (stats.phrase) score += 16;
  if (stats.ratio >= 1) score += 14;

  if (extraTokens > 4 && !strongSoundtrackContext) {
    score -= Math.min(150, (extraTokens - 4) * 16);
  }
  if (extraTokens > 8) {
    score -= Math.min(90, (extraTokens - 8) * 9);
  }

  return score;
}

function collectionNoisePenalty(text, strongSoundtrackContext) {
  let score = 0;
  if (
    /\b(compilation|collection|best of|greatest hits|movie hits|movies compilation|film themes|movie themes|various movies|various artists)\b/.test(text) &&
    !strongSoundtrackContext
  ) {
    score -= 95;
  }
  if (/karaoke|tribute|cover|covers|made famous by|as made famous/.test(text)) score -= 120;
  if (/unofficial|performed by|popcorn buckets|the hit co|tribute co/.test(text)) score -= 220;
  if (/from\s+["']?[^"']+["']?/.test(text) && !strongSoundtrackContext) score -= 25;
  return score;
}

function primaryTitleSearchBonus(item, canonicalScore, strongSoundtrackContext) {
  const rank = Number(item?.primaryTitleSearchRank ?? 0);
  if (!rank) return 0;

  const rankBonus = Math.max(0, 72 - (rank - 1) * 7);
  if (canonicalScore >= 80) return rankBonus + 44;
  if (canonicalScore > 0) return rankBonus + 22;
  if (strongSoundtrackContext) return Math.max(0, rankBonus - 18);
  return 0;
}

export function scoreSoundtrackAlbumCandidate(candidate, ctx) {
  const name = candidate?.name ?? "";
  const artist = candidate?.artist ?? "";
  const releaseDate = candidate?.releaseDate;
  const totalTracks = Number(candidate?.totalTracks ?? 0);
  const albumType = norm(candidate?.albumType ?? "");
  const text = norm(`${name} ${artist} ${candidate?.genre ?? ""}`);
  let score = bestTitleScore(name, ctx.titles || []);
  const hasShortTitle = (ctx.titles || []).some(
    (title) => norm(title).replace(/\s+/g, "").length <= 3,
  );
  const hasSoundtrackContext =
    containsAny(text, SOUNDTRACK_WORDS) ||
    /album|motion picture|television|series|movie|film|score|ost/.test(text);
  const strongSoundtrackContext =
    containsAny(text, SOUNDTRACK_WORDS) ||
    /official|original motion picture|original soundtrack|music from/.test(text);

  if (ctx.originalTitle) {
    const originalTitleScore = titleScore(name, ctx.originalTitle);
    if (originalTitleScore >= 70) score += 16;
    else if (originalTitleScore >= 50) score += 8;
  }

  const canonicalScore = canonicalSoundtrackBonus(text);
  score += titleFitBonus(name, ctx, strongSoundtrackContext);
  score += collectionNoisePenalty(text, strongSoundtrackContext);
  score += soundtrackBonus(text);
  score += canonicalScore;
  score += primaryTitleSearchBonus(candidate, canonicalScore, strongSoundtrackContext);
  score += yearScore(releaseDate, ctx.year, ctx.mediaType);

  if (containsAny(text, BAD_MATCH_WORDS)) score -= 80;
  if (/unofficial|performed by/.test(text)) score -= 220;
  if (/popcorn buckets|the hit co|tribute co|soundtrack orchestra|soundtrack hit lab/.test(text)) score -= 140;
  if (/official/.test(text)) score += 22;
  if (/original soundtrack|original motion picture/.test(text)) score += 24;
  if (/the soundtrack/.test(text) && !/unofficial|performed by/.test(text)) score += 65;
  if (/motion picture|television|series|movie|film/.test(text)) score += 10;
  if (hasShortTitle && !hasSoundtrackContext) score -= 100;
  if (ctx.mediaType === "movie" && /game|video game|manager|simulator/.test(text) && !/movie|film|motion picture/.test(text)) score -= 120;
  if (ctx.mediaType === "tv" && /movie|film|motion picture/.test(text) && !/series|television|tv/.test(text)) score -= 12;
  if (ctx.mediaType === "movie" && /series|television|tv/.test(text) && !/movie|film|motion picture/.test(text)) score -= 12;

  if (totalTracks >= 4 && totalTracks <= 80) score += 8;
  if (totalTracks < 3) score -= 100;
  if (albumType === "single") score -= 100;
  if (albumType === "ep") score -= 15;

  const nameTokens = new Set(tokens(name));
  const anyTitleToken = (ctx.titles || [])
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokens.has(t)));
  if (!anyTitleToken) score -= 50;

  const hasSigTokens = (ctx.titles || []).some((t) => sigTokens(t).length > 0);
  if (bestTitleScore(name, ctx.titles || []) === 0 && hasSigTokens) score -= 200;
  if (hasDisallowedTitleSuffixForName(name, releaseDate, ctx)) score -= 180;
  if (isPrioritySoundtrackName(name, ctx)) score += 90;

  return Math.round(score);
}
