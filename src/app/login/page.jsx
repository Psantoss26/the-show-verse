'use client'

import LoginForm from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-emerald-900/15 rounded-full blur-[120px]" />
        <div className="absolute top-10 -right-40 w-[520px] h-[520px] bg-indigo-900/15 rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <LoginForm />
      </div>
    </main>
  )
}
