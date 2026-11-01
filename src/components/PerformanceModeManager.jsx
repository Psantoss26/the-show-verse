"use client";

import { useEffect } from "react";
import {
  PERF_MODE_EVENT,
  applyPerformanceMode,
  isJankyWindow,
  readPerfMode,
  readPerfProbe,
  recordWindow,
  writePerfProbe,
} from "@/lib/ui/performanceMode";

// Mide si el dispositivo va a tirones y, si es así, activa el modo ligero
// (ver src/lib/ui/performanceMode.js). Solo en «Automático» y solo mientras no
// haya veredicto: un equipo ya marcado, o con el modo elegido a mano, no mide.
//
// Se mide DURANTE EL SCROLL (de la página o de cualquier carrusel o panel,
// por eso el oyente va en captura), que es donde se notan los tirones y donde
// el cristal cuesta más. Fuera de él no corre ningún bucle de fotogramas, así
// que en reposo no gasta nada.
const WARMUP_MS = 3000; // la hidratación y las primeras cargas no cuentan
const IDLE_MS = 150; // sin scroll este tiempo = fin de la racha
const MAX_WINDOW_MS = 2000; // rachas largas se cortan en trozos

export default function PerformanceModeManager() {
  useEffect(() => {
    let cleanup = null;

    const start = () => {
      cleanup?.();
      cleanup = null;
      if (!applyPerformanceMode() && readPerfMode() === "auto") cleanup = watchScrollFrames();
    };

    start();
    window.addEventListener(PERF_MODE_EVENT, start);
    return () => {
      window.removeEventListener(PERF_MODE_EVENT, start);
      cleanup?.();
    };
  }, []);

  return null;
}

function watchScrollFrames() {
  const readyAt = performance.now() + WARMUP_MS;
  let sampling = false;
  let startedAt = 0;
  let last = 0;
  let intervals = [];
  let raf = 0;
  let idleTimer = 0;

  const tick = (t) => {
    // El primer intervalo de la racha va desde antes del primer fotograma
    // pedido: no se cuenta.
    if (last) intervals.push(t - last);
    last = t;
    raf = requestAnimationFrame(tick);
  };

  const finish = () => {
    if (!sampling) return;
    sampling = false;
    cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    const frames = intervals;
    intervals = [];
    last = 0;
    if (document.visibilityState !== "visible") return;

    const janky = isJankyWindow(frames);
    if (janky === null) return;
    const probe = recordWindow(readPerfProbe(), janky);
    writePerfProbe(probe);
    if (probe.verdict === "lite") {
      applyPerformanceMode();
      stop();
    }
  };

  const onScroll = () => {
    const now = performance.now();
    if (now < readyAt || document.visibilityState !== "visible") return;
    if (!sampling) {
      sampling = true;
      startedAt = now;
      raf = requestAnimationFrame(tick);
    } else if (now - startedAt > MAX_WINDOW_MS) {
      finish();
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(finish, IDLE_MS);
  };

  const onHidden = () => {
    if (document.visibilityState !== "visible") finish();
  };

  const opts = { capture: true, passive: true };
  window.addEventListener("scroll", onScroll, opts);
  document.addEventListener("visibilitychange", onHidden);

  function stop() {
    window.removeEventListener("scroll", onScroll, opts);
    document.removeEventListener("visibilitychange", onHidden);
    cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    sampling = false;
  }
  return stop;
}
