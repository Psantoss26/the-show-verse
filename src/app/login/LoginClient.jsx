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
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-black px-4 text-white">
        <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando sesión...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-black text-white flex items-center justify-center px-4">
      <LoginForm next={next} />
    </main>
  );
}
