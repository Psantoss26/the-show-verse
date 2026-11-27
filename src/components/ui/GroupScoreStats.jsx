"use client";

// Medias de puntuación en la cabecera de cada agrupación de las páginas de
// usuario (Favoritos, Pendientes, Biblioteca), con los mismos logos que el
// marcador de la ficha (ScoreboardBar). Sin cápsula ni fondo.
//
// Cada media es la marca de la fuente a la izquierda de la cifra, en línea,
// separadas por líneas finas como un marcador. Los logos salen de
// public/score-logos: recortados y a 66 px de alto (3× el mayor tamaño al que
// se pintan) para que se vean nítidos sin bajar los originales de miles de px.
// Fijada (`compact`), las medias no cambian de tamaño ni de maquetación: se
// encogen con una escala (`sv-group-compact-scores`, anclada a la derecha)
// para que el paso a la barra fijada sea un único movimiento suave. El título
// hace lo mismo anclado a la izquierda (`sv-group-compact-title` en la página).
//
// La cabecera es siempre una sola fila y el título manda: si las medias no
// caben a su lado, se quitan de la menos importante a la más (`priority`)
// hasta que quepan. Para eso se miden todas en una copia invisible y se
// compara con el hueco que deja el título a su ancho natural en la fila
// (el padre directo de este componente), buscando dentro el título
// (`[data-group-title]`). Todo se mide en píxeles de maquetación
// (offsetWidth), sin la escala de fijado ni las animaciones de framer.
//
// La línea «N items · %» (`[data-group-meta]`) va detrás: solo se ve si caben
// todas las medias y aún sobra su ancho más un margen (`META_MARGIN`); este
// componente le pone `data-fit="yes|no"` y globals.css la pliega si no cabe.
//
// `onDemand` (lista, una entrada por fuente): si a la agrupación le falta la
// media de una fuente que la página no carga por defecto (IMDb, Trakt o TMDb),
// a la izquierda de las medias sale un botón sin borde con su logo, una cifra
// difuminada y una chapa «+»; al tocarlo se calcula solo con los títulos del
// grupo (useGroupScoresOnDemand) y la chapa pasa a un anillo de progreso (o a
// «reintentar» si no se pudo). Compite por el hueco como una media más, justo
// detrás de la primera; ya calculada, la media ocupa ese mismo puesto.
//
// Si el título no deja sitio para todo, la cabecera pasa a la forma reducida:
// solo IMDb, TMDb y tu media (`REDUCED_SOURCES`), sin la media de Trakt ni su
// botón de calcular, y sobre ese conjunto se sigue quitando por prioridad.

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, RotateCw, Star } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { ProgressRing } from "@/components/ui/GroupingProgress";

const SOURCES = {
  imdb: { label: "IMDb", src: "/score-logos/imdb.png", w: 131, h: 66 },
  trakt: { label: "Trakt", src: "/score-logos/trakt.png", w: 66, h: 66 },
  tmdb: { label: "TMDb", src: "/score-logos/tmdb.png", w: 92, h: 66 },
};

// Orden de importancia por defecto: IMDb y tu media primero.
export const DEFAULT_SCORE_PRIORITY = ["imdb", "my", "tmdb", "trakt"];
// Agrupando por tus notas, tu media repite el título: no se muestra, y Trakt
// solo si cabe. Lo que no está en `priority` no se pinta.
export const MY_RATING_GROUP_SCORE_PRIORITY = ["imdb", "tmdb", "trakt"];
// Lo único que queda cuando el título no deja sitio para todo.
const REDUCED_SOURCES = new Set(["imdb", "tmdb", "my"]);

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

function ScoreItem({ item, index, count }) {
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

const boxKey = (source) => `od:${source}`;

function OnDemandBox({ demand }) {
  const source = SOURCES[demand.key];
  const loading = Boolean(demand.progress);
  const failed = !loading && demand.failed;
  const titles = `${demand.missing} ${demand.missing === 1 ? "título" : "títulos"}`;
  const label = loading
    ? `Calculando la media de ${source.label}: ${demand.progress.done} de ${demand.progress.total}`
    : failed
      ? `No se pudo calcular la media de ${source.label}. Reintentar (${titles})`
      : `Calcular la media de ${source.label} (${titles})`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={loading}
      onClick={demand.onRequest}
      className="group/od flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] pl-2.5 pr-1 text-white transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-progress sm:h-10 sm:gap-2 sm:pl-3 sm:pr-1.5"
    >
      <Logo source={source} className="h-[18px] sm:h-[22px]" />
      {/* En reposo, solo logo y «+»; calculando, el progreso entre ambos. */}
      {loading ? (
        <span aria-hidden="true" className="text-xs font-bold leading-none tabular-nums text-zinc-300 sm:text-sm">
          {demand.progress.done}/{demand.progress.total}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-200 sm:h-7 sm:w-7 ${
          loading
            ? "p-0.5 text-white"
            : failed
              ? "bg-amber-400/20 text-amber-300 group-hover/od:bg-amber-400/30"
              : "bg-white/15 text-white group-hover/od:bg-white/25"
        }`}
      >
        {loading ? (
          <ProgressRing value={demand.progress.done / Math.max(1, demand.progress.total)} />
        ) : failed ? (
          <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.75} />
        ) : (
          <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover/od:rotate-90 sm:h-4 sm:w-4" strokeWidth={3} />
        )}
      </span>
    </button>
  );
}

// Margen extra (además del hueco de la fila) entre «N items · %» y las medias.
const META_MARGIN = 8;

// Izquierda de `el` dentro de `row`, en píxeles de maquetación.
function offsetLeftWithin(el, row) {
  let x = 0;
  let node = el;
  while (node && node !== row) {
    x += node.offsetLeft;
    node = node.offsetParent;
  }
  return node === row ? x : null;
}

// Cuántas medias caben (las primeras de `ranked`) y si cabe además la línea
// «N items · %», midiendo la copia invisible y el hueco que deja el título.
// Las medias de `yieldToMeta` que van al final de `ranked` se quitan antes
// que la línea de datos si así cabe, completa o, si la página la marca con
// `data-meta-core`/`data-meta-extra`, solo «· N items» (`meta: "short"`).
function measureFit(root, measurer, ranked, yieldToMeta = null) {
  const all = { fit: ranked.length, meta: null };
  const row = root.parentElement;
  if (!row || (!measurer && ranked.length)) return all;
  const title = row.querySelector("[data-group-title]");
  if (!title) return all;
  const titleLeft = offsetLeftWithin(title, row);
  if (titleLeft === null) return all;
  const rowStyle = getComputedStyle(row);
  const contentRight = row.clientWidth - (Number.parseFloat(rowStyle.paddingRight) || 0);
  const gap = Number.parseFloat(rowStyle.columnGap) || 0;
  // Dónde acabaría el título a su ancho natural.
  const leftEnd = titleLeft + title.scrollWidth;
  const budget = contentRight - gap - leftEnd;
  // «N items · %» plegada mide 0 pero el hueco que la separa del título sigue
  // ocupando la fila: sin restarlo, las medias «cabían» y el título se cortaba.
  const meta = row.querySelector("[data-group-meta]");
  const metaGap = meta ? Number.parseFloat(getComputedStyle(meta.parentElement).columnGap) || 0 : 0;
  const scoreBudget = budget - metaGap;

  const widths = {};
  for (const el of measurer?.children ?? []) widths[el.dataset.key] = el.offsetWidth;
  let used = 0;
  let fit = 0;
  for (const item of ranked) {
    const next = used + (widths[item.key] || 0);
    // offsetWidth redondea: 1 px de holgura para no cortar el título.
    if (next > scoreBudget - 1) break;
    used = next;
    fit += 1;
  }

  let metaFits = null;
  if (meta) {
    const line = meta.firstElementChild;
    const core = meta.querySelector("[data-meta-core]");
    const extra = meta.querySelector("[data-meta-extra]");
    const lineGap = line ? Number.parseFloat(getComputedStyle(line).columnGap) || 0 : 0;
    // Con la forma corta puesta la parte extra sale del flujo, pero sigue
    // midiendo su ancho (globals.css).
    const fullWidth = core && extra ? core.offsetWidth + lineGap + extra.offsetWidth : meta.scrollWidth;
    const shortWidth = core && extra ? core.offsetWidth : null;
    const room = (w, metaWidth, margin = META_MARGIN) => w + metaGap + metaWidth + margin <= budget;
    metaFits = fit === ranked.length && room(used, fullWidth);
    // Sin sitio para el porcentaje, «· N items» solo si cabe con todas las
    // medias. La forma corta se conforma con medio margen: la fila ya separa.
    if (!metaFits && fit === ranked.length && shortWidth !== null && room(used, shortWidth, META_MARGIN / 2)) {
      return { fit, meta: "short" };
    }
    if (!metaFits && yieldToMeta?.size) {
      let n = fit;
      let w = used;
      while (n > 0 && yieldToMeta.has(ranked[n - 1].key)) {
        n -= 1;
        w -= widths[ranked[n].key] || 0;
        if (room(w, fullWidth)) return { fit: n, meta: true };
        // La forma corta se conforma con medio margen: la fila ya separa.
        if (shortWidth !== null && room(w, shortWidth, META_MARGIN / 2)) return { fit: n, meta: "short" };
      }
    }
  }
  return { fit, meta: metaFits };
}

export default function GroupScoreStats({
  stats,
  sources = ["imdb", "trakt", "tmdb"],
  priority = DEFAULT_SCORE_PRIORITY,
  compact = false,
  onDemand = null,
  // Medias que ceden su sitio a «N items · %» (agrupando por tus notas, tu
  // media repite el título).
  yieldToMeta = null,
  className = "",
}) {
  const rootRef = useRef(null);
  const measurerRef = useRef(null);
  // `reduced`: sin Trakt porque no cabía todo; `fit`: cuántas de la lista
  // (completa o reducida) se ven.
  const [fitState, setFitState] = useState(null);

  const demands = (Array.isArray(onDemand) ? onDemand : []).filter((d) => SOURCES[d?.key]);
  // Con la fuente a medias (solo los títulos que ya estaban en caché), su
  // media engañaría: se ve el botón en su lugar.
  const boxes = demands.filter((d) => d.missing > 0 || d.progress);
  const boxSources = new Set(boxes.map((d) => d.key));
  const items = sources
    .filter((key) => SOURCES[key] && isScore(stats?.[key]?.avg) && !boxSources.has(key))
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
  const entries = [
    ...items.map((item) => ({ key: item.key, source: item.key, box: false })),
    ...boxes.map((d) => ({ key: boxKey(d.key), source: d.key, box: true })),
  ]
    .filter((e) => priority.includes(e.source))
    .sort((a, b) => rank(a.source) - rank(b.source));
  // Los botones y lo pedido a mano van detrás de la primera media: el botón
  // mientras falta y la media en cuanto llega.
  const requestedSources = new Set(demands.filter((d) => d.requested).map((d) => d.key));
  const promoted = (e) => e.box || requestedSources.has(e.source);
  const first = entries.find((e) => !promoted(e));
  const ranked = first
    ? [first, ...entries.filter(promoted), ...entries.filter((e) => e !== first && !promoted(e))]
    : entries;
  const reducedRanked = ranked.filter((e) => REDUCED_SOURCES.has(e.source));
  const itemsKey = `${items.map((item) => `${item.key}:${item.value}`).join("|")}|${boxes
    .map((d) => `${d.key}:${Boolean(d.progress)}:${Boolean(d.failed)}`)
    .join(",")}|${[...requestedSources].join(",")}`;

  const priorityKey = `${priority.join("|")}/${(yieldToMeta || []).join("|")}`;
  useLayoutEffect(() => {
    const root = rootRef.current;
    const row = root?.parentElement;
    if (!row) return undefined;
    const meta = row.querySelector("[data-group-meta]");
    const refit = () => {
      const yieldSet = yieldToMeta ? new Set(yieldToMeta) : null;
      let next = measureFit(root, measurerRef.current, ranked, yieldSet);
      let reduced = false;
      // El título manda: si no cabe todo, fuera Trakt (media y botón).
      if (next.fit < ranked.length && reducedRanked.length < ranked.length) {
        next = measureFit(root, measurerRef.current, reducedRanked, yieldSet);
        reduced = true;
      }
      setFitState((prev) => (prev?.fit === next.fit && prev?.reduced === reduced ? prev : { fit: next.fit, reduced }));
      // Atributo y no estado: la línea la pinta la página, no este componente.
      if (meta && next.meta !== null) {
        meta.dataset.fit = next.meta === "short" ? "short" : next.meta ? "yes" : "no";
      }
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(row);
    const title = row.querySelector("[data-group-title]");
    if (title) ro.observe(title);
    // Plegada mide 0: su hijo interior sigue el ancho natural (cambia el número).
    if (meta?.firstElementChild) ro.observe(meta.firstElementChild);
    if (measurerRef.current) ro.observe(measurerRef.current);
    return () => ro.disconnect();
    // `ranked` cambia solo cuando cambian itemsKey o priorityKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, priorityKey]);

  // Sin medias sigue haciendo falta medir si cabe «N items · %»: un nodo
  // oculto (display:none no suma hueco en la fila) da acceso a la fila.
  if (!items.length && !boxes.length) return <div ref={rootRef} hidden />;

  const measured = items.filter((item) => priority.includes(item.key));
  const shown = fitState?.reduced ? reducedRanked : ranked;
  const keep = new Set(shown.slice(0, fitState?.fit ?? shown.length).map((item) => item.key));
  const visible = items.filter((item) => keep.has(item.key));
  const visibleBoxes = boxes.filter((d) => keep.has(boxKey(d.key)));

  return (
    // Elemento normal (no motion): framer escribiría su `transform` encima de
    // la escala de fijado. Alto mínimo = el del botón «+» (h-8 / sm:h-10):
    // las medias solo miden ~22 px y la cabecera encogía al terminar el
    // cálculo y desaparecer el botón.
    <div
      ref={rootRef}
      data-compact={compact || undefined}
      className={`sv-group-compact-scores relative flex min-h-8 shrink-0 items-center sm:min-h-10 ${className}`}
    >
      {/* Copia invisible con todas las medias, solo para medirlas. */}
      <div
        ref={measurerRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute right-0 top-0 flex items-center"
      >
        {boxes.map((d) => (
          <div key={d.key} data-key={boxKey(d.key)} className="flex shrink-0 pr-1.5 sm:pr-2">
            <OnDemandBox demand={d} />
          </div>
        ))}
        {/* Solo las que pueden pintarse y en el mismo orden: la última va
            sin margen derecho y medirla con él quitaba sitio a «N items · %». */}
        {measured.map((item, index) => (
          <div key={item.key} data-key={item.key} className="flex shrink-0">
            <ScoreItem item={item} index={index} count={measured.length} />
          </div>
        ))}
      </div>
      {visibleBoxes.map((d) => (
        <motion.div layout="position" key={boxKey(d.key)} className="flex shrink-0 pr-1.5 sm:pr-2">
          <OnDemandBox demand={d} />
        </motion.div>
      ))}
      {visible.map((item, index) => (
        <motion.div layout="position" key={item.key} className="flex shrink-0">
          <ScoreItem item={item} index={index} count={visible.length} />
        </motion.div>
      ))}
    </div>
  );
}
