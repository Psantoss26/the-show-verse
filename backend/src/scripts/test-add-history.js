import 'dotenv/config';
import { db, closeDb } from '../db/client.js';
import { watchHistory } from '../db/schema.js';

async function main() {
  try {
    const [item] = await db
      .insert(watchHistory)
      .values({
        userId: 'a873fe86-c872-4dd4-a4e6-60582f2aa370', // Use the user ID from our list-ratings output
        tmdbId: 550, // Fight Club tmdb ID
        mediaType: 'movie',
        season: null,
        episode: null,
        watchedAt: new Date(),
        title: 'Fight Club',
        posterPath: '/adw66345.jpg',
      })
      .returning();
    console.log('Successfully inserted movie watch history entry:', item);
  } catch (err) {
    console.error('Error inserting rating:', err);
  } finally {
    await closeDb();
  }
}

main();
