// playbackSignals.test.mjs — El endpoint de sincronización, con señales reales.
//
// Toma las señales que producen la extensión y la app Android (las mismas que
// verifica netflix-extension/players.test.js) y las pasa por el endpoint REAL
// (/api/netflix/extension-sync) contra un TMDb simulado que se comporta como el
// de verdad: su búsqueda libre devuelve SIEMPRE algo, aunque la consulta no tenga
// nada que ver. Ahí es donde se colaban los títulos equivocados.
//
// Se comprueba qué acaba guardándose: película o serie, qué id de TMDb, y qué
// temporada y episodio.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as resolver from "./streamingResolve.js";
import * as resolve from "./resolve.js";
import * as variants from "./queryVariants.js";
import * as cache from "./requestCache.js";
import * as fingerprint from "./detectionFingerprint.js";
import * as contentIdMatch from "./contentIdMatch.js";

const { normalizeText } = resolve;

// ── Catálogo simulado de TMDb ─────────────────────────────────────────────────
const SHOWS = [
  {
    id: 66732,
    name: "Stranger Things",
    popularity: 250,
    vote_count: 16000,
    seasons: [
      { season_number: 1, episode_count: 8 },
      { season_number: 2, episode_count: 9 },
      { season_number: 3, episode_count: 8 },
      { season_number: 4, episode_count: 9 },
    ],
    episodes: {
      1: [{ episode_number: 1, name: "Capítulo uno: La desaparición de Will Byers" }],
      4: [
        { episode_number: 4, name: "Capítulo cuatro: Querido Billy" },
        { episode_number: 5, name: "Capítulo cinco: La Nina" },
      ],
    },
  },
  {
    id: 76479,
    name: "The Boys",
    popularity: 180,
    vote_count: 9000,
    seasons: [
      { season_number: 1, episode_count: 8 },
      { season_number: 2, episode_count: 8 },
    ],
    episodes: { 2: [{ episode_number: 3, name: "El Chico Diabólico" }] },
  },
  {
    id: 94997,
    name: "La Casa del Dragón",
    popularity: 190,
    vote_count: 5000,
    seasons: [
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 8 },
    ],
    episodes: { 2: [{ episode_number: 1, name: "El príncipe rebelde" }] },
  },
  {
    id: 209867,
    name: "Frieren",
    popularity: 90,
    vote_count: 900,
    seasons: [{ season_number: 1, episode_count: 28 }],
    episodes: { 1: [{ episode_number: 12, name: "La promesa" }] },
  },
  {
    id: 1396,
    name: "Breaking Bad",
    popularity: 300,
    vote_count: 13000,
    seasons: [
      { season_number: 1, episode_count: 7 },
      { season_number: 2, episode_count: 13 },
      { season_number: 3, episode_count: 13 },
      { season_number: 4, episode_count: 13 },
      { season_number: 5, episode_count: 16 },
    ],
    episodes: {
      3: [{ episode_number: 7, name: "One Minute" }],
      5: [{ episode_number: 14, name: "Ozymandias" }],
    },
  },
  // Anime con la numeración partida en Netflix: su «Temporada 4 Parte 2» es la
  // temporada 6 y numera los episodios de forma absoluta (76, 77…). Temporadas
  // reales de TMDb; el S4E23 se llama distinto que en Netflix («Crepúsculo»).
  {
    id: 1429,
    name: "Ataque a los Titanes",
    popularity: 250,
    vote_count: 7000,
    seasons: [
      { season_number: 1, episode_count: 25 },
      { season_number: 2, episode_count: 12 },
      { season_number: 3, episode_count: 22 },
      { season_number: 4, episode_count: 28 },
    ],
    episodes: {
      4: [
        { episode_number: 17, name: "Juicio" },
        { episode_number: 23, name: "Atardecer" },
      ],
    },
  },
  // Anime que TMDb junta en UNA temporada y Netflix parte en dos: su T2:E32 es el
  // S1E32 de TMDb.
  {
    id: 95479,
    name: "Jujutsu Kaisen",
    popularity: 260,
    vote_count: 3500,
    seasons: [{ season_number: 1, episode_count: 59 }],
    episodes: { 1: [{ episode_number: 32, name: "El incidente de Shibuya" }] },
  },
  // Netflix cuenta especiales que TMDb no tiene: su episodio 93 es el T5·E1.
  {
    id: 65930,
    name: "My Hero Academia",
    popularity: 240,
    vote_count: 5000,
    seasons: [
      { season_number: 1, episode_count: 13 },
      { season_number: 2, episode_count: 25 },
      { season_number: 3, episode_count: 25 },
      { season_number: 4, episode_count: 25 },
      { season_number: 5, episode_count: 25 },
    ],
    episodes: {
      5: [
        { episode_number: 1, name: "¡Todos a la acción! Clase 1-A" },
        { episode_number: 5, name: "Operación improvisación con nuevas técnicas" },
      ],
    },
  },
  // TMDb la tiene en 6 temporadas y Netflix en 2: el T2:E1 de Netflix es el S5E1.
  {
    id: 61709,
    name: "Dragon Ball Z Kai",
    popularity: 120,
    vote_count: 900,
    seasons: [26, 26, 25, 20, 35, 26].map((episode_count, i) => ({ season_number: i + 1, episode_count })),
    episodes: {
      5: [
        { episode_number: 1, name: "¡Han transcurrido siete años! El primer día de Gohan en la escuela secundaria" },
        { episode_number: 5, name: "¡Volvamos al mundo de los vivos! Goku participará en el Torneo de Artes Marciales" },
      ],
    },
  },
  // Serie REAL cuyo nombre aparece DENTRO del nombre de un episodio de otra
  // serie ("Capítulo cinco: La Nina"). Es el caso que registraba títulos sin
  // ninguna relación cuando el reproductor no decía de qué serie era el episodio.
  {
    id: 888,
    name: "La Niña",
    popularity: 12,
    vote_count: 200,
    seasons: [{ season_number: 1, episode_count: 80 }],
    episodes: { 1: [{ episode_number: 1, name: "Reclutada" }] },
  },
  // Serie que se llama igual que una película del catálogo: comprueba que una
  // duración de largometraje no se registre como serie solo porque el nombre de
  // la serie coincida exacto y el de la película lleve un subtítulo.
  {
    id: 777,
    name: "John Wick",
    popularity: 10,
    vote_count: 150,
    seasons: [{ season_number: 1, episode_count: 6 }],
    episodes: { 1: [{ episode_number: 1, name: "El continental" }] },
  },
  // Serie SEÑUELO con episodios de nombre repetido en dos temporadas: sirve para
  // comprobar que ante la ambigüedad no se fija una temporada al azar.
  {
    id: 555,
    name: "Serie Ambigua",
    popularity: 20,
    vote_count: 300,
    seasons: [
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 10 },
    ],
    episodes: {
      1: [{ episode_number: 3, name: "El regreso a casa" }],
      2: [{ episode_number: 3, name: "El regreso a casa" }],
    },
  },
];

const MOVIES = [
  { id: 324552, title: "John Wick: Capítulo 2", original_title: "John Wick: Chapter 2", popularity: 120, vote_count: 7000 },
  { id: 245891, title: "John Wick (Otro día para matar)", original_title: "John Wick", popularity: 140, vote_count: 18000 },
  { id: 398978, title: "El Irlandés", original_title: "The Irishman", popularity: 60, vote_count: 5000 },
  { id: 693134, title: "Dune: Parte Dos", original_title: "Dune: Part Two", popularity: 300, vote_count: 8000 },
  { id: 264660, title: "El Aviador", original_title: "The Aviator", popularity: 40, vote_count: 3000 },
];

// TMDb, ante una consulta cualquiera, casi nunca devuelve vacío: ordena por
// relevancia y saca lo que puede. Este señuelo reproduce ese comportamiento —
// es el que acababa en el historial cuando bastaba "que algo resolviera".
const DECOY_TV = { id: 999001, name: "Un Programa Cualquiera", popularity: 4, vote_count: 60 };
const DECOY_MOVIE = { id: 999002, title: "Una Película Cualquiera", popularity: 4, vote_count: 60 };

function searchCatalog(query, mediaType) {
  const q = normalizeText(query);
  const pool = mediaType === "tv" ? SHOWS : MOVIES;
  const named = (item) =>
    normalizeText(mediaType === "tv" ? item.name : item.title);
  const original = (item) => normalizeText(item.original_title || item.original_name || "");
  const hits = pool.filter(
    (item) =>
      named(item) === q ||
      original(item) === q ||
      named(item).includes(q) ||
      (q.length >= 6 && q.includes(named(item))),
  );
  const exact = hits.filter((item) => named(item) === q || original(item) === q);
  const rest = hits.filter((item) => !exact.includes(item));
  // La búsqueda de TMDb no devuelve temporadas ni episodios: eso se pide aparte.
  const asSearchHit = (item) => {
    const hit = { ...item };
    delete hit.seasons;
    delete hit.episodes;
    return hit;
  };
  return [...exact, ...rest, mediaType === "tv" ? DECOY_TV : DECOY_MOVIE].map(asSearchHit);
}

function showById(id) {
  return SHOWS.find((s) => String(s.id) === String(id)) || null;
}

// ── Doble de fetch: TMDb directo + backend ────────────────────────────────────
// `detections`: backend de detecciones simulado. `rules` es lo que devuelve la
// consulta de reglas; sin él, ese backend no responde (como si estuviera caído).
function installFakeNetwork(sent, detections = null) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    const search = url.match(/\/3\/search\/(movie|tv)\?/);
    if (search) {
      const query = new URL(url).searchParams.get("query");
      return json({ results: searchCatalog(query, search[1]) });
    }
    const episode = url.match(/\/3\/tv\/(\d+)\/season\/(\d+)\/episode\/(\d+)\?/);
    if (episode) {
      const show = showById(episode[1]);
      const found = (show?.episodes?.[Number(episode[2])] || []).find(
        (e) => e.episode_number === Number(episode[3]),
      );
      return found ? json(found) : json({ status_code: 34 }, 404);
    }
    const season = url.match(/\/3\/tv\/(\d+)\/season\/(\d+)\?/);
    if (season) {
      const show = showById(season[1]);
      const list = show?.episodes?.[Number(season[2])] || [];
      return json({
        episodes: list.map((e) => ({ ...e, season_number: Number(season[2]) })),
      });
    }
    const detail = url.match(/\/3\/tv\/(\d+)\?/);
    if (detail) {
      const show = showById(detail[1]);
      return show ? json({ seasons: show.seasons }) : json({ status_code: 34 }, 404);
    }
    if (detections && url.includes("/v1/streaming/detections/lookup")) {
      detections.lookups.push(JSON.parse(init.body));
      return json(detections.rules || { decision: null, rejects: [] });
    }
    if (detections && url.endsWith("/v1/streaming/discards")) {
      detections.discarded.push(JSON.parse(init.body));
      return json({ discardId: "0c2f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f00" }, 201);
    }
    if (detections && url.endsWith("/v1/streaming/detections")) {
      detections.recorded.push(JSON.parse(init.body));
      return json({ detectionId: "9b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f99" }, 201);
    }
    if (url.includes("/v1/auth/netflix/progress")) {
      sent.push({ url, body: JSON.parse(init.body) });
      return json({ ok: true, completed: false });
    }
    if (url.includes("/v1/auth/netflix/sync")) {
      sent.push({ url, body: JSON.parse(init.body) });
      return json({ ok: true });
    }
    throw new Error(`fetch no simulado: ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

const source = await readFile(
  new URL("../../app/api/netflix/extension-sync/route.js", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
}).outputText;

function handler() {
  const deps = {
    "next/server": {
      NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
    },
    "@/lib/backend/server": {
      // El proxy del backend no está disponible: se cae a TMDb directo, que es el
      // camino real cuando el backend no responde.
      backendFetchJson: async () => ({ ok: false, status: 503, error: "down" }),
      getBackendBaseUrl: () => "http://backend.test",
      getCookieSecure: () => false,
      setBackendAuthCookies: () => {},
    },
    "@/lib/netflix/streamingResolve": resolver,
    "@/lib/netflix/resolve": resolve,
    "@/lib/netflix/queryVariants": variants,
    "@/lib/netflix/requestCache": cache,
    "@/lib/netflix/detectionFingerprint": fingerprint,
    "@/lib/netflix/contentIdMatch": contentIdMatch,
  };
  const cjs = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      assert.ok(deps[name], `dependencia sin simular: ${name}`);
      return deps[name];
    },
    cjs,
    cjs.exports,
  );
  return cjs.exports.POST;
}

const request = (payload, auth = "Bearer sync-token") => ({
  json: async () => payload,
  headers: new Headers({ authorization: auth }),
});

// Ejecuta el endpoint con TMDb simulado y devuelve {body, status, sent}.
async function sync(payload, detections = null) {
  process.env.TMDB_API_KEY = "test-key";
  const sent = [];
  const restore = installFakeNetwork(sent, detections);
  try {
    const result = await handler()(request({ resolveOnly: true, ...payload }));
    return { ...result, sent, detections };
  } finally {
    restore();
  }
}

const synced = (result) => result.body?.synced || {};

// ── Navegador ─────────────────────────────────────────────────────────────────
test("Netflix, episodio: serie, temporada y episodio correctos", async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    episodeName: "Capítulo cinco: La Nina",
    subTitle: "Capítulo cinco: La Nina",
    seasonEpisodeText: "T4:E5",
    season: 4,
    episode: 5,
    tabTitle: "Netflix",
    durationSec: 4200,
  });
  assert.deepEqual(
    { ...synced(result), title: undefined, posterPath: undefined, episodeName: undefined },
    {
      tmdbId: 66732,
      mediaType: "tv",
      season: 4,
      episode: 5,
      confidence: "high",
      title: undefined,
      posterPath: undefined,
      episodeName: undefined,
    },
  );
});

test("Netflix, episodio SIN temporada: se localiza por el nombre del episodio", async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "Breaking Bad",
    showName: "Breaking Bad",
    episodeName: "Ozymandias",
    subTitle: "Ozymandias",
    episode: 14,
    durationSec: 2880,
  });
  assert.equal(synced(result).tmdbId, 1396);
  assert.equal(synced(result).season, 5);
  assert.equal(synced(result).episode, 14);
});

test("Netflix, película: se guarda como película", async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "El Irlandés",
    movieTitle: "El Irlandés",
    tabTitle: "Ver El Irlandés | Netflix",
    durationSec: 12780,
  });
  assert.equal(synced(result).mediaType, "movie");
  assert.equal(synced(result).tmdbId, 398978);
  assert.equal(synced(result).season, null);
  assert.equal(synced(result).episode, null);
});

test('Película con "Capítulo N" en el nombre: ni serie ni la película equivocada', async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "John Wick: Capítulo 2",
    movieTitle: "John Wick: Capítulo 2",
    tabTitle: "John Wick: Capítulo 2 - Netflix",
    durationSec: 7500,
  });
  assert.equal(synced(result).mediaType, "movie");
  // 245891 es "John Wick" a secas: es lo que salía al recortar el título.
  assert.equal(synced(result).tmdbId, 324552);
  assert.equal(synced(result).episode, null);
});

test("Prime Video, episodio: la serie del reproductor, no el nombre del episodio", async () => {
  const result = await sync({
    platform: "primevideo",
    mainTitle: "The Boys",
    showName: "The Boys",
    episodeName: "El Chico Diabólico",
    subTitle: "El Chico Diabólico",
    seasonEpisodeText: "T2 E3 El Chico Diabólico",
    season: 2,
    episode: 3,
    tabTitle: "Prime Video: The Boys",
    durationSec: 3600,
  });
  assert.equal(synced(result).tmdbId, 76479);
  assert.equal(synced(result).season, 2);
  assert.equal(synced(result).episode, 3);
});

test("Max, episodio: temporada y episodio del subtítulo del reproductor", async () => {
  const result = await sync({
    platform: "max",
    mainTitle: "La Casa del Dragón",
    showName: "La Casa del Dragón",
    episodeName: "El príncipe rebelde",
    subTitle: "El príncipe rebelde",
    seasonEpisodeText: "Temporada 2, Episodio 1 El príncipe rebelde",
    season: 2,
    episode: 1,
    durationSec: 3900,
  });
  assert.equal(synced(result).tmdbId, 94997);
  assert.equal(synced(result).season, 2);
  assert.equal(synced(result).episode, 1);
});

test("Crunchyroll: serie de una sola temporada, episodio por número", async () => {
  const result = await sync({
    platform: "crunchyroll",
    mainTitle: "Frieren",
    showName: "Frieren",
    episodeName: "La promesa",
    subTitle: "La promesa",
    episode: 12,
    tabTitle: "Frieren - Ver en Crunchyroll en castellano",
    durationSec: 1440,
  });
  assert.equal(synced(result).tmdbId, 209867);
  assert.equal(synced(result).season, 1);
  assert.equal(synced(result).episode, 12);
});

test("Reproductor que solo muestra el número de episodio: se localiza la temporada", async () => {
  // Sin nombre de episodio y sin temporada. Solo una temporada de Breaking Bad
  // ("5", con 16) tiene suficientes episodios para un E15.
  const result = await sync({
    platform: "skyshowtime",
    mainTitle: "Breaking Bad",
    showName: "Breaking Bad",
    seasonEpisodeText: "E15",
    episode: 15,
    durationSec: 2820,
  });
  assert.equal(synced(result).tmdbId, 1396);
  assert.equal(synced(result).season, 5);
  assert.equal(synced(result).episode, 15);
});

test("Max, película larga: la duración no la convierte en serie", async () => {
  const result = await sync({
    platform: "max",
    mainTitle: "Dune: Parte Dos",
    movieTitle: "Dune: Parte Dos",
    tabTitle: "Dune: Parte Dos | Max",
    durationSec: 9960,
  });
  assert.equal(synced(result).mediaType, "movie");
  assert.equal(synced(result).tmdbId, 693134);
});

test("Película larga cuyo nombre coincide exacto con una serie: gana la película", async () => {
  // "John Wick" existe como serie en el catálogo simulado y la película lleva un
  // subtítulo entre paréntesis, así que no hay coincidencia exacta de película.
  const result = await sync({
    platform: "netflix",
    mainTitle: "John Wick",
    movieTitle: "John Wick",
    durationSec: 6060,
  });
  assert.equal(synced(result).mediaType, "movie");
  assert.equal(synced(result).tmdbId, 245891);
});

// ── Android ───────────────────────────────────────────────────────────────────
test("Android: el texto de la notificación no puede resolver un título aproximado", async () => {
  // La app no expone la serie; lo único que llega son textos de relleno. Antes
  // bastaba con que uno de ellos "resolviera algo" para guardarlo.
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Ver ahora",
    notifTitle: "Netflix",
    notifText: "Reproduciendo en el salón",
    notifSubText: "Perfil de Pablo",
    durationSec: 2700,
  });
  assert.equal(result.status, 404, JSON.stringify(result.body));
  assert.equal(result.sent.length, 0, "no debe registrarse nada");
});

test("Android: episodio sin serie conocida no se guarda como película", async () => {
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Un episodio con nombre propio",
    episodeName: "Un episodio con nombre propio",
    seasonEpisodeText: "T1:E4",
    season: 1,
    episode: 4,
    durationSec: 2700,
  });
  assert.notEqual(synced(result).mediaType, "movie");
  assert.equal(result.status, 404, JSON.stringify(result.body));
});

test("Android: la serie del título de la notificación sí resuelve el episodio", async () => {
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Capítulo cinco: La Nina",
    episodeName: "Capítulo cinco: La Nina",
    notifTitle: "Stranger Things",
    seasonEpisodeText: "T4:E5",
    season: 4,
    episode: 5,
    durationSec: 4200,
  });
  assert.equal(synced(result).tmdbId, 66732);
  assert.equal(synced(result).season, 4);
  assert.equal(synced(result).episode, 5);
});

test("Android: película con el título en la MediaSession", async () => {
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "El Aviador",
    movieTitle: "El Aviador",
    durationSec: 10380,
  });
  assert.equal(synced(result).mediaType, "movie");
  assert.equal(synced(result).tmdbId, 264660);
});

test("Episodio sin serie conocida: no se registra una serie que solo aparece en su nombre", async () => {
  // Lo que manda Netflix en Android: el nombre del EPISODIO y "T4:E5", nunca la
  // serie. Buscar ese texto en el catálogo de series encontraba "La Niña" dentro
  // de "Capítulo cinco: La Nina" y lo daba por bueno.
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Capítulo cinco: La Nina",
    movieTitle: "Capítulo cinco: La Nina",
    tabTitle: "Capítulo cinco: La Nina",
    seasonEpisodeText: "T4:E5 - Capítulo cinco: La Nina",
    season: 4,
    episode: 5,
    durationSec: 4200,
  });
  assert.notEqual(synced(result).tmdbId, 888, "no puede resolver a «La Niña»");
  assert.equal(result.status, 404, JSON.stringify(result.body));
  assert.equal(result.sent.length, 0);
});

test("Episodio de más de 70 minutos: la duración no lo convierte en película", async () => {
  // Stranger Things T4 tiene episodios de más de una hora. El desempate por
  // duración solo puede actuar cuando el número de episodio sale de un título,
  // nunca cuando hay un badge dedicado.
  const result = await sync({
    platform: "netflix",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    episodeName: "Capítulo cinco: La Nina",
    subTitle: "Capítulo cinco: La Nina",
    seasonEpisodeText: "T4:E5",
    season: 4,
    episode: 5,
    durationSec: 4800,
  });
  assert.equal(synced(result).mediaType, "tv");
  assert.equal(synced(result).tmdbId, 66732);
  assert.equal(synced(result).season, 4);
  assert.equal(synced(result).episode, 5);
});

// ── Casos límite ──────────────────────────────────────────────────────────────
test("Nombre de episodio repetido entre temporadas: no se fija una al azar", async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "Serie Ambigua",
    showName: "Serie Ambigua",
    episodeName: "El regreso a casa",
    subTitle: "El regreso a casa",
    durationSec: 2400,
  });
  assert.equal(synced(result).tmdbId, 555);
  assert.equal(synced(result).season, null, "sin certeza, nivel serie");
  assert.equal(synced(result).episode, null);
  assert.equal(synced(result).confidence, "low");
});

test("Solo el nombre de la plataforma: no se sincroniza nada", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "Netflix", tabTitle: "Netflix" });
  assert.equal(result.status, 422);
  assert.equal(result.sent.length, 0);
});

// ── Registro del progreso ─────────────────────────────────────────────────────
test("El progreso de un episodio llega al backend con su temporada y episodio", async () => {
  const result = await sync({
    resolveOnly: false,
    recordProgress: true,
    eventId: "1b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f70",
    observedAt: "2026-09-23T10:00:00.000Z",
    platform: "netflix",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    episodeName: "Capítulo cinco: La Nina",
    subTitle: "Capítulo cinco: La Nina",
    seasonEpisodeText: "T4:E5",
    season: 4,
    episode: 5,
    positionSec: 1800,
    durationSec: 4200,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.sent.length, 1);
  assert.match(result.sent[0].url, /\/v1\/auth\/netflix\/progress$/);
  assert.deepEqual(
    {
      tmdbId: result.sent[0].body.tmdbId,
      mediaType: result.sent[0].body.mediaType,
      season: result.sent[0].body.season,
      episode: result.sent[0].body.episode,
      positionSeconds: result.sent[0].body.positionSeconds,
      runtimeSeconds: result.sent[0].body.runtimeSeconds,
      eventId: result.sent[0].body.eventId,
      observedAt: result.sent[0].body.observedAt,
    },
    {
      tmdbId: 66732,
      mediaType: "tv",
      season: 4,
      episode: 5,
      positionSeconds: 1800,
      runtimeSeconds: 4200,
      eventId: "1b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f70",
      observedAt: "2026-09-23T10:00:00.000Z",
    },
  );
});

test("El progreso de una película llega sin temporada ni episodio", async () => {
  const result = await sync({
    resolveOnly: false,
    recordProgress: true,
    eventId: "2b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f71",
    observedAt: "2026-09-23T10:05:00.000Z",
    platform: "netflix",
    mainTitle: "John Wick: Capítulo 2",
    movieTitle: "John Wick: Capítulo 2",
    positionSec: 3600,
    durationSec: 7500,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.sent[0].body.tmdbId, 324552);
  assert.equal(result.sent[0].body.mediaType, "movie");
  assert.equal(result.sent[0].body.season, 0);
  assert.equal(result.sent[0].body.episode, 0);
});

// ── Aprendizaje de las correcciones ──────────────────────────────────────────
const learned = (rules = null) => ({ rules, lookups: [], recorded: [], discarded: [] });

test("Una regla del usuario resuelve el título sin buscar y conserva el episodio", async () => {
  const result = await sync({
    platform: "netflix",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    episodeName: "Capítulo cinco: La Nina",
    season: 4,
    episode: 5,
  }, learned({
    decision: { rule: "override", scope: "user", tmdbId: 1396, mediaType: "tv", title: "Breaking Bad", posterPath: "/bb.jpg" },
    rejects: [],
  }));
  assert.equal(synced(result).tmdbId, 1396);
  assert.equal(synced(result).season, 4);
  assert.equal(synced(result).episode, 5);
  assert.equal(synced(result).detectionId, "9b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f99");
  assert.equal(result.detections.lookups[0].fingerprint, "netflix|stranger things");
  assert.equal(result.detections.recorded[0].source, "user_rule");
});

test("Un texto marcado como «no es un título» no se resuelve", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "Top 10 en España", movieTitle: "Top 10 en España" },
    learned({ decision: { rule: "not_a_title", scope: "global" }, rejects: [] }));
  assert.equal(result.status, 422);
  assert.equal(result.body.reason, "not_a_title");
  assert.equal(result.detections.recorded.length, 0);
});

test("Un título vetado no vuelve a proponerse", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "John Wick", movieTitle: "John Wick", durationSec: 6000 },
    learned({ decision: null, rejects: [{ tmdbId: 245891, mediaType: "movie" }] }));
  assert.notEqual(synced(result).tmdbId, 245891);
});

test("La detección se registra con su tipo, su huella y la señal del reproductor", async () => {
  const result = await sync({
    platform: "netflix", mainTitle: "El Irlandés", movieTitle: "El Irlandés", detectionKind: "detail",
  }, learned());
  const recorded = result.detections.recorded[0];
  assert.equal(recorded.kind, "detail");
  assert.equal(recorded.fingerprint, "netflix|el irlandes");
  assert.equal(recorded.triggerText, "El Irlandés");
  assert.equal(recorded.tmdbId, 398978);
  assert.equal(recorded.signal.movieTitle, "El Irlandés");
});

test("Sin backend de detecciones se sincroniza igual que antes", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "El Irlandés", movieTitle: "El Irlandés" });
  assert.equal(synced(result).tmdbId, 398978);
  assert.equal("detectionId" in synced(result), false);
});

// ── Mapa de ids de contenido (ver contentIdMatch.js) ─────────────────────────

const knownId = (content, decision = null) => learned({ decision, rejects: [], content });

test("Un id de contenido ya conocido resuelve sin buscar, aunque el texto sea genérico", async () => {
  const result = await sync({
    platform: "netflix",
    contentId: "81234567",
    mainTitle: "Capítulo 3",
    episodeName: "Capítulo 3",
  }, knownId({ scope: "global", source: null, tmdbId: 66732, mediaType: "tv", season: 4, episode: 3, title: "Stranger Things" }));
  assert.equal(synced(result).tmdbId, 66732);
  assert.equal(synced(result).season, 4);
  assert.equal(synced(result).episode, 3);
  assert.equal(synced(result).confidence, "high");
  // Sin huella (el texto es genérico) la consulta va igual, solo con el id.
  assert.equal(result.detections.lookups[0].fingerprint, "");
  assert.equal(result.detections.lookups[0].contentId, "81234567");
  assert.equal(result.detections.recorded[0].source, "content_id");
  assert.equal(result.detections.recorded[0].contentId, "81234567");
});

test("Si el reproductor da otro episodio, el id conocido no se usa", async () => {
  const result = await sync({
    platform: "netflix",
    contentId: "81234567",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    season: 4,
    episode: 5,
  }, knownId({ scope: "user", source: "auto", tmdbId: 1396, mediaType: "tv", season: 1, episode: 1, title: "Breaking Bad" }));
  assert.equal(synced(result).tmdbId, 66732);
  assert.equal(synced(result).episode, 5);
  // La resolución nueva va con el id, para que el backend rehaga su fila.
  assert.equal(result.detections.recorded[0].source, "search");
  assert.equal(result.detections.recorded[0].contentId, "81234567");
});

test("La corrección del usuario para un id gana a «no es un título»", async () => {
  const result = await sync({ platform: "netflix", contentId: "70000001", mainTitle: "Top 10 en España", movieTitle: "Top 10 en España" },
    knownId(
      { scope: "user", source: "correction", tmdbId: 398978, mediaType: "movie", season: null, episode: null, title: "El Irlandés" },
      { rule: "not_a_title", scope: "global" },
    ));
  assert.equal(result.status, 200);
  assert.equal(synced(result).tmdbId, 398978);
});

test("Sin id de contenido ni huella no se consulta nada", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "Capítulo 3", episodeName: "Capítulo 3" }, learned());
  assert.equal(result.detections.lookups.length, 0);
});

// ── Observaciones descartadas (medición por plataforma) ──────────────────────

test("Un título que no se encuentra queda registrado como descartado, con su señal", async () => {
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Capítulo cinco: La Nina",
    movieTitle: "Capítulo cinco: La Nina",
    seasonEpisodeText: "T4:E5 - Capítulo cinco: La Nina",
    season: 4,
    episode: 5,
    durationSec: 4200,
  }, learned());
  assert.equal(result.status, 404);
  assert.equal(result.detections.recorded.length, 0);
  const [discard] = result.detections.discarded;
  assert.equal(discard.reason, "unresolved");
  assert.equal(discard.kind, "playback");
  assert.equal(discard.triggerText, "Capítulo cinco: La Nina");
  assert.equal(discard.signal.seasonEpisodeText, "T4:E5 - Capítulo cinco: La Nina");
});

test("Cada salida sin título lleva su motivo", async () => {
  const notATitle = await sync({ platform: "netflix", mainTitle: "Top 10 en España", movieTitle: "Top 10 en España" },
    learned({ decision: { rule: "not_a_title", scope: "global" }, rejects: [] }));
  assert.deepEqual(notATitle.detections.discarded.map((d) => d.reason), ["not_a_title"]);

  const platformOnly = await sync({ platform: "netflix", mainTitle: "Netflix", tabTitle: "Netflix", contentId: "8101" }, learned());
  assert.equal(platformOnly.status, 422);
  assert.deepEqual(platformOnly.detections.discarded.map((d) => [d.reason, d.kind, d.contentId]), [["empty_title", "detail", "8101"]]);

  const noTitle = await sync({ platform: "primevideo", subTitle: "T1 E3" }, learned());
  assert.equal(noTitle.status, 400);
  assert.deepEqual(noTitle.detections.discarded.map((d) => [d.platform, d.reason, d.triggerText]), [["primevideo", "empty_title", "T1 E3"]]);
});

test("Lo que se resuelve no se registra como descartado", async () => {
  const result = await sync({ platform: "netflix", mainTitle: "El Irlandés", movieTitle: "El Irlandés" }, learned());
  assert.equal(synced(result).tmdbId, 398978);
  assert.equal(result.detections.discarded.length, 0);
});

// ── Netflix desde sus metadatos (netflix-extension/netflix-source.js) ────────

test("Netflix con metadatos: serie y episodio en inglés, números exactos", async () => {
  const result = await sync({
    platform: "netflix",
    contentId: "81091417",
    mainTitle: "Stranger Things",
    showName: "Stranger Things",
    episodeName: "Chapter Five: The Nina Project",
    season: 4,
    episode: 5,
    seasonEpisodeText: "T4:E5",
    identitySource: "netflix_metadata",
    releaseYear: 2016,
    durationSec: 3100,
    positionSec: 600,
    detectionKind: "playback",
  }, learned());
  assert.deepEqual([synced(result).tmdbId, synced(result).season, synced(result).episode], [66732, 4, 5]);
  assert.equal(synced(result).confidence, "high");
  // Queda constancia de que la identidad salió de los metadatos.
  assert.equal(result.detections.recorded[0].signal.identitySource, "netflix_metadata");
  assert.equal(result.detections.recorded[0].signal.releaseYear, 2016);
});

test("Netflix con metadatos: una película por su título original", async () => {
  const result = await sync({
    platform: "netflix",
    contentId: "80175798",
    mainTitle: "The Irishman",
    movieTitle: "The Irishman",
    identitySource: "netflix_metadata",
    releaseYear: 2019,
    durationSec: 12600,
  }, learned());
  assert.equal(synced(result).tmdbId, 398978);
  assert.equal(synced(result).mediaType, "movie");
});

// ── Numeración de la plataforma frente a la de TMDb ──────────────────────────

// La señal tal cual la mandó la extensión 3.3 al reproducir el episodio 82 de
// «Ataque a los Titanes» en Netflix (se guardaba como T6:E82, que no existe).
const AOT_NETFLIX = {
  platform: "netflix",
  contentId: "81551284",
  mainTitle: "Ataque a los Titanes",
  showName: "Ataque a los Titanes",
  episodeName: "Crepúsculo",
  subTitle: "Crepúsculo",
  season: 6,
  episode: 82,
  seasonEpisodeText: "T6:E82",
  identitySource: "netflix_metadata",
  durationSec: 1442,
  positionSec: 90,
  detectionKind: "playback",
};

test("Netflix con episodios absolutos: el T6:E82 se guarda como el S4E23 de TMDb", async () => {
  const result = await sync(AOT_NETFLIX, learned());
  assert.deepEqual([synced(result).tmdbId, synced(result).season, synced(result).episode], [1429, 4, 23]);
  assert.equal(synced(result).confidence, "medium");
  assert.deepEqual([result.detections.recorded[0].season, result.detections.recorded[0].episode], [4, 23]);
});

test("Un id ya aprendido con la numeración de TMDb vale aunque Netflix numere distinto", async () => {
  const result = await sync(AOT_NETFLIX, learned({ decision: null, rejects: [],
    content: { scope: "user", source: "auto", tmdbId: 1429, mediaType: "tv", season: 4, episode: 23, title: "Ataque a los Titanes" } }));
  assert.deepEqual([synced(result).season, synced(result).episode, synced(result).confidence], [4, 23, "high"]);
  assert.equal(result.detections.recorded[0].source, "content_id");
});

test("Un id guardado con la numeración de Netflix se corrige igual al usarlo", async () => {
  const result = await sync(AOT_NETFLIX, learned({ decision: null, rejects: [],
    content: { scope: "user", source: "auto", tmdbId: 1429, mediaType: "tv", season: 6, episode: 82, title: "Ataque a los Titanes" } }));
  assert.deepEqual([synced(result).season, synced(result).episode], [4, 23]);
});

test("Un par inexistente sin número absoluto posible ni nombre conocido queda a nivel serie", async () => {
  const result = await sync({ ...AOT_NETFLIX, season: 6, episode: 7, seasonEpisodeText: "T6:E7", episodeName: "Nada parecido" }, learned());
  assert.equal(synced(result).tmdbId, 1429);
  assert.deepEqual([synced(result).season, synced(result).episode, synced(result).confidence], [null, null, "low"]);
});

const JJK_NETFLIX = {
  platform: "netflix",
  contentId: "81442271",
  mainTitle: "Jujutsu Kaisen",
  showName: "Jujutsu Kaisen",
  episodeName: "Otro nombre en Netflix",
  season: 2,
  episode: 32,
  seasonEpisodeText: "T2:E32",
  durationSec: 1440,
  positionSec: 90,
  detectionKind: "playback",
};

test("Serie de una sola temporada en TMDb: el T2:E32 de Netflix es el S1E32", async () => {
  // Con la posición que calcula la extensión 3.3, sin dudas.
  const withPosition = await sync({ ...JJK_NETFLIX, identitySource: "netflix_metadata", absoluteEpisode: 32 }, learned());
  assert.deepEqual([synced(withPosition).tmdbId, synced(withPosition).season, synced(withPosition).episode], [95479, 1, 32]);
  assert.equal(synced(withPosition).confidence, "medium");

  // Netflix empezando la segunda parte en 1 (T2:E8): la posición sigue siendo 32.
  const restarted = await sync({ ...JJK_NETFLIX, episode: 8, seasonEpisodeText: "T2:E8", identitySource: "netflix_metadata", absoluteEpisode: 32 }, learned());
  assert.deepEqual([synced(restarted).season, synced(restarted).episode], [1, 32]);

  // Cliente antiguo, sin posición: se supone absoluta, con confianza baja.
  const guessed = await sync(JJK_NETFLIX, learned());
  assert.deepEqual([synced(guessed).season, synced(guessed).episode, synced(guessed).confidence], [1, 32, "low"]);
});

test("Sin posición, el nombre del episodio manda sobre la suposición", async () => {
  const result = await sync({ ...JJK_NETFLIX, episode: 8, seasonEpisodeText: "T2:E8", episodeName: "El incidente de Shibuya" }, learned());
  assert.deepEqual([synced(result).season, synced(result).episode, synced(result).confidence], [1, 32, "medium"]);
});

const MHA_NETFLIX = {
  platform: "netflix",
  contentId: "81447461",
  mainTitle: "My Hero Academia",
  showName: "My Hero Academia",
  episodeName: "¡Todos a la acción! Clase 1-A",
  season: 5,
  episode: 93,
  seasonEpisodeText: "T5:E93",
  durationSec: 1380,
  positionSec: 90,
  detectionKind: "playback",
};

test("Netflix cuenta especiales de más: su T5·E93 es el T5·E1 de TMDb, no el T5·E5", async () => {
  // Extensión 3.3: posición dentro de la temporada.
  const withIndex = await sync({ ...MHA_NETFLIX, identitySource: "netflix_metadata", absoluteEpisode: 93, seasonEpisodeIndex: 1 }, learned());
  assert.deepEqual([synced(withIndex).season, synced(withIndex).episode, synced(withIndex).confidence], [5, 1, "medium"]);

  // Sin posición, el nombre del episodio lo encuentra.
  const byName = await sync(MHA_NETFLIX, learned());
  assert.deepEqual([synced(byName).season, synced(byName).episode], [5, 1]);

  // Sin posición ni nombre que case: el reparto, con confianza baja.
  const guessed = await sync({ ...MHA_NETFLIX, episodeName: "Otro nombre" }, learned());
  assert.deepEqual([synced(guessed).season, synced(guessed).episode, synced(guessed).confidence], [5, 5, "low"]);
});

// La extensión en Netflix con «Dragon Ball Z Kai»: su T2 empieza en la posición
// 102 (Netflix cuenta episodios de más) y el episodio es el 1.º de esa temporada.
const DBZK_NETFLIX = {
  platform: "netflix",
  contentId: "80244799",
  mainTitle: "Dragon Ball Z Kai",
  showName: "Dragon Ball Z Kai",
  episodeName: "Siete años después",
  season: 2,
  episode: 102,
  seasonEpisodeText: "T2:E102",
  identitySource: "netflix_metadata",
  mediaTypeHint: "tv",
  absoluteEpisode: 102,
  seasonEpisodeIndex: 1,
  durationSec: 1380,
  positionSec: 90,
  detectionKind: "playback",
};

test("Temporadas reagrupadas: el T2:E1 de Netflix de «Dragon Ball Z Kai» es el S5E1, no el S5E5", async () => {
  const absolute = await sync(DBZK_NETFLIX, learned());
  assert.deepEqual([synced(absolute).tmdbId, synced(absolute).season, synced(absolute).episode], [61709, 5, 1]);

  // Netflix con numeración relativa (T2:E1): ese par existe en TMDb, pero es otro.
  const relative = await sync({ ...DBZK_NETFLIX, episode: 1, seasonEpisodeText: "T2:E1" }, learned());
  assert.deepEqual([synced(relative).season, synced(relative).episode], [5, 1]);

  // Con el nombre de TMDb del episodio, el nombre lo confirma.
  const named = await sync({ ...DBZK_NETFLIX, episodeName: "¡Han transcurrido siete años! El primer día de Gohan en la escuela secundaria" }, learned());
  assert.deepEqual([synced(named).season, synced(named).episode], [5, 1]);
});

test("El nombre del episodio corrige un desfase que quede tras alinear", async () => {
  // Posición que no alinea con ningún inicio (desfase de 4 dentro de la T5).
  const result = await sync({
    ...DBZK_NETFLIX,
    season: 5,
    episode: 106,
    absoluteEpisode: 106,
    seasonEpisodeIndex: 9,
    episodeName: "¡Volvamos al mundo de los vivos! Goku participará en el Torneo de Artes Marciales",
  }, learned());
  assert.deepEqual([synced(result).season, synced(result).episode], [5, 5]);
});

test("App Android (sin posiciones): un par que existe en TMDb pero es otro episodio se corrige por su nombre", async () => {
  // La app de Netflix muestra «T2:E1» (numeración relativa) y el nombre del
  // episodio; en TMDb ese nombre es el S5E1.
  const result = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Dragon Ball Z Kai",
    showName: "Dragon Ball Z Kai",
    episodeName: "¡Han transcurrido siete años! El primer día de Gohan en la escuela secundaria",
    season: 2,
    episode: 1,
    seasonEpisodeText: "T2:E1",
    durationSec: 1380,
    detectionKind: "playback",
  }, learned());
  assert.deepEqual([synced(result).season, synced(result).episode], [5, 1]);

  // Sin nombre que case exacto, el par se queda (no se inventa nada).
  const unchanged = await sync({
    platform: "com.netflix.mediaclient",
    mainTitle: "Dragon Ball Z Kai",
    showName: "Dragon Ball Z Kai",
    episodeName: "Siete años después",
    season: 2,
    episode: 1,
    seasonEpisodeText: "T2:E1",
    durationSec: 1380,
    detectionKind: "playback",
  }, learned());
  assert.deepEqual([synced(unchanged).season, synced(unchanged).episode], [2, 1]);
});
