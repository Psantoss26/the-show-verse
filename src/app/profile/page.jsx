import StatsClient from "../stats/StatsClient";

export const metadata = {
  title: "Mi Perfil · The Show Verse",
  description: "Tu perfil de Trakt: estadísticas, historial reciente, valoraciones y más.",
};

export default function ProfilePage() {
  return <StatsClient />;
}
