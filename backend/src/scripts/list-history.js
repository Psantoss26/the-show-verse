import '../config/load-env.js';
import { db, closeDb } from '../db/client.js';
import { watchHistory } from '../db/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
  try {
    const history = await db.select().from(watchHistory).orderBy(desc(watchHistory.createdAt)).limit(10);
    console.log('Recent watch history entries:', JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Error fetching watch history:', err);
  } finally {
    await closeDb();
  }
}

main();
