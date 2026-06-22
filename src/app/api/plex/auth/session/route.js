import { NextResponse } from "next/server";
import { getPlexAccount, setPlexTokenCookie } from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecure(req) {
  const proto = req.nextUrl?.protocol || req.headers.get("x-forwarded-proto") || "";
  return String(proto).startsWith("https");
}

// Recibe el authToken obtenido por el navegador (flujo PIN client-side) y, tras
// validarlo contra plex.tv, lo guarda en la cookie httpOnly del usuario.
export async function POST(req) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const account = await getPlexAccount(token);
  if (!account) {
    return NextResponse.json({ error: "Invalid Plex token" }, { status: 401 });
  }

  const res = NextResponse.json({ connected: true, account });
  setPlexTokenCookie(res, token, { secure: isSecure(req) });
  return res;
}
