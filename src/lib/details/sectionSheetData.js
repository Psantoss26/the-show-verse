// Datos de la vista lateral del reparto (details/sectionSheet): el equipo
// técnico de TMDb agrupado por departamento, con una entrada por persona y
// sus trabajos, en español.
//
// `crew` es el de /credits (películas: { job, department }) o el de
// /aggregate_credits (series: { jobs: [{ job, episode_count }], department,
// total_episode_count }).

const DEPARTMENTS = [
  // Creadores de una serie: TMDb no los incluye en los créditos del equipo
  // (vienen en `created_by`), se añaden aparte y van los primeros.
  ["Creator", "Creación"],
  ["Directing", "Dirección"],
  ["Writing", "Guion"],
  ["Production", "Producción"],
  ["Camera", "Fotografía"],
  ["Editing", "Montaje"],
  ["Sound", "Sonido"],
  ["Art", "Arte"],
  ["Costume & Make-Up", "Vestuario y maquillaje"],
  ["Visual Effects", "Efectos visuales"],
  ["Lighting", "Iluminación"],
  ["Crew", "Equipo"],
];
const DEPARTMENT_LABELS = new Map(DEPARTMENTS);
const DEPARTMENT_ORDER = new Map(DEPARTMENTS.map(([key], index) => [key, index]));

const JOBS = {
  Director: "Director",
  "Co-Director": "Codirector",
  Screenplay: "Guion",
  Writer: "Guionista",
  Teleplay: "Guion de televisión",
  Story: "Historia",
  Novel: "Novela",
  Characters: "Personajes",
  Creator: "Creador",
  Producer: "Productor",
  "Executive Producer": "Productor ejecutivo",
  "Co-Producer": "Coproductor",
  "Co-Executive Producer": "Coproductor ejecutivo",
  "Associate Producer": "Productor asociado",
  "Line Producer": "Productor de línea",
  "Supervising Producer": "Productor supervisor",
  Casting: "Casting",
  "Original Music Composer": "Música original",
  "Music Supervisor": "Supervisión musical",
  "Director of Photography": "Director de fotografía",
  Editor: "Montaje",
  "Production Design": "Diseño de producción",
  "Art Direction": "Dirección de arte",
  "Set Decoration": "Decoración",
  "Costume Design": "Diseño de vestuario",
  "Makeup Artist": "Maquillaje",
  "Visual Effects Supervisor": "Supervisión de efectos visuales",
  "Sound Designer": "Diseño de sonido",
  "Stunt Coordinator": "Coordinación de especialistas",
  "Script Coordinator": "Coordinación de guion",
  "Script Supervisor": "Supervisión de guion",
  "First Assistant Director": "Primer ayudante de dirección",
  "Second Assistant Director": "Segundo ayudante de dirección",
  "Assistant Director": "Ayudante de dirección",
  "Staff Writer": "Guionista de plantilla",
  "Story Editor": "Editor de historia",
  "Executive Story Editor": "Editor ejecutivo de historia",
  "Consulting Producer": "Productor consultor",
  "Casting Director": "Director de casting",
  "Music": "Música",
  "Composer": "Compositor",
  "Sound Mixer": "Mezcla de sonido",
  "Supervising Sound Editor": "Supervisión de edición de sonido",
  "Camera Operator": "Operador de cámara",
  "Production Manager": "Jefe de producción",
};

// Trabajos principales de cada departamento: van delante del resto (TMDb da
// los créditos en otro orden: en «Dirección» salían antes los ayudantes que
// el director).
const KEY_JOBS = [
  "Creator",
  "Director",
  "Co-Director",
  "Screenplay",
  "Writer",
  "Teleplay",
  "Story",
  "Novel",
  "Executive Producer",
  "Producer",
  "Original Music Composer",
  "Director of Photography",
  "Editor",
  "Casting",
  "Production Design",
  "Costume Design",
];
const KEY_JOB_RANK = new Map(KEY_JOBS.map((job, index) => [job, index]));

function jobRank(person) {
  return Math.min(...person.jobs.map((job) => KEY_JOB_RANK.get(job.job) ?? KEY_JOBS.length));
}

/** Trabajo de TMDb en español (o tal cual si no se conoce). */
export function crewRoleLabel(job) {
  return JOBS[job] || job || "";
}

/**
 * [{ department, label, people: [{ id, name, profile_path, jobs: [{ job,
 * episodes }], episodes }] }] ordenado por departamento; dentro, por episodios
 * Dentro de cada departamento, primero los trabajos principales (director,
 * guion, producción…), luego por episodios (series) y luego por el orden de
 * TMDb.
 *
 * `creators`: los creadores de una serie ({ id, name, profile_path }), que
 * forman el grupo «Creación».
 */
export function buildCrewGroups(crew, { creators = [] } = {}) {
  const groups = new Map();
  const members = [
    ...(Array.isArray(creators) ? creators : []).map((person) => ({ ...person, department: "Creator", job: "Creator" })),
    ...(Array.isArray(crew) ? crew : []),
  ];
  members.forEach((member, index) => {
    if (!member?.id || !member?.name) return;
    const department = member.department || "Crew";
    if (!groups.has(department)) groups.set(department, new Map());
    const people = groups.get(department);
    const jobs = Array.isArray(member.jobs)
      ? member.jobs.map((job) => ({ job: job?.job, episodes: Number(job?.episode_count) || null }))
      : [{ job: member.job, episodes: null }];
    const existing = people.get(member.id);
    if (existing) {
      for (const job of jobs) {
        if (job.job && !existing.jobs.some((item) => item.job === job.job)) existing.jobs.push(job);
      }
      existing.episodes = Math.max(existing.episodes || 0, Number(member.total_episode_count) || 0) || null;
      return;
    }
    people.set(member.id, {
      id: member.id,
      name: member.name,
      profile_path: member.profile_path || null,
      jobs: jobs.filter((job) => job.job),
      episodes: Number(member.total_episode_count) || null,
      index,
    });
  });

  return [...groups.entries()]
    .map(([department, people]) => ({
      department,
      label: DEPARTMENT_LABELS.get(department) || department,
      people: [...people.values()].sort(
        (a, b) => jobRank(a) - jobRank(b) || (b.episodes || 0) - (a.episodes || 0) || a.index - b.index,
      ),
    }))
    .sort((a, b) => (DEPARTMENT_ORDER.get(a.department) ?? 99) - (DEPARTMENT_ORDER.get(b.department) ?? 99));
}
