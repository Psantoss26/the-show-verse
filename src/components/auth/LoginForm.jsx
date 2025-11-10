'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createRequestToken, validateWithLogin, createSession, getAccount } from '@/lib/api/auth'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { login } = useAuth()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const token = await createRequestToken()
      const validatedToken = await validateWithLogin(username, password, token)

      if (!validatedToken) {
        setError('Credenciales incorrectas')
        setLoading(false)
        return
      }

      const session_id = await createSession(validatedToken)
      const account = await getAccount(session_id)

      // Esto ya guarda en localStorage, cookie y contexto
      login({ session_id, account })

      setSuccess(true)
      setTimeout(() => {
        router.push('/')
      }, 1000)
    } catch (err) {
      console.error(err)
      setError('Error al iniciar sesión')
    }

    setLoading(false)
  }

  return (
    <motion.form
      onSubmit={handleLogin}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm mx-auto text-white bg-[#0e0e0e] border border-neutral-800 rounded-2xl px-8 py-10 shadow-xl"
    >
      <h2 className="text-3xl font-bold text-center mb-2">Iniciar sesión</h2>
      <p className="text-sm text-neutral-400 text-center mb-6">Con tu cuenta de TMDb</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-300 mb-1">Usuario</label>
          <input
            type="text"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            placeholder="Tu nombre de usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1">Contraseña</label>
          <input
            type="password"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              className="flex items-center gap-2 text-red-500 text-sm mt-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {success && (
            <motion.div
              className="flex items-center gap-2 text-green-400 text-sm mt-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <CheckCircle className="w-4 h-4" />
              Inicio de sesión exitoso
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-xl font-semibold flex justify-center items-center gap-2 transition-all"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </motion.form>
  )
}
