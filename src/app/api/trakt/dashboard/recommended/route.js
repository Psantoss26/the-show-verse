import { NextResponse } from "next/server";
import { getTraktRecommended } from "@/lib/api/traktHelpers";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
} from "@/lib/trakt/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(
      request.cookies,
    ).catch(() => ({ token: null, refreshedTokens: null, shouldClear: false }));
    const items = await getTraktRecommended(30, "weekly", { token });
    const res = NextResponse.json(items || []);
    if (shouldClear) clearTraktCookies(res);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/recommended:", err);
    return NextResponse.json([]);
  }
}
