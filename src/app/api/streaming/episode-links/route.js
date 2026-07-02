import { NextResponse } from "next/server";
import {
  backendFetchJson,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const tmdbId = Number(request.nextUrl.searchParams.get("tmdbId"));
  const season = Number(request.nextUrl.searchParams.get("season"));
  const episode = Number(request.nextUrl.searchParams.get("episode"));

  if (
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    !Number.isInteger(season) ||
    season <= 0 ||
    !Number.isInteger(episode) ||
    episode <= 0
  ) {
    return NextResponse.json(
      { error: "Missing or invalid tmdbId, season, or episode" },
      { status: 400 },
    );
  }

  let backend;
  try {
    backend = await backendFetchJson(
      request,
      `/v1/history/streaming-links/${tmdbId}/${season}/${episode}`,
    );
  } catch (error) {
    console.warn("Episode streaming links backend request failed:", error);
    return NextResponse.json(
      { error: "Unable to load episode streaming links" },
      { status: 502 },
    );
  }

  if (backend.ok) {
    const response = NextResponse.json({
      links: Array.isArray(backend.json?.links) ? backend.json.links : [],
    });
    setBackendAuthCookies(response, backend, {
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }

  if (backend.skipped || backend.status === 401 || backend.status === 404) {
    return NextResponse.json({ links: [] });
  }

  return NextResponse.json(
    { error: backend.error || "Unable to load episode streaming links" },
    { status: backend.status >= 400 ? backend.status : 502 },
  );
}
