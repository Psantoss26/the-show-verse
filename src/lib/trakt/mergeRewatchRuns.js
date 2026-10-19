// Fusión de los runs de rewatch guardados en localStorage con los que deriva el
// servidor por capas de plays (computeRewatchRuns en /api/trakt/show/plays).
//
// Un run local creado a mano ("Nuevo rewatch") arranca ANTES del primer play, así
// que su startedAt no coincide con el que calcula el servidor: se le asocia el
// primer run del servidor que empieza después de él y antes del siguiente run
// local. Cada run local absorbe como mucho UN run del servidor, y nunca uno que ya
// tiene su propio id en la respuesta: si no, un rewatch nuevo (p. ej. el que crea
// la sincronización de plataformas al volver a ver la serie) se fundía con el run
// anterior y no aparecía nunca.

function toTs(value) {
  return new Date(value).getTime();
}

function normalizeRun(run) {
  const startedAt = String(run?.startedAt || run?.id || "");
  if (!startedAt) return null;
  return {
    id: String(run?.id || startedAt),
    startedAt,
    label: run?.label || `Rewatch · ${startedAt.slice(0, 10)}`,
    completedAt: run?.completedAt || null,
    completed: typeof run?.completed === "boolean" ? run.completed : null,
    progressCount:
      typeof run?.progressCount === "number" ? run.progressCount : null,
  };
}

function mergeRunData(baseRun, overlayRun) {
  return {
    ...(baseRun || {}),
    ...(overlayRun || {}),
    id: String(baseRun?.id || overlayRun?.id || ""),
    startedAt: String(baseRun?.startedAt || overlayRun?.startedAt || ""),
    label:
      baseRun?.label ||
      overlayRun?.label ||
      `Rewatch · ${String(baseRun?.startedAt || overlayRun?.startedAt || "").slice(0, 10)}`,
    completedAt: overlayRun?.completedAt ?? baseRun?.completedAt ?? null,
    completed:
      typeof overlayRun?.completed === "boolean"
        ? overlayRun.completed
        : (baseRun?.completed ?? null),
    progressCount: overlayRun?.progressCount ?? baseRun?.progressCount ?? null,
  };
}

const byStartedAtDesc = (a, b) => toTs(b.startedAt) - toTs(a.startedAt);

export function mergeRewatchRuns(currentRuns, incomingRuns) {
  const normalizedCurrent = (Array.isArray(currentRuns) ? currentRuns : [])
    .map(normalizeRun)
    .filter(Boolean)
    .sort(byStartedAtDesc);
  // Ascendente: el run del servidor más antiguo reclama primero el run local que
  // lo precede; los posteriores ya lo encuentran ocupado.
  const normalizedIncoming = (Array.isArray(incomingRuns) ? incomingRuns : [])
    .map(normalizeRun)
    .filter(Boolean)
    .sort((a, b) => toTs(a.startedAt) - toTs(b.startedAt));

  const incomingIds = new Set(normalizedIncoming.map((run) => run.id));
  // Runs locales que ya tienen pareja del servidor (por id o absorbida aquí).
  const claimed = new Set(
    normalizedCurrent.filter((run) => incomingIds.has(run.id)).map((run) => run.id),
  );

  const mergedById = new Map();
  for (const run of normalizedCurrent) {
    mergedById.set(run.id, run);
  }

  for (const incomingRun of normalizedIncoming) {
    const exact = mergedById.get(incomingRun.id);
    if (exact) {
      mergedById.set(incomingRun.id, mergeRunData(exact, incomingRun));
      continue;
    }

    const incomingTs = toTs(incomingRun.startedAt);
    const candidateLocal = normalizedCurrent.find((localRun, index) => {
      if (claimed.has(localRun.id)) return false;
      const localTs = toTs(localRun.startedAt);
      const newerLocalTs =
        index > 0 ? toTs(normalizedCurrent[index - 1].startedAt) : Number.NaN;

      if (!Number.isFinite(incomingTs) || !Number.isFinite(localTs)) {
        return false;
      }
      if (incomingTs < localTs) return false;
      if (Number.isFinite(newerLocalTs) && incomingTs >= newerLocalTs) {
        return false;
      }
      return true;
    });

    if (candidateLocal) {
      claimed.add(candidateLocal.id);
      mergedById.set(
        candidateLocal.id,
        mergeRunData(mergedById.get(candidateLocal.id), incomingRun),
      );
      continue;
    }

    mergedById.set(incomingRun.id, incomingRun);
  }

  return Array.from(mergedById.values()).sort(byStartedAtDesc);
}
