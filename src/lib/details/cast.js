export const isMainDirectorCredit = (credit) =>
  credit?.job === "Director" || credit?.job === "Co-Director";

export const getMovieDirectorsFromCrew = (crew) =>
  Array.isArray(crew) ? crew.filter(isMainDirectorCredit) : [];

export const formatCreditNames = (list) =>
  Array.isArray(list) && list.length
    ? list.map((person) => person?.name).filter(Boolean).join(", ")
    : null;

export function pickBestRoleName(roles) {
  const arr = Array.isArray(roles) ? roles : [];
  if (!arr.length) return "";

  const best = [...arr].sort(
    (a, b) => Number(b?.episode_count || 0) - Number(a?.episode_count || 0),
  )[0];
  return best?.character || "";
}

export function normalizeCastFromTmdb(raw = [], { isAggregate = false } = {}) {
  const list = Array.isArray(raw) ? raw : [];

  const normalized = list
    .filter((person) => person?.id && person?.name)
    .map((person, idx) => {
      const order = Number.isFinite(Number(person?.order))
        ? Number(person.order)
        : Number.isFinite(Number(person?.cast_id))
          ? Number(person.cast_id)
          : idx;

      const character =
        person?.character ||
        (isAggregate ? pickBestRoleName(person?.roles) : "") ||
        "";

      return {
        ...person,
        character,
        order,
      };
    });

  const seen = new Set();
  const unique = [];

  for (const item of normalized) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  unique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  return unique;
}

export function buildCreativeCreditsForCast({
  type,
  movieDirectors,
  tvCreators,
}) {
  const source =
    type === "movie" ? movieDirectors : type === "tv" ? tvCreators : [];
  const role = type === "movie" ? "Director" : "Creador";

  return (Array.isArray(source) ? source : [])
    .filter((person) => person?.id && person?.name)
    .map((person, idx) => ({
      ...person,
      character: person?.job || role,
      order: -1000 + idx,
    }));
}

export function buildCastDataForUI({ baseCast, creativeCredits }) {
  const base = Array.isArray(baseCast) ? baseCast : [];
  const creative = Array.isArray(creativeCredits) ? creativeCredits : [];
  const creativeIds = new Set(
    creative.map((person) => person?.id).filter(Boolean),
  );
  const baseHasOrder = base.some((person) =>
    Number.isFinite(Number(person?.order)),
  );

  const normalizedBase = base
    .filter((person) => person?.id && person?.name)
    .filter((person) => !creativeIds.has(person.id))
    .map((person, idx) => ({
      ...person,
      order: Number.isFinite(Number(person?.order))
        ? Number(person.order)
        : baseHasOrder
          ? 1000 + idx
          : idx,
    }));

  const seen = new Set();
  const mergedUnique = [];

  for (const item of [...creative, ...normalizedBase]) {
    if (!item?.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    mergedUnique.push(item);
  }

  if (baseHasOrder) {
    mergedUnique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  }

  return mergedUnique;
}
