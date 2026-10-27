// Server-only helper: fetch the combined community summary for a title.
// Used for SSR on the details page. Fails soft (returns null) so a slow or
// unavailable backend never blocks the details page render.

import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/backend/server";

const BASE =
  process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function fetchCommunitySummary({ type, id }) {
  if (!BASE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200); // short SSR budget
  try {
    // IP del visitante (ver clientIpFromHeaders): el render del servidor
    // cuenta en SU límite de peticiones, no en uno común para todos.
    const ip = clientIpFromHeaders(await headers().catch(() => null));
    const res = await fetch(`${BASE}/v1/community/${type}/${id}/summary`, {
      cache: "no-store",
      signal: controller.signal,
      headers: ip ? { "X-Forwarded-For": ip } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Solo las imágenes más votadas (para las rutas de ficha que no piden el
// resumen completo). `null` = no se sabe; `{}` = ningún voto todavía.
export async function fetchCommunityArtwork({ type, id }) {
  if (!BASE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const ip = clientIpFromHeaders(await headers().catch(() => null));
    const res = await fetch(`${BASE}/v1/community/${type}/${id}/artwork`, {
      cache: "no-store",
      signal: controller.signal,
      headers: ip ? { "X-Forwarded-For": ip } : {},
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.artwork && typeof json.artwork === "object" ? json.artwork : {};
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
