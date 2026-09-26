"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { isServerReachable, reportConnection, saveOfflineRoute, workerMessage } from "@/lib/offline/client";
import { prepareOfflineAccount } from "@/lib/offline/prepare";
import { openSavedRoute } from "@/lib/offline/navigation";
import { hideBrokenImages } from "@/lib/offline/brokenImages";

export default function OfflineManager() {
  const { user, hydrated } = useAuth();
  const online = useServerOnline();
  const path = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  const active = useRef(null);

  useEffect(() => { routerRef.current = router; }, [router]);

  useEffect(() => {
    if (!online || !user?.id) return;
    const save = () => { void saveOfflineRoute(window.location.pathname + window.location.search); };
    save();
    navigator.serviceWorker?.addEventListener("controllerchange", save);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", save);
  }, [path, online, user?.id]);

  useEffect(() => {
    if (!hydrated || !user?.id || !online || !("serviceWorker" in navigator)) return;
    let timer;
    let cancelled = false;
    let refreshPending = false;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled || !navigator.serviceWorker.controller) return;
        if (active.current) { refreshPending = true; return; }
        refreshPending = false;
        const controller = new AbortController();
        active.current = controller;
        try {
          await navigator.storage?.persist?.();
          const result = await prepareOfflineAccount({ id: user.id, username: user.username }, { signal: controller.signal });
          if (result) localStorage.setItem(`showverse:offline:prepared:${user.id}`, JSON.stringify(result));
        } catch (error) {
          if (!controller.signal.aborted) console.warn("No se completó la copia para consulta sin conexión", error);
        } finally {
          if (active.current === controller) active.current = null;
          if (refreshPending && !cancelled) start();
        }
      }, 5000);
    };
    const message = (event) => {
      if (event.data?.type === "OFFLINE_DATA_CHANGED") start();
      if (event.data?.type === "OFFLINE_STORAGE_FULL") {
        window.dispatchEvent(new CustomEvent("showverse:offline-preparation", { detail: { phase: "storage-full" } }));
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", start);
    navigator.serviceWorker.addEventListener("message", message);
    window.addEventListener("showverse:offline-prepare", start);
    start();
    return () => {
      window.removeEventListener("showverse:offline-prepare", start);
      cancelled = true;
      clearTimeout(timer);
      active.current?.abort();
      navigator.serviceWorker.removeEventListener("controllerchange", start);
      navigator.serviceWorker.removeEventListener("message", message);
    };
  }, [hydrated, user?.id, user?.username, online]);

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
