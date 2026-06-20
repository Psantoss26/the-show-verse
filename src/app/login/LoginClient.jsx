"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/context/AuthContext";

export default function LoginClient({ next }) {
  const router = useRouter();
  const { authenticated, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated || !authenticated) return;
    router.replace(next || "/");
  }, [authenticated, hydrated, next, router]);

  if (hydrated && authenticated) {
    return null;
  }

  return (
    <>
      {/* Fondo fijo: los blobs nunca se mueven al hacer scroll */}
      <div className="fixed inset-0 bg-[#0a0a0a] pointer-events-none z-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse duration-[8s]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[130px] animate-pulse duration-[10s]" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px] animate-pulse duration-[12s]" />
      </div>

      {/* Contenedor scrollable fijo — navbar top (4rem) + bottom nav móvil (5rem + safe-area) */}
      <main className="fixed inset-0 z-10 overflow-y-auto overscroll-none text-white">
        <div className="min-h-full flex items-center justify-center px-4 pt-20 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pt-8 lg:pb-8">
          <LoginForm next={next} />
        </div>
      </main>
    </>
  );
}
