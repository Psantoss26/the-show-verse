"use client";

// Panel glassy de "Reconocimientos" para la pestaña Premios. Extraído VERBATIM
// desde DetailsClient para compartirlo con la ficha rápida del dashboard
// (DetailModal) a través de <DetailsInfoTabs>. Recibe la cadena CRUDA de premios
// (OMDb) y la formatea internamente con formatDashboardAwards.

import { Trophy } from "lucide-react";
import { formatDashboardAwards } from "@/lib/details/awardsText";

export default function AwardsPanel({ awards }) {
  const formattedAwards = formatDashboardAwards(awards);

  return (
    <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
      {/* Capa de fondo suave */}
      <div
        className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
        style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
      />
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none z-10" />

      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white mb-2">
              Reconocimientos
            </h3>
            {formattedAwards && (
              <p className="text-base leading-relaxed text-zinc-200">
                {formattedAwards}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
