import { NextResponse } from "next/server";
import { ingestNetflixActivity } from "@/lib/netflix/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!syncToken) {
      return NextResponse.json(
        { error: "Netflix sync token is required" },
        { status: 401 },
      );
    }

    const { items } = await request.json().catch(() => ({}));
    const result = await ingestNetflixActivity(syncToken, items);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
