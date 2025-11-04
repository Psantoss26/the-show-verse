import { cookies } from 'next/headers'

export async function GET() {
  const jar = cookies()
  const session_id = jar.get('tmdb_session_id')?.value || null
  if (!session_id) {
    return new Response(JSON.stringify({ session_id: null }), { status: 200 })
  }
  // opcional: podrías validar llamando a /account con session_id aquí
  return Response.json({ session_id })
}
