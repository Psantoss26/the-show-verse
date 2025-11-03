import { tmdbGet, json } from '../_utils';

export async function GET() {
  try {
    const data = await tmdbGet('/authentication/token/new'); // { success, request_token, ... }
    return json({ request_token: data.request_token });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}
