// src/app/api/trakt/item/watched/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  normalizeWatchedAt,
  traktAddToHistory,
  traktRemoveFromHistory,
} from "@/lib/trakt/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request) {
    const cookieStore = request.cookies;
    let token = null;
    let refreshedTokens = null;
    let shouldClear = false;

    let payload = null;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const type = payload?.type;
    const tmdbId = payload?.tmdbId;
    const watched = !!payload?.watched;
    const watchedAt = payload?.watchedAt || null;

    if (type !== "movie" && type !== "show") {
      return NextResponse.json(
        { error: "Invalid type. Use movie|show." },
        { status: 400 },
      );
    }
    if (!tmdbId) {
      return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
    }

    if (type === "movie") {
      try {
        if (watched) {
          const backend = await backendFetchJson(request, "/v1/history", {
            method: "POST",
            body: JSON.stringify({
              tmdbId: Number(tmdbId),
              mediaType: "movie",
              watchedAt: watchedAt ? normalizeWatchedAt(watchedAt) : undefined,
              title: payload?.title,
              posterPath: payload?.posterPath,
            }),
          });

          if (backend.ok) {
            const res = NextResponse.json({
              ok: true,
              watched: true,
              lastWatchedAt: backend.json?.item?.watchedAt || null,
              source: "backend",
            });
            setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
            return res;
          }
          if (!backend.skipped && backend.status !== 401) {
            console.warn("Backend movie watched failed; falling back to Trakt", backend.error);
          }
        } else {
          const current = await backendFetchJson(
            request,
            `/v1/history/movies/${encodeURIComponent(tmdbId)}`,
          );
          if (current.ok) {
            const ids = Array.isArray(current.json?.history)
              ? current.json.history.map((entry) => entry.id).filter(Boolean)
              : [];

            if (ids.length > 0) {
              const removed = await backendFetchJson(request, "/v1/history/bulk", {
                method: "DELETE",
                body: JSON.stringify({ ids }),
              });
              if (!removed.ok) {
                throw new Error(removed.error || "Backend history bulk delete failed");
              }
            }

            const res = NextResponse.json({
              ok: true,
              watched: false,
              lastWatchedAt: null,
              source: "backend",
            });
            setBackendAuthCookies(res, current, { secure: request.nextUrl.protocol === "https:" });
            return res;
          }
          if (!current.skipped && current.status !== 401 && current.status !== 404) {
            console.warn("Backend movie history lookup failed; falling back to Trakt", current.error);
          }
        }
      } catch (e) {
        console.warn("Backend movie watched failed; falling back to Trakt", e);
      }
    }

    try {
      const t = await getValidTraktToken(cookieStore);
      token = t.token;
      refreshedTokens = t.refreshedTokens;
      shouldClear = t.shouldClear;

      if (!token) {
        const res = NextResponse.json(
          { error: "Not connected to Trakt" },
          { status: 401 },
        );
        if (shouldClear) clearTraktCookies(res);
        return res;
      }

      if (watched) {
        const watchedAtIso = normalizeWatchedAt(watchedAt);
        await traktAddToHistory(token, { type, tmdbId, watchedAtIso });

        const res = NextResponse.json({
          ok: true,
          watched: true,
          lastWatchedAt: watchedAtIso,
        });
        if (refreshedTokens) setTraktCookies(res, refreshedTokens);
        return res;
      }

      await traktRemoveFromHistory(token, { type, tmdbId });

      const res = NextResponse.json({
        ok: true,
        watched: false,
        lastWatchedAt: null,
      });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    } catch (e) {
      const res = NextResponse.json(
        { ok: false, error: e?.message || "Trakt watched failed" },
        { status: 500 },
      );
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }
}
