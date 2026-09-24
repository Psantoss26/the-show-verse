import { shareResponse } from "@/lib/share/shareRoute";

export const runtime = "nodejs";

// Vista previa de una TEMPORADA para rastreadores (ver lib/share/shareMeta.js).
export async function GET(_req, ctx) {
  const { id, season } = await ctx.params;
  return shareResponse(
    { kind: "season", id, season },
    `/details/tv/${encodeURIComponent(id)}/season/${encodeURIComponent(season)}`,
  );
}
