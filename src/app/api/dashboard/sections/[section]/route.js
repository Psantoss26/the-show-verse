import { NextResponse } from "next/server";
import {
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import { getValidTraktToken } from "@/lib/trakt/server";
import { loadSectionItems, SECTION_CONFIG } from "@/lib/dashboard/sectionItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const { section } = await params;
  const config = SECTION_CONFIG[section];
  let backendResult = null;

  if (!config) {
    return NextResponse.json(
      { error: "Sección no encontrada", items: [] },
      { status: 404 },
    );
  }

  try {
    const { token: traktToken } = await getValidTraktToken(
      request.cookies,
    ).catch(() => ({ token: null }));
    const items = await loadSectionItems(section, {
      traktToken,
      request,
      onBackendResult: (result) => {
        if (result?.refreshedTokens) backendResult = result;
      },
    });
    const response = NextResponse.json({
      section,
      ...config,
      items,
    });
    setBackendAuthCookies(response, backendResult, {
      secure: getCookieSecure(request),
    });
    return response;
  } catch (err) {
    console.error(`Error cargando sección ${section}:`, err);
    const response = NextResponse.json(
      {
        section,
        ...config,
        items: [],
        error: "No se pudo cargar la sección.",
      },
      { status: 200 },
    );
    setBackendAuthCookies(response, backendResult, {
      secure: getCookieSecure(request),
    });
    return response;
  }
}
