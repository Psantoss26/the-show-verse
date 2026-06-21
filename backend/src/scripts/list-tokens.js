import '../config/load-env.js';
import { db, closeDb } from '../db/client.js';
import { refreshTokens } from '../db/schema.js';

async function main() {
  try {
    const tokens = await db.select().from(refreshTokens);
    console.log('Refresh tokens in DB:', JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('Error fetching refresh tokens:', err);
  } finally {
    await closeDb();
  }
}

main();
