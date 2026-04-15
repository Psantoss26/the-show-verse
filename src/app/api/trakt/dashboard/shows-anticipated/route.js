import { NextResponse } from "next/server";
import {
  getTraktShowsAnticipated,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTraktShowsAnticipated(30);
    return NextResponse.json(removeDuplicates(items) || []);
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/shows-anticipated:", err);
    return NextResponse.json([]);
  }
}
