import './src/config/load-env.js';
import { signAccessToken } from './src/lib/jwt.js';
import { db, closeDb } from './src/db/client.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
const [u] = await db.select().from(users).where(eq(users.username, 'psantos26')).limit(1);
process.stdout.write(await signAccessToken({ sub: u.id, username: u.username }));
await closeDb();
