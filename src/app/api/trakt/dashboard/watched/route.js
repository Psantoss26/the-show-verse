import { NextResponse } from "next/server";
import { getTraktWatched } from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "weekly";

    const items = await getTraktWatched(period, 30);
    return NextResponse.json(items || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/watched:", err);
    return NextResponse.json([]);
  }
}
