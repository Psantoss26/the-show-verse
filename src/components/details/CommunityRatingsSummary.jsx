"use client";

// Puntuaciones de los usuarios de The Show Verse dentro del modal de
// puntuación: media del título a la izquierda y 10 barras (1–10) con el reparto
// de votos. La barra de la nota que el usuario está eligiendo en el deslizador
// se ilumina, para ver dónde cae su nota frente a la del resto.

import { memo, useEffect, useState } from "react";
import { LIQUID_GLASS_TOOLTIP } from "@/lib/ui/liquidGlass";
import {
  fetchCommunityRatings,
  formatCommunityAverage,
  formatShare,
  formatVoteCount,
  getCachedCommunityRatings,
  normalizeCommunityRatings,
  ratingBucket,
} from "@/lib/details/communityRatings";

const EMPTY = normalizeCommunityRatings(null);

function CommunityRatingsSummary({ type, tmdbId, selectedValue }) {
  const [data, setData] = useState(() => getCachedCommunityRatings(type, tmdbId));
  const [failed, setFailed] = useState(false);
  // Las barras crecen desde la base al abrir el modal (transición CSS: cuesta
  // lo mismo que el resto del modal y respeta «reducir movimiento»).
  const [grown, setGrown] = useState(false);
  const [pinned, setPinned] = useState(null);

  useEffect(() => {
    let alive = true;
    // Siempre se renueva al abrir: la copia en memoria solo evita el hueco.
    fetchCommunityRatings(type, tmdbId)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [type, tmdbId]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (failed && !data) return null;

  const loading = !data;
  const { count, average, bars } = data || EMPTY;
  const selected = ratingBucket(selectedValue);

  return (
    <section
      aria-label="Puntuaciones de los usuarios de The Show Verse"
      aria-busy={loading}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="select-none text-[10px] font-bold tracking-widest text-white/40">
          USUARIOS DE THE SHOW VERSE
        </span>
        <span className="text-[11px] font-bold text-white/45 tabular-nums">
          {loading ? " " : count > 0 ? formatVoteCount(count) : "Sin votos aún"}
        </span>
      </div>

      <div className="mt-3 flex items-stretch">
        {/* Centrada entre el borde del modal (-ml-6 = su px-6) y las barras, y a la
            altura de toda la fila, números de debajo incluidos. */}
        <div className="-ml-6 flex w-[7rem] shrink-0 flex-col items-center justify-center">
          <div className="flex items-center justify-center">
            <span
              className={`text-[2.75rem] font-bold leading-none tracking-tighter pr-[0.05em] ${
                count > 0 ? "text-white" : "text-white/30"
              }`}
            >
              {formatCommunityAverage(average)}
            </span>
          </div>
          <span className="mt-1 select-none text-[10px] font-bold tracking-widest text-white/35">
            MEDIA
          </span>
        </div>

        <ul className="grid min-w-0 flex-1 grid-cols-10 gap-1" role="list">
          {bars.map((bar, index) => {
            const isSelected = bar.score === selected;
            const showTip = pinned === bar.score;
            const label = `Nota ${bar.score}: ${formatVoteCount(bar.count)}${
              count > 0 ? `, ${formatShare(bar.share)}` : ""
            }`;
            // Una barra con votos nunca queda a ras de suelo, aunque sean pocos.
            const scale = grown && bar.count > 0 ? Math.max(0.06, bar.ratio) : 0;
            return (
              <li key={bar.score} className="min-w-0">
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={showTip}
                  disabled={loading}
                  onClick={() => setPinned((cur) => (cur === bar.score ? null : bar.score))}
                  onBlur={() => setPinned((cur) => (cur === bar.score ? null : cur))}
                  className="group relative flex w-full flex-col items-center gap-1.5 border-0 bg-transparent p-0 focus-visible:outline-none"
                >
                  <span
                    className={`pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-30 w-max -translate-x-1/2 rounded-2xl ${LIQUID_GLASS_TOOLTIP} px-3 py-1.5 text-center text-xs font-bold text-white transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      showTip
                        ? "translate-y-0 scale-100 opacity-100"
                        : "translate-y-1 scale-95 opacity-0 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100"
                    } ${index < 2 ? "!left-0 !translate-x-0" : index > 7 ? "!left-auto right-0 !translate-x-0" : ""}`}
                  >
                    <span className="block">{formatVoteCount(bar.count)}</span>
                    {count > 0 ? (
                      <span className="block text-[10px] text-yellow-200/90">{formatShare(bar.share)}</span>
                    ) : null}
                  </span>
                  <span
                    className={`relative block h-16 w-full overflow-hidden rounded-md transition-colors duration-200 ${
                      isSelected ? "bg-yellow-300/[0.14]" : "bg-white/[0.06] group-hover:bg-white/[0.1]"
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`absolute inset-0 origin-bottom rounded-md bg-gradient-to-t transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                        isSelected
                          ? "from-yellow-400 to-yellow-100 shadow-[0_0_14px_rgba(250,204,21,0.45)]"
                          : "from-yellow-500/45 to-yellow-200/55 group-hover:from-yellow-500/65 group-hover:to-yellow-200/75"
                      }`}
                      style={{
                        transform: `scaleY(${scale})`,
                        transitionDelay: grown ? `${index * 25}ms` : "0ms",
                      }}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold leading-none tabular-nums transition-colors duration-200 ${
                      isSelected ? "text-yellow-200" : "text-white/60 group-hover:text-white/85"
                    }`}
                    aria-hidden="true"
                  >
                    {bar.score}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default memo(CommunityRatingsSummary);
