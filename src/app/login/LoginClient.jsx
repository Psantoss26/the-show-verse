"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/context/AuthContext";
import { GOOGLE_SESSION_PARAM } from "@/lib/auth/googleSignIn";

export default function LoginClient({ next, googleClientId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated, hydrated } = useAuth();
  // Vuelta del login de Google por redirección: las cookies ya están puestas y
  // solo falta que /api/auth/me cargue el usuario. Mientras, «Entrando…» en vez
  // del formulario (que parecía que el login no había funcionado).
  const arrivingFromGoogle = searchParams?.get(GOOGLE_SESSION_PARAM) === "1";
  const enteringSession = authenticated || (arrivingFromGoogle && !hydrated);

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

  return (
    <>
      {/* Fondo fijo: los blobs nunca se mueven al hacer scroll */}
      <div className="fixed inset-0 bg-[#0a0a0a] pointer-events-none z-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse duration-[8s]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[130px] animate-pulse duration-[10s]" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px] animate-pulse duration-[12s]" />
      </div>

      {/* Contenedor fijo centrado — navbar top (4rem + recorte de la cámara) + bottom nav móvil (calc(4.5rem + safe-area)) */}
      <main className="fixed top-[calc(4rem+var(--sv-safe-top,0px))] bottom-[calc(4.5rem+var(--sv-safe-bottom,0px))] left-0 right-0 z-10 overflow-hidden overscroll-none text-white flex items-center justify-center lg:inset-0 lg:overflow-y-auto">
        <div className="w-full flex items-center justify-center px-4 py-0 lg:min-h-full lg:pt-8 lg:pb-8">
          {enteringSession ? (
            <div
              role="status"
              className="flex w-full max-w-[380px] flex-col items-center gap-4 rounded-[2.5rem] border border-white/12 bg-zinc-900/40 px-6 py-12 shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
            >
              <img
                src="/logo-TSV-sinFondo.png"
                alt="The Show Verse"
                className="h-24 w-auto object-contain scale-[1.6]"
              />
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Entrando…
              </div>
            </div>
          ) : (
            <LoginForm next={next} googleClientId={googleClientId} />
          )}
        </div>
      </main>
    </>
  );
}
