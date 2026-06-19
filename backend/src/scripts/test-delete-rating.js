import '../config/load-env.js';
import { db, closeDb } from '../db/client.js';
import { userRatings } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

function ratingIdentity(userId, tmdbId, mediaType, season, episode) {
  const conditions = [
    eq(userRatings.userId, userId),
    eq(userRatings.tmdbId, tmdbId),
    eq(userRatings.mediaType, mediaType),
  ];

  if (season === undefined || season === null) conditions.push(isNull(userRatings.season));
  else conditions.push(eq(userRatings.season, Number(season)));

  if (episode === undefined || episode === null) conditions.push(isNull(userRatings.episode));
  else conditions.push(eq(userRatings.episode, Number(episode)));

  return and(...conditions);
}

async function main() {
  try {
    const userId = 'a873fe86-c872-4dd4-a4e6-60582f2aa370';
    const tmdbId = 1399; // Juego de tronos
    const mediaType = 'tv';

    const deleted = await db
      .delete(userRatings)
      .where(ratingIdentity(userId, tmdbId, mediaType, undefined, undefined))
      .returning();
    
    console.log('Successfully deleted rating:', deleted);
  } catch (err) {
    console.error('Error deleting rating:', err);
  } finally {
    await closeDb();
  }
}

main();
