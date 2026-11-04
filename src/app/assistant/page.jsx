// src/app/assistant/page.jsx
// «Qué ver con IA» a pantalla completa. Los títulos recomendados abren la ficha
// rápida (DetailModal) como drawer desde la derecha, igual que en las páginas
// de usuario.
import WatchNextAssistant from "@/components/WatchNextAssistant";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";

export const metadata = {
  title: "Qué ver con IA",
  description:
    "Pide recomendaciones en una conversación: el asistente cruza tus pendientes, favoritos, historial y valoraciones.",
};

export default function AssistantPage() {
  return (
    <DetailModalProvider placement="right">
      <WatchNextAssistant />
    </DetailModalProvider>
  );
}
