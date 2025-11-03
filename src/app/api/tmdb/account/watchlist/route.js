// POST /api/tmdb/account/watchlist  { session_id, media_id, media_type:'movie'|'tv', watchlist:boolean }
const TMDB = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function getAccountId(session_id) {
  const url = new URL(`${TMDB}/account`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('session_id', session_id);
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.status_message || 'account error');
  return j.id;
}

export async function POST(req) {
  try {
    const { session_id, media_id, media_type = 'movie', watchlist } = await req.json();
    if (!session_id || !media_id) return Response.json({ error: 'missing fields' }, { status: 400 });

    const account_id = await getAccountId(session_id);
    const url = new URL(`${TMDB}/account/${account_id}/watchlist`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('session_id', session_id);

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_type, media_id, watchlist: !!watchlist }),
    });
    const j = await r.json();
    return Response.json(j, { status: r.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
