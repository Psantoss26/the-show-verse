import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let backendReady = false;
  try {
    const base = getBackendBaseUrl();
    if (base) {
      const response = await fetch(`${base}/ready`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      backendReady = response.ok;
    }
  } catch { /* NAS/backend is unavailable */ }
  return NextResponse.json({
    ok: backendReady,
    service: "the-show-verse",
    env: {
      tmdb: Boolean(process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY),
      traktClientId: Boolean(process.env.TRAKT_CLIENT_ID || process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID),
      traktClientSecret: Boolean(process.env.TRAKT_CLIENT_SECRET),
      plex: Boolean(process.env.PLEX_TOKEN),
      ai: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    timestamp: new Date().toISOString(),
  }, { status: backendReady ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
