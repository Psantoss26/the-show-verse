import { NextResponse } from "next/server";
import { getTraktScoreboardData } from "@/lib/trakt/scoreboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Vercel: aumentado para dar más margen en producción

export async function GET(req) {
  const cacheHeaders = {
    "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
  };

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const tmdbId = searchParams.get("tmdbId");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    const data = await getTraktScoreboardData({
      type,
      tmdbId,
      season,
      episode,
    });
    return NextResponse.json(data, { headers: cacheHeaders });
  } catch (e) {
    const isTimeout =
      e?.isTimeout ||
      e?.message?.includes("timeout") ||
      e?.name === "AbortError";
    const isRateLimit =
      e?.status === 429 || /rate limit/i.test(e?.message || "");
    const isMissingEnv = e?.message?.includes("TRAKT_CLIENT_ID");
    const isNotFound = e?.status === 404;
    const isServerError = e?.status >= 500 && e?.status < 600;

    // Log detallado del error para debugging
    console.error("❌ [Trakt Scoreboard] Error:", {
      message: e?.message,
      status: e?.status,
      path: e?.path,
      type: e?.name,
      isTimeout,
      isRateLimit,
      isMissingEnv,
      isNotFound,
      stack: e?.stack?.split("\n").slice(0, 3).join("\n"),
    });

    // Degradación graciosa: timeouts, rate limits, errores 500
    if (isTimeout || isRateLimit || isServerError) {
      console.warn(
        "⚠️ [Trakt Scoreboard] Unavailable (degradación graciosa):",
        e.message,
      );
      return NextResponse.json({ found: false });
    }

    // Variable de entorno faltante: error crítico
    if (isMissingEnv) {
      console.error(
        "❌ CRÍTICO: Variable de entorno TRAKT_CLIENT_ID no configurada en producción",
      );
      return NextResponse.json(
        {
          error: "Server configuration error",
          found: false,
        },
        { status: 500 },
      );
    }

    // 404: el contenido no existe en Trakt (normal)
    if (isNotFound) {
      console.log("ℹ️ [Trakt Scoreboard] Content not found in Trakt");
      return NextResponse.json({ found: false });
    }

    // Otros errores: devolver found=false para no romper la UI
    console.error("❌ [Trakt Scoreboard] Unexpected error:", e.message);
    return NextResponse.json({ found: false });
  }
}
