// Filmografía de una persona agrupada como la de TMDb: por departamento
// (Actuación, Producción, Guion…) y, dentro de cada uno, por año, con los
// proyectos sin fecha primero (suelen ser los anunciados) y después del más
// reciente al más antiguo. La pinta la vista lateral «Filmografía» de
// ActorDetails (details/sectionSheet/FilmographySheet).

const DEPARTMENT_LABELS = {
  Acting: "Actuación",
  Production: "Producción",
  Writing: "Guion",
  Directing: "Dirección",
  Creator: "Creación",
  Crew: "Equipo",
  Sound: "Sonido",
  Camera: "Fotografía",
  Editing: "Montaje",
  Art: "Arte",
  "Costume & Make-Up": "Vestuario y maquillaje",
  "Visual Effects": "Efectos visuales",
  Lighting: "Iluminación",
};

// Orden de las pestañas: actuación y los oficios principales primero.
const DEPARTMENT_ORDER = ["Acting", "Directing", "Writing", "Production", "Creator"];

export function departmentLabel(department) {
  return DEPARTMENT_LABELS[department] || department || "Equipo";
}

function creditDepartment(credit) {
  return credit?.kind === "acting" ? "Acting" : credit?.department || "Crew";
}

function creditDate(credit) {
  return credit?.media_type === "tv" ? credit?.first_air_date : credit?.release_date;
}

function creditYear(credit) {
  const year = Number(String(creditDate(credit) || "").slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function uniqueJoin(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

/**
 * Créditos → [{ key, label, count, years: [{ year, items }] }].
 * Cada título sale una vez por departamento: sus papeles (o trabajos) y sus
 * episodios se juntan. `media`: "all" | "movie" | "tv"; `query`: busca en el
 * título y en el papel.
 */
export function buildFilmography(credits, { media = "all", query = "" } = {}) {
  const needle = String(query || "").trim().toLocaleLowerCase("es-ES");
  const departments = new Map();

  for (const credit of Array.isArray(credits) ? credits : []) {
    if (!credit?.id) continue;
    const mediaType = credit.media_type === "tv" ? "tv" : "movie";
    if (media !== "all" && mediaType !== media) continue;
    const department = creditDepartment(credit);
    if (!departments.has(department)) departments.set(department, new Map());
    const titles = departments.get(department);
    const key = `${mediaType}-${credit.id}`;
    const entry = titles.get(key) || {
      key,
      id: credit.id,
      media_type: mediaType,
      title: credit.title || credit.name || "Sin título",
      poster_path: credit.poster_path || null,
      date: creditDate(credit) || null,
      year: creditYear(credit),
      roles: [],
      episodes: 0,
    };
    entry.roles.push(credit.kind === "acting" ? credit.character : credit.job);
    entry.episodes += Number(credit.episode_count) || 0;
    if (!entry.poster_path && credit.poster_path) entry.poster_path = credit.poster_path;
    titles.set(key, entry);
  }

  const result = [];
  for (const [department, titles] of departments) {
    const items = [...titles.values()]
      .map((item) => ({ ...item, roles: uniqueJoin(item.roles) }))
      .filter((item) => {
        if (!needle) return true;
        return [item.title, ...item.roles].some((value) =>
          value.toLocaleLowerCase("es-ES").includes(needle),
        );
      });
    if (!items.length) continue;
    const byYear = new Map();
    for (const item of items) {
      const year = item.year ?? null;
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(item);
    }
    const years = [...byYear.entries()]
      // Sin fecha primero; luego del más reciente al más antiguo.
      .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : b - a))
      .map(([year, list]) => ({
        year,
        items: list.sort(
          (a, b) =>
            String(b.date || "").localeCompare(String(a.date || "")) ||
            a.title.localeCompare(b.title, "es-ES"),
        ),
      }));
    result.push({ key: department, label: departmentLabel(department), count: items.length, years });
  }

  return result.sort((a, b) => {
    const ia = DEPARTMENT_ORDER.indexOf(a.key);
    const ib = DEPARTMENT_ORDER.indexOf(b.key);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.count - a.count;
  });
}

/** «como Mia Thermopolis», «como Margy Palm / Natalie» o el trabajo. */
export function filmographyRoleLabel(item, department) {
  if (!item?.roles?.length) return null;
  return department === "Acting" ? `como ${item.roles.join(" / ")}` : item.roles.join(", ");
}
