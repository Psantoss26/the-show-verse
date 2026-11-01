"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import {
  PERF_LITE_ATTR,
  PERF_MODE_EVENT,
  readPerfMode,
  setPerfMode,
} from "@/lib/ui/performanceMode";

// Rendimiento visual de ESTE dispositivo (localStorage, no la cuenta): por eso
// no espera al servidor ni se desactiva sin conexión, a diferencia del resto
// de filas de Ajustes. Ver src/lib/ui/performanceMode.js.
const OPTIONS = [
  { value: "auto", label: "Automático", key: "settings_perf_auto" },
  { value: "full", label: "Completa", key: "settings_perf_full" },
  { value: "lite", label: "Ligera", key: "settings_perf_lite" },
];

function isLiteNow() {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(PERF_LITE_ATTR);
}

export default function PerformanceModeSetting({ panelClassName = "", t = (_k, fallback) => fallback }) {
  // Se lee tras montar: en el servidor no hay localStorage.
  const [mode, setMode] = useState(null);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    const sync = () => {
      setMode(readPerfMode());
      setLite(isLiteNow());
    };
    sync();
    window.addEventListener(PERF_MODE_EVENT, sync);
    return () => window.removeEventListener(PERF_MODE_EVENT, sync);
  }, []);

  const status =
    mode === "auto"
      ? lite
        ? t(
            "settings_perf_status_lite",
            "Este dispositivo va mejor sin desenfoques: se han quitado para que el scroll y las animaciones vayan fluidos.",
          )
        : t(
            "settings_perf_status_full",
            "Calidad completa. Si el dispositivo va a tirones, se quitan los desenfoques solo en él.",
          )
      : mode === "lite"
        ? t("settings_perf_status_forced_lite", "Sin desenfoques de fondo en este dispositivo.")
        : t("settings_perf_status_forced_full", "Siempre con todos los efectos, aunque el dispositivo vaya justo.");

  return (
    <div className={`${panelClassName} rounded-2xl p-4 sm:p-5`}>
      <div className="flex min-w-0 items-start gap-4">
        <div className="rounded-xl bg-white/5 p-2.5 text-emerald-400">
          <Gauge className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="perf-mode-title" className="text-sm font-bold text-white tracking-wide">
            {t("settings_perf_title", "Efectos visuales en este dispositivo")}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">{mode ? status : " "}</p>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby="perf-mode-title" className="mt-4 grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={mode === null}
              onClick={() => setPerfMode(option.value)}
              className={`min-h-11 rounded-xl px-2 sm:px-4 text-xs sm:text-sm font-bold transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-60 ${
                active ? "bg-white text-black shadow-lg shadow-white/10" : "bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {t(option.key, option.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
