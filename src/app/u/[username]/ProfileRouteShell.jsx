"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import ProfileClient from "./ProfileClient";
import { PROFILE_SECTION_IDS } from "./profileRoutes";
import { saveUserDetailsSequenceFromLink } from "@/lib/navigation/userDetailsSequence";

// El layout de usuario permanece montado entre sus rutas hijas. Este pequeño
// adaptador mantiene también montado ProfileClient entre todas las secciones
// de Perfil, de forma que el cambio de URL reemplaza únicamente su contenido.
// Seguidores y siguiendo conservan sus páginas independientes.
export default function ProfileRouteShell({ username, children }) {
  const segment = useSelectedLayoutSegment();
  const isProfileRoute = segment === null || PROFILE_SECTION_IDS.has(segment);

  const captureDetailsSequence = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    saveUserDetailsSequenceFromLink(target.closest('a[href^="/details/"]'));
  };

  if (!isProfileRoute) return children;

  return (
    <div onClickCapture={captureDetailsSequence}>
      <ProfileClient username={username} initialTab={segment || "profile"} />
    </div>
  );
}
