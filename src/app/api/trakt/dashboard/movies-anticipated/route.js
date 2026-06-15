import { NextResponse } from "next/server";
import {
  getTraktMoviesAnticipated,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

function parseLimit(request, fallback = 18) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || fallback);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 30) : fallback;
}

export async function GET(request) {
  try {
    const items = await getTraktMoviesAnticipated(parseLimit(request));
    return NextResponse.json(removeDuplicates(items) || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/movies-anticipated:", err);
    return NextResponse.json([]);
  }
}
