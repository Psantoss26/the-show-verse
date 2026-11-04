// src/lib/ai/watchNextIntent.js
//
// INTÉRPRETE DE LA PETICIÓN del Asistente (/assistant → /api/ai/watch-next).
// Convierte el texto libre del chat en criterios concretos que el servidor
// aplica como FILTROS de TMDb y del conjunto de candidatos (no solo como
// pistas para la IA): tipo, géneros (y los excluidos), ánimo, duración, nota
// mínima, plataformas de España, cines, novedad o época, país o idioma,
// «parecida a X» y «de mis pendientes».
//
// Puro y sin red: se prueba con node:test (watchNextIntent.test.mjs).
//
// Los identificadores salen de la API de TMDb (región ES, comprobados el
// 2026-11-04): géneros de /genre/{movie,tv}/list, plataformas de
// /watch/providers y palabras clave de /search/keyword. Las series no tienen
// terror, romance, suspense ni historia como género: se cubren con palabras
// clave o con el género más cercano.

// ---------------------------------------------------------------------------
// Texto

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabras que, justo antes de un concepto, lo NIEGAN: «sin terror», «nada de
// romance», «que no sea de miedo», «no quiero dramas», «ni anime».
const NEGATION_BEFORE =
  /(?:\bsin|\bnada de|\bque no (?:sea|tenga|de)|\bno quiero|\bno me apetece|\bno me apetecen|\bnada que|\bevita(?:r|ndo)?|\bexcepto|\bmenos\b|\bni\b|\bno\b)\s+(?:(?:un|una|unos|unas|el|la|los|las|algo|de|del|nada|que|mucho|mucha|tanto|tanta|demasiado|demasiada|ningun|ninguna|sea|tenga|este|esten|salga|salgan|en|pelis?|peliculas?|series?|cosas?)\s+){0,3}$/;

function findMatches(text, regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    out.push({ index: m.index, text: m[0] });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function isNegatedAt(text, index) {
  return NEGATION_BEFORE.test(text.slice(Math.max(0, index - 40), index));
}

// ---------------------------------------------------------------------------
// Géneros

// `movie`/`tv`: géneros de TMDb por tipo. `tvKeywords`: palabras clave cuando
// las series no tienen ese género. `label`: cómo se nombra en la respuesta.
export const GENRES = {
  action: { label: "acción", movie: [28], tv: [10759], re: /\b(accion|tiros|peleas?|explosiones|adrenalina pura|artes marciales)\b/ },
  adventure: { label: "aventuras", movie: [12], tv: [10759], re: /\b(aventuras?|epicas?|epicos?)\b/ },
  animation: { label: "animación", movie: [16], tv: [16], re: /\b(animacion|(?:peliculas?|pelis?|series?) animad[ao]s?|dibujos animados|dibujos|anime|pixar|ghibli)\b/ },
  comedy: { label: "comedia", movie: [35], tv: [35], re: /\b(comedias?|comicas?|comicos?|graciosas?|graciosos?|divertidas?|divertidos?|humor|reir|reirme|risas?|carcajadas?|sitcom)\b/ },
  crime: { label: "crimen", movie: [80], tv: [80], re: /\b(crimen(es)?|criminal|mafias?|mafiosos?|policiacas?|policiacos?|gangsters?|narcos?|atracos?|robos?|asesinos? en serie|true crime)\b/ },
  documentary: { label: "documental", movie: [99], tv: [99], re: /\b(documental(?:es)?|docuseries?|documentaria)\b/ },
  drama: { label: "drama", movie: [18], tv: [18], re: /\b(dramas?|dramaticas?|dramaticos?)\b/ },
  // «Con niños», «infantil» o «para toda la familia» son el ánimo `kids`
  // (familia O animación, sin terror), no este género a secas.
  family: { label: "familia", movie: [10751], tv: [10751, 10762], re: /\b(familiar(es)?|en familia)\b/ },
  fantasy: { label: "fantasía", movie: [14], tv: [10765], re: /\b(fantasia|fantasticas?|fantasticos?|magia|magos?|dragones|brujas?|elfos)\b/ },
  history: { label: "historia", movie: [36], tv: [10768], re: /\b(historicas?|historicos?|de epoca|epoca medieval|medievales?|antigua roma|imperio romano)\b/ },
  horror: { label: "terror", movie: [27], tv: [], tvKeywords: [315058], re: /\b(terror|miedo|sustos?|asustar(me)?|horror|slasher|gore|zombis?|zombies?|fantasmas?|posesiones?|exorcismos?|de miedo|que de miedo|pasar miedo)\b/ },
  music: { label: "música", movie: [10402], tv: [], re: /\b(musicales?|musica|conciertos?)\b/ },
  mystery: { label: "misterio", movie: [9648], tv: [9648], re: /\b(misterios?|intrigas?|enigmas?|detectives?|whodunit|quien es el asesino)\b/ },
  romance: { label: "romance", movie: [10749], tv: [], tvKeywords: [9840], re: /\b(romances?|romanticas?|romanticos?|amor|amorosa|enamorad[oa]s?|enamorarse|historia de amor|comedia romantica|san valentin)\b/ },
  scifi: { label: "ciencia ficción", movie: [878], tv: [10765], re: /\b(ciencia ficcion|sci ?fi|scifi|futuristas?|espacio|espaciales?|aliens?|extraterrestres?|robots?|inteligencia artificial|viajes? en el tiempo|distopias?|distopicas?|ciberpunk|cyberpunk)\b/ },
  thriller: { label: "suspense", movie: [53], tv: [80, 9648], re: /\b(thrillers?|suspense|suspenses|tension|tensas?|tensos?|psicologicas?|psicologicos?)\b/ },
  war: { label: "bélica", movie: [10752], tv: [10768], re: /\b(belicas?|belicos?|guerras?|soldados|segunda guerra mundial|primera guerra mundial|vietnam)\b/ },
  western: { label: "western", movie: [37], tv: [37], re: /\b(westerns?|vaqueros|del oeste|pistoleros)\b/ },
  reality: { label: "reality", movie: [], tv: [10764], re: /\b(realitys?|reality shows?|concursos?)\b/ },
};

// Expresiones de ÁNIMO: no exigen un género, lo favorecen (puntuación y, si no
// hay géneros explícitos, la búsqueda de TMDb). `avoid`: géneros que
// desentonan con ese ánimo (se penalizan, no se excluyen).
export const MOODS = {
  // Animación sola no es «ligero» (mucho anime es de acción o drama): manda
  // la comedia o lo familiar, y se aparta lo tenso.
  lighthearted: { label: "algo ligero", genres: ["comedy", "family"], avoid: ["horror", "war", "crime", "thriller", "action"], re: /\b(ligeras?|ligeros?|desconectar|relajarme|relajante|buen rollo|feel ?good|alegres?|optimistas?|sin complicaciones|para no pensar|entretenida sin mas|reconfortante|bonita)\b/ },
  laugh: { label: "para reír", genres: ["comedy"], avoid: ["horror", "war"], re: /\b(para reir|reirme|echarme unas risas|me haga reir|partirme|carcajadas?)\b/ },
  cry: { label: "para emocionarse", genres: ["drama", "romance"], avoid: [], re: /\b(llorar|lagrimas|lagrimon|emocionante|emotivas?|emotivos?|conmovedoras?|conmovedores?|que me toque|tocar la fibra|me emocione)\b/ },
  thrill: { label: "con tensión", genres: ["thriller", "action", "crime"], avoid: [], re: /\b(intensas?|intensos?|adrenalina|trepidantes?|frenetica|no pueda parar|enganchar(me)?|enganchante|me tenga en vilo|al borde del asiento)\b/ },
  mindBending: { label: "para pensar", genres: ["mystery", "scifi", "thriller"], avoid: [], re: /\b(me haga pensar|para pensar|complejas?|complejos?|giros?|me vuele la cabeza|volarme la cabeza|rompecabezas|mindfuck|retorcidas?|inteligentes?|filosoficas?)\b/ },
  scary: { label: "que dé miedo", genres: ["horror", "thriller"], avoid: ["comedy", "family"], re: /\b(pasar miedo|que de miedo|que me asuste|no pueda dormir|aterradoras?|escalofriantes?|espeluznantes?)\b/ },
  date: { label: "para ver en pareja", genres: ["romance", "comedy"], avoid: ["horror"], re: /\b(en pareja|con mi (?:novia|novio|pareja|mujer|marido|chica|chico)|cita|plan romantico)\b/ },
  kids: { label: "para ver con niños", genres: ["family", "animation"], avoid: ["horror", "war", "crime", "thriller"], re: /\b(con (?:mis |los )?(?:hijos|ninos|crios|peques|sobrinos)|para (?:los )?(?:ninos|crios|peques|chavales)|infantil(es)?|toda la familia)\b/ },
};

// Palabras clave de TMDb que se piden cuando aparecen (se combinan con los
// géneros; solo reducen la búsqueda, no la sustituyen).
export const KEYWORDS = {
  trueStory: { id: 9672, label: "basada en hechos reales", re: /\b(hechos reales|historia real|basad[ao]s? en (?:una )?(?:historia|hechos) real(es)?|true story|real como la vida)\b/ },
  heist: { id: 10051, label: "de atracos", re: /\b(atracos?|golpes? perfectos?|heist)\b/ },
  timeTravel: { id: 4379, label: "viajes en el tiempo", re: /\b(viajes? en el tiempo|viajar en el tiempo|bucles? temporal(es)?)\b/ },
  zombie: { id: 12377, label: "zombis", re: /\b(zombis?|zombies?)\b/ },
  christmas: { id: 207317, label: "navideña", re: /\b(navidad|navidenas?|navidenos?|navidades)\b/ },
  superhero: { id: 9715, label: "superhéroes", re: /\b(superheroes?|superheroinas?|marvel|dc comics)\b/ },
  comingOfAge: { id: 10683, label: "de crecer", re: /\b(coming of age|adolescentes?|instituto|de crecer|madurar)\b/ },
  dystopia: { id: 4565, label: "distopía", re: /\b(distopias?|distopicas?|distopicos?|postapocalipticas?|postapocalipticos?|apocalipsis)\b/ },
  miniseries: { id: 11162, label: "miniserie", re: /\b(miniseries?|serie corta de una temporada|de una sola temporada|una sola temporada)\b/ },
};

// ---------------------------------------------------------------------------
// Plataformas (España, ids de TMDb). `ids`: todas las variantes de la misma
// plataforma (con anuncios, canal de Amazon…).
export const PROVIDERS = [
  { key: "netflix", label: "Netflix", ids: [8, 1796], re: /\bnetflix\b/ },
  { key: "prime", label: "Prime Video", ids: [119, 2100], re: /\b(prime video|amazon prime|prime|amazon)\b/ },
  { key: "disney", label: "Disney+", ids: [337], re: /\bdisney ?\+?(?: plus)?\b/ },
  { key: "max", label: "HBO Max", ids: [1899, 1825], re: /\b(hbo max|hbo|max)\b/ },
  { key: "apple", label: "Apple TV", ids: [350, 2243], re: /\b(apple tv ?\+?|apple)\b/ },
  { key: "movistar", label: "Movistar Plus+", ids: [2241, 149], re: /\bmovistar\b/ },
  { key: "filmin", label: "Filmin", ids: [63, 64], re: /\bfilmin\b/ },
  { key: "skyshowtime", label: "SkyShowtime", ids: [1773], re: /\b(skyshowtime|sky showtime)\b/ },
  { key: "rakuten", label: "Rakuten TV", ids: [35], re: /\brakuten\b/ },
  { key: "atresplayer", label: "Atresplayer", ids: [62], re: /\b(atresplayer|atres player)\b/ },
  { key: "rtve", label: "RTVE Play", ids: [541], re: /\b(rtve|rtve play)\b/ },
  { key: "flixole", label: "FlixOlé", ids: [393, 684], re: /\bflixole\b/ },
  { key: "mubi", label: "MUBI", ids: [11, 201], re: /\bmubi\b/ },
  { key: "crunchyroll", label: "Crunchyroll", ids: [283, 1968], re: /\bcrunchyroll\b/ },
  { key: "pluto", label: "Pluto TV", ids: [300], re: /\bpluto(?: tv)?\b/ },
];

// ---------------------------------------------------------------------------
// País / idioma original

export const ORIGINS = [
  { label: "coreana", language: "ko", re: /\b(coreanas?|coreanos?|corea del sur|k ?dramas?|kdramas?)\b/ },
  { label: "japonesa", language: "ja", re: /\b(japonesas?|japoneses|japon|j ?dramas?)\b/ },
  { label: "española", language: "es", country: "ES", re: /\b(espanolas?|espanoles|de espana|cine patrio|hecha en espana)\b/ },
  { label: "mexicana", language: "es", country: "MX", re: /\b(mexicanas?|mexicanos?|de mexico)\b/ },
  { label: "argentina", language: "es", country: "AR", re: /\b(argentinas?|argentinos?)\b/ },
  { label: "francesa", language: "fr", re: /\b(francesas?|franceses|de francia)\b/ },
  { label: "italiana", language: "it", re: /\b(italianas?|italianos?|de italia)\b/ },
  { label: "alemana", language: "de", re: /\b(alemanas?|alemanes|de alemania)\b/ },
  { label: "británica", language: "en", country: "GB", re: /\b(britanicas?|britanicos?|inglesas?|ingleses|de reino unido)\b/ },
  { label: "turca", language: "tr", re: /\b(turcas?|turcos?|de turquia)\b/ },
  { label: "india", language: "hi", re: /\b(bollywood|hindi)\b/ },
  { label: "nórdica", language: "sv|da|no|fi|is", re: /\b(nordicas?|nordicos?|escandinavas?|escandinavos?|suecas?|suecos?|danesas?|daneses|noruegas?|noruegos?)\b/ },
];

// ---------------------------------------------------------------------------
// Números escritos en palabras (duración y nota).

const WORD_NUMBERS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (s in WORD_NUMBERS) return WORD_NUMBERS[s];
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Minutos a partir de «90 minutos», «hora y media», «dos horas», «1h30».
function durationToMinutes(qty, unit, extra) {
  const n = toNumber(qty);
  if (n == null) return null;
  if (/^h/.test(unit)) {
    let minutes = n * 60;
    if (extra && /media/.test(extra)) minutes += 30;
    const extraMinutes = extra && extra.match(/(\d+)/);
    if (extraMinutes) minutes += Number(extraMinutes[1]);
    return minutes;
  }
  return n;
}

const NUM = "(\\d+(?:[.,]\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";
const UNIT = "(horas?|h|minutos?|mins?)";
const EXTRA = "((?:\\s*y\\s*media)|(?:\\s*y\\s*\\d+(?:\\s*min(?:utos)?)?)|(?:\\d+))?";

function parseRuntime(text) {
  const result = { min: null, max: null, labels: [] };

  // «hora y media» suelta.
  const halfHour = /\bhora y media\b/.test(text);

  const maxRe = new RegExp(`\\b(?:menos de|como mucho|maximo|max|que no pase de|que no dure mas de|de hasta|hasta|no mas de|por debajo de)\\s+${NUM}\\s*${UNIT}${EXTRA}`);
  const minRe = new RegExp(`\\b(?:mas de|minimo|al menos|por encima de|que dure mas de|superior a)\\s+${NUM}\\s*${UNIT}${EXTRA}`);
  const aroundRe = new RegExp(`\\b(?:de|unos|unas|sobre|alrededor de|que dure|dure)\\s+${NUM}\\s*${UNIT}${EXTRA}`);

  const maxM = text.match(maxRe);
  if (maxM) result.max = durationToMinutes(maxM[1], maxM[2], maxM[3]);
  const minM = text.match(minRe);
  if (minM) result.min = durationToMinutes(minM[1], minM[2], minM[3]);
  if (!maxM && !minM) {
    if (/\b(?:menos de|que no pase de|como mucho|hasta) (?:una )?hora y media\b/.test(text)) result.max = 90;
    else if (/\b(?:mas de) (?:una )?hora y media\b/.test(text)) result.min = 90;
    else {
      const aroundM = text.match(aroundRe);
      if (aroundM) {
        const minutes = durationToMinutes(aroundM[1], aroundM[2], aroundM[3]);
        if (minutes) {
          result.min = Math.max(1, minutes - 15);
          result.max = minutes + 15;
        }
      } else if (halfHour) {
        result.min = 75;
        result.max = 105;
      }
    }
  }

  // Cualitativo (solo si no hubo número).
  const isShortEpisodes = /\b(capitulos?|episodios?) (?:muy )?(cortos?|breves?|de media hora|de 20|de 30)\b/.test(text);
  const isLongEpisodes = /\b(capitulos?|episodios?) largos?\b/.test(text);
  let episodes = null;
  if (isShortEpisodes) episodes = { min: null, max: /de 20/.test(text) ? 25 : 35 };
  if (isLongEpisodes) episodes = { min: 45, max: null };

  if (result.min == null && result.max == null && !episodes) {
    if (/\b(cortas?|cortos?|cortita|cortito|breves?|poco tiempo|rapidita|que no dure mucho|que no sea muy larga|para un rato|de una sentada corta)\b/.test(text)) {
      result.max = 100;
      result.short = true;
    } else if (/\b(largas?|largos?|de mas de dos horas|epica larga|tres horas|larguisima)\b/.test(text)) {
      result.min = 140;
      result.long = true;
    }
  }

  return { ...result, episodes };
}

// ---------------------------------------------------------------------------
// Nota mínima.

function parseRating(text) {
  // Numérica: «más de 7», «nota de 8», «al menos un 7,5», «por encima de 6.5»,
  // «con un 8 en imdb», «7+».
  const numeric =
    text.match(/\b(?:mas de|minimo|al menos|por encima de|superior a|desde|con mas de)\s+(?:un\s+|una nota de\s+)?(\d(?:[.,]\d)?)\b(?!\s*(?:horas?|h\b|minutos?|mins?))/) ||
    text.match(/\bnota (?:de |minima de |mayor de |superior a )?(\d(?:[.,]\d)?)\b/) ||
    text.match(/\bcon (?:un|una) (\d(?:[.,]\d)?)\b(?!\s*(?:horas?|h\b|minutos?|mins?))/) ||
    text.match(/\b(\d(?:[.,]\d)?) ?\+(?!\w)/) ||
    text.match(/\b(\d(?:[.,]\d)?) (?:o mas|para arriba|en imdb|en tmdb|de nota|sobre 10)\b/);
  if (numeric) {
    const value = toNumber(numeric[1]);
    if (value != null && value > 0 && value <= 10) return { min: value, label: `nota de ${String(value).replace(".", ",")} o más` };
  }
  if (/\b(obras? maestras?|imprescindibles?|de las mejores|lo mejor de lo mejor|joyas?|10 de 10|top de todos los tiempos|cine de culto)\b/.test(text)) {
    return { min: 7.8, minVotes: 800, label: "de las mejor valoradas" };
  }
  if (/\b(buena nota|buenas notas|bien valoradas?|bien valorados?|aclamadas?|aclamados?|nota alta|notaza|muy buenas?|de calidad|con buenas criticas|buenas criticas|premiadas?|premiados?|que valga la pena|que merezca la pena)\b/.test(text)) {
    return { min: 7, label: "bien valoradas" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Época.

function parseYears(text, now) {
  const currentYear = now.getFullYear();
  const isoDay = (date) => date.toISOString().slice(0, 10);

  // Años explícitos: «de 1996», «del 2019», «entre 2010 y 2015», «2015-2020».
  const range = text.match(/\b(?:entre|de|del)\s+(?:el\s+)?(19\d{2}|20\d{2})\s+(?:y|a|al|hasta)\s+(?:el\s+)?(19\d{2}|20\d{2})\b/) ||
    text.match(/\b(19\d{2}|20\d{2})\s*-\s*(19\d{2}|20\d{2})\b/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { from: `${Math.min(a, b)}-01-01`, to: `${Math.max(a, b)}-12-31`, label: `de ${Math.min(a, b)} a ${Math.max(a, b)}` };
  }
  const after = text.match(/\b(?:despues de|a partir de|desde|posterior(?:es)? a)\s+(?:el\s+)?(19\d{2}|20\d{2})\b/);
  if (after) return { from: `${after[1]}-01-01`, to: null, label: `desde ${after[1]}` };
  const before = text.match(/\b(?:antes de|anterior(?:es)? a)\s+(?:el\s+)?(19\d{2}|20\d{2})\b/);
  if (before) return { from: null, to: `${Number(before[1]) - 1}-12-31`, label: `anterior a ${before[1]}` };
  const year = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (year && Number(year[1]) <= currentYear + 2) {
    return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31`, label: `de ${year[1]}` };
  }

  // Décadas: «años 90», «de los 80», «los 2000», «noventera». NO «de 90
  // minutos»: la década exige «años»/«los» o el sufijo «s».
  // Décadas: «años 90», «de los 80», «los 2000». NO «de 90 minutos» ni «los
  // 10 mejores»: con dos cifras solo cuentan 30-90, y la década exige «años»
  // o «los» delante (o el sufijo «s»: «90s»).
  const decade =
    text.match(/\b(?:anos|ano|los|decada de los|decada de)\s+((?:19|20)[0-9]0|[3-9]0)s?\b(?!\s*(?:minutos?|mins?|horas?|mejores|primer|primeras?|primeros?|titulos?|pelis?|peliculas?|series?))/) ||
    text.match(/\b([3-9]0)s\b/);
  if (decade) {
    const raw = decade[1];
    const startYear = raw.length === 4 ? Number(raw) : 1900 + Number(raw);
    return { from: `${startYear}-01-01`, to: `${startYear + 9}-12-31`, label: `de los ${startYear >= 2000 ? startYear : String(startYear).slice(2)}` };
  }
  const namedDecades = [
    [/\b(sesenta|sesenteras?)\b/, 1960],
    [/\b(setenta|setenteras?)\b/, 1970],
    [/\b(ochenta|ochenteras?|ochenteros?)\b/, 1980],
    [/\b(noventa|noventeras?|noventeros?)\b/, 1990],
    [/\bdos mil\b/, 2000],
  ];
  for (const [re, startYear] of namedDecades) {
    if (re.test(text)) return { from: `${startYear}-01-01`, to: `${startYear + 9}-12-31`, label: `de los ${String(startYear).slice(2)}` };
  }

  if (/\b(de este ano|de este mismo ano|este ano)\b/.test(text)) {
    return { from: `${currentYear}-01-01`, to: null, label: `de ${currentYear}`, recent: true };
  }
  if (/\b(del ano pasado|el ano pasado)\b/.test(text)) {
    return { from: `${currentYear - 1}-01-01`, to: `${currentYear - 1}-12-31`, label: `de ${currentYear - 1}` };
  }
  if (/\b(estrenos?|recien estrenadas?|recien estrenados?|novedad(es)?|lo ultimo|ultimas? (?:pelis?|peliculas?|series?|estrenos?)|(?:pelis?|peliculas?|series?|estrenos?) nuev[ao]s|nuev[ao]s (?:pelis?|peliculas?|series?|estrenos?)|recientes?|actuales?|de ahora|que acaben? de salir|acaba de salir)\b/.test(text)) {
    const from = new Date(now.getTime() - 365 * 86400000);
    return { from: isoDay(from), to: null, label: "recientes", recent: true };
  }
  if (/\b(modernas?|modernos?|de los ultimos anos|de hace poco)\b/.test(text)) {
    return { from: `${currentYear - 6}-01-01`, to: null, label: "de los últimos años" };
  }
  if (/\b(clasicos?|clasicas?|antiguas?|antiguos?|de toda la vida|de siempre|en blanco y negro|viejas?)\b/.test(text)) {
    return { from: null, to: "1995-12-31", label: "clásicas", classic: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// «Parecida a X».

function parseSimilar(original, text) {
  if (/\b(?:parecid[oa]s? a|como|del estilo de|segun|en la linea de) mis (?:favorit[oa]s|gustos)\b|\bsegun (?:lo que he visto|mis gustos)\b|\bbasad[oa] en mis gustos\b/.test(text)) {
    return { favorites: true, title: null };
  }
  const src = String(original || "");
  // Mismo largo que `src` (solo quita tildes, no colapsa espacios): así un
  // índice encontrado aquí sirve para recortar el título del original, con
  // sus mayúsculas.
  const loose = src.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const quoted = src.match(/[«"“]([^«»"“”]{2,60})[»"”]/);
  if (quoted) return { favorites: false, title: quoted[1].trim() };
  const cue = /\b(parecid[oa]s? a|similar(?:es)? a|del (?:mismo )?estilo de|al estilo de|en la linea de|si me gusto|me gusto|me encanto|me flipo|como|tipo|rollo)\s+/g;
  const stop = /[,.;!?¿¡]|\s+(?:pero|y que|que|aunque|con|sin|para)\s|\s+en\s+(?:netflix|prime|amazon|hbo|max|disney|movistar|filmin|apple|skyshowtime|rakuten|cines?)\b/i;
  let m;
  while ((m = cue.exec(loose))) {
    const tail = src.slice(m.index + m[0].length);
    const end = tail.search(stop);
    let title = (end >= 0 ? tail.slice(0, end) : tail).trim().slice(0, 60);
    title = title.replace(/^(?:la serie|la peli(?:cula)?|la saga(?: de)?)\s+/i, "").trim();
    if (title.length < 2) continue;
    // Con «como», «tipo» o «rollo» solo es un título si empieza en mayúscula
    // («algo como Dark»); «algo como para reír» no lo es.
    const loose3 = ["como", "tipo", "rollo"].includes(m[1]);
    if (loose3 && !/^[A-ZÁÉÍÓÚÑ0-9]/.test(title)) continue;
    if (!loose3 && /^(?:algo|lo|eso|esto|mis|tus|las de|los de)\b/i.test(title)) continue;
    return { favorites: false, title };
  }
  return null;
}

// ---------------------------------------------------------------------------

function parseMediaType(text) {
  const movie = /\b(peliculas?|pelis?|films?|largometrajes?|cine)\b/.test(text);
  const tv = /\b(series?|miniseries?|serie de tv|temporadas?|capitulos?|episodios?|docuseries?|k ?dramas?|sitcoms?)\b/.test(text);
  if (movie && tv) return null;
  if (movie) return "movie";
  if (tv) return "tv";
  return null;
}

function parseCount(text) {
  const m = text.match(/\b(?:dame|recomiendame|sugiereme|ponme|quiero|busca(?:me)?|dime)\s+(\d|un par de|un par|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho)\b/);
  if (!m) return null;
  if (/par/.test(m[1])) return 2;
  const n = toNumber(m[1]);
  return n && n >= 1 && n <= 8 ? n : null;
}

/**
 * Interpreta la petición del chat. Devuelve criterios listos para aplicar.
 *
 * - `genres` / `excludeGenres`: claves de GENRES (explícitas en el texto).
 * - `moods`: claves de MOODS (favorecen géneros, no los exigen).
 * - `runtime`: { min, max, episodes: {min,max} } en minutos.
 * - `rating`: { min, minVotes?, label }.
 * - `providers`: entradas de PROVIDERS; `inCinemas`: cartelera.
 * - `years`: { from, to, label, recent?, classic? } (fechas AAAA-MM-DD).
 * - `origin`: entrada de ORIGINS; `keywords`: claves de KEYWORDS.
 * - `similar`: { title } o { favorites: true }.
 * - `onlyWatchlist`, `rewatch`, `future`, `free`, `count`.
 */
export function parseWatchIntent(message, { now = new Date() } = {}) {
  const original = String(message || "");
  const text = normalizeText(original);

  const genres = new Set();
  const excludeGenres = new Set();
  for (const [key, def] of Object.entries(GENRES)) {
    for (const match of findMatches(text, def.re)) {
      if (isNegatedAt(text, match.index)) excludeGenres.add(key);
      else genres.add(key);
    }
  }

  const moods = new Set();
  for (const [key, def] of Object.entries(MOODS)) {
    for (const match of findMatches(text, def.re)) {
      if (!isNegatedAt(text, match.index)) moods.add(key);
    }
  }
  // «Sin que dé miedo» anula el ánimo de miedo.
  if (excludeGenres.has("horror")) moods.delete("scary");
  // Con niños: películas o series familiares o de animación (cualquiera de
  // las dos vale) y nada de terror.
  const implicitGenres = new Set();
  const implicitExclude = new Set();
  if (moods.has("kids")) {
    for (const g of ["family", "animation"]) {
      if (!genres.has(g)) implicitGenres.add(g);
      genres.add(g);
    }
    if (!excludeGenres.has("horror")) implicitExclude.add("horror");
    excludeGenres.add("horror");
  }
  for (const g of excludeGenres) genres.delete(g);

  const keywords = new Set();
  for (const [key, def] of Object.entries(KEYWORDS)) {
    for (const match of findMatches(text, def.re)) {
      if (!isNegatedAt(text, match.index)) keywords.add(key);
    }
  }
  // «zombis» ya es terror; «atracos» ya es crimen: la palabra clave afina.
  if (keywords.has("zombie")) genres.add("horror");

  const providers = PROVIDERS.filter((p) => {
    const matches = findMatches(text, p.re);
    return matches.some((m) => !isNegatedAt(text, m.index));
  });
  // «max» suelto es ambiguo («como máximo 90 minutos»): solo cuenta con
  // «en max», «de max» o «hbo».
  const maxIndex = providers.findIndex((p) => p.key === "max");
  if (maxIndex >= 0 && !/\b(hbo|en max|de max|la max|plataforma max)\b/.test(text)) providers.splice(maxIndex, 1);
  const primeIndex = providers.findIndex((p) => p.key === "prime");
  if (primeIndex >= 0 && !/\b(prime video|amazon prime|en prime|de prime|amazon)\b/.test(text)) providers.splice(primeIndex, 1);
  const appleIndex = providers.findIndex((p) => p.key === "apple");
  if (appleIndex >= 0 && !/\bapple tv\b|\ben apple\b/.test(text)) providers.splice(appleIndex, 1);

  const inCinemas = /\b(en (?:el )?cines?|en salas?|en la cartelera|cartelera|ir al cine|vamos al cine|ver en el cine|estan en cines|esta en cines)\b/.test(text);

  let mediaType = parseMediaType(text);
  if (inCinemas) mediaType = "movie";
  if (keywords.has("miniseries")) mediaType = "tv";
  if (moods.has("kids")) {
    // Nada: vale tanto película como serie.
  }

  const runtime = parseRuntime(text);
  // «De menos de 90 minutos», «de 2 horas» sin decir el tipo: es una
  // película (en series se habla de capítulos o episodios).
  if (!mediaType && !runtime.episodes && !runtime.short && !runtime.long && (runtime.min != null || runtime.max != null)) {
    mediaType = "movie";
  }
  const rating = parseRating(text);
  const years = parseYears(text, now);
  const originEntry = ORIGINS.find((o) => findMatches(text, o.re).some((m) => !isNegatedAt(text, m.index))) || null;
  // «anime» = animación japonesa.
  const origin = originEntry || (/\banime\b/.test(text) ? ORIGINS.find((o) => o.language === "ja") : null);
  const similar = parseSimilar(original, text);

  const onlyWatchlist = /\b(de mis pendientes|de mi lista|de mi watchlist|que tengo pendientes?|que tenga pendientes?|de lo que tengo pendiente|de las que tengo guardadas|de los que tengo guardados|de mi lista de pendientes|entre mis pendientes|en mis pendientes|de pendientes)\b/.test(text);
  const rewatch = /\b(rever|revisionar|volver a ver|rewatch|repetir|otra vez|ya vist[ao]s?|que ya haya visto)\b/.test(text);
  const future = /\b(proxim[oa]s? estrenos?|que vayan a salir|que salgan pronto|futur[oa]s?|cuando salga|mas esperad[oa]s?|esperad[oa]s?|por estrenar)\b/.test(text);
  const free = /\b(gratis|gratuitas?|gratuitos?|sin pagar|sin suscripcion)\b/.test(text);
  const count = parseCount(text);

  const intent = {
    text,
    mediaType,
    genres: [...genres],
    excludeGenres: [...excludeGenres],
    // Añadidos por un ánimo («con niños»): no se nombran en la respuesta.
    implicitGenres: [...implicitGenres],
    implicitExclude: [...implicitExclude],
    moods: [...moods],
    keywords: [...keywords],
    runtime,
    rating,
    providers,
    inCinemas,
    years,
    origin,
    similar,
    onlyWatchlist,
    rewatch,
    future,
    free,
    count,
  };
  intent.hasConstraints = hasHardConstraints(intent);
  intent.hasIntent = intent.hasConstraints || intent.moods.length > 0 || !!intent.similar;
  return intent;
}

// Criterios que FILTRAN (no solo ordenan).
export function hasHardConstraints(intent) {
  return !!(
    intent.mediaType ||
    intent.genres.length ||
    intent.excludeGenres.length ||
    intent.keywords.length ||
    intent.runtime?.min != null ||
    intent.runtime?.max != null ||
    intent.runtime?.episodes ||
    intent.rating ||
    intent.providers.length ||
    intent.inCinemas ||
    intent.years ||
    intent.origin ||
    intent.onlyWatchlist ||
    intent.free
  );
}

// Géneros de TMDb de una lista de claves para un tipo.
export function genreIdsFor(keys, mediaType) {
  const ids = new Set();
  for (const key of keys || []) {
    for (const id of GENRES[key]?.[mediaType] || []) ids.add(id);
  }
  return [...ids];
}

export function tvKeywordIdsFor(keys) {
  const ids = new Set();
  for (const key of keys || []) {
    for (const id of GENRES[key]?.tvKeywords || []) ids.add(id);
  }
  return [...ids];
}

export function moodGenreKeys(intent) {
  const keys = new Set();
  for (const mood of intent.moods || []) {
    for (const g of MOODS[mood]?.genres || []) {
      if (!intent.excludeGenres.includes(g)) keys.add(g);
    }
  }
  return [...keys];
}

export function moodAvoidKeys(intent) {
  const keys = new Set();
  for (const mood of intent.moods || []) {
    for (const g of MOODS[mood]?.avoid || []) {
      if (!intent.genres.includes(g)) keys.add(g);
    }
  }
  return [...keys];
}

function joinList(items, conjunction = "y") {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} ${conjunction} ${list.at(-1)}`;
}

/** Frase con los criterios aplicados, para la respuesta del asistente. */
export function describeIntent(intent) {
  const parts = [];
  const implicit = new Set(intent.implicitGenres || []);
  const named = intent.genres.filter((g) => !implicit.has(g));
  const onlyDocs = named.length === 1 && named[0] === "documentary";
  let what = intent.mediaType === "movie" ? "películas" : intent.mediaType === "tv" ? "series" : "títulos";
  if (intent.keywords.includes("miniseries")) what = "miniseries";
  if (onlyDocs) what = intent.mediaType === "tv" ? "series documentales" : "documentales";
  const genreLabels = onlyDocs ? [] : named.map((g) => GENRES[g].label);
  parts.push(genreLabels.length ? `${what} de ${joinList(genreLabels)}` : what);
  if (intent.origin) parts.push(intent.origin.label === "india" ? "de Bollywood" : `de producción ${intent.origin.label}`);
  for (const k of intent.keywords) if (k !== "miniseries") parts.push(KEYWORDS[k].label);
  if (intent.moods.length) parts.push(joinList(intent.moods.map((m) => MOODS[m].label)));
  const implicitExclude = new Set(intent.implicitExclude || []);
  const excluded = intent.excludeGenres.filter((g) => !implicitExclude.has(g));
  if (excluded.length) parts.push(`sin ${joinList(excluded.map((g) => GENRES[g].label), "ni")}`);
  const rt = intent.runtime || {};
  if (rt.episodes?.max) parts.push(`con episodios de hasta ${rt.episodes.max} min`);
  else if (rt.episodes?.min) parts.push(`con episodios de ${rt.episodes.min} min o más`);
  // «corto»/«largo» sin número ni tipo: vale para películas y series.
  if (rt.short && !intent.mediaType) parts.push("cortas");
  else if (rt.long && !intent.mediaType) parts.push("largas");
  else if (rt.min != null && rt.max != null) parts.push(`de ${rt.min} a ${rt.max} min`);
  else if (rt.max != null) parts.push(`de ${rt.max} min como mucho`);
  else if (rt.min != null) parts.push(`de más de ${rt.min} min`);
  if (intent.rating) parts.push(intent.rating.label);
  if (intent.years) parts.push(intent.years.label);
  if (intent.inCinemas) parts.push("en cartelera");
  if (intent.providers.length) parts.push(`en ${joinList(intent.providers.map((p) => p.label), "o")}`);
  if (intent.free) parts.push("gratis");
  if (intent.similar?.title) parts.push(`parecidas a «${intent.similar.title}»`);
  if (intent.similar?.favorites) parts.push("parecidas a tus favoritas");
  if (intent.onlyWatchlist) parts.push("de tus pendientes");
  return parts.filter(Boolean).join(", ");
}
