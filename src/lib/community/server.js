// Server-only helper: fetch the combined community summary for a title.
// Used for SSR on the details page. Fails soft (returns null) so a slow or
// unavailable backend never blocks the details page render.

const BASE =
  process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function fetchCommunitySummary({ type, id }) {
  if (!BASE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200); // short SSR budget
  try {
    const res = await fetch(`${BASE}/v1/community/${type}/${id}/summary`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
