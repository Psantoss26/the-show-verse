// src/lib/api/auth.js
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function createRequestToken() {
  const res = await fetch(
    `${BASE_URL}/authentication/token/new?api_key=${API_KEY}`
  )
  const data = await res.json()

  if (!res.ok || !data.success) {
    console.error('Error creando request token TMDb:', data)
    throw new Error(data.status_message || 'No se pudo crear request_token')
  }

  return data.request_token
}

export async function validateWithLogin(username, password, request_token) {
  const res = await fetch(
    `${BASE_URL}/authentication/token/validate_with_login?api_key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, request_token }),
    }
  )
  const data = await res.json()
  return data.success ? data.request_token : null
}

export async function createSession(request_token) {
  const res = await fetch(
    `${BASE_URL}/authentication/session/new?api_key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_token }),
    }
  )
  const data = await res.json()

  if (!res.ok || !data.success) {
    console.error('Error creando session TMDb:', data)
    throw new Error(data.status_message || 'No se pudo crear session_id')
  }

  return data.session_id
}

export async function getAccount(session_id) {
  const res = await fetch(
    `${BASE_URL}/account?api_key=${API_KEY}&session_id=${session_id}`
  )
  const data = await res.json()

  if (!res.ok) {
    console.error('Error obteniendo cuenta TMDb:', data)
    throw new Error(data.status_message || 'No se pudo obtener la cuenta')
  }

  return data
}

export async function getUserAccount(sessionId) {
  const res = await fetch(
    `${BASE_URL}/account?api_key=${API_KEY}&session_id=${sessionId}`
  )
  const data = await res.json()
  return data
}

export function getCookie(name) {
  if (typeof document === 'undefined') return null
  const cookieStr = document.cookie || ''
  const parts = cookieStr.split('; ').filter(Boolean)
  const found = parts.find((c) => c.startsWith(name + '='))
  if (!found) return null
  return decodeURIComponent(found.split('=').slice(1).join('='))
}
