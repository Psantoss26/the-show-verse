"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  buildBackgroundCollageTiles,
  getDesktopBackgroundGrid,
} from "@/lib/lists/posterCollage";
import { peekListArtwork, requestListArtwork } from "@/lib/tmdb/artworkBatch";

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
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Títulos de los que se piden pósters: los primeros de la lista que llega
// (ya ordenada por relevancia). Caben en UN lote de /api/tmdb/artwork.
const MAX_COLLAGE_TITLES = 60;

const titleTarget = (title) => {
  const id = Number(title?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const mediaType = title?.media_type === "tv" ? "tv" : "movie";
  return { id, mediaType, key: `${mediaType}:${id}` };
};

const textlessPosterUrl = (picks) =>
  picks?.textlessPoster ? `https://image.tmdb.org/t/p/w185${picks.textlessPoster}` : null;

// FONDO de la ficha de una persona: un mosaico SOLO con pósters SIN IDIOMA
// (sin título impreso) de los títulos de su filmografía, más relevantes
// primero. Se piden todos en un único lote al servidor (/api/tmdb/artwork,
// cacheado un día); un título sin póster neutro no entra (ni su backdrop ni
// un póster con texto). Sin ninguno, queda el fondo liso.
export default function ActorCollageBackground({ titles = [] }) {
  // Sin medida hasta montar, igual en el servidor y en el cliente: calcularla
  // al crear el estado (con `window` en el cliente y 1280×900 en el
  // servidor) daba HTML distinto y React avisaba de un error de hidratación.
  // Se mide en el efecto de maquetación, antes de pintar.
  const [grid, setGrid] = useState(null);

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

  const targets = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const title of Array.isArray(titles) ? titles : []) {
      const target = titleTarget(title);
      if (!target || seen.has(target.key)) continue;
      seen.add(target.key);
      out.push(target);
      if (out.length >= MAX_COLLAGE_TITLES) break;
    }
    return out;
  }, [titles]);
  const targetKey = targets.map((target) => target.key).join("|");

  // Lo que ya está en la caché del lote (volver a la ficha) sale al momento;
  // si falta algo se espera al lote completo para no cambiar las celdas
  // después.
  const [resolved, setResolved] = useState({ key: "", posters: [] });
  useEffect(() => {
    if (!targets.length) return undefined;
    let cancelled = false;
    Promise.all(
      targets.map((target) => requestListArtwork(target.mediaType, target.id)),
    ).then((picks) => {
      if (!cancelled) {
        setResolved({ key: targetKey, posters: picks.map(textlessPosterUrl).filter(Boolean) });
      }
    });
    return () => {
      cancelled = true;
    };
    // `targetKey` identifica la lista de títulos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const activePosters = useMemo(() => {
    if (resolved.key === targetKey) return resolved.posters;
    const cached = targets.map((target) => peekListArtwork(target.mediaType, target.id));
    return cached.every((picks) => picks !== undefined)
      ? cached.map(textlessPosterUrl).filter(Boolean)
      : [];
  }, [resolved, targetKey, targets]);

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
          className="absolute inset-0 overflow-hidden transition-opacity duration-300 ease-out"
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
                    loading={index < (grid.cols * 2) ? "eager" : "lazy"}
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
