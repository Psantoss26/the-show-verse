"use client";

// /src/components/details/AwardCard.jsx
// Tarjeta de un premio y los ayudantes puros que la alimentan (normalización de
// la respuesta de TMDb, ordenación, etiquetas y paleta por galardón).
//
// Vivían dentro de DetailsClient. Se mueven aquí porque la ficha de TELÉFONO
// del DetailModal muestra la MISMA sección de Premios: son ~400 líneas de
// lógica pura que no tiene ningún sentido tener por duplicado, y con dos copias
// la primera corrección a una etiqueta o a un color dejaría las dos superficies
// distintas.

import OptimizedImage from "@/components/OptimizedImage";

function awardResultLabel(result) {
  if (result === "winner") return "Ganador";
  if (result === "nominee") return "Nominado";
  return "Reconocimiento";
}

function awardResultClass(result) {
  if (result === "winner") {
    return "text-yellow-400";
  }
  if (result === "nominee") {
    return "text-zinc-300";
  }
  return "text-zinc-400";
}

export function flattenAwardItems(details) {
  const groups = Array.isArray(details?.groups) ? details.groups : [];
  let sourceIndex = 0;

  return groups.flatMap((group) =>
    (Array.isArray(group?.items) ? group.items : []).map((item, index) => {
      const flattened = {
        ...item,
        id: `${group?.name || "award"}-${item?.category || "category"}-${item?.year || "year"}-${index}`,
        groupName: group?.name || "Premio",
        groupImageUrl: group?.imageUrl || null,
        sourceIndex,
      };
      sourceIndex += 1;
      return flattened;
    }),
  );
}

function awardResultRank(result) {
  if (result === "winner") return 0;
  if (result === "nominee") return 1;
  return 2;
}

export function sortAwardItemsForDisplay(items) {
  return [...items].sort((a, b) => {
    const byResult = awardResultRank(a?.result) - awardResultRank(b?.result);
    if (byResult !== 0) return byResult;
    return (a?.sourceIndex ?? 0) - (b?.sourceIndex ?? 0);
  });
}

function getAwardInitials(name) {
  const words = String(name || "Premio")
    .replace(/\b(awards?|film|prize|academy|guild|of|the|and|de|la)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials || "TSV";
}

function formatAwardGroupName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Premio";

  const n = raw.toLowerCase();

  if (/academy awards?|oscars?/.test(n)) return "Premios Oscar";
  if (/primetime emmy|emmy/.test(n)) return "Premios Emmy";
  if (/golden\s+globes?/.test(n)) return "Globos de Oro";
  if (/bafta/.test(n)) return "Premios BAFTA";
  if (/goya/.test(n)) return "Premios Goya";
  if (/c[eé]sar/.test(n)) return "Premios César";
  if (/screen\s+actors\s+guild|sag/.test(n)) {
    return "Premios del Sindicato de Actores";
  }
  if (/actor awards?/.test(n)) return "Premios de Interpretación";
  if (/writers?\s+guild|wga/.test(n)) {
    return "Premios del Sindicato de Guionistas";
  }
  if (/directors?\s+guild|dga/.test(n)) {
    return "Premios del Sindicato de Directores";
  }
  if (/producers?\s+guild|pga/.test(n)) {
    return "Premios del Sindicato de Productores";
  }
  if (/japan academy film prize/.test(n)) {
    return "Premios de la Academia Japonesa de Cine";
  }
  if (/mainichi film awards?/.test(n)) return "Premios Mainichi de Cine";
  if (/american film institute|\bafi\b/.test(n)) {
    return "Instituto Americano de Cine";
  }
  if (/critics'? choice/.test(n)) return "Premios de la Crítica";
  if (/independent spirit/.test(n)) return "Premios Independent Spirit";
  if (/saturn awards?/.test(n)) return "Premios Saturn";
  if (/annie awards?/.test(n)) return "Premios Annie";
  if (/hugo awards?/.test(n)) return "Premios Hugo";
  if (/grammy awards?/.test(n)) return "Premios Grammy";
  if (/cannes/.test(n)) return "Festival de Cannes";
  if (/venice/.test(n)) return "Festival de Venecia";
  if (/berlin/.test(n)) return "Festival de Berlín";
  if (/national board of review/.test(n)) return "National Board of Review";
  if (/new york film critics/.test(n)) {
    return "Críticos de Cine de Nueva York";
  }
  if (/los angeles film critics/.test(n)) {
    return "Críticos de Cine de Los Ángeles";
  }
  if (/online film critics/.test(n)) return "Críticos de Cine Online";

  return raw
    .replace(/\bAwards?\b/g, "Premios")
    .replace(/\bFilm\b/g, "Cine")
    .replace(/\bPrize\b/g, "Premio")
    .replace(/\bAcademy\b/g, "Academia")
    .replace(/\bGuild\b/g, "Sindicato");
}

function getAwardVisual(name) {
  const n = String(name || "").toLowerCase();

  if (/\bacademy\b|oscar/.test(n)) {
    return {
      label: "OSCAR",
      background:
        "radial-gradient(circle at 50% 18%, rgba(255,231,138,0.36), transparent 30%), linear-gradient(145deg, #3d2a08 0%, #090807 48%, #000 100%)",
      accent: "text-yellow-200",
      ring: "border-yellow-300/25",
    };
  }

  if (/golden\s+globes?/.test(n)) {
    return {
      label: "GLOBOS",
      background:
        "radial-gradient(circle at 50% 26%, rgba(252,211,77,0.34), transparent 32%), linear-gradient(145deg, #2c1d08 0%, #071716 52%, #010101 100%)",
      accent: "text-amber-200",
      ring: "border-amber-300/25",
    };
  }

  if (/bafta/.test(n)) {
    return {
      label: "BAFTA",
      background:
        "radial-gradient(circle at 50% 22%, rgba(251,191,36,0.28), transparent 33%), linear-gradient(145deg, #301f0c 0%, #16100c 42%, #000 100%)",
      accent: "text-orange-200",
      ring: "border-orange-300/25",
    };
  }

  if (/actor|screen\s+actors|sag/.test(n)) {
    return {
      label: "ACTORES",
      background:
        "radial-gradient(circle at 50% 18%, rgba(125,211,252,0.24), transparent 34%), linear-gradient(145deg, #071b2b 0%, #060b12 52%, #000 100%)",
      accent: "text-sky-200",
      ring: "border-sky-300/25",
    };
  }

  if (/writers?|screenplay|wga|guild/.test(n)) {
    return {
      label: "GUION",
      background:
        "radial-gradient(circle at 50% 18%, rgba(216,180,254,0.22), transparent 34%), linear-gradient(145deg, #241035 0%, #100817 52%, #000 100%)",
      accent: "text-violet-200",
      ring: "border-violet-300/25",
    };
  }

  if (/\bafi\b/.test(n)) {
    return {
      label: "AFI",
      background:
        "radial-gradient(circle at 50% 18%, rgba(248,113,113,0.22), transparent 34%), linear-gradient(145deg, #2f0d0d 0%, #130809 50%, #000 100%)",
      accent: "text-red-200",
      ring: "border-red-300/25",
    };
  }

  if (/japan/.test(n)) {
    return {
      label: "JAPÓN",
      background:
        "radial-gradient(circle at 50% 18%, rgba(244,114,182,0.22), transparent 34%), linear-gradient(145deg, #2a0d1d 0%, #13080f 52%, #000 100%)",
      accent: "text-pink-200",
      ring: "border-pink-300/25",
    };
  }

  if (/czech|lion/.test(n)) {
    return {
      label: "LEÓN",
      background:
        "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.25), transparent 34%), linear-gradient(145deg, #2f2608 0%, #101006 52%, #000 100%)",
      accent: "text-yellow-200",
      ring: "border-yellow-300/25",
    };
  }

  return {
    label: getAwardInitials(name),
    background:
      "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.2), transparent 34%), linear-gradient(145deg, #1f1b12 0%, #0b0b0b 52%, #000 100%)",
    accent: "text-yellow-200",
    ring: "border-yellow-300/20",
  };
}

function awardCategoryContextLabel(category) {
  const c = String(category || "").toLowerCase();
  if (/motion picture.*drama|drama.*motion picture/.test(c)) {
    return "en película dramática";
  }
  if (
    /motion picture.*(musical or comedy|comedy or musical)/.test(c) ||
    /(musical or comedy|comedy or musical).*motion picture/.test(c)
  ) {
    return "en película musical o comedia";
  }
  if (/television series.*drama|drama.*television series/.test(c)) {
    return "en serie dramática";
  }
  if (
    /television series.*(musical or comedy|comedy or musical)/.test(c) ||
    /(musical or comedy|comedy or musical).*television series/.test(c)
  ) {
    return "en serie musical o comedia";
  }
  if (/musical or comedy|comedy or musical/.test(c)) {
    return "en musical o comedia";
  }
  if (/drama series/.test(c)) return "en drama";
  if (/comedy series/.test(c)) return "en comedia";
  if (/limited series|miniseries|television movie|tv movie/.test(c)) {
    return "en miniserie/TV";
  }
  if (/motion picture|feature film|film\b/.test(c)) return "en película";
  if (/series/.test(c)) return "en serie";
  return "";
}

function normalizeAwardCategoryKey(category) {
  return String(category || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCommonAwardCategory(category) {
  const c = normalizeAwardCategoryKey(category);

  const exact = {
    "best picture": "Mejor película",
    "best film": "Mejor película",
    "best director": "Mejor dirección",
    "best original screenplay": "Mejor guion original",
    "best adapted screenplay": "Mejor guion adaptado",
    "best screenplay based on material from another medium":
      "Mejor guion adaptado",
    "best screenplay based on material previously produced or published":
      "Mejor guion adaptado",
    "best screenplay": "Mejor guion",
    "best original score": "Mejor música original",
    "best original song": "Mejor canción original",
    "best cinematography": "Mejor fotografía",
    "best editing": "Mejor montaje",
    "best film editing": "Mejor montaje",
    "best production design": "Mejor diseño de producción",
    "best art direction": "Mejor dirección artística",
    "best costume design": "Mejor vestuario",
    "best makeup": "Mejor maquillaje",
    "best make-up and hair": "Mejor maquillaje y peluquería",
    "best visual effects": "Mejores efectos visuales",
    "best special effects": "Mejores efectos especiales",
    "best sound": "Mejor sonido",
    "best sound editing": "Mejor edición de sonido",
    "best sound mixing": "Mejor mezcla de sonido",
    "best foreign film": "Mejor película extranjera",
    "best international feature film": "Mejor película internacional",
    "best foreign language film": "Mejor película en lengua extranjera",
    "outstanding foreign language film": "Mejor película en lengua extranjera",
    "afi movies of the year": "Película del año",
  };

  if (exact[c]) return exact[c];

  if (/best motion picture - drama/.test(c)) return "Mejor película dramática";
  if (/best motion picture - musical or comedy/.test(c)) {
    return "Mejor película musical o comedia";
  }
  if (/best television series - drama/.test(c)) {
    return "Mejor serie dramática";
  }
  if (/best television series - musical or comedy/.test(c)) {
    return "Mejor serie musical o comedia";
  }
  if (/best limited series|best television movie/.test(c)) {
    return "Mejor miniserie o película de TV";
  }

  if (/best performance by/.test(c)) {
    const context = awardCategoryContextLabel(category);
    const withContext = (base) => [base, context].filter(Boolean).join(" ");

    if (/ensemble|cast/.test(c)) return withContext("Mejor reparto");
    if (/supporting/.test(c) && /(female actor|actress|actriz)/.test(c)) {
      return withContext("Mejor actriz de reparto");
    }
    if (/supporting/.test(c) && /(male actor|actor)/.test(c)) {
      return withContext("Mejor actor de reparto");
    }
    if (/female actor|actress/.test(c)) return withContext("Mejor actriz");
    if (/male actor|actor/.test(c)) return withContext("Mejor actor");
  }

  if (/best director/.test(c)) return "Mejor dirección";
  if (/best screenplay/.test(c)) return "Mejor guion";
  if (/best original score/.test(c)) return "Mejor música original";
  if (/best original song/.test(c)) return "Mejor canción original";

  if (/best (lead )?actor/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actor", context].filter(Boolean).join(" ");
  }
  if (/best (lead )?actress/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actriz", context].filter(Boolean).join(" ");
  }
  if (/best supporting actor/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actor de reparto", context].filter(Boolean).join(" ");
  }
  if (/best supporting actress/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actriz de reparto", context].filter(Boolean).join(" ");
  }

  if (/outstanding drama series/.test(c)) return "Mejor serie dramática";
  if (/outstanding comedy series/.test(c)) return "Mejor serie de comedia";
  if (/outstanding limited|outstanding television movie/.test(c)) {
    return "Mejor miniserie o película de TV";
  }
  if (/outstanding directing/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor dirección", context].filter(Boolean).join(" ");
  }
  if (/outstanding writing/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor guion", context].filter(Boolean).join(" ");
  }
  if (/outstanding casting/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor casting", context].filter(Boolean).join(" ");
  }

  return null;
}

function formatAwardCategory(category, groupName) {
  const raw = String(category || "").trim();
  if (!raw) return formatAwardGroupName(groupName);

  const group = String(groupName || "").toLowerCase();
  const c = normalizeAwardCategoryKey(raw);
  const isActorAward = /actor|screen\s+actors|sag/.test(group);

  if (isActorAward || /outstanding performance/.test(c)) {
    const context = awardCategoryContextLabel(raw);
    const withContext = (base) => [base, context].filter(Boolean).join(" ");

    if (/stunt ensemble|action performance/.test(c)) {
      return withContext("Mejor equipo de especialistas");
    }
    if (/ensemble|cast/.test(c)) return withContext("Mejor reparto");
    if (/guest actor/.test(c)) return withContext("Mejor actor invitado");
    if (/female actor|actress/.test(c)) return withContext("Mejor actriz");
    if (/male actor|actor/.test(c)) return withContext("Mejor actor");
  }

  return formatCommonAwardCategory(raw) || raw;
}

export default function AwardCard({ item, enableHover = false }) {
  const people = Array.isArray(item?.people) ? item.people.filter(Boolean) : [];
  const visual = getAwardVisual(item?.groupName);
  const categoryLabel = formatAwardCategory(item?.category, item?.groupName);
  const groupLabel = formatAwardGroupName(item?.groupName);

  return (
    <article
      className={`block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md transform-gpu transition-all duration-300 motion-reduce:transition-none ${
        enableHover
          ? "hover:-translate-y-1 hover:brightness-110 hover:shadow-yellow-900/20"
          : ""
      }`}
    >
      <div
        className="aspect-[2/3] overflow-hidden relative flex flex-col"
        style={{ background: visual.background }}
      >
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.18)_48%,transparent_52%)] pointer-events-none" />
        <div className="absolute inset-x-5 top-12 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        <div className="absolute inset-x-0 top-0 z-10 hidden items-start justify-between gap-2 px-3 py-2 sm:flex">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${awardResultClass(
              item?.result,
            )}`}
          >
            {item?.result === "winner" && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
            )}
            {item?.result === "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(212,212,216,0.8)]" />
            )}
            {item?.result !== "winner" && item?.result !== "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            )}
            {awardResultLabel(item?.result)}
          </span>
          {item?.year && (
            <span className="text-[10px] font-black tracking-widest text-zinc-300 transition-all">
              {item.year}
            </span>
          )}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-2 pb-14 sm:px-4 sm:pb-20 z-10">
          <div
            className={`max-w-[95%] rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[9px] font-black uppercase leading-none tracking-[0.16em] drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] truncate backdrop-blur-sm sm:max-w-[82%] sm:px-2 sm:text-[11px] ${visual.accent}`}
          >
            {visual.label}
          </div>

          {item?.groupImageUrl && (
            <div
              className={`mt-3 flex h-20 w-20 items-center justify-center transform-gpu transition-transform duration-500 ease-out sm:mt-4 sm:h-24 sm:w-24 motion-reduce:transition-none ${
                enableHover ? "group-hover:scale-110" : ""
              }`}
            >
              <OptimizedImage
                src={item.groupImageUrl}
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] rounded-lg"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-2 py-2 sm:px-3 sm:py-3 z-20">
          <div className="sm:hidden">
            <p className="text-center text-[10px] font-extrabold leading-tight text-white line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {categoryLabel}
            </p>
            <p className="mt-1 text-center text-[9px] font-bold leading-tight text-yellow-400 line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-white font-extrabold text-sm leading-tight line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {categoryLabel}
            </p>
            <p className="mt-1 text-yellow-400 text-xs font-bold leading-tight line-clamp-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
            {people.length > 0 && (
              <p className="mt-1 text-gray-200 text-xs leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {people.join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
