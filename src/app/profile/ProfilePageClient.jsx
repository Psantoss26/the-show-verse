"use client";

import { useEffect } from "react";
import { useSelectedLayoutSegment, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
  const router = useRouter();
  const isProfileRoute = segment === null || PROFILE_SECTION_IDS.has(segment);

  useEffect(() => {
    if (hydrated && !user?.username && isProfileRoute) {
      router.replace("/login");
    }
  }, [hydrated, user?.username, isProfileRoute, router]);

  // Ajustes conserva su pantalla independiente. Las secciones de Perfil se
  // mantienen bajo este mismo layout para que no se desmonte el lienzo al
  // pasar de /profile a /profile/[section].
  if (!isProfileRoute) return children;

  if (!hydrated || !user?.username) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
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
