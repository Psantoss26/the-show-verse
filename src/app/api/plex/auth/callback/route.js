import { NextResponse } from "next/server";
import {
  pollPlexPin,
  getRequestOrigin,
  setPlexTokenCookie,
  PLEX_PIN_COOKIE,
} from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeNext(p) {
  if (!p || typeof p !== "string" || !p.startsWith("/")) return "/profile/settings";
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(req) {
  const origin = getRequestOrigin(req);
  const secure = origin.startsWith("https://");

  let pin = null;
  try {
    pin = JSON.parse(req.cookies.get(PLEX_PIN_COOKIE)?.value || "null");
  } catch {
    pin = null;
  }

  const nextPath = sanitizeNext(pin?.next);

  const back = (status) => {
    const dest = new URL(nextPath, origin);
    dest.searchParams.set("plex", status);
    const res = NextResponse.redirect(dest);
    res.cookies.set(PLEX_PIN_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
    return res;
  };

  if (!pin?.id) return back("error");

  // Tras autorizar, el PIN ya debería traer authToken; reintentamos por si tarda.
  let token = null;
  for (let i = 0; i < 6 && !token; i += 1) {
    token = await pollPlexPin(pin.id, pin.code).catch(() => null);
    if (!token && i < 5) await sleep(600);
  }

  if (!token) return back("error");

  const res = back("connected");
  setPlexTokenCookie(res, token, { secure });
  return res;
}
