'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react'

export default function TraktDiagnosticPage() {
    const [tmdbId, setTmdbId] = useState('550') // Fight Club por defecto
    const [type, setType] = useState('movie')
    const [watchedAt, setWatchedAt] = useState(new Date().toISOString().slice(0, 10))
    
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    
    const [history, setHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)

    const addWatch = async () => {
        setLoading(true)
        setError(null)
        setResult(null)
        
        try {
            const res = await fetch('/api/trakt/item/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    op: 'add',
                    type,
                    tmdbId: Number(tmdbId),
                    watchedAt
                })
            })
            
            const data = await res.json()
            
            if (!res.ok) {
                setError({
                    status: res.status,
                    message: data.error || 'Error desconocido',
                    code: data.code,
                    data
                })
            } else {
                setResult(data)
                // Recargar historial
                loadHistory()
            }
        } catch (e) {
            setError({
                status: 'network',
                message: e.message,
                stack: e.stack
            })
        } finally {
            setLoading(false)
        }
    }

    const loadHistory = async () => {
        setHistoryLoading(true)
        try {
            const res = await fetch(`/api/trakt/item/status?type=${type}&tmdbId=${tmdbId}`)
            const data = await res.json()
            
            if (res.ok && data.history) {
                setHistory(data.history)
            }
        } catch (e) {
            console.error('Error cargando historial:', e)
        } finally {
            setHistoryLoading(false)
        }
    }

    const deleteWatch = async (historyId) => {
        try {
            const res = await fetch('/api/trakt/item/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    op: 'remove',
                    historyId
                })
            })
            
            if (res.ok) {
                loadHistory()
            }
        } catch (e) {
            console.error('Error eliminando:', e)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-white mb-2">
                        🔍 Diagnóstico Trakt - Múltiples Visionados
                    </h1>
                    <p className="text-zinc-400 text-sm">
                        Prueba añadir múltiples visionados a una película para diagnosticar el problema
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Panel de Entrada */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                        <h2 className="text-xl font-bold text-white">Añadir Visionado</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Tipo
                                </label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg text-white"
                                >
                                    <option value="movie">Película</option>
                                    <option value="show">Serie</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    TMDB ID
                                </label>
                                <input
                                    type="text"
                                    value={tmdbId}
                                    onChange={(e) => setTmdbId(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg text-white font-mono"
                                    placeholder="550"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Fecha de Visionado
                                </label>
                                <input
                                    type="date"
                                    value={watchedAt}
                                    onChange={(e) => setWatchedAt(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg text-white"
                                />
                            </div>

                            <button
                                onClick={addWatch}
                                disabled={loading}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Añadiendo...
                                    </>
                                ) : (
                                    'Añadir Visionado'
                                )}
                            </button>

                            <button
                                onClick={loadHistory}
                                disabled={historyLoading}
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm"
                            >
                                {historyLoading ? 'Cargando...' : 'Recargar Historial'}
                            </button>
                        </div>

                        {/* Resultado */}
                        {result && (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                    ¡Éxito!
                                </div>
                                <pre className="text-xs text-emerald-300/70 overflow-auto max-h-40 font-mono">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
                                    <AlertCircle className="w-5 h-5" />
                                    Error {error.status}
                                </div>
                                <div className="text-sm text-red-300 mb-2">{error.message}</div>
                                {error.code && (
                                    <div className="text-xs text-red-400/70 font-mono">
                                        Código: {error.code}
                                    </div>
                                )}
                                <pre className="text-xs text-red-300/50 overflow-auto max-h-40 mt-2 font-mono">
                                    {JSON.stringify(error.data, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Panel de Historial */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4">
                            Historial ({history.length})
                        </h2>
                        
                        <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                            {history.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500">
                                    No hay visionados registrados
                                </div>
                            ) : (
                                history.map((item) => {
                                    const date = new Date(item.watchedAt || item.watched_at)
                                    return (
                                        <div
                                            key={item.id}
                                            className="p-3 bg-black/30 border border-white/5 rounded-lg flex items-center justify-between hover:bg-black/50 transition"
                                        >
                                            <div>
                                                <div className="text-sm text-white font-medium">
                                                    {date.toLocaleDateString('es-ES', {
                                                        weekday: 'short',
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </div>
                                                <div className="text-xs text-zinc-500 font-mono">
                                                    {date.toLocaleTimeString('es-ES')} · ID: {item.id.toString().slice(-6)}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => deleteWatch(item.id)}
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Información de Ayuda */}
                <div className="mt-6 p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                    <h3 className="text-lg font-bold text-blue-300 mb-3">
                        ℹ️ Información sobre el Problema
                    </h3>
                    <div className="space-y-2 text-sm text-blue-200/70">
                        <p>
                            <strong className="text-blue-300">Limitación de Trakt:</strong> La API de Trakt tiene un límite de <strong>1 petición POST por segundo</strong> para usuarios autenticados.
                        </p>
                        <p>
                            <strong className="text-blue-300">Posibles causas:</strong>
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-4">
                            <li>Trakt puede haber implementado restricciones nuevas sobre múltiples visionados</li>
                            <li>Timestamps demasiado cercanos pueden ser rechazados como duplicados</li>
                            <li>Rate limiting si añades visionados muy rápido</li>
                            <li>Cambios en la política de Trakt sobre datos de historial</li>
                        </ul>
                        <p className="mt-3">
                            <strong className="text-blue-300">Solución implementada:</strong> Hemos mejorado la generación de timestamps únicos y añadido delays automáticos entre peticiones.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
