import StatsClient from "../stats/StatsClient";

export const metadata = {
  title: "Perfil",
  description: "Tu perfil de The Show Verse: estadísticas, historial reciente, valoraciones y más.",
};

export default function ProfilePage() {
  return <StatsClient />;
}
