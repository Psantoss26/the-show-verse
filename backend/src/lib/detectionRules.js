// src/lib/detectionRules.js
// Aprendizaje de las correcciones de detecciones de streaming (sin base de datos,
// para poder probarlo aislado). Ver db/schema.js → detection_rules.
//
// Una HUELLA (plataforma + texto de identidad normalizado; la calcula el
// endpoint de resolución) puede tener reglas de dos dueños:
//   - el propio usuario: valen en cuanto corrige;
//   - 'global': se derivan de las correcciones de TODOS y solo valen cuando las
//     respaldan al menos GLOBAL_RULE_MIN_SUPPORTERS usuarios distintos. Así un
//     error (o un abuso) de una sola persona no cambia la detección de nadie más.
// Lo personal manda siempre sobre lo global.

export const GLOBAL_OWNER = 'global';

export function globalRuleMinSupporters() {
  const value = Number.parseInt(process.env.DETECTION_GLOBAL_MIN_SUPPORTERS || '', 10);
  return Number.isInteger(value) && value >= 1 ? value : 3;
}

const titleKey = (tmdbId, mediaType) => `${mediaType}:${tmdbId}`;

/**
 * Decide qué hacer con una huella a partir de sus reglas.
 * @param {Array<{owner:string, rule:string, tmdbId?:number|null, mediaType?:string|null,
 *   title?:string|null, posterPath?:string|null, supporters?:number}>} rules
 * @param {string} userId
 * @returns {{ decision: null | { rule:'override'|'not_a_title', scope:'user'|'global',
 *   tmdbId?:number, mediaType?:string, title?:string|null, posterPath?:string|null },
 *   rejects: Array<{tmdbId:number, mediaType:string}> }}
 */
export function decideFromRules(rules, userId, minSupporters = globalRuleMinSupporters()) {
  const mine = [];
  const global = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.owner === userId) mine.push(rule);
    else if (rule?.owner === GLOBAL_OWNER && (rule.supporters ?? 0) >= minSupporters) global.push(rule);
  }

  const myRejects = new Set(
    mine.filter((r) => r.rule === 'reject').map((r) => titleKey(r.tmdbId, r.mediaType)),
  );
  const asDecision = (rule, scope) => (rule.rule === 'override'
    ? {
        rule: 'override', scope, tmdbId: rule.tmdbId, mediaType: rule.mediaType,
        title: rule.title ?? null, posterPath: rule.posterPath ?? null,
      }
    : { rule: 'not_a_title', scope });

  let decision = null;
  const myDecision = mine.find((r) => r.rule === 'override' || r.rule === 'not_a_title');
  if (myDecision) {
    decision = asDecision(myDecision, 'user');
  } else {
    const globalDecision = global.find((r) => r.rule === 'override' || r.rule === 'not_a_title');
    // Un título que este usuario ya rechazó no se le impone por consenso.
    if (globalDecision && !(globalDecision.rule === 'override'
      && myRejects.has(titleKey(globalDecision.tmdbId, globalDecision.mediaType)))) {
      decision = asDecision(globalDecision, 'global');
    }
  }

  // Vetos: los propios y los globales, salvo el título que el propio usuario
  // eligió para esta huella (su elección gana a un veto ajeno).
  const chosen = decision?.rule === 'override' ? titleKey(decision.tmdbId, decision.mediaType) : null;
  const rejects = new Map();
  for (const rule of [...mine, ...global]) {
    if (rule.rule !== 'reject' || !rule.tmdbId || !rule.mediaType) continue;
    const key = titleKey(rule.tmdbId, rule.mediaType);
    if (key === chosen && rule.owner !== userId) continue;
    rejects.set(key, { tmdbId: rule.tmdbId, mediaType: rule.mediaType });
  }
  return { decision, rejects: [...rejects.values()] };
}

/**
 * Reglas personales que produce una corrección.
 * @returns {{ decision: null | {rule, tmdbId?, mediaType?, title?, posterPath?},
 *   reject: {tmdbId:number, mediaType:string} }}
 */
export function userRulesFromCorrection(correction) {
  const reject = { tmdbId: correction.rejectedTmdbId, mediaType: correction.rejectedMediaType };
  if (correction.verdict === 'not_a_title') return { decision: { rule: 'not_a_title' }, reject };
  if (correction.tmdbId && correction.mediaType) {
    return {
      decision: {
        rule: 'override', tmdbId: correction.tmdbId, mediaType: correction.mediaType,
        title: correction.title ?? null, posterPath: correction.posterPath ?? null,
      },
      reject,
    };
  }
  // Título equivocado sin elegir el correcto: solo se veta el propuesto.
  return { decision: null, reject };
}

/**
 * Reglas globales de UNA huella a partir de todas sus correcciones. Cuenta cada
 * usuario una sola vez (su corrección más reciente).
 * @param {Array} corrections filas de detection_corrections de la huella
 * @returns {{ decision: null | {rule, tmdbId?, mediaType?, title?, posterPath?, supporters},
 *   rejects: Array<{tmdbId, mediaType, supporters}> }}
 */
export function aggregateGlobalRules(corrections, minSupporters = globalRuleMinSupporters()) {
  const latestByUser = new Map();
  for (const c of Array.isArray(corrections) ? corrections : []) {
    if (!c?.userId) continue;
    const prev = latestByUser.get(c.userId);
    if (!prev || new Date(c.createdAt) > new Date(prev.createdAt)) latestByUser.set(c.userId, c);
  }

  const decisions = new Map();
  const rejects = new Map();
  for (const c of latestByUser.values()) {
    const { decision, reject } = userRulesFromCorrection(c);
    if (decision) {
      const key = decision.rule === 'override' ? titleKey(decision.tmdbId, decision.mediaType) : 'not_a_title';
      const entry = decisions.get(key) || { ...decision, supporters: 0 };
      entry.supporters += 1;
      decisions.set(key, entry);
    }
    const rKey = titleKey(reject.tmdbId, reject.mediaType);
    const rEntry = rejects.get(rKey) || { ...reject, supporters: 0 };
    rEntry.supporters += 1;
    rejects.set(rKey, rEntry);
  }

  // Gana la decisión con más respaldo si llega al mínimo; un empate en cabeza no
  // decide nada (no hay consenso).
  const ranked = [...decisions.values()].sort((a, b) => b.supporters - a.supporters);
  let decision = null;
  if (ranked[0] && ranked[0].supporters >= minSupporters
    && !(ranked[1] && ranked[1].supporters === ranked[0].supporters)) {
    decision = ranked[0];
  }
  const chosen = decision?.rule === 'override' ? titleKey(decision.tmdbId, decision.mediaType) : null;
  const globalRejects = [...rejects.entries()]
    .filter(([key, r]) => key !== chosen && r.supporters >= minSupporters)
    .map(([, r]) => r);
  return { decision, rejects: globalRejects };
}
