"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  buildBackgroundCollageTiles,
  getDesktopBackgroundGrid,
} from "@/lib/lists/posterCollage";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

const COLLAGE_FEATHER_PX = 12;
const featherRamp = (direction, px = COLLAGE_FEATHER_PX) => `linear-gradient(${direction},
    transparent 0px,
    rgba(0, 0, 0, 0.104) ${px * 0.2}px,
    rgba(0, 0, 0, 0.352) ${px * 0.4}px,
    rgba(0, 0, 0, 0.648) ${px * 0.6}px,
    rgba(0, 0, 0, 0.896) ${px * 0.8}px,
    #000 ${px}px,
    #000 calc(100% - ${px}px),
    rgba(0, 0, 0, 0.896) calc(100% - ${px * 0.8}px),
    rgba(0, 0, 0, 0.648) calc(100% - ${px * 0.6}px),
    rgba(0, 0, 0, 0.352) calc(100% - ${px * 0.4}px),
    rgba(0, 0, 0, 0.104) calc(100% - ${px * 0.2}px),
    transparent 100%)`;

const collageTileStyle = (px = COLLAGE_FEATHER_PX) => ({
  inset: -px,
  WebkitMaskImage: `${featherRamp("to right", px)}, ${featherRamp("to bottom", px)}`,
  maskImage: `${featherRamp("to right", px)}, ${featherRamp("to bottom", px)}`,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
});

const DESKTOP_COLLAGE_FEATHER_RATIO = 0.15;
const DESKTOP_COLLAGE_REVEAL_CAP_MS = 2500;
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Caché en memoria para almacenar las carátulas sin idioma por título
const textlessPostersCache = new Map();

function interleaveTextlessPosters(postersByTitle) {
  const result = [];
  const seen = new Set();
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const list of postersByTitle) {
      if (round < list.length) {
        const url = list[round];
        if (url && !seen.has(url)) {
          seen.add(url);
          result.push(url);
          added = true;
        }
      }
    }
    round += 1;
  }
  return result;
}

export default function ActorCollageBackground({
  titles = [],
  fallbackPosters = [],
}) {
  const [grid, setGrid] = useState(null);
  const [textlessPosters, setTextlessPosters] = useState([]);

  useClientLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = getDesktopBackgroundGrid(
        window.innerWidth,
        window.innerHeight
      );
      setGrid((current) =>
        current &&
        current.cols === next.cols &&
        current.rows === next.rows &&
        Math.round(current.tileWidth) === Math.round(next.tileWidth)
          ? current
          : next
      );
    };
    const onResize = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Obtener carátulas sin texto de los títulos conocidos (múltiples por título)
  useEffect(() => {
    if (!Array.isArray(titles) || titles.length === 0) {
      setTextlessPosters([]);
      return;
    }

    let cancelled = false;
    const targets = titles
      .filter((t) => t?.id)
      .map((t) => ({
        id: t.id,
        mediaType: t.media_type === "tv" ? "tv" : "movie",
        key: `${t.media_type === "tv" ? "tv" : "movie"}:${t.id}`,
      }));

    if (targets.length === 0) {
      setTextlessPosters([]);
      return;
    }

    const allCached = targets.every((t) => textlessPostersCache.has(t.key));
    if (allCached) {
      const lists = targets.map((t) => textlessPostersCache.get(t.key) || []);
      const interleaved = interleaveTextlessPosters(lists);
      setTextlessPosters(interleaved);
      return;
    }

    Promise.all(
      targets.map(async (t) => {
        if (textlessPostersCache.has(t.key)) {
          return textlessPostersCache.get(t.key);
        }
        try {
          const images = await fetchTmdbImages(t.mediaType, t.id, {
            allLanguages: true,
          });
          const list = (images?.posters || [])
            .filter(
              (p) => p.file_path && (!p.iso_639_1 || p.iso_639_1 === "xx")
            )
            .map((p) => `https://image.tmdb.org/t/p/w185${p.file_path}`);
          textlessPostersCache.set(t.key, list);
          return list;
        } catch {
          textlessPostersCache.set(t.key, []);
          return [];
        }
      })
    ).then((lists) => {
      if (cancelled) return;
      const interleaved = interleaveTextlessPosters(lists);
      setTextlessPosters(interleaved);
    });

    return () => {
      cancelled = true;
    };
  }, [titles]);

  const activePosters = useMemo(() => {
    if (textlessPosters.length > 0) return textlessPosters;
    return fallbackPosters;
  }, [textlessPosters, fallbackPosters]);

  const uniquePosters = useMemo(() => {
    const valid = (Array.isArray(activePosters) ? activePosters : []).filter(
      (p) => typeof p === "string" && p.trim()
    );
    return [...new Set(valid)];
  }, [activePosters]);

  // Si hay suficientes pósters únicos sin texto, se recortan exactamente al número de celdas sin repetir ninguno.
  // Solo se recurre a buildBackgroundCollageTiles (que cicla) si el total es menor a la cantidad de celdas.
  const tiles = useMemo(() => {
    if (!grid?.count || uniquePosters.length === 0) return [];
    if (uniquePosters.length >= grid.count) {
      return uniquePosters.slice(0, grid.count);
    }
    return buildBackgroundCollageTiles(uniquePosters, [], grid.count);
  }, [uniquePosters, grid?.count]);

  const tileWidth = grid?.tileWidth || 160;
  const tileStyle = useMemo(
    () =>
      collageTileStyle(
        Math.max(
          COLLAGE_FEATHER_PX,
          Math.round(tileWidth * DESKTOP_COLLAGE_FEATHER_RATIO)
        )
      ),
    [tileWidth]
  );

  const [settled, setSettled] = useState(() => new Set());
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    setSettled(new Set());
    setCapped(false);
    const timer = window.setTimeout(
      () => setCapped(true),
      DESKTOP_COLLAGE_REVEAL_CAP_MS
    );
    return () => window.clearTimeout(timer);
  }, [uniquePosters]);

  const settle = (src) =>
    setSettled((current) => {
      if (current.has(src)) return current;
      const next = new Set(current);
      next.add(src);
      return next;
    });

  const ready =
    tiles.length > 0 &&
    (capped || uniquePosters.every((src) => settled.has(src)));

  return (
    <div
      data-actor-background="collage"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-black select-none"
      aria-hidden="true"
    >
      {/* Cuadrícula de pósters con desenfoque suave y difuminado */}
      {tiles.length > 0 && grid ? (
        <div
          data-actor-collage-grid
          className={`absolute inset-0 overflow-hidden transition-opacity duration-700 ease-out motion-reduce:transition-none ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="grid bg-neutral-950 w-full h-full"
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              transform: "scale(1.06)",
              transformOrigin: "top center",
              filter: "blur(6px) brightness(0.55) saturate(1.1)",
            }}
          >
            {tiles.map((src, index) => (
              <div
                key={`${index}-${src}`}
                className="relative aspect-[2/3] min-h-0"
              >
                <div className="absolute" style={tileStyle}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    decoding="async"
                    fetchPriority="low"
                    onLoad={() => settle(src)}
                    onError={() => settle(src)}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Degradado vertical tenue para contraste y legibilidad, idéntico al de detalles de listas */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_20%,rgba(0,0,0,0.75)_70%,#000000_100%)]" />

      {/* Tinte radial sutil y limpio similar a detalles de listas, sin niebla verde invasiva */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(13,148,136,0.08),transparent_32%)]" />
    </div>
  );
}
