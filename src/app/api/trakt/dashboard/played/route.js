import { NextResponse } from "next/server";
import { getTraktPlayed } from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

function parseLimit(searchParams, fallback = 18) {
  const limit = Number(searchParams.get("limit") || fallback);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 30) : fallback;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "weekly";

    const items = await getTraktPlayed(period, parseLimit(searchParams));
    return NextResponse.json(items || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/played:", err);
    return NextResponse.json([]);
  }
}
