import '../config/load-env.js';
import { db, closeDb } from '../db/client.js';
import { userRatings } from '../db/schema.js';

async function main() {
  try {
    const ratings = await db.select().from(userRatings);
    console.log('--- USER RATINGS ---');
    console.log(JSON.stringify(ratings, null, 2));
  } catch (err) {
    console.error('Error listing ratings:', err);
  } finally {
    await closeDb();
  }
}

main();
