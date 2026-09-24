import { shareResponse } from "@/lib/share/shareRoute";

export const runtime = "nodejs";

// Vista previa de una SERIE para rastreadores (ver lib/share/shareMeta.js).
export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  return shareResponse({ kind: "tv", id }, `/details/tv/${encodeURIComponent(id)}`);
}
