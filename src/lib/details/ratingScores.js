// src/lib/details/ratingScores.js
//
// Notas del PÚBLICO de Rotten Tomatoes (Popcornmeter) y Metacritic (User Score),
// leídas del HTML de su ficha. Son las que más votos reúnen, así que el marcador
// las enseña en lugar del Tomatometer y el Metascore, en escala 0–10 con un
// decimal como TMDb, Trakt e IMDb, y con su recuento de votos como `sub`.
// Solo se fía de datos estructurados del propio título:
//   - Rotten Tomatoes, `<script data-json="mediaScorecard">`: `audienceScore`
//     ("91%" → 9.1). El recuento solo se publica en tramos ("250,000+ Ratings"),
//     así que se devuelve el mínimo del tramo y `audienceCountBanded`.
//   - Metacritic: "Based on 4,204 User Ratings" del bloque de nota de usuarios y
//     el `aria-label="User score 8.8 out of 10"` que lo sigue. El bloque puede
//     salir más de una vez: si no coinciden, no se sabe cuál es y no se usa.
// Sin dato reconocible devuelve null: la insignia no se pinta.

import { formatCountShort } from "./formatters.js";

function positiveInt(value) {
  const n = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : value;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Nota 0–10 con un decimal, o null fuera de rango.
function score10(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
}

export function parseRottenTomatoesScores(html) {
  const scorecard = /<script[^>]*data-json=["']mediaScorecard["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ""));
  if (!scorecard) return null;
  let audience;
  try {
    audience = JSON.parse(scorecard[1])?.audienceScore;
  } catch {
    return null;
  }
  const percent = /^\s*(\d{1,3})\s*%\s*$/.exec(String(audience?.scorePercent ?? ""));
  const score = percent ? score10(Number(percent[1]) / 10) : null;
  if (score == null) return null;
  const banded = /^\s*([\d.,]+)\s*\+/.exec(String(audience?.bandedRatingCount || ""));
  return {
    audienceScore: score,
    audienceCount: banded ? positiveInt(banded[1]) : null,
    audienceCountBanded: true,
  };
}

export function parseMetacriticScores(html) {
  // La página también trae reseñas de usuarios sueltas con su propio
  // "User score N out of 10": solo vale la nota que sigue al recuento global
  // ("Based on N User Ratings", enlace a /user-reviews/).
  const text = String(html || "");
  const blocks = [...text.matchAll(/user-reviews\/"[^>]*>(?:<!--\[-->)?\s*Based on ([\d,]+) User Ratings?/g)]
    .map((match) => {
      const after = text.slice(match.index, match.index + 3000);
      const label = /aria-label="User score (\d{1,2}(?:\.\d)?) out of 10"/.exec(after);
      return label ? `${label[1]}|${match[1]}` : null;
    });
  const distinct = new Set(blocks);
  if (distinct.size !== 1 || blocks[0] == null) return null;
  const [raw, count] = blocks[0].split("|");
  const score = score10(raw);
  if (score == null) return null;
  return { audienceScore: score, audienceCount: positiveInt(count), audienceCountBanded: false };
}

// Insignia del marcador: { value: "9.1", sub: "250K+" }, o null sin nota.
export function audienceScoreBadge(scores, href) {
  if (scores?.audienceScore == null) return null;
  const count = formatCountShort(scores.audienceCount);
  return {
    value: scores.audienceScore.toFixed(1),
    sub: count ? `${count}${scores.audienceCountBanded ? "+" : ""}` : undefined,
    href,
  };
}
