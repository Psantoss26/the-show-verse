// Calcula el nivel de todos los usuarios y persiste su caché.
//
// El XP se deriva, así que este script no "concede" nada: solo rellena
// user_level_state para que los chips de nivel de los listados de miembros
// aparezcan sin esperar a que alguien visite cada perfil. También persiste los
// logros que el historial ya tenía conseguidos. Es idempotente: ejecutarlo dos
// veces da el mismo resultado.
//
// Uso:
//   npm run level:backfill
//   npm run level:backfill -- --username psantos26

import { asc, eq } from 'drizzle-orm';

import { closeDb, db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getLevelState } from '../level/store.js';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const username = option('--username');

const targets = await db
  .select({ id: users.id, username: users.username })
  .from(users)
  .where(username ? eq(users.username, username) : eq(users.isActive, true))
  .orderBy(asc(users.username));

if (!targets.length) {
  console.error(username ? `No existe el usuario ${username}.` : 'No hay usuarios activos.');
  await closeDb();
  process.exit(1);
}

console.log(`Calculando el nivel de ${targets.length} usuario(s)...\n`);

let failed = 0;
for (const target of targets) {
  try {
    const state = await getLevelState(db, target.id, { refresh: true });
    console.log(
      `  ${target.username.padEnd(20)} Nv.${String(state.level).padStart(2)} `
      + `${state.tier.name.padEnd(14)} ${String(state.xp).padStart(7)} XP  `
      + `${state.achievements.unlockedCount}/${state.achievements.total} logros  `
      + `racha ${state.streaks.current}d (máx ${state.streaks.longest}d)`,
    );
  } catch (err) {
    failed += 1;
    console.error(`  ${target.username.padEnd(20)} ERROR: ${err.message}`);
  }
}

console.log(`\nListo. ${targets.length - failed} correcto(s), ${failed} con error.`);
await closeDb();
process.exit(failed ? 1 : 0);
