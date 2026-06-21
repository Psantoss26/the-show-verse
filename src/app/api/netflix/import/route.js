import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import { normalizeText, resolveNetflixItems } from "@/lib/netflix/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => normalizeText(value));
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index]?.trim() || "";
    });
    return item;
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.text !== "function") {
      return NextResponse.json({ error: "Selecciona el CSV de actividad de Netflix." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      return NextResponse.json({ error: "El CSV no contiene actividad válida." }, { status: 400 });
    }

    const { resolved, skipped, limited } = await resolveNetflixItems(rows);
    if (!resolved.length) {
      return NextResponse.json(
        {
          error: "No se pudo resolver ningún título del CSV con TMDb.",
          fetched: rows.length,
          skipped,
          limited,
        },
        { status: 422 },
      );
    }

    const backend = await backendFetchJson(request, "/v1/import/netflix/data/chunk", {
      method: "POST",
      body: JSON.stringify({ history: resolved }),
    });

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo importar la actividad de Netflix." },
        { status: backend.status || 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      provider: "netflix",
      fetched: rows.length,
      resolved: resolved.length,
      skipped: skipped.length,
      limited,
      import: backend.json,
      skippedSamples: skipped.slice(0, 10),
    });

    setBackendAuthCookies(response, backend, {
      secure: getCookieSecure(request),
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo importar Netflix." },
      { status: 500 },
    );
  }
}
