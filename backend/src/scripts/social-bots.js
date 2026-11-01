// Usuarios automáticos de Social (lib/socialBots). En producción actúan solos
// desde server.js; este script sirve para crearlos, forzar un tic o borrarlos.
//
//   npm run bots:social                crea las cuentas que falten y muestra el plan de hoy
//   npm run bots:social -- --tick      además ejecuta un tic ahora (lo que ya tocaba hoy)
//   npm run bots:social -- --remove    borra las cuentas y toda su actividad

import '../config/load-env.js';

import { closeDb } from '../db/client.js';
import { ensureBotAccounts, removeBotAccounts, runSocialBotsTick } from '../lib/socialBots.js';
import { BOT_TZ, BOTS, botDayKey, planBotDay } from '../lib/socialBotsCore.js';
import { closeRedis } from '../lib/redis.js';

const time = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: BOT_TZ, hour: '2-digit', minute: '2-digit' });

async function main() {
  if (process.argv.includes('--remove')) {
    const removed = await removeBotAccounts();
    console.log(removed.length ? `Borrados: ${removed.join(', ')}` : 'No había usuarios automáticos.');
    return;
  }

  const { accounts, created } = await ensureBotAccounts();
  console.log(`Cuentas: ${accounts.length} (${created} nuevas)`);
  const dayKey = botDayKey(Date.now());
  for (const account of accounts) {
    const slots = planBotDay(BOTS.find((bot) => bot.handle === account.handle), dayKey);
    console.log(`  ${account.username.padEnd(16)} hoy a las ${slots.map(time).join(', ')}`);
  }

  if (process.argv.includes('--tick')) {
    const result = await runSocialBotsTick({ force: true, log: { info: (data) => console.log(data.sessions.join('\n')) } });
    console.log(`Tic: ${result.ran} sesiones${result.skipped ? ` (${result.skipped})` : ''}.`);
  }
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
