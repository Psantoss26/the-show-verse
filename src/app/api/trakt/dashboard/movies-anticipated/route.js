import { NextResponse } from "next/server";
import {
  getTraktMoviesAnticipated,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTraktMoviesAnticipated(30);
    return NextResponse.json(removeDuplicates(items) || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/movies-anticipated:", err);
    return NextResponse.json([]);
  }
}
