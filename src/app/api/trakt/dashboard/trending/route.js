import { NextResponse } from "next/server";
import { getTraktTrending, removeDuplicates } from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTraktTrending(30);
    return NextResponse.json(removeDuplicates(items) || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/trending:", err);
    return NextResponse.json([]);
  }
}
