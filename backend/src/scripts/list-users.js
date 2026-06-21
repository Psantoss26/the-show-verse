import '../config/load-env.js';
import { db, closeDb } from '../db/client.js';
import { users } from '../db/schema.js';

async function main() {
  try {
    const allUsers = await db.select().from(users);
    console.log('Users in database:', JSON.stringify(allUsers, null, 2));
  } catch (err) {
    console.error('Error fetching users:', err);
  } finally {
    await closeDb();
  }
}

main();
