"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { isServerReachable, saveOfflineRoute, workerMessage } from "@/lib/offline/client";
import { prepareOfflineAccount } from "@/lib/offline/prepare";

export default function OfflineManager() {
  const { user, hydrated } = useAuth();
  const online = useServerOnline();
  const path = usePathname();
  const active = useRef(null);

  useEffect(() => {
    if (!online || !user?.id) return;
    const timer = setTimeout(() => { void saveOfflineRoute(window.location.pathname + window.location.search); }, 1800);
    return () => clearTimeout(timer);
  }, [path, online, user?.id]);

  useEffect(() => {
    if (!hydrated || !user?.id || !online || !("serviceWorker" in navigator)) return;
    let timer;
    let cancelled = false;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled || !navigator.serviceWorker.controller || active.current) return;
        const controller = new AbortController();
        active.current = controller;
        try {
          await navigator.storage?.persist?.();
          const result = await prepareOfflineAccount({ id: user.id, username: user.username }, { signal: controller.signal });
          if (result) localStorage.setItem(`showverse:offline:prepared:${user.id}`, JSON.stringify(result));
        } catch (error) {
          if (!controller.signal.aborted) console.warn("No se completó la copia para consulta sin conexión", error);
        } finally { if (active.current === controller) active.current = null; }
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
    // Full document navigation in offline mode avoids replaying Next Flight
    // responses produced for a different router state. Filters and local tabs
    // remain usable; saved pages still render their original React components.
    const click = (event) => {
      if (isServerReachable() || !(event.target instanceof Element)) return;
      const control = event.target.closest('[data-online-only="true"]');
      if (control) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const link = event.target.closest("a[href]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/") || url.href === window.location.href || (url.pathname === location.pathname && url.hash)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.location.assign(url.href);
    };
    const submit = (event) => {
      if (!isServerReachable() && event.target?.closest('[data-online-only="true"]')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    // Ask the controlling worker immediately on an offline document reload.
    void workerMessage({ type: "OFFLINE_STATUS" });
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
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
