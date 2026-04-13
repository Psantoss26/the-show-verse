import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktRemoveHistoryEntries,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const cookieStore = req.cookies;
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json(
        { error: "No autorizado", code: "TRAKT_REAUTH_REQUIRED" },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x) => Number(x)).filter(Boolean)
      : [];

    if (!ids.length) {
      return NextResponse.json(
        { error: "ids debe ser un array con history ids" },
        { status: 400 },
      );
    }

    const data = await traktRemoveHistoryEntries(token, { ids });
    const res = NextResponse.json({ ok: true, data });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const status = Number(e?.status || 500);
    const needsReauth = status === 401 || status === 403;
    return NextResponse.json(
      {
        error: e?.message || "Error eliminando del historial",
        ...(needsReauth ? { code: "TRAKT_REAUTH_REQUIRED" } : {}),
      },
      { status },
    );
  }
}
