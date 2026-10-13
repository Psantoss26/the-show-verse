// Devuelve los datos de UN usuario al estado de una copia anterior de la base
// de datos (p. ej. una instantánea del volumen de Postgres de ayer), sin tocar
// a nadie más. Pensado para deshacer una importación que modificó datos que el
// usuario ya tenía (notas, favoritas, visionados…).
//
// Uso (DATABASE_URL = la base a corregir; SOURCE_DATABASE_URL = la copia):
//   SOURCE_DATABASE_URL=postgres://… npm run user:restore -- --username <usuario>
//   SOURCE_DATABASE_URL=postgres://… npm run user:restore -- --username <usuario> --apply
//   … --tables user_ratings,favorites   (solo esas tablas)
//
// Sin --apply es SIEMPRE una vista previa: cuenta y muestra lo que cambiaría.
// Con --apply lo hace todo en UNA transacción (o todo o nada).
//
// Compara fila a fila por `id`: lo que solo está en la base actual se borra, lo
// que solo está en la copia se vuelve a crear con su mismo id y lo que cambió
// recupera los valores de la copia. Conservar los ids mantiene intactas las
// referencias de otros (p. ej. los me gusta a sus reseñas).
//
// No toca las cuentas conectadas (connected_accounts): su estado de hoy evita
// que la sincronización de Letterboxd vuelva a procesar lo ya visto.

import '../config/load-env.js';
import postgres from 'postgres';

// Orden de inserción (padres antes que hijos); se borra en orden inverso.
const TABLES = [
  { name: 'user_ratings', where: (sql, userId) => sql`user_id = ${userId}` },
  { name: 'favorites', where: (sql, userId) => sql`user_id = ${userId}` },
  { name: 'watchlist', where: (sql, userId) => sql`user_id = ${userId}` },
  { name: 'watch_history', where: (sql, userId) => sql`user_id = ${userId}` },
  { name: 'title_comments', where: (sql, userId) => sql`user_id = ${userId}` },
  { name: 'user_lists', where: (sql, userId) => sql`user_id = ${userId}` },
  {
    name: 'user_list_items',
    where: (sql, userId) => sql`list_id in (select id from user_lists where user_id = ${userId})`,
  },
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? null;
}

function sameRow(a, b) {
  return Object.keys(a).every((key) => normalize(a[key]) === normalize(b[key]));
}

/** Diferencias por id entre la copia (source) y la base actual (target). */
export function diffRows(sourceRows, targetRows) {
  const source = new Map(sourceRows.map((row) => [row.id, row]));
  const target = new Map(targetRows.map((row) => [row.id, row]));
  const toDelete = targetRows.filter((row) => !source.has(row.id));
  const toInsert = sourceRows.filter((row) => !target.has(row.id));
  const toUpdate = sourceRows
    .filter((row) => target.has(row.id) && !sameRow(row, target.get(row.id)))
    .map((row) => ({ before: target.get(row.id), after: row }));
  return { toDelete, toInsert, toUpdate };
}

function describe(table, row) {
  const title = row.title || row.name || row.body?.slice(0, 40) || row.tmdb_id || row.id;
  const where = row.season != null ? ` T${row.season}${row.episode != null ? `E${row.episode}` : ''}` : '';
  const extra = table === 'user_ratings' ? ` · nota ${row.rating}` : '';
  return `${row.media_type ? `[${row.media_type}] ` : ''}${title}${where}${extra}`;
}

async function main() {
  const username = String(option('--username') || '').trim();
  const apply = process.argv.includes('--apply');
  const only = String(option('--tables') || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!username || !sourceUrl || !targetUrl) {
    console.error('Uso: SOURCE_DATABASE_URL=… npm run user:restore -- --username <usuario> [--tables a,b] [--apply]');
    process.exitCode = 1;
    return;
  }
  if (sourceUrl === targetUrl) {
    console.error('Error: la copia (SOURCE_DATABASE_URL) y la base a corregir son la misma.');
    process.exitCode = 1;
    return;
  }
  const tables = only.length ? TABLES.filter((table) => only.includes(table.name)) : TABLES;
  if (only.length && tables.length !== only.length) {
    console.error(`Error: tablas desconocidas. Válidas: ${TABLES.map((table) => table.name).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const source = postgres(sourceUrl, { max: 1 });
  const target = postgres(targetUrl, { max: 1 });
  try {
    const [sourceUser] = await source`select id, username from users where username = ${username}`;
    const [targetUser] = await target`select id, username from users where username = ${username}`;
    if (!sourceUser || !targetUser) throw new Error(`El usuario "${username}" no existe en ${sourceUser ? 'la base actual' : 'la copia'}.`);
    if (sourceUser.id !== targetUser.id) throw new Error('El usuario tiene un id distinto en la copia y en la base actual.');
    const userId = targetUser.id;

    const plan = [];
    for (const table of tables) {
      const [sourceRows, targetRows] = await Promise.all([
        source`select * from ${source(table.name)} where ${table.where(source, userId)}`,
        target`select * from ${target(table.name)} where ${table.where(target, userId)}`,
      ]);
      const diff = diffRows([...sourceRows], [...targetRows]);
      plan.push({ table, ...diff });
      console.log(
        `\n${table.name}: copia ${sourceRows.length} · actual ${targetRows.length} → ` +
          `borrar ${diff.toDelete.length} · recrear ${diff.toInsert.length} · restaurar ${diff.toUpdate.length}`,
      );
      for (const row of diff.toUpdate.slice(0, 15)) {
        console.log(`  ~ ${describe(table.name, row.before)}  →  ${describe(table.name, row.after)}`);
      }
      for (const row of diff.toDelete.slice(0, 10)) console.log(`  - ${describe(table.name, row)}`);
      for (const row of diff.toInsert.slice(0, 10)) console.log(`  + ${describe(table.name, row)}`);
    }

    if (!apply) {
      console.log('\nVista previa: no se ha cambiado nada. Repite con --apply para aplicarlo.');
      return;
    }

    await target.begin(async (tx) => {
      for (const { table, toDelete } of [...plan].reverse()) {
        if (toDelete.length) await tx`delete from ${tx(table.name)} where id in ${tx(toDelete.map((row) => row.id))}`;
      }
      for (const { table, toInsert, toUpdate } of plan) {
        for (let index = 0; index < toInsert.length; index += 500) {
          await tx`insert into ${tx(table.name)} ${tx(toInsert.slice(index, index + 500))}`;
        }
        for (const { after } of toUpdate) {
          const { id, ...values } = after;
          await tx`update ${tx(table.name)} set ${tx(values)} where id = ${id}`;
        }
      }
    });
    console.log(`\nAplicado: los datos de ${username} están como en la copia.`);
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
