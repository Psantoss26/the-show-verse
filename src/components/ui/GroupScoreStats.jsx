"use client";

// Medias de puntuación en la cabecera de cada agrupación de las páginas de
// usuario (Favoritos, Pendientes, Biblioteca), con los mismos logos que el
// marcador de la ficha (ScoreboardBar). Sin cápsula ni fondo.
//
// Cada media es la marca de la fuente a la izquierda de la cifra, en línea,
// separadas por líneas finas como un marcador. Los logos salen de
// public/score-logos: recortados y a 66 px de alto (3× el mayor tamaño al que
// se pintan) para que se vean nítidos sin bajar los originales de miles de px.
// Fijada (`compact`), lo mismo en pequeño, porque la barra tiene poco alto.
//
// La cabecera es siempre una sola fila y el título manda: si las medias no
// caben a su lado, se quitan de la menos importante a la más (`priority`)
// hasta que quepan. Para eso se miden todas en una copia invisible y se
// compara con el hueco que deja el título a su ancho natural en la fila
// (el padre directo de este componente), buscando dentro el título
// (`[data-group-title]`) y, si se ve, la línea «N items · %»
// (`[data-group-meta]`).

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";

const SOURCES = {
  imdb: { label: "IMDb", src: "/score-logos/imdb.png", w: 131, h: 66 },
  trakt: { label: "Trakt", src: "/score-logos/trakt.png", w: 66, h: 66 },
  tmdb: { label: "TMDb", src: "/score-logos/tmdb.png", w: 92, h: 66 },
};

// Orden de importancia por defecto: IMDb y tu media primero.
export const DEFAULT_SCORE_PRIORITY = ["imdb", "my", "tmdb", "trakt"];
// Agrupando por tus notas, tu media repite el título: va la última.
export const MY_RATING_GROUP_SCORE_PRIORITY = ["imdb", "tmdb", "trakt", "my"];

function isScore(v) {
  return typeof v === "number" && !Number.isNaN(v) && v > 0;
}

function formatAvg(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// Ancho y alto reales: sin ellos el <img> diferido mide 0 de ancho hasta
// cargar y la carga diferida no llega a pedirlo.
function Logo({ source, className }) {
  return (
    <OptimizedImage
      src={source.src}
      width={source.w}
      height={source.h}
      alt=""
      draggable="false"
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  );
}

function ScoreItem({ item, compact, index, count }) {
  if (compact) {
    return (
      <div
        title={item.label}
        aria-label={`${item.label}: ${item.value}`}
        className={`flex shrink-0 items-center gap-1.5 ${
          item.key === "my" && index > 0 ? "border-l border-white/10 pl-3 sm:pl-4" : ""
        }`}
      >
        {item.source ? (
          <Logo source={item.source} className="h-4" />
        ) : (
          <Star aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
        )}
        <span aria-hidden="true" className="text-sm font-bold leading-none text-white tabular-nums sm:text-base">
          {item.value}
        </span>
      </div>
    );
  }
  return (
    <div
      title={item.label}
      aria-label={`${item.label}: ${item.value}`}
      className={`flex shrink-0 items-center gap-1.5 px-2.5 sm:gap-2 sm:px-4 ${
        index > 0 ? "border-l border-white/10" : ""
      } ${index === count - 1 ? "pr-0 sm:pr-1" : ""}`}
    >
      {item.source ? (
        <Logo source={item.source} className="h-[18px] sm:h-[22px]" />
      ) : (
        <Star aria-hidden="true" className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400 sm:h-5 sm:w-5" />
      )}
      <span aria-hidden="true" className="text-base font-bold leading-none text-white tabular-nums sm:text-xl">
        {item.value}
      </span>
    </div>
  );
}

// Cuántas medias caben (las primeras de `ranked`), midiendo la copia
// invisible y el hueco que deja el título en la fila.
function measureFit(root, measurer, ranked) {
  const row = root.parentElement;
  if (!row || !measurer) return ranked.length;
  const title = row.querySelector("[data-group-title]");
  if (!title) return ranked.length;
  const rowStyle = getComputedStyle(row);
  const rowRect = row.getBoundingClientRect();
  const contentLeft = rowRect.left + (Number.parseFloat(rowStyle.paddingLeft) || 0);
  const contentRight = rowRect.right - (Number.parseFloat(rowStyle.paddingRight) || 0);
  const gap = Number.parseFloat(rowStyle.columnGap) || 0;

  // Dónde acabaría lo de la izquierda con el título entero.
  const titleRect = title.getBoundingClientRect();
  const titleOverflow = Math.max(0, title.scrollWidth - title.clientWidth);
  let leftEnd = titleRect.right + titleOverflow;
  const meta = row.querySelector("[data-group-meta]");
  if (meta && meta.offsetWidth > 0) {
    const metaRect = meta.getBoundingClientRect();
    leftEnd = metaRect.right + titleOverflow;
  }
  const budget = contentRight - gap - leftEnd;
  if (contentRight - contentLeft <= 0) return ranked.length;

  const widths = {};
  for (const el of measurer.children) widths[el.dataset.key] = el.getBoundingClientRect().width;
  const itemGap = Number.parseFloat(getComputedStyle(measurer).columnGap) || 0;
  let used = 0;
  let fit = 0;
  for (const item of ranked) {
    used += (widths[item.key] || 0) + (fit > 0 ? itemGap : 0);
    if (used > budget + 0.5) break;
    fit += 1;
  }
  return fit;
}

export default function GroupScoreStats({
  stats,
  sources = ["imdb", "trakt", "tmdb"],
  priority = DEFAULT_SCORE_PRIORITY,
  compact = false,
  className = "",
}) {
  const rootRef = useRef(null);
  const measurerRef = useRef(null);
  const [fitCount, setFitCount] = useState(null);

  const items = sources
    .filter((key) => SOURCES[key] && isScore(stats?.[key]?.avg))
    .map((key) => ({
      key,
      label: `Media en ${SOURCES[key].label}`,
      value: formatAvg(stats[key].avg),
      source: SOURCES[key],
    }));
  if (isScore(stats?.my?.avg)) {
    items.push({ key: "my", label: "Tu media", value: formatAvg(stats.my.avg) });
  }
  const rank = (key) => {
    const i = priority.indexOf(key);
    return i === -1 ? priority.length : i;
  };
  const ranked = [...items].sort((a, b) => rank(a.key) - rank(b.key));
  const itemsKey = items.map((item) => `${item.key}:${item.value}`).join("|");

  const priorityKey = priority.join("|");
  useLayoutEffect(() => {
    const root = rootRef.current;
    const row = root?.parentElement;
    if (!row) return undefined;
    const refit = () => {
      const next = measureFit(root, measurerRef.current, ranked);
      setFitCount((prev) => (prev === next ? prev : next));
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(row);
    const title = row.querySelector("[data-group-title]");
    if (title) ro.observe(title);
    if (measurerRef.current) ro.observe(measurerRef.current);
    return () => ro.disconnect();
    // `ranked` cambia solo cuando cambian itemsKey o priorityKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, priorityKey, compact]);

  if (!items.length) return null;

  const keep = new Set(ranked.slice(0, fitCount ?? ranked.length).map((item) => item.key));
  const visible = items.filter((item) => keep.has(item.key));

  return (
    <motion.div
      ref={rootRef}
      layout
      className={`relative flex shrink-0 items-center ${compact ? "gap-3 sm:gap-4" : ""} ${className}`}
    >
      {/* Copia invisible con todas las medias, solo para medirlas. */}
      <div
        ref={measurerRef}
        aria-hidden="true"
        className={`pointer-events-none invisible absolute right-0 top-0 flex items-center ${compact ? "gap-3 sm:gap-4" : ""}`}
      >
        {items.map((item, index) => (
          <div key={item.key} data-key={item.key} className="flex shrink-0">
            <ScoreItem item={item} compact={compact} index={index} count={items.length} />
          </div>
        ))}
      </div>
      {visible.map((item, index) => (
        <motion.div layout="position" key={item.key} className="flex shrink-0">
          <ScoreItem item={item} compact={compact} index={index} count={visible.length} />
        </motion.div>
      ))}
    </motion.div>
  );
}
