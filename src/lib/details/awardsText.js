// src/lib/details/awardsText.js

function toNumber(value) {
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compactCount(value, singular, plural = `${singular}s`) {
  const number = toNumber(value);
  if (!number) return null;
  return `${number} ${number === 1 ? singular : plural}`;
}

function awardNameLabel(name = "") {
  const normalized = String(name).toLowerCase();

  if (/oscar|academy award/.test(normalized)) return "Oscar";
  if (/primetime emmy|emmy/.test(normalized)) return "Emmy";
  if (/golden globe/.test(normalized)) return "Globo de Oro";
  if (/bafta/.test(normalized)) return "BAFTA";
  if (/goya/.test(normalized)) return "Goya";
  if (/cesar|césar/.test(normalized)) return "César";

  return "premio";
}

export function formatDashboardAwards(rawAwards) {
  const raw = String(rawAwards || "").trim();
  if (!raw || /^(awards:\s*)?n\/a$/i.test(raw)) return null;

  const text = raw.replace(/\s+/g, " ");
  const parts = [];

  const wonSpecial = text.match(
    /\bWon\s+(\d+)\s+([^\.]+?)(?: Awards?)?(?:\.|$)/i,
  );
  const nominatedSpecial = text.match(
    /\bNominated\s+for\s+(\d+)\s+([^\.]+?)(?: Awards?)?(?:\.|$)/i,
  );
  const totals = text.match(
    /(\d+)\s+wins?\s*&\s*(\d+)\s+nominations?(?:\s+total)?/i,
  );
  const winsOnly = !totals ? text.match(/\b(\d+)\s+wins?\b/i) : null;
  const nominationsOnly = !totals
    ? text.match(/\b(\d+)\s+nominations?\b/i)
    : null;

  if (wonSpecial) {
    const count = toNumber(wonSpecial[1]);
    const label = awardNameLabel(wonSpecial[2]);
    if (count) {
      parts.push(
        `${count} ${label}${label === "premio" && count > 1 ? "s" : ""}`,
      );
    }
  } else if (nominatedSpecial) {
    const count = toNumber(nominatedSpecial[1]);
    const label = awardNameLabel(nominatedSpecial[2]);
    if (count) {
      parts.push(
        `${count} ${count === 1 ? "nominación" : "nominaciones"} ${label}${label === "premio" && count > 1 ? "s" : ""}`,
      );
    }
  }

  if (totals) {
    const wins = compactCount(totals[1], "premio");
    const nominations = compactCount(
      totals[2],
      "nominación",
      "nominaciones",
    );
    if (wins) parts.push(wins);
    if (nominations) parts.push(nominations);
  } else {
    const wins = winsOnly ? compactCount(winsOnly[1], "premio") : null;
    const nominations = nominationsOnly
      ? compactCount(nominationsOnly[1], "nominación", "nominaciones")
      : null;
    if (wins) parts.push(wins);
    if (nominations) parts.push(nominations);
  }

  if (!parts.length) return "Reconocida en premios";

  return parts.slice(0, 3).join(" · ");
}
