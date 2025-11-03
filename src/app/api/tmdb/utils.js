// Helpers comunes para hablar con TMDb desde el servidor (App Router)
export const TMDB_BASE = 'https://api.themoviedb.org/3';

export function withKey(pathOrUrl) {
  const key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${TMDB_BASE}${pathOrUrl}`;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api_key=${key}`;
}

export async function tmdbGet(path) {
  const r = await fetch(withKey(path), { cache: 'no-store' });
  if (!r.ok) throw await errorFrom(r);
  return r.json();
}

export async function tmdbPost(path, body) {
  const r = await fetch(withKey(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=utf-8' },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw await errorFrom(r);
  return r.json();
}

export async function tmdbDelete(path) {
  const r = await fetch(withKey(path), { method: 'DELETE' });
  if (!r.ok) throw await errorFrom(r);
  return r.json();
}

async function errorFrom(res) {
  const txt = await res.text().catch(() => '');
  let msg = `TMDb ${res.status}`;
  try {
    const j = JSON.parse(txt);
    msg = j.status_message || msg;
  } catch {}
  const e = new Error(msg);
  e.status = res.status;
  return e;
}

export function json(data, init = 200) {
  return new Response(JSON.stringify(data), {
    status: typeof init === 'number' ? init : init?.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
