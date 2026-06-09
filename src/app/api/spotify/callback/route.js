import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

function html(body) {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Spotify conectado</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.5;background:#111;color:#f5f5f5}code,textarea{font-family:ui-monospace,monospace}textarea{width:100%;min-height:120px;background:#050505;color:#dcfce7;border:1px solid #333;border-radius:8px;padding:12px}a{color:#86efac}</style></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const storedState = req.cookies.get("spotify_oauth_state")?.value;

  if (error) {
    return html(`<h1>Spotify no autorizó la conexión</h1><p>${error}</p>`);
  }

  if (!code) {
    return html(
      "<h1>Callback de Spotify disponible</h1><p>Abre <a href=\"/api/spotify/login\">/api/spotify/login</a> para generar el refresh token.</p>",
    );
  }

  if (storedState && state !== storedState) {
    return html("<h1>Estado OAuth inválido</h1><p>Vuelve a iniciar la conexión.</p>");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    `${url.protocol}//${url.host}/api/spotify/callback`;

  if (!clientId || !clientSecret) {
    return html("<h1>Faltan credenciales</h1><p>Configura SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET.</p>");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !payload?.refresh_token) {
    return html(
      `<h1>No se pudo obtener refresh token</h1><pre>${JSON.stringify(payload, null, 2)}</pre>`,
    );
  }

  const response = html(
    `<h1>Spotify conectado</h1><p>Añade esta variable a tu <code>.env</code> local y reinicia Next:</p><textarea readonly>SPOTIFY_REFRESH_TOKEN=${payload.refresh_token}</textarea><p>Despues prueba <code>/api/soundtrack?title=The%20Bear&type=tv&year=2022&country=ES</code>.</p>`,
  );
  response.cookies.delete("spotify_oauth_state");
  return response;
}
