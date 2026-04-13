import { NextResponse } from "next/server";
import { getTraktRecommended } from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTraktRecommended(30);
    return NextResponse.json(items || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/recommended:", err);
    return NextResponse.json([]);
  }
}
