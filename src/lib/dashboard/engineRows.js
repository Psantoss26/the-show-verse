import { getBackendBaseUrl } from "@/lib/backend/server";

const VALID_SURFACES = new Set(["home", "movies", "series"]);

export async function fetchAnonymousDashboardRows(surface, { timeoutMs = 1800 } = {}) {
  if (!VALID_SURFACES.has(surface)) return [];

  const base = getBackendBaseUrl();
  if (!base) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/v1/dashboard/${surface}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = await response.json().catch(() => null);
    return Array.isArray(json?.rows) ? json.rows : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
