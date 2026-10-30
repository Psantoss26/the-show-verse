// Usuarios de demostración con actividad para probar la sección Social (Hoy,
// Siguiendo, Yo) y la píldora «Hoy» del navbar en LOCAL.
//
//   npm run demo:social                       crea (o rehace) los usuarios demo
//   npm run demo:social -- --viewer psantos26 además los sigue esa cuenta
//   npm run demo:social -- --remove           borra los usuarios demo y todo lo suyo
//
// Todo cuelga de cuentas con correo `demo+…@theshowverse.test`: borrarlas se
// lleva en cascada su actividad, listas y seguimientos. Las fechas son
// relativas a AHORA (con segundos y milisegundos, como una acción real), así
// que hay que volver a lanzarlo otro día para que «Hoy» tenga contenido.
//
// Qué cubre:
//   - Visionados de películas y de episodios, con maratones (varios episodios
//     seguidos de la misma serie) y con hitos: estreno de serie, final de
//     temporada y final de serie.
//   - Puntuaciones de película, serie, temporada y episodio (una pegada a su
//     visionado y otra suelta de una maratón).
//   - Reseñas con y sin spoiler.
//   - Listas públicas con títulos y una privada (no debe verse en ningún feed).
//   - Pendientes y favoritos (salen en Siguiendo, no en Hoy).
//   - Actividad repartida por la semana para los recuentos de Hoy/Ayer/días.
//   - Un bloque importado (mismo instante en punto) que Hoy debe ignorar.
//   - Una cuenta que se excluye de Hoy · Comunidad.
//   - Fotos de perfil generadas (degradado con iniciales, no caras reales).
//
// Solo escribe en una base local: se niega si DATABASE_URL no apunta a
// localhost (ver backend-env-local: sin NODE_ENV=test, .env.local la fija a la
// Postgres de desarrollo).

import '../config/load-env.js';
import { eq, like } from 'drizzle-orm';

import { closeDb, db } from '../db/client.js';
import {
  favorites,
  follows,
  titleComments,
  userListItems,
  userLists,
  userPreferences,
  userRatings,
  users,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { closeRedis, getRedis } from '../lib/redis.js';

const DEMO_EMAIL = (handle) => `demo+${handle}@theshowverse.test`;
const DEMO_EMAIL_PATTERN = 'demo+%@theshowverse.test';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // Cadena no estándar: se trata como remota.
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.argv.includes('--force')) {
    throw new Error(`DATABASE_URL apunta a "${host || 'desconocido'}": este script solo escribe en una base local (usa --force si de verdad es una de pruebas).`);
  }
}

// Instante de hace `minutes` minutos con segundos y milisegundos «reales»:
// las fechas en punto se tomarían por importadas y Hoy las descartaría.
let jitter = 0;
function ago(minutes) {
  jitter = (jitter + 7919) % 50_000;
  return new Date(Date.now() - minutes * 60_000 - 3_217 - jitter);
}
const HOUR = 60;
const DAY = 24 * HOUR;

const T = {
  dune2: { tmdbId: 693134, mediaType: 'movie', title: 'Dune: Parte dos' },
  oppenheimer: { tmdbId: 872585, mediaType: 'movie', title: 'Oppenheimer' },
  interstellar: { tmdbId: 157336, mediaType: 'movie', title: 'Interstellar' },
  inception: { tmdbId: 27205, mediaType: 'movie', title: 'Origen' },
  poorThings: { tmdbId: 792307, mediaType: 'movie', title: 'Pobres criaturas' },
  parasite: { tmdbId: 496243, mediaType: 'movie', title: 'Parásitos' },
  infinity: { tmdbId: 299536, mediaType: 'movie', title: 'Vengadores: Infinity War' },
  breakingBad: { tmdbId: 1396, mediaType: 'tv', title: 'Breaking Bad' },
  severance: { tmdbId: 95396, mediaType: 'tv', title: 'Separación' },
  bear: { tmdbId: 136315, mediaType: 'tv', title: 'The Bear' },
  lastOfUs: { tmdbId: 100088, mediaType: 'tv', title: 'The Last of Us' },
  peaky: { tmdbId: 60574, mediaType: 'tv', title: 'Peaky Blinders' },
  stranger: { tmdbId: 66732, mediaType: 'tv', title: 'Stranger Things' },
  dragon: { tmdbId: 94997, mediaType: 'tv', title: 'La casa del dragón' },
};

// handle, nombre, bio y los dos colores de su foto de perfil (ver demoAvatar);
// `hideFromCommunityToday` marca la cuenta que se excluye de Comunidad.
const PEOPLE = [
  { handle: 'lucia', displayName: 'Lucía Ferrer', colors: ['#f472b6', '#7c3aed'], bio: 'Maratones de fin de semana.' },
  { handle: 'marcos', displayName: 'Marcos Ruiz', colors: ['#38bdf8', '#1e3a8a'], bio: 'Ciencia ficción y poco más.' },
  { handle: 'sara', displayName: 'Sara Gil', colors: ['#34d399', '#065f46'], bio: 'Series de oficina raras.' },
  { handle: 'dani', displayName: 'Dani Ortega', colors: ['#fbbf24', '#b45309'], bio: 'Cine en versión original.' },
  { handle: 'elena', displayName: 'Elena Navarro', colors: ['#fb7185', '#9f1239'], bio: 'Solo en Comunidad: nadie de la demo la sigue.' },
  { handle: 'oculto', displayName: 'Cuenta oculta', colors: ['#a1a1aa', '#3f3f46'], bio: 'Se excluye de Hoy · Comunidad.', hideFromCommunityToday: true },
];

/** Actividad de cada persona: [tipo, título, minutos atrás, extra]. */
function activityFor(handle) {
  const watchEp = (title, season, episode, minutes) => ['watch', title, minutes, { season, episode }];
  switch (handle) {
    case 'lucia':
      return [
        // Maratón con final de serie, nota de la serie y reseña.
        watchEp(T.peaky, 6, 3, 5 * HOUR),
        watchEp(T.peaky, 6, 4, 4 * HOUR),
        watchEp(T.peaky, 6, 5, 3 * HOUR),
        watchEp(T.peaky, 6, 6, 2 * HOUR),
        ['rating', T.peaky, 110, { rating: 9 }],
        ['review', T.peaky, 100, { body: 'Qué manera de cerrar la historia de los Shelby. El último episodio va a otro ritmo y funciona; Cillian Murphy está enorme.' }],
        ['watch', T.poorThings, DAY + 3 * HOUR],
        ['rating', T.poorThings, DAY + 2 * HOUR, { rating: 7 }],
        ['watchlist', T.dragon, 3 * DAY],
        ['favorite', T.peaky, 90],
        ['watch', T.inception, 12 * DAY],
      ];
    case 'marcos':
      return [
        watchEp(T.peaky, 6, 6, 7 * HOUR),
        ['review', T.peaky, 6 * HOUR, { body: 'Tommy acaba vivo y se va a caballo. No me lo esperaba después de toda la temporada.', spoiler: true }],
        ['watch', T.dune2, 45],
        ['rating', T.dune2, 40, { rating: 8.5 }],
        ['review', T.dune2, 35, { body: 'Visualmente es lo mejor que he visto en años. El sonido en una sala grande es otra película.' }],
        ['watch', T.interstellar, 2 * DAY + 5 * HOUR],
        ['rating', T.interstellar, 2 * DAY + 4 * HOUR, { rating: 10 }],
        ['list', { name: 'Ciencia ficción imprescindible', description: 'Para ver al menos una vez.' }, 3 * HOUR, { items: [T.dune2, T.interstellar, T.inception] }],
        ['list', { name: 'Notas privadas', description: 'No debería salir en ningún feed.', private: true }, 2 * HOUR, { items: [T.oppenheimer] }],
      ];
    case 'sara':
      return [
        // Estreno de serie y maratón, con la nota del primer episodio pegada.
        watchEp(T.severance, 1, 1, 9 * HOUR),
        ['rating', T.severance, 9 * HOUR - 5, { season: 1, episode: 1, rating: 9 }],
        watchEp(T.severance, 1, 2, 8 * HOUR),
        watchEp(T.severance, 1, 3, 7 * HOUR),
        ['watch', T.parasite, 20],
        ['rating', T.parasite, 15, { rating: 9.5 }],
        ['favorite', T.severance, 6 * HOUR],
        ['watchlist', T.lastOfUs, 5 * HOUR],
        watchEp(T.stranger, 4, 1, 4 * DAY + 2 * HOUR),
        watchEp(T.stranger, 4, 2, 4 * DAY + HOUR),
      ];
    case 'dani':
      return [
        ['watch', T.oppenheimer, DAY + 6 * HOUR],
        ['rating', T.oppenheimer, DAY + 5 * HOUR, { rating: 10 }],
        ['review', T.oppenheimer, DAY + 5 * HOUR - 10, { body: 'Tres horas que pasan volando. La secuencia de Trinity sin sonido es de lo mejor del año.' }],
        // Final de temporada y nota de la temporada.
        watchEp(T.bear, 1, 7, 2 * DAY + 3 * HOUR),
        watchEp(T.bear, 1, 8, 2 * DAY + 2 * HOUR),
        ['rating', T.bear, 2 * DAY + HOUR, { season: 1, rating: 8 }],
        ['watch', T.infinity, 5 * DAY],
        ['rating', T.infinity, 5 * DAY - 30, { rating: 7.5 }],
        ['list', { name: 'Cine de 2023', description: 'Lo mejor del año, en orden.' }, 6 * DAY, { items: [T.oppenheimer, T.poorThings] }],
        watchEp(T.lastOfUs, 1, 3, 30),
      ];
    case 'elena':
      return [
        // Final de serie solo visible en Comunidad.
        watchEp(T.breakingBad, 5, 15, 3 * HOUR),
        watchEp(T.breakingBad, 5, 16, 2 * HOUR),
        ['rating', T.breakingBad, 100, { rating: 10 }],
        ['watch', T.interstellar, 50],
        ['rating', T.interstellar, 48, { rating: 9 }],
        ['review', T.interstellar, 47, { body: 'La escena del planeta del agua todavía me pone nerviosa.' }],
        watchEp(T.dragon, 2, 1, 3 * DAY),
        // Importación: muchas películas en el mismo instante en punto. Hoy no
        // debe contarlas.
        ['imported', [T.inception, T.parasite, T.oppenheimer, T.poorThings, T.dune2], 6 * HOUR],
      ];
    case 'oculto':
      return [
        watchEp(T.lastOfUs, 1, 1, 80),
        watchEp(T.lastOfUs, 1, 2, 70),
        ['rating', T.lastOfUs, 60, { rating: 8 }],
      ];
    default:
      return [];
  }
}

async function removeDemo() {
  const removed = await db.delete(users).where(like(users.email, DEMO_EMAIL_PATTERN)).returning({ username: users.username });
  return removed.map((row) => row.username);
}

// La caché de Hoy (Redis, 30–60 s) seguiría enseñando lo de antes.
async function clearTodayCache() {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    await redis.connect().catch(() => {});
    const keys = await redis.keys('today:v2:*');
    if (keys.length) await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

// Foto de perfil de la cuenta demo: degradado con sus iniciales, en WebP como
// data URL (el mismo formato que una foto subida desde Ajustes). Ninguna es la
// cara de una persona real. Usa sharp, que llega con Next en la raíz del repo;
// si no está, la cuenta se queda sin foto y el avatar pinta la inicial.
async function demoAvatar(person) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return null;
  }
  const initials = person.displayName.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const [from, to] = person.colors;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="192" height="192" fill="url(#g)"/>
    <circle cx="150" cy="40" r="70" fill="#fff" fill-opacity="0.12"/>
    <text x="96" y="96" dy="0.35em" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="76" font-weight="700" fill="#fff">${initials}</text>
  </svg>`;
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  return `data:image/webp;base64,${webp.toString('base64')}`;
}

async function seedPerson(person) {
  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL(person.handle),
      username: `demo_${person.handle}`,
      displayName: person.displayName,
      bio: person.bio,
      avatarUrl: await demoAvatar(person),
      emailVerified: true,
    })
    .returning({ id: users.id, username: users.username });

  if (person.hideFromCommunityToday) {
    await db.insert(userPreferences).values({ userId: user.id, uiSettings: { hideFromCommunityToday: true } });
  }

  const counts = { watch: 0, rating: 0, review: 0, list: 0, watchlist: 0, favorite: 0, imported: 0 };
  for (const [kind, title, minutes, extra = {}] of activityFor(person.handle)) {
    const at = ago(minutes);
    if (kind === 'watch') {
      await db.insert(watchHistory).values({
        userId: user.id,
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        season: extra.season ?? null,
        episode: extra.episode ?? null,
        title: title.title,
        watchedAt: at,
      });
    } else if (kind === 'rating') {
      const mediaType = extra.episode != null ? 'episode' : extra.season != null ? 'season' : title.mediaType;
      await db.insert(userRatings).values({
        userId: user.id,
        tmdbId: title.tmdbId,
        mediaType,
        season: extra.season ?? null,
        episode: extra.episode ?? null,
        rating: extra.rating,
        title: title.title,
        ratedAt: at,
        updatedAt: at,
      });
    } else if (kind === 'review') {
      await db.insert(titleComments).values({
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        source: 'native',
        userId: user.id,
        authorName: person.displayName,
        authorUsername: user.username,
        body: extra.body,
        spoiler: Boolean(extra.spoiler),
        createdAt: at,
        importedAt: at,
      });
    } else if (kind === 'list') {
      const [list] = await db
        .insert(userLists)
        .values({ userId: user.id, name: title.name, description: title.description, isPublic: !title.private, createdAt: at, updatedAt: at })
        .returning({ id: userLists.id });
      await db.insert(userListItems).values(extra.items.map((item, position) => ({
        listId: list.id,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        position,
        addedAt: new Date(at.getTime() + (position + 1) * 61_123),
      })));
    } else if (kind === 'watchlist' || kind === 'favorite') {
      await db.insert(kind === 'watchlist' ? watchlist : favorites).values({
        userId: user.id,
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        title: title.title,
        addedAt: at,
      });
    } else if (kind === 'imported') {
      // Mismo instante en punto para todo el bloque, como una importación.
      const instant = new Date(at);
      instant.setUTCMinutes(0, 0, 0);
      await db.insert(watchHistory).values(title.map((item) => ({
        userId: user.id,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        watchedAt: instant,
      })));
      counts.imported += title.length;
      continue;
    }
    counts[kind] += 1;
  }
  return { ...user, counts };
}

async function main() {
  assertLocalDatabase();

  const removed = await removeDemo();
  if (process.argv.includes('--remove')) {
    console.log(removed.length ? `Borrados: ${removed.join(', ')}` : 'No había usuarios demo.');
    console.log(`Caché de Hoy limpiada (${await clearTodayCache()} claves).`);
    return;
  }

  const created = [];
  for (const person of PEOPLE) created.push(await seedPerson(person));
  const byHandle = Object.fromEntries(created.map((user) => [user.username.replace(/^demo_/, ''), user]));

  // Seguimientos entre ellos: Lucía, Marcos y Sara se siguen; Dani sigue a Lucía.
  const pairs = [
    ['lucia', 'marcos'], ['marcos', 'lucia'], ['sara', 'lucia'], ['lucia', 'sara'], ['dani', 'lucia'],
  ];
  await db.insert(follows).values(pairs.map(([a, b]) => ({ followerId: byHandle[a].id, followingId: byHandle[b].id })));

  // La cuenta con la que se prueba sigue a cuatro de ellos (no a Elena ni a la
  // oculta, que solo deben verse —o no— en Comunidad).
  const viewerName = option('--viewer');
  let viewerNote = 'sin --viewer: nadie de fuera los sigue';
  if (viewerName) {
    const [viewer] = await db.select({ id: users.id }).from(users).where(eq(users.username, viewerName)).limit(1);
    if (!viewer) throw new Error(`No existe el usuario "${viewerName}"`);
    const followed = ['lucia', 'marcos', 'sara', 'dani'].map((handle) => byHandle[handle].id);
    await db.insert(follows).values(followed.map((id) => ({ followerId: viewer.id, followingId: id }))).onConflictDoNothing();
    // Dani sigue también a quien prueba, para ver un seguidor en la cabecera.
    await db.insert(follows).values({ followerId: byHandle.dani.id, followingId: viewer.id }).onConflictDoNothing();
    viewerNote = `${viewerName} sigue a demo_lucia, demo_marcos, demo_sara y demo_dani`;
  }

  console.log('Usuarios demo creados:');
  for (const user of created) {
    const c = user.counts;
    console.log(`  ${user.username.padEnd(13)} vistos ${c.watch}, notas ${c.rating}, reseñas ${c.review}, listas ${c.list}, pendientes ${c.watchlist}, favoritos ${c.favorite}${c.imported ? `, importados ${c.imported}` : ''}`);
  }
  console.log(`Seguimientos: ${viewerNote}.`);
  console.log(`Caché de Hoy limpiada (${await clearTodayCache()} claves).`);
  if (removed.length) console.log(`(Se rehicieron: ${removed.join(', ')})`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
    await closeRedis().catch(() => {});
  });

