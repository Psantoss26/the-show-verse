// /src/app/api/tmdb/request-token/route.js
// Genera un request token de TMDb
import { tmdbGet, json } from '../utils';

export async function GET() {
  try {
    // https://developer.themoviedb.org/reference/authentication-create-request-token
    const data = await tmdbGet('/authentication/token/new');
    return json(data, 200);
  } catch (e) {
    return json({ error: e.message || 'Error creando request token' }, e.status || 500);
  }
}
