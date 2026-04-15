import { NextResponse } from "next/server";
import { getTraktPopular, removeDuplicates } from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTraktPopular(30);
    return NextResponse.json(removeDuplicates(items) || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/popular:", err);
    return NextResponse.json([]);
  }
}
