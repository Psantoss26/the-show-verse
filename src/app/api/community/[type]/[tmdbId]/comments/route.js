// src/app/api/community/[type]/[tmdbId]/comments/route.js
import { NextResponse } from "next/server";
import {
  backendFetchJson, hasBackendCredentials, setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

async function anon(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

function pathFrom(params, search) {
  const qs = search ? `?${search}` : "";
  return `/v1/community/${params.type}/${params.tmdbId}/comments${qs}`;
}

export async function GET(request, { params }) {
  const p = await params;
  const search = request.nextUrl.search.replace(/^\?/, "");
  // Public read: use authed fetch when possible (native comments attributed), else anon.
  if (hasBackendCredentials(request)) {
    const backend = await backendFetchJson(request, pathFrom(p, search));
    if (backend.ok) {
      const res = NextResponse.json(backend.json);
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      return res;
    }
  }
  return anon(pathFrom(p, search));
}

async function authWrite(request, params, method) {
  const p = await params;
  const body = method === "DELETE" ? undefined : JSON.stringify(await request.json().catch(() => ({})));
  const idPart = new URL(request.url).searchParams.get("id");
  const path = `/v1/community/${p.type}/${p.tmdbId}/comments${idPart ? `/${idPart}` : ""}`;
  const backend = await backendFetchJson(request, path, {
    method, ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}),
  });
  const res = NextResponse.json(backend.json || {}, { status: backend.status || (backend.ok ? 200 : 500) });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

export const POST = (request, ctx) => authWrite(request, ctx.params, "POST");
export const PATCH = (request, ctx) => authWrite(request, ctx.params, "PATCH");
export const DELETE = (request, ctx) => authWrite(request, ctx.params, "DELETE");
