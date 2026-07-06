// src/app/continue-watching/page.jsx
import ContinueWatchingClient from "./ContinueWatchingClient";

export const metadata = {
  title: "Continuar viendo",
  description:
    "Películas y episodios que tienes a medias, con el porcentaje de reproducción capturado desde tus plataformas de streaming.",
};

export default function ContinueWatchingPage() {
  return <ContinueWatchingClient />;
}
