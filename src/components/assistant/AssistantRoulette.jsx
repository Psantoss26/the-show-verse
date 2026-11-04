"use client";

// Ruleta del asistente (/assistant): elige al azar entre las últimas
// recomendaciones. Antes vivía dentro del panel de WatchNextAssistant; en la
// página ocupa el sitio de la conversación hasta que se vuelve al chat.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Dices, Loader2 } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";

const ROULETTE_COLORS = [
  "#0891b2",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#6366f1",
];

function point(percent) {
  return [Math.cos(2 * Math.PI * percent), Math.sin(2 * Math.PI * percent)];
}

function slicePath(index, total, radius = 138, cx = 150, cy = 150) {
  const [sx, sy] = point(index / total - 0.25);
  const [ex, ey] = point((index + 1) / total - 0.25);
  const large = 1 / total > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx + radius * sx} ${cy + radius * sy} A ${radius} ${radius} 0 ${large} 1 ${cx + radius * ex} ${cy + radius * ey} Z`;
}

function tmdbImg(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

const panel =
  "rounded-3xl bg-black/20 backdrop-blur-md p-6 shadow-inner";

export default function AssistantRoulette({ items, onBack }) {
  const reduceMotion = useReducedMotion();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [chosen, setChosen] = useState(null);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const spin = () => {
    if (spinning || items.length < 3) return;
    setSpinning(true);
    setChosen(null);
    const total = items.length;
    const winner = Math.floor(Math.random() * total);
    const target = 360 - (winner + 0.5) * (360 / total);
    const extra = reduceMotion ? 360 : 360 * 6;
    setRotation((prev) => prev - (prev % 360) + extra + target);
    timerRef.current = window.setTimeout(
      () => {
        setSpinning(false);
        setChosen(items[winner]);
      },
      reduceMotion ? 600 : 5100,
    );
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-4 lg:grid-cols-[1.2fr_1fr] lg:py-8">
      <div className={`relative flex min-h-[360px] flex-col items-center justify-center ${panel}`}>
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al chat
        </button>

        <div className="relative mt-8 scale-[0.85] select-none sm:scale-100">
          <div className="absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
              <path d="M12 22L2 6h20L12 22z" fill="#eab308" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-0 -m-3.5 rounded-full bg-black/40 shadow-[0_0_50px_rgba(34,211,238,0.15)]" />
          <svg width="300" height="300" viewBox="0 0 300 300" className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "150px 150px",
                transition: spinning
                  ? `transform ${reduceMotion ? "0.6s" : "5.2s"} cubic-bezier(0.12, 0.8, 0.08, 1)`
                  : "none",
              }}
            >
              {items.map((item, idx) => (
                <path
                  key={`s-${item.mediaType}-${item.id}`}
                  d={slicePath(idx, items.length)}
                  fill={ROULETTE_COLORS[idx % ROULETTE_COLORS.length]}
                  stroke="#18181b"
                  strokeWidth="2"
                />
              ))}
              {items.map((item, idx) => (
                <g
                  key={`l-${item.mediaType}-${item.id}`}
                  transform={`rotate(${(idx + 0.5) * (360 / items.length)}, 150, 150)`}
                >
                  <text
                    x={150}
                    y={47}
                    fill="white"
                    fontSize="10px"
                    fontWeight="bold"
                    textAnchor="middle"
                    transform="rotate(90, 150, 47)"
                    className="pointer-events-none select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                  >
                    {item.title.length > 18 ? `${item.title.slice(0, 16)}...` : item.title}
                  </text>
                </g>
              ))}
            </g>
            <circle cx="150" cy="150" r="38" fill="rgba(255,255,255,0.05)" className="pointer-events-none" />
            <circle
              cx="150"
              cy="150"
              r="32"
              fill="#18181b"
              stroke="#ffffff"
              strokeWidth="2.5"
              role="button"
              aria-label="Girar la ruleta"
              className={`cursor-pointer transition duration-200 ${spinning ? "cursor-not-allowed opacity-60" : "hover:fill-zinc-800"}`}
              onClick={spin}
            />
            <text
              x="150"
              y="154"
              fill={spinning ? "#71717a" : "#eab308"}
              fontSize="10px"
              fontWeight="bold"
              textAnchor="middle"
              className="pointer-events-none select-none tracking-wider"
            >
              {spinning ? "SPIN..." : "GIRAR"}
            </text>
          </svg>
        </div>
      </div>

      <div className={`flex min-h-[200px] flex-col justify-center ${panel}`}>
        {spinning ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-cyan-400" />
            <h3 className="mb-2 text-lg font-bold text-white">Seleccionando tu próximo visionado…</h3>
            <p className="text-sm text-zinc-400">Cruzando tus gustos y pendientes</p>
          </div>
        ) : chosen ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex h-full flex-col justify-between"
          >
            <div>
              <span className="mb-4 inline-block rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
                ¡Elección final!
              </span>
              <div className="mb-4 flex items-start gap-4">
                {chosen.posterPath ? (
                  <div className="h-32 w-[84px] shrink-0 overflow-hidden rounded-2xl bg-zinc-900 shadow-xl">
                    <OptimizedImage src={tmdbImg(chosen.posterPath)} alt={chosen.title} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-xl font-bold leading-tight text-white">{chosen.title}</h3>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-cyan-200/80">
                    {chosen.mediaType === "tv" ? "Serie" : "Película"}
                    {chosen.year ? ` · ${chosen.year}` : ""}
                  </p>
                  {chosen.voteAverage ? (
                    <span className="inline-block rounded-lg bg-yellow-400/10 px-2 py-0.5 text-xs font-bold text-yellow-200">
                      ★ {Number(chosen.voteAverage).toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">
                {chosen.reason || "Es perfecta para tus gustos actuales."}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={spin}
                className="rounded-xl bg-white/5 px-4 py-2.5 text-xs font-bold text-zinc-200 transition hover:bg-white/10"
              >
                Girar otra vez
              </button>
              <Link
                href={chosen.href || `/details/${chosen.mediaType}/${chosen.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-600"
              >
                Ver detalles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center py-12 text-center">
            <Dices className="mb-4 h-10 w-10 text-cyan-300/50" />
            <h3 className="mb-2 text-lg font-bold text-white">Gira la ruleta</h3>
            <p className="max-w-xs text-sm leading-relaxed text-zinc-400">
              Pulsa <strong>GIRAR</strong> en el centro para que elija una de tus recomendaciones al azar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
