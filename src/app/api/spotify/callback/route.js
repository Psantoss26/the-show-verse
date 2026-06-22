import { NextResponse } from "next/server";
import {
  exchangeSpotifyCode,
  resolveSpotifyRedirectUri,
  setSpotifyCookies,
  getRequestOrigin,
} from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeState(s) {
  try {
    const o = JSON.parse(Buffer.from(String(s), "base64url").toString("utf8"));
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function sanitizeNext(p) {
  if (!p || typeof p !== "string" || !p.startsWith("/")) return "/profile/settings";
  return p;
}

export async function GET(req) {
  const url = new URL(req.url);
  // Origin REAL (header Host): host donde se ejecuta este callback.
  const origin = getRequestOrigin(req);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const stateParam = url.searchParams.get("state");
  const decoded = decodeState(stateParam);
  const appHost =
    decoded?.h && /^https?:\/\//i.test(decoded.h)
      ? String(decoded.h).replace(/\/+$/, "")
      : null;

  // ── Puente de host ──
  // Spotify solo permite 127.0.0.1 como redirect_uri (no localhost), así que este
  // callback puede entregarse en 127.0.0.1 aunque la app (y tu sesión) viva en
  // localhost. Si el host actual no es el de la app, reenviamos al host de la app
  // para hacer ahí el intercambio y guardar las cookies junto a la sesión.
  if (appHost && appHost !== origin) {
    const forward = new URL("/api/spotify/callback", appHost);
    if (code) forward.searchParams.set("code", code);
    if (stateParam) forward.searchParams.set("state", stateParam);
    if (oauthError) forward.searchParams.set("error", oauthError);
    return NextResponse.redirect(forward);
  }

  // A partir de aquí estamos en el host de la app (donde están la sesión y el
  // nonce del OAuth).
  const nextPath = sanitizeNext(decoded?.p);
  const storedNonce = req.cookies.get("spotify_oauth_state")?.value || null;
  const secure = origin.startsWith("https://");

  const back = (status) => {
    const dest = new URL(nextPath, origin);
    dest.searchParams.set("spotify", status);
    const res = NextResponse.redirect(dest);
    const clear = { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 };
    res.cookies.set("spotify_oauth_state", "", clear);
    res.cookies.set("spotify_oauth_redirect_uri", "", clear);
    return res;
  };

  if (oauthError || !code) return back("error");
  if (decoded?.n && storedNonce && decoded.n !== storedNonce) return back("error");

  // redirect_uri del intercambio = el MISMO enviado a /authorize (el registrado,
  // p. ej. 127.0.0.1). resolveSpotifyRedirectUri devuelve SPOTIFY_REDIRECT_URI.
  const redirectUri = resolveSpotifyRedirectUri(origin);

  try {
    const tokens = await exchangeSpotifyCode({ code, redirectUri });
    const res = back("connected");
    setSpotifyCookies(res, tokens, { secure });
    return res;
  } catch (e) {
    console.error("[Spotify] token exchange failed:", e?.message);
    return back("error");
  }
}
