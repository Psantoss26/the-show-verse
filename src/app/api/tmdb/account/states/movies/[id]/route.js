// GET /api/tmdb/account/states/movies/:id?session_id=...
const TMDB = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params; // Next 15 pide await en params
    const { searchParams } = new URL(req.url);
    const session_id = searchParams.get('session_id');
    if (!session_id) return Response.json({ error: 'missing session_id' }, { status: 400 });

    const url = new URL(`${TMDB}/movie/${id}/account_states`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('session_id', session_id);

    const r = await fetch(url, { next: { revalidate: 60 } });
    const data = await r.json();
    if (!r.ok) return Response.json(data, { status: r.status });

    return Response.json({
      favorite: !!data.favorite,
      watchlist: !!data.watchlist,
      rated: typeof data.rated === 'object' ? data.rated.value : null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
