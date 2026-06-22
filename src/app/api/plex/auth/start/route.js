import { NextResponse } from "next/server";
import {
  createPlexPin,
  buildPlexAuthUrl,
  getRequestOrigin,
  PLEX_PIN_COOKIE,
} from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeNext(p) {
  if (!p || typeof p !== "string" || !p.startsWith("/")) return "/profile/settings";
  return p;
}

export async function GET(req) {
  const origin = getRequestOrigin(req);
  const nextPath = sanitizeNext(req.nextUrl?.searchParams?.get("next"));
  const secure = origin.startsWith("https://");

  try {
    const { id, code } = await createPlexPin();
    const forwardUrl = `${origin}/api/plex/auth/callback`;
    const authUrl = buildPlexAuthUrl({ code, forwardUrl });

    const res = NextResponse.redirect(authUrl);
    // Guardamos el PIN (id+code) y el destino para el callback.
    res.cookies.set(PLEX_PIN_COOKIE, JSON.stringify({ id, code, next: nextPath }), {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 10,
    });
    return res;
  } catch (e) {
    console.error("[Plex] createPin failed:", e?.message);
    const dest = new URL(nextPath, origin);
    dest.searchParams.set("plex", "error");
    return NextResponse.redirect(dest);
  }
}
