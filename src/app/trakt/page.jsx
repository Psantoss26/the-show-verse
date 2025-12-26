'use client'

import { Anton } from 'next/font/google'
import TraktConnectButton from '@/components/trakt/TraktConnectButton'
import { useTraktAuth } from '@/lib/trakt/useTraktAuth'

const anton = Anton({ weight: '400', subsets: ['latin'] })

export default function TraktPage() {
    const { isConnected } = useTraktAuth()

    return (
        <div className="min-h-screen px-6 py-6 text-white bg-black">
            <div className="flex items-end justify-between gap-4">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text">
                    <span
                        className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}
                    >
                        TRAKT
                    </span>
                </h1>

                <div className="shrink-0">
                    <TraktConnectButton />
                </div>
            </div>

            <div className="mt-6 space-y-10">
                {!isConnected && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm text-white/80">
                            Conecta tu cuenta de Trakt para ver progreso, watchlist, historial y recomendaciones.
                        </p>
                    </div>
                )}

            </div>
        </div>
    )
}
