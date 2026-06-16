import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "the-show-verse",
    env: {
      tmdb: Boolean(process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY),
      traktClientId: Boolean(process.env.TRAKT_CLIENT_ID || process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID),
      traktClientSecret: Boolean(process.env.TRAKT_CLIENT_SECRET),
      plex: Boolean(process.env.PLEX_TOKEN),
      ai: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    timestamp: new Date().toISOString(),
  });
}
