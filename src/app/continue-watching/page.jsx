// src/app/continue-watching/page.jsx
import ContinueWatchingClient from "./ContinueWatchingClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";

export const metadata = {
  title: "Continuar viendo",
  description:
    "Películas y episodios que tienes a medias, con el porcentaje de reproducción capturado desde tus plataformas de streaming.",
};

export default function ContinueWatchingPage() {
  return (
    <DetailModalProvider placement="right">
      <ContinueWatchingClient />
    </DetailModalProvider>
  );
}
