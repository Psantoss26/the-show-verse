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

  // Lock scroll and prevent dragging/elastic bounces on mobile view
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyWidth = document.body.style.width;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.width = originalBodyWidth;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

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

      {/* Contenedor fijo centrado — navbar top (4rem) + bottom nav móvil (calc(4.5rem + safe-area)) */}
      <main className="fixed top-16 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-10 overflow-hidden overscroll-none text-white flex items-center justify-center lg:inset-0 lg:overflow-y-auto">
        <div className="w-full flex items-center justify-center px-4 py-0 lg:min-h-full lg:pt-8 lg:pb-8">
          <LoginForm next={next} />
        </div>
      </main>
    </>
  );
}
