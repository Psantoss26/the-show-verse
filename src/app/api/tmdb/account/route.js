import { tmdbGet, json } from '../_utils';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const session_id = searchParams.get('session_id');
    if (!session_id) return json({ error: 'session_id requerido' }, 400);

    const acc = await tmdbGet(`/account?session_id=${encodeURIComponent(session_id)}`);
    // { id, username, name, ... }
    return json(acc);
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}
