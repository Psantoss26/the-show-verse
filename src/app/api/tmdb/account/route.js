// Devuelve los datos de la cuenta de TMDb usando la session_id guardada en cookie
import { cookies } from 'next/headers';
import { tmdbGet, json } from '../utils';

const SESSION_COOKIE = 'tmdb_session_id';

export async function GET() {
  try {
    const store = await cookies();
    const sessionId = store.get(SESSION_COOKIE)?.value;

    if (!sessionId) {
      return json({ error: 'No hay sesión de TMDb' }, 401);
    }

    // https://developer.themoviedb.org/reference/account-details
    const account = await tmdbGet(`/account?session_id=${encodeURIComponent(sessionId)}`);
    return json(account, 200);
  } catch (e) {
    return json({ error: e.message || 'Error obteniendo la cuenta' }, e.status || 500);
  }
}
