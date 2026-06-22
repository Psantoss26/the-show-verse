import { NextResponse } from "next/server";
import {
  getUserPlexToken,
  discoverUserPlexServer,
} from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve al NAVEGADOR del usuario su token de Plex + las conexiones de su
// servidor. Es necesario porque un servidor LOCAL (192.168.x.x) no es accesible
// desde el servidor (Vercel): solo el navegador, en la misma red, puede hablar
// con él vía las URLs *.plex.direct (HTTPS con certificado válido). Es el mismo
// modelo que la web oficial de Plex (el token del propio usuario en su navegador).
export async function GET(req) {
  const token = getUserPlexToken(req);
  if (!token) {
    return NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const server = await discoverUserPlexServer(token);

  return NextResponse.json(
    { connected: true, token, server },
    { headers: { "Cache-Control": "no-store" } },
  );
}
