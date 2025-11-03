// POST valora, DELETE elimina valoración de película
// POST body: { session_id, value }  // value: 0.5 .. 10 (pasos de 0.5)
const TMDB = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function POST(req, ctx) {
  try {
    const { id } = await ctx.params;
    const { session_id, value } = await req.json();
    if (!session_id || typeof value === 'undefined') {
      return Response.json({ error: 'missing fields' }, { status: 400 });
    }
    const v = Math.max(0.5, Math.min(10, Math.round((Number(value) + Number.EPSILON) * 2) / 2));

    const url = new URL(`${TMDB}/movie/${id}/rating`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('session_id', session_id);

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: v }),
    });
    const j = await r.json();
    return Response.json(j, { status: r.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req, ctx) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const session_id = searchParams.get('session_id');
    if (!session_id) return Response.json({ error: 'missing session_id' }, { status: 400 });

    const url = new URL(`${TMDB}/movie/${id}/rating`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('session_id', session_id);

    const r = await fetch(url, { method: 'DELETE' });
    const j = await r.json();
    return Response.json(j, { status: r.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
