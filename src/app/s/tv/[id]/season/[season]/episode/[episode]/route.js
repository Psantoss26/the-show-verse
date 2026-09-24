import { shareResponse } from "@/lib/share/shareRoute";

export const runtime = "nodejs";

// Vista previa de un EPISODIO para rastreadores (ver lib/share/shareMeta.js).
export async function GET(_req, ctx) {
  const { id, season, episode } = await ctx.params;
  return shareResponse(
    { kind: "episode", id, season, episode },
    `/details/tv/${encodeURIComponent(id)}/season/${encodeURIComponent(season)}/episode/${encodeURIComponent(episode)}`,
  );
}
