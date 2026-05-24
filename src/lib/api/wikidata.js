const wikidataUrl = (params) =>
  `https://www.wikidata.org/w/api.php?${params.toString()}`;

const entityLabel = (entity, fallback = "") =>
  entity?.labels?.es?.value || entity?.labels?.en?.value || fallback;

const wikidataEntityIdFromSnak = (snak) => {
  const value = snak?.datavalue?.value;
  if (!value) return null;
  if (value.id) return value.id;
  if (value["numeric-id"]) return `Q${value["numeric-id"]}`;
  return null;
};

const yearFromWikidataTime = (time) => {
  if (!time || typeof time !== "string") return null;
  const match = time.match(/[+-](\d{4})/);
  return match ? Number(match[1]) : null;
};

export async function fetchPersonAwardsFromWikidata(wikidataId) {
  if (!wikidataId) return [];

  const entityParams = new URLSearchParams({
    action: "wbgetentities",
    ids: wikidataId,
    props: "claims",
    format: "json",
    origin: "*",
  });

  const entityRes = await fetch(wikidataUrl(entityParams), {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 },
  });
  const entityJson = await entityRes.json().catch(() => ({}));
  if (!entityRes.ok) return [];

  const claims = entityJson?.entities?.[wikidataId]?.claims || {};
  const rawItems = [
    ...(claims.P166 || []).map((claim) => ({ claim, status: "winner" })),
    ...(claims.P1411 || []).map((claim) => ({ claim, status: "nominee" })),
  ];

  const entityIds = new Set();
  const normalized = rawItems
    .map(({ claim, status }, index) => {
      const awardId = wikidataEntityIdFromSnak(claim?.mainsnak);
      if (!awardId) return null;
      entityIds.add(awardId);

      const year = yearFromWikidataTime(
        claim?.qualifiers?.P585?.[0]?.datavalue?.value?.time,
      );
      const workId =
        wikidataEntityIdFromSnak(claim?.qualifiers?.P1686?.[0]) ||
        wikidataEntityIdFromSnak(claim?.qualifiers?.P805?.[0]) ||
        wikidataEntityIdFromSnak(claim?.qualifiers?.P642?.[0]);
      if (workId) entityIds.add(workId);

      return {
        id: `${status}-${awardId}-${index}`,
        awardId,
        workId,
        status,
        year,
      };
    })
    .filter(Boolean);

  if (!normalized.length) return [];

  const labelParams = new URLSearchParams({
    action: "wbgetentities",
    ids: Array.from(entityIds).join("|"),
    props: "labels",
    languages: "es|en",
    format: "json",
    origin: "*",
  });

  const labelRes = await fetch(wikidataUrl(labelParams), {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 },
  });
  const labelJson = await labelRes.json().catch(() => ({}));
  const entities = labelJson?.entities || {};

  return normalized
    .map((item) => ({
      ...item,
      award: entityLabel(entities[item.awardId], item.awardId),
      work: item.workId ? entityLabel(entities[item.workId], "") : "",
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "winner" ? -1 : 1;
      return (b.year || 0) - (a.year || 0);
    });
}
