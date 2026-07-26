"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";
import ProfileClient from "@/app/u/[username]/ProfileClient";
import { PROFILE_SECTION_IDS } from "@/app/u/[username]/profileRoutes";

// El perfil propio utiliza el mismo lienzo que cualquier miembro. Así las
// pestañas sociales, la cabecera y el panel de métricas no divergen entre
// /profile y /u/[username]. Las acciones privadas siguen mostrándose desde
// ProfileClient cuando el perfil corresponde al usuario autenticado.
export default function ProfilePageClient({ children }) {
  const { user, hydrated } = useAuth();
  const segment = useSelectedLayoutSegment();
  const isProfileRoute = segment === null || PROFILE_SECTION_IDS.has(segment);

  // Ajustes conserva su pantalla independiente. Las secciones de Perfil se
  // mantienen bajo este mismo layout para que no se desmonte el lienzo al
  // pasar de /profile a /profile/[section].
  if (!isProfileRoute) return children;

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user?.username) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <LogIn className="h-10 w-10 text-zinc-700" />
        <h1 className="text-2xl font-black text-white">Inicia sesión para ver tu perfil</h1>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-full bg-emerald-400 px-5 text-sm font-bold text-black transition hover:bg-emerald-300"
        >
          Acceder
        </Link>
      </div>
    );
  }

  return (
    <DetailModalProvider placement="right">
      <ProfileClient
        username={user.username}
        initialTab={segment || "profile"}
        routeBase="/profile"
      />
    </DetailModalProvider>
  );
}
