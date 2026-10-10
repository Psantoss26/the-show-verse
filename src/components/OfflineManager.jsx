"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { isServerReachable, PREPARATION_EVENT, reportConnection, runKey, saveOfflineRoute, workerMessage } from "@/lib/offline/client";
import { prepareOfflineAccount } from "@/lib/offline/prepare";
import { preparedKey, shouldPrepareAutomatically, withPreparationLock } from "@/lib/offline/schedule";
import { openSavedRoute } from "@/lib/offline/navigation";
import { hideBrokenImages } from "@/lib/offline/brokenImages";

const BUILD = process.env.NEXT_PUBLIC_SW_BUILD || "dev";
// La página a la que se llega ya la guarda el worker al servirla; volver a
// pedirla en cada cambio de ruta duplicaba cada documento. Se espera a que la
// vista asiente y no se repite si hay una copia reciente.
const ROUTE_SAVE_DELAY_MS = 3000;
const ROUTE_FRESH_MS = 30 * 60 * 1000;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export default function OfflineManager() {
  const { user, hydrated } = useAuth();
  const online = useServerOnline();
  const path = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  const active = useRef(null);
  // `start` del efecto de preparación, para que el botón «Actualizar» de
  // Ajustes lo pueda lanzar al momento (ver el efecto del evento manual).
  const startRef = useRef(null);
  const contextRef = useRef({ hydrated, userId: user?.id, online });

  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => {
    contextRef.current = { hydrated, userId: user?.id, online };
  }, [hydrated, user?.id, online]);

  useEffect(() => {
    if (!online || !user?.id) return;
    let timer;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void saveOfflineRoute(window.location.pathname + window.location.search, { freshSince: Date.now() - ROUTE_FRESH_MS });
      }, ROUTE_SAVE_DELAY_MS);
    };
    save();
    navigator.serviceWorker?.addEventListener("controllerchange", save);
    return () => {
      clearTimeout(timer);
      navigator.serviceWorker?.removeEventListener("controllerchange", save);
    };
  }, [path, online, user?.id]);

  useEffect(() => {
    if (!hydrated || !user?.id || !online || !("serviceWorker" in navigator)) return;
    let timer;
    let cancelled = false;
    let refreshPending = false;
    const report = (detail) => window.dispatchEvent(new CustomEvent(PREPARATION_EVENT, { detail }));
    // Las actualizaciones AUTOMÁTICAS (cambio de datos, nuevo service worker)
    // esperan 5 s para agruparse. La MANUAL (botón «Actualizar») arranca ya y lo
    // dice desde el primer instante: con la espera y sus salidas silenciosas,
    // pulsarlo parecía no hacer nada.
    const due = (reason) => shouldPrepareAutomatically({
      last: readJson(preparedKey(user.id)),
      build: BUILD,
      pending: Boolean(readJson(runKey(user.id))),
      reason,
    });
    const start = ({ manual = false, reason = "start" } = {}) => {
      if (!manual && !due(reason)) return;
      clearTimeout(timer);
      if (manual && !active.current) report({ phase: "preparing", completed: 0 });
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (!navigator.serviceWorker.controller) {
          if (!manual) return;
          // El service worker puede no controlar aún la página (primera carga,
          // recarga forzada): se le da un momento antes de rendirse.
          await Promise.race([
            new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
          if (cancelled) return;
          if (!navigator.serviceWorker.controller) { report({ phase: "no-worker" }); return; }
        }
        if (active.current) { refreshPending = true; return; }
        refreshPending = false;
        const controller = new AbortController();
        active.current = controller;
        try {
          // Otra pestaña puede estar copiando: entonces esta no hace nada. Con
          // el candado ya en la mano se vuelve a mirar si toca, porque otra
          // pestaña puede haber terminado la copia mientras esta esperaba.
          const { skipped } = await withPreparationLock(async () => {
            if (!manual && !due(reason)) return;
            await navigator.storage?.persist?.();
            const result = await prepareOfflineAccount({ id: user.id, username: user.username }, { signal: controller.signal });
            if (result) localStorage.setItem(preparedKey(user.id), JSON.stringify({ ...result, build: BUILD }));
          });
          if (skipped && manual) report({ phase: "preparing" });
        } catch (error) {
          if (!controller.signal.aborted) {
            console.warn("No se completó la copia para consulta sin conexión", error);
            report({ phase: "error" });
          }
        } finally {
          if (active.current === controller) active.current = null;
          if (refreshPending && !cancelled) start();
        }
      }, manual ? 0 : 5000);
    };
    startRef.current = start;
    const message = (event) => {
      if (event.data?.type === "OFFLINE_DATA_CHANGED") start({ reason: "data" });
      if (event.data?.type === "OFFLINE_STORAGE_FULL") {
        window.dispatchEvent(new CustomEvent("showverse:offline-preparation", { detail: { phase: "storage-full" } }));
      }
    };
    const automatic = () => start();
    navigator.serviceWorker.addEventListener("controllerchange", automatic);
    navigator.serviceWorker.addEventListener("message", message);
    start();
    return () => {
      if (startRef.current === start) startRef.current = null;
      cancelled = true;
      clearTimeout(timer);
      // Una copia a medias que se corta (se pierde el servidor, cambia la
      // sesión) lo DICE: antes se cancelaba en silencio y en Ajustes quedaba la
      // «Copia parcial» de la vez anterior. Al volver la conexión este mismo
      // efecto la relanza y prepareOfflineAccount la reanuda donde iba.
      if (active.current) {
        active.current.abort();
        report({ phase: "interrupted" });
      }
      navigator.serviceWorker.removeEventListener("controllerchange", automatic);
      navigator.serviceWorker.removeEventListener("message", message);
    };
  }, [hydrated, user?.id, user?.username, online]);

  // BOTÓN «ACTUALIZAR» DE AJUSTES. Se escucha SIEMPRE: antes solo había oyente
  // cuando se cumplían todas las condiciones de la preparación, y si faltaba
  // alguna el aviso se perdía sin más. Ahora, o arranca, o dice por qué no.
  useEffect(() => {
    const manual = () => {
      if (startRef.current) { startRef.current({ manual: true }); return; }
      const { hydrated: ready, userId, online: reachable } = contextRef.current;
      const phase = !("serviceWorker" in navigator)
        ? "no-worker"
        : !reachable
          ? "error"
          : ready && !userId
            ? "no-session"
            : null;
      if (phase) window.dispatchEvent(new CustomEvent(PREPARATION_EVENT, { detail: { phase } }));
    };
    window.addEventListener("showverse:offline-prepare", manual);
    return () => window.removeEventListener("showverse:offline-prepare", manual);
  }, []);

  useEffect(() => {
    // Offline links only open routes with a saved copy. They go through the App
    // Router: the worker answers with the saved page's full-tree Flight stream
    // (never a network response recorded for another router state), so there
    // is no document load and no browser loading bar. See openSavedRoute.
    const click = (event) => {
      if (isServerReachable() || !(event.target instanceof Element)) return;
      const control = event.target.closest('[data-online-only="true"]');
      if (control) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const link = event.target.closest("a[href]");
      // Enlaces que resuelven la navegación en el propio cliente (pestañas del
      // perfil): recargar el documento solo provocaría un parpadeo.
      if (link?.dataset.offlineLocalNav === "true") return;
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/") || url.href === window.location.href || (url.pathname === location.pathname && url.hash)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void openSavedRoute(url.href, { navigate: (target) => routerRef.current.push(target) });
    };
    const submit = (event) => {
      if (!isServerReachable() && event.target?.closest('[data-online-only="true"]')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    const stopHidingBrokenImages = hideBrokenImages(document);
    // Ask the controlling worker immediately on an offline document reload.
    void workerMessage({ type: "OFFLINE_STATUS" }).then((status) => {
      if (status?.online === false) reportConnection(false);
    });
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      stopHidingBrokenImages();
    };
  }, []);

  useEffect(() => {
    if (online) return;
    const originals = new Map();
    let frame;
    const mark = () => {
      for (const button of document.querySelectorAll('[data-online-only="true"]')) {
        if (originals.has(button)) continue;
        originals.set(button, button.getAttribute("aria-disabled"));
        button.setAttribute("aria-disabled", "true");
        button.setAttribute("data-offline-blocked", "true");
      }
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mark);
    });
    mark();
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const [button, original] of originals) {
        if (original === null) button.removeAttribute("aria-disabled");
        else button.setAttribute("aria-disabled", original);
        button.removeAttribute("data-offline-blocked");
      }
    };
  }, [online]);
  return null;
}
