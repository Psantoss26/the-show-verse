import { NextResponse } from "next/server";
import { PLEX_CLIENT_ID, PLEX_PRODUCT } from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Expone el identificador público de la app para que el navegador haga el flujo
// PIN con el MISMO clientIdentifier que usa el servidor para descubrir el servidor.
export async function GET() {
  return NextResponse.json({
    clientIdentifier: PLEX_CLIENT_ID,
    product: PLEX_PRODUCT,
  });
}
