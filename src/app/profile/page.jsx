import ProfileClient from "./ProfileClient";

export const metadata = {
  title: "Mi Perfil · The Show Verse",
  description: "Tu perfil de Trakt: estadísticas, historial reciente, valoraciones y más.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
