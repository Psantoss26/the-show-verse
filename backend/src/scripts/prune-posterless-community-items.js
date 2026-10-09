// Limpia de una vez los títulos sin póster de las listas IMPORTADAS de Trakt.
//
// La lectura de una lista ya los oculta y los borra (community/store.js), pero
// solo en las listas que alguien abre. Este script recorre los títulos sin
// `poster_path` de las listas con `source = 'trakt'` (agrupados: una consulta
// por título, que vale para todas sus copias) y aplica la comprobación de
// posterlessItems.js: si TMDb tiene póster en algún idioma, lo guarda en todas
// las copias; si TMDb ya no tiene el título o no tiene ningún póster, BORRA
// sus copias. Los errores pasajeros de TMDb no borran nada (se reintentan en la
// siguiente ejecución). Las listas publicadas por usuarios no se tocan.
//
// Ojo: al importar solo se guardó el póster de los primeros títulos de cada
// lista, así que una pasada completa son decenas de miles de consultas a TMDb.
//
// Uso (con la base que toque; ver load-env.js):
//   npm run community:prune-posterless -- --limit 500          # simulación
//   npm run community:prune-posterless -- --limit 500 --apply  # lo aplica
//   npm run community:prune-posterless -- --apply              # todo

import { and, eq, isNull, sql } from 'drizzle-orm';

import { closeDb, db } from '../db/client.js';
import { communityListItems, communityLists } from '../db/schema.js';
import { checkTmdbPosters, posterItemKey } from '../community/posterlessItems.js';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const apply = process.argv.includes('--apply');
const limit = Number(option('--limit')) || null;

const trakt = and(isNull(communityListItems.posterPath), eq(communityLists.source, 'trakt'));
let query = db
  .selectDistinct({
    tmdbId: communityListItems.tmdbId,
    mediaType: communityListItems.mediaType,
    title: sql`max(${communityListItems.title})`.as('title'),
  })
  .from(communityListItems)
  .innerJoin(communityLists, eq(communityListItems.listId, communityLists.id))
  .where(trakt)
  .groupBy(communityListItems.tmdbId, communityListItems.mediaType)
  .orderBy(communityListItems.mediaType, communityListItems.tmdbId);
if (limit) query = query.limit(limit);
const titles = await query;

console.log(`Títulos sin póster en listas importadas (esta pasada): ${titles.length}`);

const checks = await checkTmdbPosters(titles, { max: Number.POSITIVE_INFINITY });
const recovered = [];
const missing = [];
let unknown = 0;
for (const title of titles) {
  const check = checks.get(posterItemKey(title.mediaType, title.tmdbId));
  if (check?.status === 'poster') recovered.push({ ...title, posterPath: check.posterPath });
  else if (check?.status === 'missing') missing.push(title);
  else unknown += 1;
}

console.log(`Con póster recuperado: ${recovered.length}`);
console.log(`Sin póster en TMDb (se borran sus copias en listas importadas): ${missing.length}`);
for (const title of missing) console.log(`  - ${title.mediaType}:${title.tmdbId} ${title.title || ''}`);
console.log(`Sin respuesta de TMDb (se dejan): ${unknown}`);

if (apply) {
  // Solo filas de listas importadas: las de usuario no se tocan.
  const inTraktList = sql`${communityListItems.listId} in (select ${communityLists.id} from ${communityLists} where ${communityLists.source} = 'trakt')`;
  for (const title of recovered) {
    await db
      .update(communityListItems)
      .set({ posterPath: title.posterPath })
      .where(and(
        eq(communityListItems.tmdbId, title.tmdbId),
        eq(communityListItems.mediaType, title.mediaType),
        isNull(communityListItems.posterPath),
        inTraktList,
      ));
  }
  for (const title of missing) {
    await db
      .delete(communityListItems)
      .where(and(
        eq(communityListItems.tmdbId, title.tmdbId),
        eq(communityListItems.mediaType, title.mediaType),
        isNull(communityListItems.posterPath),
        inTraktList,
      ));
  }
  console.log('Aplicado.');
} else {
  console.log('Simulación: añade --apply para guardar los cambios.');
}

await closeDb();
