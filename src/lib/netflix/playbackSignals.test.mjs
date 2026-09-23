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
      { season_number: 3, episode_count: 13 },
      { season_number: 5, episode_count: 16 },
    ],
    episodes: {
      3: [{ episode_number: 7, name: "One Minute" }],
      5: [{ episode_number: 14, name: "Ozymandias" }],
    },
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
function installFakeNetwork(sent) {
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
async function sync(payload) {
  process.env.TMDB_API_KEY = "test-key";
  const sent = [];
  const restore = installFakeNetwork(sent);
  try {
    const result = await handler()(request({ resolveOnly: true, ...payload }));
    return { ...result, sent };
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
