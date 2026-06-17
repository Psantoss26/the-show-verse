// src/app/api/trakt/community/comments/route.js
import { NextResponse } from "next/server";
import {
  resolveTraktIdFromTmdb,
  traktHeaders,
  readPaginationHeaders,
  safeTraktBody,
  buildTraktErrorMessage,
} from "../_utils";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "").toLowerCase(); // movie | show
    const tmdbId = searchParams.get("tmdbId");
    const sort = (searchParams.get("sort") || "likes").toLowerCase(); // likes | newest | oldest | replies
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "20";

    if (!tmdbId)
      return NextResponse.json({ error: "Falta tmdbId" }, { status: 400 });
    if (type !== "movie" && type !== "show")
      return NextResponse.json(
        { error: "type debe ser movie o show" },
        { status: 400 },
      );

    const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId });

    const headers = await traktHeaders({ includeAuth: false });
    const base = type === "movie" ? "movies" : "shows";
    const url = `https://api.trakt.tv/${base}/${traktId}/comments/${sort}?page=${encodeURIComponent(
      page,
    )}&limit=${encodeURIComponent(limit)}`;

    const res = await fetch(url, { headers, cache: "no-store" });
    const { json, text } = await safeTraktBody(res);

    if (!res.ok) {
      const msg = buildTraktErrorMessage({
        res,
        json,
        text,
        fallback: "Error cargando comentarios",
      });
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const pg = readPaginationHeaders(res);
    return NextResponse.json({
      items: Array.isArray(json) ? json : [],
      pagination: pg,
    });
  } catch (e) {
    const isExpected =
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 429 ||
      /rate limit|timeout|no se encontr|forbidden/i.test(e?.message || "");
    if (!isExpected) console.warn("Trakt comments error:", e?.message);
    return NextResponse.json({
      items: [],
      pagination: { itemCount: 0, pageCount: 0, page: 1, limit: 20 },
    });
  }
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const { type, tmdbId, comment, spoiler } = payload || {};

    if (!type || !tmdbId || !comment) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (type, tmdbId, comment)" },
        { status: 400 },
      );
    }
    if (type !== "movie" && type !== "show") {
      return NextResponse.json(
        { error: "type debe ser movie o show" },
        { status: 400 },
      );
    }

    const cookieStore = req.cookies;
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json(
        { error: "No conectado a Trakt" },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId });
    if (!traktId) {
      return NextResponse.json(
        { error: "No se pudo resolver el ID de Trakt para este título" },
        { status: 404 },
      );
    }

    const traktBody = {
      comment,
      spoiler: !!spoiler,
      [type]: {
        ids: {
          trakt: Number(traktId),
        },
      },
    };

    const response = await traktFetch("/comments", {
      token,
      method: "POST",
      body: traktBody,
    });

    if (!response.ok) {
      const errMsg =
        response.json?.error ||
        response.json?.message ||
        "Error al publicar el comentario en Trakt";
      return NextResponse.json({ error: errMsg }, { status: response.status });
    }

    const res = NextResponse.json(response.json);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    console.error("Error al publicar comentario en Trakt:", e);
    return NextResponse.json(
      { error: e?.message || "Error interno al procesar el comentario" },
      { status: 500 },
    );
  }
}

export async function PUT(req) {
  try {
    const payload = await req.json().catch(() => null);
    const { commentId, comment, spoiler } = payload || {};

    if (!commentId || !comment) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (commentId, comment)" },
        { status: 400 },
      );
    }

    const cookieStore = req.cookies;
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json(
        { error: "No conectado a Trakt" },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const traktBody = {
      comment,
      spoiler: !!spoiler,
    };

    const response = await traktFetch(`/comments/${commentId}`, {
      token,
      method: "PUT",
      body: traktBody,
    });

    if (!response.ok) {
      const errMsg =
        response.json?.error ||
        response.json?.message ||
        "Error al actualizar el comentario en Trakt";
      return NextResponse.json({ error: errMsg }, { status: response.status });
    }

    const res = NextResponse.json(response.json);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    console.error("Error al actualizar comentario en Trakt:", e);
    return NextResponse.json(
      { error: e?.message || "Error interno al actualizar el comentario" },
      { status: 500 },
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json(
        { error: "Falta el parámetro commentId" },
        { status: 400 },
      );
    }

    const cookieStore = req.cookies;
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json(
        { error: "No conectado a Trakt" },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const response = await traktFetch(`/comments/${commentId}`, {
      token,
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      const errMsg =
        response.json?.error ||
        response.json?.message ||
        "Error al eliminar el comentario en Trakt";
      return NextResponse.json({ error: errMsg }, { status: response.status });
    }

    const res = NextResponse.json({ success: true });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    console.error("Error al eliminar comentario en Trakt:", e);
    return NextResponse.json(
      { error: e?.message || "Error interno al eliminar el comentario" },
      { status: 500 },
    );
  }
}

