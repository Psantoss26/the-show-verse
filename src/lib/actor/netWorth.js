// PATRIMONIO NETO de una persona (ActorDetails), desde Wikidata.
//
// Wikidata guarda el dato en la propiedad P2218 («patrimonio neto»): una
// cantidad con su moneda como unidad, normalmente con la fecha a la que se
// refiere (calificador P585, «fecha») y la publicación que lo cita (Forbes y
// similares, en sus referencias). Es la única fuente fiable y abierta con este
// dato: las webs de «net worth» no tienen API y sus cifras no citan fuente.
//
// Solo lo tiene una parte de las personas (sobre todo las más conocidas): sin
// dato, la ficha simplemente no muestra la tarjeta.

// Monedas por su elemento de Wikidata (la «unidad» de la cantidad).
const CURRENCY_BY_QID = {
  Q4917: "USD",
  Q4916: "EUR",
  Q25224: "GBP",
  Q8146: "JPY",
  Q1104069: "CAD",
  Q259502: "AUD",
  Q39099: "CNY",
  Q80524: "INR",
  Q41044: "RUB",
  Q4730: "MXN",
  Q173117: "BRL",
  Q202040: "KRW",
  Q25344: "CHF",
};

// Cómo se nombra cada moneda tras la cifra («120 millones de dólares»).
const CURRENCY_NAMES = {
  USD: "dólares",
  EUR: "euros",
  GBP: "libras",
  JPY: "yenes",
  CAD: "dólares canadienses",
  AUD: "dólares australianos",
  CNY: "yuanes",
  INR: "rupias",
  RUB: "rublos",
  MXN: "pesos mexicanos",
  BRL: "reales",
  KRW: "wones",
  CHF: "francos suizos",
};

function currencyFromUnit(unit) {
  const qid = String(unit || "").split("/").pop();
  return CURRENCY_BY_QID[qid] || null;
}

// "+2023-00-00T00:00:00Z" → 2023.
function yearFromWikidataTime(time) {
  const match = /^[+-]?(\d{1,4})-/.exec(String(time || ""));
  const year = match ? Number(match[1]) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

function claimYear(claim) {
  const qualifier = claim?.qualifiers?.P585?.find(
    (snak) => snak?.snaktype === "value",
  );
  return yearFromWikidataTime(qualifier?.datavalue?.value?.time);
}

/**
 * Elige el patrimonio de las declaraciones P2218 de una persona: descarta las
 * obsoletas, prefiere las de rango preferente y, entre ellas, la más reciente.
 * Devuelve `{ amount, currency, year }` (year puede ser null) o null.
 */
export function pickNetWorth(claims) {
  const candidates = (Array.isArray(claims?.P2218) ? claims.P2218 : [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => {
      const snak = claim?.mainsnak;
      if (snak?.snaktype !== "value") return null;
      const value = snak?.datavalue?.value;
      const amount = Number(value?.amount);
      const currency = currencyFromUnit(value?.unit);
      if (!Number.isFinite(amount) || amount <= 0 || !currency) return null;
      return {
        amount,
        currency,
        year: claimYear(claim),
        preferred: claim.rank === "preferred",
      };
    })
    .filter(Boolean);
  if (!candidates.length) return null;

  candidates.sort(
    (a, b) =>
      Number(b.preferred) - Number(a.preferred) || (b.year ?? 0) - (a.year ?? 0),
  );
  const { amount, currency, year } = candidates[0];
  return { amount, currency, year };
}

const decimal = (value) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 });

/**
 * «120 millones de dólares», «1,2 mil millones de dólares», «450.000 euros».
 * Las cifras de patrimonio son estimaciones redondas: un decimal basta.
 */
export function formatNetWorth(netWorth) {
  if (!netWorth?.amount || !netWorth?.currency) return null;
  const { amount, currency } = netWorth;
  const name = CURRENCY_NAMES[currency] || currency;
  if (amount >= 1e9) return `${decimal(amount / 1e9)} mil millones de ${name}`;
  if (amount >= 1e6) {
    const millions = amount / 1e6;
    return `${decimal(millions)} ${millions === 1 ? "millón" : "millones"} de ${name}`;
  }
  return `${Math.round(amount).toLocaleString("es-ES")} ${name}`;
}
