import { Suspense } from "react";
import StatsClient from "./StatsClient";

export const metadata = {
  title: "Estadísticas | The Show Verse",
  description: "Tus estadísticas de visualización en detalle",
};

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <StatsClient />
    </Suspense>
  );
}
