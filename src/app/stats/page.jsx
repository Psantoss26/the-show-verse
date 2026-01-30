import { Suspense } from "react";
import StatsClient from "./StatsClient";

export const metadata = {
  title: "Estadísticas | The Show Verse",
  description: "Tus estadísticas de visualización en detalle",
};

export default function StatsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <StatsClient />
    </Suspense>
  );
}
