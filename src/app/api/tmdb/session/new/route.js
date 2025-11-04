import { tmdbPost, json } from '../../utils';

export async function POST(req) {
  try {
    const { request_token } = await req.json();
    if (!request_token) return json({ error: 'request_token requerido' }, 400);

    const data = await tmdbPost('/authentication/session/new', { request_token }); // { success, session_id }
    return json({ session_id: data.session_id });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}
