const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_RE = /^[1-9]\d*$/;

export function normalizeHistoryEntryIds(ids) {
  if (!Array.isArray(ids)) return [];

  return [
    ...new Set(
      ids
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

export function classifyHistoryEntryIds(ids) {
  const normalized = normalizeHistoryEntryIds(ids);
  if (normalized.length === 0) {
    return { kind: "empty", ids: [] };
  }

  if (normalized.every((id) => UUID_RE.test(id))) {
    return { kind: "backend", ids: normalized };
  }

  if (normalized.every((id) => POSITIVE_INTEGER_RE.test(id))) {
    return {
      kind: "trakt",
      ids: normalized.map((id) => Number(id)),
    };
  }

  return { kind: "invalid", ids: normalized };
}
