// Imágenes de la portada móvil de un episodio (EpisodeDetailsClient).
//
// Un episodio no tiene póster: tiene imágenes horizontales (16:9, los "stills"
// de TMDb). En el teléfono la ficha usa la misma cabecera que las temporadas,
// con una portada VERTICAL; se compone apilando varias de esas imágenes, una
// debajo de otra con la unión difuminada. Con tres bandas 16:9 el conjunto
// llena una portada vertical casi sin recortar; con dos, cada banda se recorta
// un poco por los lados.
//
// Orden: la imagen oficial del episodio (`still_path`) primero y después las
// demás en el orden de TMDb (por votos). Sin texto si las hay. Si el episodio
// tiene menos de dos, se completa con fondos sin texto de la serie.

export const EPISODE_HERO_MAX_BANDS = 3;
export const EPISODE_HERO_MIN_BANDS = 2;

const isTextless = (image) => {
  const lang = image?.iso_639_1;
  return lang == null || lang === "" || lang === "xx";
};

function textlessFirst(images) {
  const valid = (Array.isArray(images) ? images : []).filter(
    (image) => typeof image?.file_path === "string" && image.file_path,
  );
  const textless = valid.filter(isTextless);
  return (textless.length ? textless : valid).map((image) => image.file_path);
}

export function pickEpisodeHeroStills({
  stillPath = null,
  stills = [],
  showBackdrops = [],
} = {}) {
  const picked = [];
  const add = (path) => {
    if (typeof path === "string" && path && !picked.includes(path)) picked.push(path);
  };

  add(stillPath);
  for (const path of textlessFirst(stills)) {
    if (picked.length >= EPISODE_HERO_MAX_BANDS) break;
    add(path);
  }
  // Solo los fondos SIN texto de la serie: uno rotulado repetiría el título
  // encima de la imagen del episodio.
  const showTextless = (Array.isArray(showBackdrops) ? showBackdrops : [])
    .filter((image) => typeof image?.file_path === "string" && image.file_path && isTextless(image))
    .map((image) => image.file_path);
  for (const path of showTextless) {
    if (picked.length >= EPISODE_HERO_MIN_BANDS) break;
    add(path);
  }
  return picked.slice(0, EPISODE_HERO_MAX_BANDS);
}

// Fondo de la ficha del episodio en ORDENADOR (desde `sm`). La portada de la
// izquierda ya es la imagen oficial (`still_path`); usar la misma de fondo
// repetía la escena dos veces. Se busca otra, por este orden:
//   1. otra imagen del episodio (sin texto si las hay),
//   2. un fondo sin texto de la serie,
//   3. el fondo principal de la serie,
// y solo si no hay ninguna distinta se repite la de la portada.
export function pickEpisodeBackdrop({
  stillPath = null,
  stills = [],
  showBackdrops = [],
  showBackdropPath = null,
} = {}) {
  const differs = (path) =>
    typeof path === "string" && path !== "" && path !== stillPath;

  const fromEpisode = textlessFirst(stills).find(differs);
  if (fromEpisode) return fromEpisode;

  const fromShow = (Array.isArray(showBackdrops) ? showBackdrops : [])
    .filter((image) => isTextless(image))
    .map((image) => image?.file_path)
    .find(differs);
  if (fromShow) return fromShow;

  if (differs(showBackdropPath)) return showBackdropPath;
  return stillPath || showBackdropPath || null;
}
