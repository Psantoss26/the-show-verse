"use client";

// Pieza LIGERA de la vista neural (sin canvas ni d3-force): el marco del
// lienzo y su esqueleto de carga. La usa el perfil mientras se descarga la
// vista, y la propia vista mientras llegan los datos, con el MISMO tamaño y
// forma: el relevo entre una y otra no mueve nada.

import { useLayoutEffect, useRef } from "react";

// Marco del lienzo (fuera de pantalla completa).
export const NEURAL_STAGE_CLASS = [
  // MÓVIL: sin ventana. La red ocupa todo el ancho (sale del margen lateral de
  // la página), llega al borde inferior de la pantalla —la barra inferior de
  // cristal flota encima— y no tiene esquinas, borde ni panel: solo un
  // resplandor suave que se desvanece antes de los bordes.
  "-mx-4 h-[calc(100dvh_-_var(--neural-top,16rem))] min-h-[320px]",
  "bg-[radial-gradient(85%_55%_at_50%_45%,rgba(16,185,129,0.09),transparent_75%)]",
  // TABLET Y ESCRITORIO: ventana con esquinas, hasta el borde inferior (en
  // táctil se reserva la barra inferior flotante).
  "@[640px]/detail-page:mx-0 @[640px]/detail-page:rounded-2xl @[640px]/detail-page:bg-white/[0.015]",
  "@[640px]/detail-page:bg-[radial-gradient(120%_90%_at_50%_0%,rgba(16,185,129,0.07),transparent_60%),radial-gradient(90%_80%_at_50%_100%,rgba(99,102,241,0.06),transparent_60%)]",
  "@[640px]/detail-page:h-[calc(100dvh_-_var(--neural-top,16rem)_-_5.25rem_-_env(safe-area-inset-bottom))] desktop:h-[calc(100dvh_-_var(--neural-top,16rem)_-_1.5rem)]",
].join(" ");

// Distancia de un elemento al principio del DOCUMENTO por offsetTop, que no
// cuenta transformaciones: las animaciones de entrada del perfil desplazan con
// transform y falsearían una medida con getBoundingClientRect.
export function documentTop(element) {
  let top = 0;
  for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
  return top;
}

/** Fija `--neural-top` del marco antes de pintar (su alto depende de ello). */
export function useStageTop(ref) {
  useLayoutEffect(() => {
    const stage = ref.current;
    if (stage) stage.style.setProperty("--neural-top", `${Math.round(documentTop(stage))}px`);
  });
}

// Una red de ejemplo: hubs y títulos a su alrededor, en tonos apagados. Solo
// indica "aquí va una red" mientras carga; late como los demás esqueletos.
const HUBS = [
  { x: 170, y: 120, r: 13 },
  { x: 290, y: 95, r: 10 },
  { x: 245, y: 200, r: 15 },
  { x: 120, y: 215, r: 9 },
  { x: 350, y: 190, r: 11 },
];
const DOTS = [
  [140, 90, 0], [200, 80, 0], [150, 150, 0], [205, 140, 0], [270, 60, 1], [320, 70, 1],
  [305, 125, 1], [215, 230, 2], [270, 240, 2], [230, 170, 2], [285, 175, 2], [95, 185, 3],
  [100, 245, 3], [145, 250, 3], [375, 160, 4], [380, 220, 4], [330, 230, 4], [255, 135, 1],
];

export function NeuralSkeletonArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <svg viewBox="60 40 360 230" className="h-auto w-[min(78%,30rem)] animate-pulse motion-reduce:animate-none">
        {DOTS.map(([x, y, hub], i) => (
          <line key={`l${i}`} x1={x} y1={y} x2={HUBS[hub].x} y2={HUBS[hub].y} stroke="rgba(161,161,170,0.18)" strokeWidth="1" />
        ))}
        {HUBS.map((hub, i) => (
          <line
            key={`h${i}`}
            x1={hub.x}
            y1={hub.y}
            x2={HUBS[(i + 2) % HUBS.length].x}
            y2={HUBS[(i + 2) % HUBS.length].y}
            stroke="rgba(161,161,170,0.1)"
            strokeWidth="1"
          />
        ))}
        {DOTS.map(([x, y], i) => (
          <circle key={`d${i}`} cx={x} cy={y} r="3.5" fill="rgba(255,255,255,0.14)" />
        ))}
        {HUBS.map((hub, i) => (
          <circle key={`c${i}`} cx={hub.x} cy={hub.y} r={hub.r} fill="rgba(16,185,129,0.22)" />
        ))}
      </svg>
      <span className="sr-only">Cargando la vista neural…</span>
    </div>
  );
}

/** Marcador de la vista mientras se descarga su código. */
export default function NeuralGraphSkeleton() {
  const ref = useRef(null);
  useStageTop(ref);
  return (
    <section ref={ref} aria-busy="true" aria-label="Vista neural de títulos" className={`relative isolate overflow-hidden ${NEURAL_STAGE_CLASS}`}>
      <NeuralSkeletonArt />
    </section>
  );
}
