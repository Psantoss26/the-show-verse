// src/app/api/trakt/community/seasons/route.js
import { NextResponse } from "next/server";
import {
  resolveTraktIdFromTmdb,
  traktHeaders,
  safeTraktBody,
  buildTraktErrorMessage,
} from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get("tmdbId");
    const extended = searchParams.get("extended") || "full"; // full recomendado

    if (!tmdbId)
      return NextResponse.json({ error: "Falta tmdbId" }, { status: 400 });

    const { traktId } = await resolveTraktIdFromTmdb({ type: "show", tmdbId });
    const headers = await traktHeaders({ includeAuth: false });

    const url = `https://api.trakt.tv/shows/${traktId}/seasons?extended=${encodeURIComponent(extended)}`;

    // ✅ Añadir timeout de 5 segundos para evitar bloqueos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const { json, text } = await safeTraktBody(res);

    if (!res.ok) {
      const msg = buildTraktErrorMessage({
        res,
        json,
        text,
        fallback: "Error cargando temporadas",
      });
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    return NextResponse.json({ items: Array.isArray(json) ? json : [] });
  } catch (e) {
    // Timeout
    if (e?.name === "AbortError") {
      return NextResponse.json(
        { error: "Trakt request timeout" },
        { status: 504 },
      );
    }
    // 403 (rate limit / Cloudflare), 404 (no encontrado en Trakt) → vacío gracioso
    const isGraceful =
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 405 ||
      e?.isTimeout ||
      /no se encontró|not found/i.test(e?.message || "");
    if (isGraceful) {
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
