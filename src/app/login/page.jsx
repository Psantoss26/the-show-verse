'use client'

import LoginForm from '@/components/auth/LoginForm'
import NoPageScroll from '@/components/NoPageScroll'

export default function LoginPage() {
  return (
    <main className="h-[100dvh] overflow-hidden bg-black text-white">
      <NoPageScroll />
      <div className="h-full w-full flex items-center justify-center px-4 py-4">
        <LoginForm />
      </div>
    </main>
  )
}