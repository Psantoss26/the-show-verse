// /src/app/lists/trakt/[username]/[listId]/page.jsx
'use client'

import { useParams } from 'next/navigation'
import TraktListDetailsClient from '@/components/lists/TraktListDetailsClient'

export default function TraktListDetailsPage() {
    const params = useParams()

    const usernameRaw = params?.username
    const listIdRaw = params?.listId

    const username = Array.isArray(usernameRaw) ? usernameRaw[0] : usernameRaw
    const listId = Array.isArray(listIdRaw) ? listIdRaw[0] : listIdRaw

    if (!username || !listId) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100 flex items-center justify-center p-6">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-300 max-w-md w-full">
                    <p className="font-bold text-red-300">Error</p>
                    <p className="mt-2 text-sm text-zinc-400">Missing params</p>
                </div>
            </div>
        )
    }

    return (
        <TraktListDetailsClient
            username={decodeURIComponent(String(username))}
            listId={decodeURIComponent(String(listId))}
        />
    )
}
