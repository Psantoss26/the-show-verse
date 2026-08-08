import 'dotenv/config';
import { signAccessToken } from './src/lib/jwt.js';
import { db } from './src/db/client.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
const [yo] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.username, 'psantos26'));
console.log(await signAccessToken({ sub: yo.id, username: yo.username }));
process.exit(0);
