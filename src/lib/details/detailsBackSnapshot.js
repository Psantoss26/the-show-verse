"use client";

// INSTANTÁNEA DE LA FICHA PARA VOLVER ATRÁS.
//
// Al pasar de una ficha a otro título (Recomendaciones, Reparto, Colección…) y
// volver con atrás, el App Router REMONTA la ficha: todo su estado de cliente
// arrancaba de cero y la página se volvía a cargar delante del usuario (el
// reparto pedía sus datos otra vez y, mientras, todas las secciones de debajo
// desaparecían; cada bloque repetía su animación de entrada). La posición de
// scroll sí se restauraba, pero sobre un contenido que se estaba reconstruyendo.
//
// Solución: mientras la ficha está montada se anota el último valor de su
// estado relevante y, al desmontar, se guarda en memoria. Si el siguiente
// montaje de ese mismo título viene de atrás/adelante, arranca YA con ese
// estado y sus efectos de carga no se repiten: la ficha se pinta exactamente
// como se dejó, estática, desde el primer fotograma.
//
// Solo memoria del documento (no sessionStorage): una recarga no es "volver" y
// debe cargar fresco, y así el primer render de la hidratación nunca difiere
// del HTML del servidor.

import { useEffect, useLayoutEffect, useMemo } from "react";
import { isHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";

const SNAPSHOTS = new Map();
const MAX_SNAPSHOTS = 8;
const MAX_AGE_MS = 30 * 60 * 1000;

// Las dependencias de un efecto se comparan entre montajes distintos: los
// objetos y funciones cambian de identidad en cada montaje aunque representen
// lo mismo, así que solo cuentan los valores primitivos.
const OPAQUE = Symbol("opaque");

function normalizeDeps(deps) {
  return deps.map((value) =>
    value !== null && (typeof value === "object" || typeof value === "function")
      ? OPAQUE
      : value,
  );
}

function sameDeps(saved, deps) {
  if (!saved || saved.length !== deps.length) return false;
  const next = normalizeDeps(deps);
  return next.every((value, index) => Object.is(value, saved[index]));
}

function readSnapshot(key) {
  const entry = SNAPSHOTS.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    SNAPSHOTS.delete(key);
    return null;
  }
  return entry;
}

function saveSnapshot(session) {
  if (!session?.key) return;
  SNAPSHOTS.delete(session.key);
  SNAPSHOTS.set(session.key, {
    values: { ...session.live },
    deps: { ...session.liveDeps },
    savedAt: Date.now(),
  });
  while (SNAPSHOTS.size > MAX_SNAPSHOTS) {
    SNAPSHOTS.delete(SNAPSHOTS.keys().next().value);
  }
}

function openSession(key) {
  const snapshot =
    typeof window !== "undefined" && isHistoryNavigation()
      ? readSnapshot(key)
      : null;
  return {
    key,
    restored: Boolean(snapshot),
    values: snapshot?.values || null,
    // Se copian: cada efecto borra su entrada en cuanto diverge.
    deps: snapshot ? { ...snapshot.deps } : null,
    live: {},
    liveDeps: {},
  };
}

/**
 * Sesión de instantánea de un montaje de la ficha. `session.restored` indica
 * que este montaje viene de atrás/adelante y ha recuperado el estado anterior.
 */
export function useDetailsSnapshot(key) {
  const session = useMemo(() => openSession(key), [key]);
  useEffect(() => () => saveSnapshot(session), [session]);
  return session;
}

/**
 * Valor inicial de un `useState` restaurable:
 *   useState(() => restoredValue(session, "nombre", inicial))
 * En un montaje restaurado devuelve el último valor del montaje anterior del
 * mismo título; si no, `inicial` (o su resultado, si es una función).
 */
export function restoredValue(session, name, initial) {
  if (session.values && Object.hasOwn(session.values, name)) {
    return session.values[name];
  }
  return typeof initial === "function" ? initial() : initial;
}

/**
 * Anota tras cada render los valores actuales del estado restaurable; son los
 * que se guardan al desmontar. Las claves deben coincidir con las usadas en
 * `restoredValue`.
 */
export function useSnapshotValues(session, values) {
  useLayoutEffect(() => {
    Object.assign(session.live, values);
  });
}

// ¿Se puede saltar esta ejecución? Solo si el montaje es restaurado, el efecto
// se ejecutó por última vez con las mismas dependencias y su trabajo había
// terminado (`settled`): si se salió con una carga a medias, se repite.
function shouldSkip(session, name, deps, settled) {
  session.liveDeps[name] = normalizeDeps(deps);
  const saved = session.deps?.[name];
  if (!saved) return false;
  if (settled && sameDeps(saved, deps)) return true;
  // Ha divergido: desde aquí el efecto se comporta con normalidad.
  delete session.deps[name];
  return false;
}

/**
 * `useEffect` de carga que no se repite al volver: en un montaje restaurado se
 * salta mientras sus dependencias sean las de la última ejecución anterior.
 */
export function useRestorableEffect(session, name, effect, deps, settled = true) {
  useEffect(() => {
    if (shouldSkip(session, name, deps, settled)) return undefined;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useRestorableLayoutEffect(
  session,
  name,
  effect,
  deps,
  settled = true,
) {
  useLayoutEffect(() => {
    if (shouldSkip(session, name, deps, settled)) return undefined;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
