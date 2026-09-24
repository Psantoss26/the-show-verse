import { shareResponse } from "@/lib/share/shareRoute";

export const runtime = "nodejs";

// Vista previa de una PELÍCULA para rastreadores (ver lib/share/shareMeta.js).
export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  return shareResponse({ kind: "movie", id }, `/details/movie/${encodeURIComponent(id)}`);
}
