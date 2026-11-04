"use client";

// Ruleta del Asistente (/assistant): elige al azar entre las recomendaciones.
//
// CARRETE DE PÓSTERS (como una tragaperras horizontal) en vez de la rueda de
// quesitos de colores con los nombres recortados, que era poco legible y no
// se parecía a nada de la app:
//  - Los pósters (con la escalera de idioma de las tarjetas) pasan bajo un
//    marco central y frenan poco a poco hasta pararse en el elegido.
//  - El elegido sale en una tarjeta con «Ver ficha» (la ficha rápida, igual
//    que los pósters del chat; en el móvil, la ficha completa), «Girar otra
//    vez» y «Descartar y girar».
//  - Debajo, quién participa: un toque saca o vuelve a meter un título
//    (como mínimo quedan 2).
//  - El giro es una animación WAAPI de `transform` en la pista (no en el
//    panel de cristal, que se vería plano: ver globals.css). Con «Reducir
//    movimiento» no hay giro: se elige y se muestra.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, Dices, Film, Shuffle, Star, Tv, X } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { mediaTypeOfRecommendation, useLadderPosters } from "./useLadderPoster";

// Vueltas del carrete: se repite la lista y se aterriza en una de las últimas
// copias, para que siempre haya recorrido de sobra.
const REPEATS = 12;
const LAND_REPEAT = 9;
const SPIN_MS = 4800;
// Frenada larga al final, como una ruleta de verdad.
const SPIN_EASING = "cubic-bezier(0.08, 0.72, 0.12, 1)";

function keyOf(item) {
  return `${mediaTypeOfRecommendation(item)}:${Number(item?.id)}`;
}

function tmdbPoster(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function Poster({ item, posters, size = "w342", className = "" }) {
  const key = keyOf(item);
  const ladder = posters?.[key];
  const src = tmdbPoster(ladder !== undefined ? ladder || item?.posterPath : null, size);
  const Icon = mediaTypeOfRecommendation(item) === "tv" ? Tv : Film;
  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${className}`}>
      {src ? (
        <OptimizedImage
          src={src}
          alt={item?.title || ""}
          className="h-full w-full object-cover"
          draggable={false}
          loading="eager"
          decoding="async"
        />
      ) : ladder !== undefined ? (
        <div className="grid h-full w-full place-items-center text-zinc-600">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
    </div>
  );
}

export default function AssistantRoulette({ items, onBack }) {
  const reduceMotion = useReducedMotion();
  const previewClick = usePreviewOpen();
  const [excluded, setExcluded] = useState(() => new Set());
  const [spinning, setSpinning] = useState(false);
  const [winnerKey, setWinnerKey] = useState(null);
  // Índice (dentro de la pista repetida) del póster que está bajo el marco.
  const [restIndex, setRestIndex] = useState(null);
  const [metrics, setMetrics] = useState({ step: 0, card: 0, viewport: 0 });

  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const animationRef = useRef(null);
  const resultRef = useRef(null);

  const unique = useMemo(() => {
    const seen = new Set();
    return (items || []).filter((item) => {
      const key = keyOf(item);
      if (!item?.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [items]);
  const active = useMemo(() => unique.filter((item) => !excluded.has(keyOf(item))), [unique, excluded]);
  const count = active.length;
  const { posters } = useLadderPosters(unique);

  const track = useMemo(() => {
    const out = [];
    for (let r = 0; r < REPEATS; r++) active.forEach((item, i) => out.push({ item, slot: r * count + i }));
    return out;
  }, [active, count]);

  // Medidas reales de un póster y del hueco entre pósters (cambian con el
  // ancho de pantalla).
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const trackEl = trackRef.current;
    if (!viewport || !trackEl) return undefined;
    const measure = () => {
      const cards = trackEl.children;
      if (cards.length < 2) return;
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      setMetrics({ step: b.left - a.left, card: a.width, viewport: viewport.clientWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [count]);

  const offsetFor = useCallback(
    (index) => metrics.viewport / 2 - (index * metrics.step + metrics.card / 2),
    [metrics],
  );

  // Al empezar o al cambiar quién participa, el carrete vuelve al principio
  // (segunda copia, para que haya pósters a los dos lados).
  useEffect(() => {
    animationRef.current?.cancel();
    setSpinning(false);
    setRestIndex(count ? count : null);
    setWinnerKey((prev) => (prev && active.some((item) => keyOf(item) === prev) ? prev : null));
  }, [count, active]);

  // Posición en reposo (sin animación).
  useLayoutEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl || spinning || restIndex == null || !metrics.step) return;
    trackEl.style.transform = `translateX(${offsetFor(restIndex)}px)`;
  }, [restIndex, metrics, offsetFor, spinning]);

  useEffect(() => () => animationRef.current?.cancel(), []);

  // Al pararse, la tarjeta del resultado se trae a la vista (con pantallas
  // bajas quedaba debajo de la caja de texto y había que buscarla).
  useEffect(() => {
    if (!winnerKey || spinning) return;
    const id = requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" }),
    );
    return () => cancelAnimationFrame(id);
  }, [winnerKey, spinning, reduceMotion]);

  function spinWith(pool) {
    const trackEl = trackRef.current;
    const n = pool.length;
    if (!trackEl || n < 2) return;
    const winner = Math.floor(Math.random() * n);
    const target = LAND_REPEAT * n + winner;
    setWinnerKey(null);

    if (reduceMotion || !metrics.step) {
      setRestIndex(target);
      setWinnerKey(keyOf(pool[winner]));
      return;
    }

    // Se parte de la MISMA imagen que hay ahora, pero en la segunda copia:
    // así siempre quedan vueltas por delante.
    const from = ((((restIndex ?? n) % n) + n) % n) + n;
    const fromX = offsetFor(from);
    const toX = offsetFor(target);
    animationRef.current?.cancel();
    setSpinning(true);
    const animation = trackEl.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
      { duration: SPIN_MS, easing: SPIN_EASING, fill: "forwards" },
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      trackEl.style.transform = `translateX(${toX}px)`;
      animation.cancel();
      setRestIndex(target);
      setSpinning(false);
      setWinnerKey(keyOf(pool[winner]));
    };
  }

  // «Descartar y girar»: se saca el elegido y se gira en cuanto el carrete
  // se ha recolocado con los que quedan (ver el efecto de `count`).
  const [pendingSpin, setPendingSpin] = useState(false);
  const spin = ({ exclude } = {}) => {
    if (spinning || count < 2) return;
    if (exclude) {
      if (count <= 2) return;
      setExcluded((prev) => new Set(prev).add(exclude));
      setPendingSpin(true);
      return;
    }
    spinWith(active);
  };
  useEffect(() => {
    if (!pendingSpin || spinning || restIndex !== count || !metrics.step) return;
    setPendingSpin(false);
    spinWith(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpin, restIndex, count, metrics.step]);

  const toggle = (item) => {
    if (spinning) return;
    const key = keyOf(item);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (unique.length - next.size > 2) next.add(key);
      return next;
    });
  };

  const winner = active.find((item) => keyOf(item) === winnerKey) || null;
  const winnerType = mediaTypeOfRecommendation(winner);
  const winnerHref = winner ? `/details/${winnerType}/${winner.id}` : "#";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 desktop:py-8">
      {/* Cabecera */}
      <div className="sv-assistant-rise mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition hover:text-cyan-100 ${LIQUID_GLASS_PANEL}`}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver al chat</span>
        </button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Dices className="h-5 w-5 text-cyan-300" />
            Ruleta
          </h2>
          <p className="truncate text-xs text-zinc-400">
            {count} {count === 1 ? "título" : "títulos"} en juego · uno al azar
          </p>
        </div>
      </div>

      {/* Carrete */}
      <div
        className={`sv-assistant-rise relative isolate overflow-hidden rounded-[2rem] py-6 ${LIQUID_GLASS_PANEL}`}
        style={{ "--sv-enter-delay": "60ms" }}
      >
        <div
          ref={viewportRef}
          className="relative"
          // Los pósters se desvanecen hacia los lados: el ojo va al centro.
          style={{
            maskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)",
          }}
        >
          <div ref={trackRef} className="flex w-max gap-3 will-change-transform" aria-hidden="true">
            {track.map(({ item, slot }) => {
              const isWinner = !spinning && slot === restIndex && keyOf(item) === winnerKey;
              return (
                <div
                  key={slot}
                  className={`w-[104px] shrink-0 transition-[transform,opacity] duration-500 sm:w-[132px] ${
                    isWinner ? "scale-[1.08]" : winnerKey && !spinning ? "opacity-50" : ""
                  }`}
                >
                  <Poster item={item} posters={posters} className="aspect-[2/3] w-full rounded-2xl shadow-lg shadow-black/40" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Marco central con flechas arriba y abajo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-3 left-1/2 w-[116px] -translate-x-1/2 rounded-[1.35rem] ring-2 ring-cyan-300/80 shadow-[0_0_40px_-6px_rgba(34,211,238,0.55)] sm:w-[146px]"
        >
          <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-cyan-300" />
          <span className="absolute -bottom-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-b-[9px] border-x-transparent border-b-cyan-300" />
        </div>
      </div>

      {/* Girar */}
      <div className="sv-assistant-rise mt-5 flex justify-center" style={{ "--sv-enter-delay": "120ms" }}>
        <button
          type="button"
          onClick={() => spin()}
          disabled={spinning || count < 2}
          className="inline-flex h-12 items-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 px-8 text-base font-bold text-zinc-950 shadow-[0_12px_32px_-10px_rgba(34,211,238,0.75)] transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Dices className={`h-5 w-5 ${spinning ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {spinning ? "Girando…" : winner ? "Girar otra vez" : "Girar"}
        </button>
      </div>

      {/* Resultado */}
      <div ref={resultRef} aria-live="polite" className="scroll-mb-4">
        {winner ? (
          <div key={winnerKey} className={`sv-assistant-rise mt-5 flex gap-4 rounded-[2rem] p-4 sm:gap-5 sm:p-5 ${LIQUID_GLASS_PANEL}`}>
            <Poster item={winner} posters={posters} className="aspect-[2/3] w-24 shrink-0 rounded-2xl sm:w-32" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="w-fit rounded-full bg-cyan-400/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                Te toca ver
              </span>
              <h3 className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-white sm:text-2xl">{winner.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-400">
                <span>{winnerType === "tv" ? "Serie" : "Película"}</span>
                {winner.year ? <span>· {winner.year}</span> : null}
                {winner.voteAverage ? (
                  <span className="inline-flex items-center gap-1 text-yellow-200">
                    · <Star className="h-3.5 w-3.5 fill-current" /> {Number(winner.voteAverage).toFixed(1)}
                  </span>
                ) : null}
              </p>
              {winner.matchTags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {winner.matchTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-bold text-zinc-300">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Link
                  href={winnerHref}
                  prefetch={false}
                  onClick={previewClick({ ...winner, media_type: winnerType }, { mediaType: winnerType })}
                  className="inline-flex h-10 items-center rounded-full bg-cyan-400 px-5 text-sm font-bold text-zinc-950 transition hover:bg-cyan-300"
                >
                  Ver ficha
                </Link>
                {count > 2 ? (
                  <button
                    type="button"
                    onClick={() => spin({ exclude: winnerKey })}
                    disabled={spinning}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.14] disabled:opacity-50"
                  >
                    <Shuffle className="h-4 w-4" />
                    Descartar y girar
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : !spinning ? (
          <p className="sv-assistant-fade mt-4 text-center text-sm text-zinc-400" style={{ "--sv-enter-delay": "180ms" }}>
            Pulsa <strong className="text-white">Girar</strong> y el carrete elegirá uno por ti.
          </p>
        ) : null}
      </div>

      {/* Quién participa */}
      <div className="sv-assistant-rise mt-6" style={{ "--sv-enter-delay": "180ms" }}>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">En la ruleta</h4>
          <span className="text-[11px] text-zinc-500">Toca un póster para sacarlo o volver a meterlo</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {unique.map((item) => {
            const key = keyOf(item);
            const out = excluded.has(key);
            const locked = !out && count <= 2;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(item)}
                disabled={spinning || locked}
                aria-pressed={!out}
                aria-label={`${out ? "Meter" : "Sacar"} «${item.title}»`}
                title={locked ? "Tienen que quedar al menos 2" : item.title}
                className={`relative w-12 shrink-0 overflow-hidden rounded-lg transition sm:w-14 ${
                  out ? "opacity-35 grayscale" : "ring-1 ring-white/10 hover:ring-cyan-300/70"
                } ${winnerKey === key ? "ring-2 ring-cyan-300" : ""} disabled:cursor-not-allowed`}
              >
                <Poster item={item} posters={posters} size="w154" className="aspect-[2/3] w-full" />
                {out ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                    <X className="h-4 w-4" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
