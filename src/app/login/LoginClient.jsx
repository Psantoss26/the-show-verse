"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
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

  if (!hydrated || authenticated) {
    return (
      <main className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#0a0a0a] px-4 text-white overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] animate-pulse duration-[8s]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse duration-[10s]" />
        </div>
        <div className="relative z-10 flex items-center gap-3 text-sm font-semibold text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          Cargando sesión...
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[calc(100dvh-4rem)] bg-[#0a0a0a] text-white flex items-center justify-center px-4 overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse duration-[8s]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[130px] animate-pulse duration-[10s]" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px] animate-pulse duration-[12s]" />
      </div>
      <div className="relative z-10 w-full flex justify-center">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
