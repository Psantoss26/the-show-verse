// Copia las PUNTUACIONES de un usuario de una base de datos a otra pasando por
// un fichero JSON (las dos bases no tienen por qué verse entre sí, p. ej. la
// local del PC y la de producción en el NAS).
//
//   1) Exportar (en la base de origen):
//      npm run ratings:copy -- --export --email <email> --out puntuaciones.json
//   2) Vista previa en la base de destino (no cambia nada):
//      npm run ratings:copy -- --from puntuaciones.json --email <email>
//   3) Aplicar (una sola transacción):
//      npm run ratings:copy -- --from puntuaciones.json --email <email> --apply
//
// El usuario se busca por --email (o --username): el nombre de usuario puede
// no coincidir entre las dos bases. Al aplicar, cada puntuación del fichero
// (película, serie, temporada o episodio) deja en el destino su nota y su
// fecha: se corrige si es distinta y se crea si falta. Las puntuaciones que
// solo existen en el destino no se tocan (se listan en la vista previa).

import '../config/load-env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

/** Clave de una puntuación: el título y, si es de temporada/episodio, cuál. */
export function ratingKey(row) {
  return [Number(row.tmdb_id), row.media_type, row.season ?? '', row.episode ?? ''].join(':');
}

/** Qué cambia en el destino para que tenga las notas del fichero. */
export function planRatings(sourceRows, targetRows) {
  const target = new Map(targetRows.map((row) => [ratingKey(row), row]));
  const sourceKeys = new Set(sourceRows.map(ratingKey));
  const toUpdate = [];
  const toInsert = [];
  for (const row of sourceRows) {
    const current = target.get(ratingKey(row));
    if (!current) toInsert.push(row);
    else if (Number(current.rating) !== Number(row.rating)) toUpdate.push({ before: current, after: row });
  }
  const onlyTarget = targetRows.filter((row) => !sourceKeys.has(ratingKey(row)));
  return { toUpdate, toInsert, onlyTarget };
}

function label(row) {
  const where = row.season != null ? ` T${row.season}${row.episode != null ? `E${row.episode}` : ''}` : '';
  return `[${row.media_type}] ${row.title || row.tmdb_id}${where}`;
}

async function findUser(sql, { email, username }) {
  const rows = email
    ? await sql`select id, username, email from users where lower(email) = lower(${email})`
    : await sql`select id, username, email from users where username = ${username}`;
  if (!rows.length) throw new Error(`No existe el usuario ${email || username}.`);
  return rows[0];
}

async function main() {
  const email = String(option('--email') || '').trim();
  const username = String(option('--username') || '').trim();
  const out = option('--out');
  const from = option('--from');
  const exporting = process.argv.includes('--export');
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if ((!email && !username) || !url || (exporting ? !out : !from)) {
    console.error('Uso: npm run ratings:copy -- --export --email <email> --out <fichero.json>');
    console.error('     npm run ratings:copy -- --from <fichero.json> --email <email> [--apply]');
    process.exitCode = 1;
    return;
  }

  const sql = postgres(url, { max: 1 });
  try {
    const user = await findUser(sql, { email, username });

    if (exporting) {
      const ratings = await sql`
        select tmdb_id, media_type, season, episode, rating, title, poster_path, rated_at
        from user_ratings where user_id = ${user.id}
        order by media_type, tmdb_id, season nulls first, episode nulls first`;
      writeFileSync(
        out,
        JSON.stringify({ exportedAt: new Date().toISOString(), username: user.username, ratings }, null, 2),
      );
      console.log(`Exportadas ${ratings.length} puntuaciones de ${user.username} a ${out}.`);
      return;
    }

    const file = JSON.parse(readFileSync(from, 'utf8'));
    const sourceRows = Array.isArray(file?.ratings) ? file.ratings : [];
    if (!sourceRows.length) throw new Error('El fichero no tiene puntuaciones.');
    const targetRows = await sql`select * from user_ratings where user_id = ${user.id}`;
    const { toUpdate, toInsert, onlyTarget } = planRatings(sourceRows, [...targetRows]);

    console.log(`Usuario: ${user.username} · fichero: ${sourceRows.length} (de ${file.username}, ${file.exportedAt}) · actuales: ${targetRows.length}`);
    console.log(`\nSe corrigen ${toUpdate.length} notas:`);
    for (const { before, after } of toUpdate) console.log(`  ~ ${label(after)}: ${before.rating} → ${after.rating}`);
    console.log(`\nSe crean ${toInsert.length} que faltan:`);
    for (const row of toInsert.slice(0, 40)) console.log(`  + ${label(row)}: ${row.rating}`);
    if (toInsert.length > 40) console.log(`  … y ${toInsert.length - 40} más`);
    console.log(`\nSolo existen aquí (no se tocan): ${onlyTarget.length}`);
    for (const row of onlyTarget.slice(0, 40)) console.log(`  = ${label(row)}: ${row.rating}`);
    if (onlyTarget.length > 40) console.log(`  … y ${onlyTarget.length - 40} más`);

    if (!apply) {
      console.log('\nVista previa: no se ha cambiado nada. Repite con --apply para aplicarlo.');
      return;
    }

    const now = new Date();
    await sql.begin(async (tx) => {
      for (const { before, after } of toUpdate) {
        await tx`
          update user_ratings
          set rating = ${after.rating}, rated_at = ${after.rated_at}, updated_at = ${now}
          where id = ${before.id}`;
      }
      for (const row of toInsert) {
        await tx`
          insert into user_ratings (user_id, tmdb_id, media_type, season, episode, rating, title, poster_path, rated_at, updated_at)
          values (${user.id}, ${row.tmdb_id}, ${row.media_type}, ${row.season}, ${row.episode}, ${row.rating},
                  ${row.title}, ${row.poster_path}, ${row.rated_at}, ${now})
          on conflict do nothing`;
      }
    });
    console.log(`\nAplicado: ${toUpdate.length} notas corregidas y ${toInsert.length} creadas.`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
