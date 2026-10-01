import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachBackgrounds,
  backgroundTitleKeys,
  buildYearInReview,
  computePersona,
  dayOfYear,
  localParts,
  normalizePlays,
  pickTextlessImage,
  watchLocalParts,
} from './yearInReviewCore.js';

const TZ = 'Europe/Madrid';
const NOW = '2026-10-01T12:00:00Z';

function meta(entries) {
  return new Map(Object.entries(entries));
}

const META = meta({
  'tv:1': {
    title: 'Severance',
    posterPath: '/sev.jpg',
    backdropPath: '/sev-bd.jpg',
    episodeRuntime: 50,
    genres: ['Drama', 'Ciencia ficción'],
    date: '2022-02-18',
    originalLanguage: 'en',
    countries: ['US'],
    voteAverage: 8.4,
    networks: [{ id: 2552, name: 'Apple TV+', logoPath: '/apple.png' }],
    seasonEpisodeCounts: { 1: 3 },
  },
  'movie:10': {
    title: 'Parásitos',
    posterPath: '/par.jpg',
    runtime: 132,
    genres: ['Drama', 'Suspense'],
    date: '2019-05-30',
    originalLanguage: 'ko',
    countries: ['KR'],
    voteAverage: 8.5,
  },
  'movie:11': {
    title: 'Casablanca',
    posterPath: '/casa.jpg',
    runtime: 102,
    genres: ['Drama', 'Romance'],
    date: '1942-11-26',
    originalLanguage: 'en',
    countries: ['US'],
    voteAverage: 8.1,
  },
});

test('localParts usa la zona del usuario (Nochevieja en Madrid es del año que acaba)', () => {
  const parts = localParts('2025-12-31T22:30:00Z', TZ);
  assert.equal(parts.y, 2025);
  assert.equal(parts.dayKey, '2025-12-31');
  assert.equal(parts.hour, 23);
  const next = localParts('2025-12-31T23:30:00Z', TZ);
  assert.equal(next.y, 2026);
  assert.equal(next.dayKey, '2026-01-01');
  assert.equal(next.hour, 0);
});

test('dayOfYear cuenta desde 0', () => {
  assert.equal(dayOfYear('2026-01-01'), 0);
  assert.equal(dayOfYear('2026-12-31'), 364);
  assert.equal(dayOfYear('2024-12-31'), 365);
});

test('las filas con el mismo instante se marcan como bloque', () => {
  const at = '2026-03-01T10:00:00Z';
  const plays = normalizePlays(
    [
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 1, watchedAt: at },
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 2, watchedAt: at },
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 3, watchedAt: at },
      { tmdbId: 10, mediaType: 'movie', watchedAt: '2026-03-02T21:00:00Z' },
    ],
    META,
    TZ,
  );
  assert.equal(plays.filter((p) => p.bulk).length, 3);
  assert.equal(plays.find((p) => p.mediaType === 'movie').bulk, false);
});

test('sin actividad en el año el resumen sale vacío pero con años disponibles', () => {
  const result = buildYearInReview({
    year: 2026,
    timeZone: TZ,
    now: NOW,
    history: [{ tmdbId: 10, mediaType: 'movie', watchedAt: '2025-05-01T20:00:00Z' }],
    meta: META,
  });
  assert.equal(result.empty, true);
  assert.deepEqual(result.availableYears, [{ year: 2025, plays: 1 }]);
});

function sampleInput() {
  return {
    year: 2026,
    timeZone: TZ,
    now: NOW,
    meta: META,
    history: [
      // Severance: un episodio el año anterior, dos este año el mismo día (maratón real).
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 1, watchedAt: '2025-11-02T21:00:00Z' },
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 2, watchedAt: '2026-02-10T20:00:00Z' },
      { tmdbId: 1, mediaType: 'tv', season: 1, episode: 3, watchedAt: '2026-02-10T21:00:00Z' },
      // Parásitos dos veces: rewatch dentro del año.
      { tmdbId: 10, mediaType: 'movie', watchedAt: '2026-02-11T19:00:00Z' },
      { tmdbId: 10, mediaType: 'movie', watchedAt: '2026-06-20T23:30:00Z' },
      { tmdbId: 11, mediaType: 'movie', watchedAt: '2026-02-12T18:00:00Z', runtimeMins: 102 },
    ],
    ratings: [
      { tmdbId: 10, mediaType: 'movie', rating: 10, ratedAt: '2026-02-11T22:00:00Z' },
      { tmdbId: 11, mediaType: 'movie', rating: 6, ratedAt: '2026-02-12T22:00:00Z' },
      { tmdbId: 1, mediaType: 'tv', rating: 9, ratedAt: '2025-12-01T10:00:00Z' },
    ],
    credits: new Map([
      ['movie:10', { cast: [{ id: 7, name: 'Song Kang-ho', profilePath: '/s.jpg' }], directors: [{ id: 9, name: 'Bong Joon-ho' }] }],
      ['movie:11', { cast: [{ id: 7, name: 'Song Kang-ho', profilePath: '/s.jpg' }], directors: [{ id: 8, name: 'Michael Curtiz' }] }],
    ]),
    activity: { favoritesAdded: 2, listsCreated: 1 },
    achievements: [{ id: 'maraton', name: 'Maratón' }],
  };
}

test('totales, títulos y comparación con el año anterior', () => {
  const r = buildYearInReview(sampleInput());
  assert.equal(r.empty, false);
  assert.equal(r.totals.movies.plays, 3);
  assert.equal(r.totals.movies.unique, 2);
  assert.equal(r.totals.episodes.plays, 2);
  assert.equal(r.totals.minutes, 132 * 2 + 102 + 50 * 2);
  assert.equal(r.totals.activeDays, 4);
  assert.equal(r.previous.plays, 1);
  assert.ok(r.previous.minutesDelta > 0);
});

test('series: completada este año, no es nueva y maratón del mismo día', () => {
  const r = buildYearInReview(sampleInput());
  const show = r.shows.top[0];
  assert.equal(show.title, 'Severance');
  assert.equal(show.isNew, false);
  assert.equal(show.completedThisYear, true);
  assert.equal(show.rating, 9);
  assert.equal(r.binge.episodes, 2);
  assert.equal(r.binge.date, '2026-02-10');
  assert.equal(r.milestones.completedShows.length, 1);
});

test('película del año: la mejor puntuada; rewatch detectado', () => {
  const r = buildYearInReview(sampleInput());
  assert.equal(r.movies.top[0].title, 'Parásitos');
  assert.equal(r.movies.top[0].rewatch, true);
  assert.equal(r.movies.longest.title, 'Parásitos');
});

test('notas del año: media, comparación con TMDb y la más polémica', () => {
  const r = buildYearInReview(sampleInput());
  assert.equal(r.ratings.count, 2);
  assert.equal(r.ratings.average, 8);
  assert.equal(r.ratings.controversial.title, 'Casablanca');
  assert.ok(r.ratings.controversial.diff < 0);
});

test('géneros, épocas, idiomas y personas', () => {
  const r = buildYearInReview(sampleInput());
  assert.equal(r.genres.top[0].name, 'Drama');
  assert.equal(r.eras.oldest.title, 'Casablanca');
  assert.equal(r.eras.oldest.year, 1942);
  assert.equal(r.world.discovery.code, 'ko');
  assert.equal(r.people.actors[0].name, 'Song Kang-ho');
  assert.equal(r.people.actors[0].titles, 2);
  // Ningún director repite: no se inventa un "director favorito".
  assert.equal(r.people.directors.length, 0);
});

test('calendario: racha más larga con fechas y día más intenso', () => {
  const r = buildYearInReview(sampleInput());
  assert.equal(r.calendar.longestStreak.length, 3);
  assert.equal(r.calendar.longestStreak.start, '2026-02-10');
  assert.equal(r.calendar.longestStreak.end, '2026-02-12');
  assert.equal(r.calendar.perDay.length, 365);
  assert.equal(r.monthly.peak.label, 'febrero');
});

test('la comunidad solo aparece con suficientes usuarios activos', () => {
  const few = buildYearInReview({ ...sampleInput(), community: { activeUsers: 3, rank: 1 } });
  assert.equal(few.community, null);
  const many = buildYearInReview({ ...sampleInput(), community: { activeUsers: 200, rank: 3 } });
  assert.equal(many.community.topPercent, 2);
});

test('perfil de espectador: un año de películas da el Cinéfilo', () => {
  const persona = computePersona({ movieShare: 0.9 });
  assert.equal(persona.id, 'cinefilo');
  const binge = computePersona({ bingeEpisodes: 10, episodesPerActiveDay: 6, movieShare: 0.1 });
  assert.equal(binge.id, 'maratoniano');
});

test('importados sin hora: cuentan su fecha UTC pero no la hora', () => {
  const parts = watchLocalParts('2026-03-05T00:00:00.000Z', 'America/New_York');
  assert.equal(parts.timeless, true);
  // En Nueva York sería el día 4; la fecha guardada es la del 5.
  assert.equal(parts.dayKey, '2026-03-05');
  const real = watchLocalParts('2026-03-05T21:13:42.512Z', TZ);
  assert.equal(real.timeless, false);
  assert.equal(real.hour, 22);

  const r = buildYearInReview({
    year: 2026,
    timeZone: TZ,
    now: NOW,
    meta: META,
    history: Array.from({ length: 8 }, (_, i) => ({
      tmdbId: 100 + i,
      mediaType: 'movie',
      watchedAt: `2026-04-0${i + 1}T00:00:00.000Z`,
    })),
  });
  assert.equal(r.rhythm.reliable, false);
  assert.equal(r.rhythm.weekdaysReliable, true);
  assert.equal(r.rhythm.lateNightShare, 0);
});

test('el día más intenso ignora los marcados en bloque', () => {
  const at = '2026-05-01T10:00:00Z';
  const r = buildYearInReview({
    year: 2026,
    timeZone: TZ,
    now: NOW,
    meta: META,
    history: [
      ...[1, 2, 3].map((episode) => ({ tmdbId: 1, mediaType: 'tv', season: 1, episode, watchedAt: at })),
      { tmdbId: 10, mediaType: 'movie', watchedAt: '2026-05-03T20:11:09.120Z' },
    ],
  });
  assert.equal(r.calendar.busiestDay.date, '2026-05-03');
  assert.equal(r.calendar.busiestDay.plays, 1);
  assert.equal(r.calendar.activeDays, 2);
});

test('las notas importadas en bloque no cuentan como notas del año', () => {
  const at = '2026-01-15T10:00:00.000Z';
  const r = buildYearInReview({
    ...sampleInput(),
    ratings: [
      ...[20, 21, 22, 23].map((tmdbId) => ({ tmdbId, mediaType: 'movie', rating: 7, ratedAt: at })),
      { tmdbId: 10, mediaType: 'movie', rating: 10, ratedAt: '2026-02-11T22:00:00Z' },
    ],
  });
  assert.equal(r.ratings.count, 1);
});

test('banda sonora: cada pantalla suena con su título más representativo y sin repetir', () => {
  const r = buildYearInReview(sampleInput());
  const { bySlide, cards } = r.soundtrack;
  // Portada, tiempo y resumen: el título del año (Parásitos: dos visionados).
  assert.equal(bySlide.intro, r.topTitle.key);
  assert.equal(bySlide.summary, r.topTitle.key);
  // Serie y película del año, siempre la suya.
  assert.equal(bySlide.topShow, 'tv:1');
  assert.equal(bySlide.topMovie, 'movie:10');
  // "Películas y series": el otro formato del título del año.
  assert.equal(bySlide.split, r.topTitle.key.startsWith('tv:') ? 'movie:10' : 'tv:1');
  // Las notas: la mejor puntuada que no haya sonado aún → Casablanca no (6), Parásitos sí;
  // como Parásitos ya suena en otras, se queda con el primer candidato.
  assert.ok(['movie:10', 'movie:11'].includes(bySlide.ratings));
  // El maratón suena con la serie del maratón.
  assert.equal(bySlide.binge, 'tv:1');
  // Todas las claves tienen tarjeta para resolver la pista.
  for (const key of Object.values(bySlide).filter(Boolean)) {
    assert.ok(cards[key]?.title, `sin tarjeta para ${key}`);
  }
});

test('banda sonora: con títulos de sobra, las pantallas no repiten canción', () => {
  const history = [];
  const metaEntries = {};
  // 8 series y 8 películas en meses, horas y décadas distintos.
  for (let i = 0; i < 8; i += 1) {
    metaEntries[`tv:${200 + i}`] = { title: `Serie ${i}`, episodeRuntime: 40, genres: ['Drama'], date: `${1980 + i * 5}-01-01`, originalLanguage: i % 2 ? 'ja' : 'en' };
    metaEntries[`movie:${300 + i}`] = { title: `Peli ${i}`, runtime: 100 + i, genres: ['Drama'], date: `${1985 + i * 4}-01-01`, originalLanguage: i % 3 ? 'fr' : 'en' };
    for (let e = 1; e <= 8 - i; e += 1) {
      history.push({ tmdbId: 200 + i, mediaType: 'tv', season: 1, episode: e, watchedAt: `2026-0${(i % 8) + 1}-1${e % 9}T2${e % 3}:1${i}:0${e}.123Z` });
    }
    history.push({ tmdbId: 300 + i, mediaType: 'movie', watchedAt: `2026-0${(i % 8) + 1}-2${i}T1${i}:3${i}:11.456Z` });
  }
  const r = buildYearInReview({ year: 2026, timeZone: TZ, now: NOW, meta: meta(metaEntries), history });
  const bySlide = r.soundtrack.bySlide;
  assert.equal(bySlide.intro, bySlide.minutes);
  assert.equal(bySlide.intro, bySlide.summary);
  // Las pantallas con candidatos propios suenan cada una con un título distinto.
  const varied = ['split', 'genres', 'topShows', 'topMovies', 'binge', 'rhythm', 'eras', 'world', 'persona'].map((id) => bySlide[id]);
  assert.equal(new Set([bySlide.intro, bySlide.topMovie, ...varied]).size, varied.length + 2);
  // Sin notas, repartos ni series terminadas, esas pantallas vuelven al título del año.
  assert.equal(bySlide.ratings, bySlide.intro);
  assert.equal(bySlide.people, bySlide.intro);
});

test('fondos: solo arte sin idioma, el de más resolución y luego más votos', () => {
  const gallery = [
    { file_path: '/con-texto.jpg', iso_639_1: 'en', width: 2000, height: 3000, vote_count: 99 },
    { file_path: '/pequeno.jpg', iso_639_1: null, width: 500, height: 750, vote_count: 50 },
    { file_path: '/grande-pocos-votos.jpg', iso_639_1: null, width: 2000, height: 3000, vote_count: 2 },
    { file_path: '/grande-mas-votos.jpg', iso_639_1: null, width: 2000, height: 3000, vote_count: 9 },
  ];
  assert.equal(pickTextlessImage(gallery), '/grande-mas-votos.jpg');
  // Nunca cae a un arte con idioma.
  assert.equal(pickTextlessImage([{ file_path: '/es.jpg', iso_639_1: 'es', width: 2000, height: 3000 }]), null);
  assert.equal(pickTextlessImage([]), null);
});

test('fondos: se adjuntan a las tarjetas y el muro solo conserva pósters sin idioma', () => {
  const r = buildYearInReview(sampleInput());
  const keys = backgroundTitleKeys(r);
  assert.ok(keys.includes(r.topTitle.key) && keys.includes(r.shows.top[0].key) && keys.includes(r.movies.top[0].key));
  attachBackgrounds(r, new Map([
    ['tv:1', { poster: '/sev-limpio.jpg', backdrop: '/sev-fondo-limpio.jpg' }],
    ['movie:10', { poster: null, backdrop: '/par-fondo-limpio.jpg' }],
  ]));
  assert.equal(r.shows.top[0].textlessPosterPath, '/sev-limpio.jpg');
  assert.equal(r.movies.top[0].textlessPosterPath, null);
  assert.equal(r.movies.top[0].textlessBackdropPath, '/par-fondo-limpio.jpg');
  assert.deepEqual(r.posterWall.map((p) => p.key), ['tv:1']);
});
