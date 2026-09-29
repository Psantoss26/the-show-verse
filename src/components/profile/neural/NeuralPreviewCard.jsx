"use client";

// VISTA PREVIA de la vista neuronal para el lateral de Perfil: una miniatura
// estática de la red, sin simulación ni worker (no carga d3-force).
//
//   - Posiciones: la disposición guardada de la vista (la misma red que se ve
//     en la pestaña, en pequeño) o, si aún no se ha abierto, las posiciones de
//     partida, que ya salen agrupadas por género.
//   - Datos: se piden solo cuando el bloque entra en pantalla, y son los mismos
//     que usa la pestaña, así que al abrirla después ya están.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildNeuralGraph, fitCamera } from "@/lib/profile/neuralGraph";
import {
  getCachedNeuralGraph,
  getNeuralLayout,
  neuralLayoutKey,
  saveNeuralLayout,
  useNeuralPayload,
} from "@/lib/profile/neuralGraphData";
import { NeuralSkeletonArt } from "./NeuralGraphSkeleton";

const TOP_LABELS = 5;

// Disposición asentada de la red: la guardada por la vista o, si no hay, la
// que calcula su mismo worker en modo instantáneo (fuera del hilo principal).
// Se guarda, así que la pestaña se abre después con esta misma red.
function useSettledLayout(username, payload, graph) {
  const layoutKey = neuralLayoutKey(username, payload, "genre-saga");
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    if (!graph?.nodes.length) return undefined;
    const saved = getNeuralLayout(layoutKey, graph.nodes.length);
    if (saved) {
      setLayout(saved.positions);
      return undefined;
    }
    setLayout(null);
    const worker = new Worker(new URL("./neuralGraph.worker.js", import.meta.url), { type: "module" });
    let lastPositions = null;
    worker.onmessage = ({ data }) => {
      if (data.type === "tick") {
        lastPositions = data.positions;
        return;
      }
      if (data.type !== "end" || !lastPositions) return;
      const positions = lastPositions;
      saveNeuralLayout(layoutKey, { positions, camera: null });
      setLayout(positions);
      worker.terminate();
    };
    worker.postMessage({
      type: "init",
      nodes: graph.nodes.map((node) => ({
        x: node.x,
        y: node.y,
        r: node.r,
        charge: node.kind === "genre" ? -320 : node.kind === "saga" ? -40 : -26,
        saga: node.kind === "saga",
      })),
      links: graph.links,
      instant: true,
    });
    return () => worker.terminate();
  }, [graph, layoutKey]);

  return layout;
}

function PreviewCanvas({ username }) {
  const { status, payload } = useNeuralPayload(username);
  const canvasRef = useRef(null);
  const graph = useMemo(() => (payload ? buildNeuralGraph(payload) : null), [payload]);
  const positions = useSettledLayout(username, payload, graph);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph?.nodes.length || !positions) return undefined;
    const P = positions;
    const px = (i) => (P ? P[i * 2] : graph.nodes[i].x);
    const py = (i) => (P ? P[i * 2 + 1] : graph.nodes[i].y);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      // AMPLIADA: se encuadra el NÚCLEO de la red (el 85% de los nodos más
      // cercanos al centro), no los grupos sueltos de los bordes, que dejaban
      // la red diminuta. Lo de fuera se sale por los lados.
      const points = graph.nodes.map((node, i) => ({ x: px(i), y: py(i), r: node.r }));
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const distances = points.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
      const limit = distances[Math.floor((distances.length - 1) * 0.85)] ?? Infinity;
      const core = points.filter((p) => Math.hypot(p.x - cx, p.y - cy) <= limit);
      const fit = fitCamera(core.length ? core : points, rect.width, rect.height, { padding: 6, maxK: 2 });
      // Un 30% más cerca: la tarjeta es apaisada y la red suele ser más alta
      // que ancha; así llena el ancho a costa de recortar arriba y abajo.
      const zoom = 1.3;
      const cam = { x: fit.x * zoom, y: fit.y * zoom, k: fit.k * zoom };
      const scale = dpr * cam.k;
      ctx.setTransform(scale, 0, 0, scale, dpr * (rect.width / 2 + cam.x), dpr * (rect.height / 2 + cam.y));
      ctx.clearRect(-1e5, -1e5, 2e5, 2e5);

      ctx.lineWidth = 1 / cam.k;
      ctx.strokeStyle = "rgba(161,161,170,0.16)";
      ctx.beginPath();
      for (const [a, b] of graph.links) {
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();

      // Títulos primero y géneros encima, un trazo por color.
      const byColor = new Map();
      graph.nodes.forEach((node, i) => {
        const key = `${node.kind === "title" ? 0 : 1}|${node.color}`;
        if (!byColor.has(key)) byColor.set(key, []);
        byColor.get(key).push(i);
      });
      for (const key of [...byColor.keys()].sort()) {
        const indices = byColor.get(key);
        ctx.fillStyle = graph.nodes[indices[0]].color;
        ctx.beginPath();
        for (const i of indices) {
          const r = graph.nodes[i].r;
          ctx.moveTo(px(i) + r, py(i));
          ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // Nombres de los géneros principales, en tamaño de pantalla.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.fillStyle = "#ffffff";
      // Un nombre que pisaría a otro ya colocado (más importante) se omite.
      const placed = [];
      graph.nodes
        .map((node, i) => ({ node, i }))
        .filter(({ node }) => node.kind === "genre")
        .sort((a, b) => b.node.degree - a.node.degree)
        .slice(0, TOP_LABELS)
        .forEach(({ node, i }) => {
          const sx = px(i) * cam.k + rect.width / 2 + cam.x;
          const sy = (py(i) + node.r) * cam.k + rect.height / 2 + cam.y + 2;
          const half = ctx.measureText(node.label).width / 2 + 3;
          const box = { x0: sx - half, x1: sx + half, y0: sy - 1, y1: sy + 13 };
          if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) return;
          placed.push(box);
          ctx.strokeText(node.label, sx, sy);
          ctx.fillText(node.label, sx, sy);
        });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph, positions]);

  if (status === "error" && !graph) {
    return <p className="flex h-full items-center justify-center text-xs font-semibold text-zinc-500">No se pudo cargar la red.</p>;
  }
  if (graph && !graph.stats.titles) {
    return <p className="flex h-full items-center justify-center text-xs font-semibold text-zinc-500">Aún no hay títulos que conectar.</p>;
  }

  return (
    <>
      {!positions ? <NeuralSkeletonArt /> : null}
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
    </>
  );
}

/**
 * Bloque del lateral: miniatura de la red que abre la pestaña Neuronal.
 * `onOpen` navega a la pestaña; `onIntent` adelanta su carga.
 */
function PreviewStats({ username }) {
  const { payload } = useNeuralPayload(username);
  if (!payload?.titles?.length) return null;
  return (
    <p className="mt-2 text-center text-[11px] font-semibold text-zinc-500">
      {payload.titles.length} títulos · {payload.genres?.length || 0} géneros · {payload.sagas?.length || 0} sagas
    </p>
  );
}

export default function NeuralPreviewCard({ username, onOpen, onIntent }) {
  const ref = useRef(null);
  // Solo se piden los datos cuando el bloque llega a verse (o si ya están).
  const [visible, setVisible] = useState(() => Boolean(getCachedNeuralGraph(username)));

  useEffect(() => {
    if (visible) return undefined;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div>
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      aria-label="Abrir la vista neuronal"
      className="relative block h-52 w-full overflow-hidden rounded-2xl bg-white/[0.02] bg-[radial-gradient(120%_90%_at_50%_0%,rgba(16,185,129,0.08),transparent_60%),radial-gradient(90%_80%_at_50%_100%,rgba(99,102,241,0.06),transparent_60%)] transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
    >
      {visible ? <PreviewCanvas username={username} /> : <NeuralSkeletonArt />}
    </button>
    {visible ? <PreviewStats username={username} /> : null}
    </div>
  );
}
