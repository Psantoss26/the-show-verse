import { z } from 'zod';

const addHistorySchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  watchedAt: z.string().datetime().optional(),
  runtimeMins: z.number().int().positive().optional(),
  title: z.string().optional(),
  posterPath: z.string().optional(),
});

const payloads = [
  // Payload 1: Basic movie watch (e.g. Benjamin Button)
  {
    tmdbId: 49013,
    mediaType: "movie",
    watchedAt: new Date().toISOString(),
    title: "El curioso caso de Benjamin Button",
    posterPath: "/something.jpg"
  },
  // Payload 2: Movie watch with posterPath = null/undefined/empty
  {
    tmdbId: 49013,
    mediaType: "movie",
    watchedAt: new Date().toISOString(),
    title: "El curioso caso de Benjamin Button"
  },
  // Payload 3: Movie watch with string tmdbId
  {
    tmdbId: "49013",
    mediaType: "movie",
    watchedAt: new Date().toISOString(),
  }
];

payloads.forEach((payload, index) => {
  const parsed = addHistorySchema.safeParse(payload);
  console.log(`Payload ${index + 1}:`, parsed.success ? "Success" : "Failed", parsed.success ? "" : parsed.error.issues);
});
