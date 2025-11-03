const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export async function createRequestToken() {
  const res = await fetch(`${BASE_URL}/authentication/token/new?api_key=${API_KEY}`);
  const data = await res.json();
  return data.request_token;
}

export async function validateWithLogin(username, password, request_token) {
  const res = await fetch(`${BASE_URL}/authentication/token/validate_with_login?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, request_token }),
  });
  const data = await res.json();
  return data.success ? data.request_token : null;
}

export async function createSession(validated_token) {
  const res = await fetch(`${BASE_URL}/authentication/session/new?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_token: validated_token }),
  });
  const data = await res.json();
  return data.session_id;
}

export async function getAccount(session_id) {
  const res = await fetch(`${BASE_URL}/account?api_key=${API_KEY}&session_id=${session_id}`);
  return await res.json();
}

export async function getUserAccount(sessionId) {
  const res = await fetch(`https://api.themoviedb.org/3/account?api_key=${API_KEY}&session_id=${sessionId}`);
  const data = await res.json();
  return data;
}
