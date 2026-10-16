// Imagen y vídeo compartibles de la ficha de una PERSONA. Usa la misma hoja de
// compartir que la ficha de un título (DetailsShareSheet) en su variante de
// listas (`kind="list"`): una filmografía es, a efectos de la imagen, una lista
// de títulos con portada propia.
//   - Imagen (composición «cover»): la foto de perfil a sangre, el oficio como
//     etiqueta, el nombre, el recuento de títulos con la trayectoria y, en el
//     sitio de la fila de acciones, la vista previa de «Conocido/a por».
//   - Vídeo: filmografía, mejor valoradas, «En cifras» y la biografía.

import {
  buildListShareCard,
  buildListShareStory,
  normalizeListShareItem,
} from "../lists/shareList.js";

const DEPARTMENTS = {
  acting: "Interpretación",
  directing: "Dirección",
  writing: "Guion",
  production: "Producción",
  camera: "Fotografía",
  editing: "Montaje",
  sound: "Sonido",
  art: "Dirección de arte",
  "costume & make-up": "Vestuario y maquillaje",
  "visual effects": "Efectos visuales",
  lighting: "Iluminación",
  crew: "Equipo técnico",
  creator: "Creación",
};

// Por debajo de estos votos la nota de TMDb no dice nada (un 10 con dos votos
// encabezaba «Mejor valoradas»).
const MIN_VOTES = 20;

export function departmentLabel(department) {
  const key = String(department || "").trim().toLowerCase();
  return DEPARTMENTS[key] || String(department || "").trim() || "Persona";
}

const creditKey = (item) => `${item?.media_type === "tv" ? "tv" : "movie"}:${item?.id}`;

/** Un crédito por título (la persona puede salir varias veces: reparto y equipo). */
export function uniqueCredits(credits) {
  const byTitle = new Map();
  for (const item of Array.isArray(credits) ? credits : []) {
    if (!item?.id) continue;
    const key = creditKey(item);
    if (!byTitle.has(key)) byTitle.set(key, item);
  }
  return [...byTitle.values()];
}

/**
 * @param person    detalles de TMDb (name, profile_path, known_for_department)
 * @param credits   créditos ya normalizados por la ficha (media_type, kind…)
 * @param knownFor  títulos destacados en el orden de la ficha
 * @param score     orden de popularidad de la ficha para la filmografía
 * @param facts     celdas de «En cifras» ya formateadas
 */
export function buildActorShare({
  person,
  biography = "",
  credits = [],
  knownFor = [],
  score = () => 0,
  careerYears = null,
  facts = [],
}) {
  const name = person?.name || "Persona";
  const titles = uniqueCredits(credits);
  const career = careerYears && careerYears !== "—" ? careerYears : null;

  const ranked = titles
    .filter((item) => item?.poster_path)
    .sort((a, b) => score(b) - score(a));
  const voted = ranked.filter((item) => Number(item?.vote_count || 0) >= MIN_VOTES);
  const filmography = (voted.length ? voted : ranked).map((item) => normalizeListShareItem(item));

  return {
    title: name,
    card: buildListShareCard({
      title: name,
      label: departmentLabel(person?.known_for_department),
      coverPath: person?.profile_path || null,
      layout: "cover",
      items: knownFor.map((item) => normalizeListShareItem(item)),
      count: titles.length,
      noun: "title",
      meta: [career],
    }),
    story: buildListShareStory({
      items: filmography,
      count: titles.length,
      noun: "title",
      description: biography || "",
      facts,
    }),
  };
}
