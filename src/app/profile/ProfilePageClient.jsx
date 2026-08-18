"use client";

import { useEffect } from "react";
import { useSelectedLayoutSegment, useRouter } from "next/navigation";
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

  // SIN ESTADO DE CARGA: el perfil aparece directamente en cuanto está listo.
  // AuthContext restaura la sesión cacheada en un `useLayoutEffect`, o sea ANTES
  // del paint, así que en un dispositivo ya usado esta rama ni se llega a ver: el
  // primer frame trae ya el contenido. Cuando no hay sesión cacheada (o se está
  // redirigiendo a /login) se deja el lienzo neutro, igual que hace
  // `ProfilePendingSurface` en ProfileClient mientras llega el perfil: un spinner
  // aquí solo añadiría un parpadeo antes de pintar lo mismo.
  if (!hydrated || !user?.username) {
    return <div className="min-h-screen bg-black" aria-busy="true" />;
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
