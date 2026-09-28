"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, ImageOff, X as XIcon } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { AlertText, alertIcon } from "@/components/notifications/AlertsMenu";
import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  ALERTS_LOADED_EVENT,
  ALERTS_REFRESH_EVENT,
  freshAlertGroups,
} from "@/lib/notifications/alerts";
import { syncDevicePush } from "@/lib/notifications/devicePush";
import { getActivityDetailsHref } from "@/lib/profile/activityRatingTarget";

// Ventanas emergentes DENTRO de la app para lo que pasa mientras está abierta:
// un progreso sincronizado, un visto automático, un recordatorio de puntuar…
//
// Llegan por dos caminos, y se enseñan una sola vez aunque lleguen por los dos:
//   1. Push (instantáneo): el service worker (Web Push) o la app de Android
//      (FCM) no pintan notificación del sistema si la app está a la vista y se
//      lo pasan a la página.
//   2. Alertas de la campana: al cargarlas (navegar, volver a la pestaña, o el
//      sondeo de abajo cuando el dispositivo no tiene push) se enseña lo
//      ocurrido desde que se abrió la app.

const VISIBLE_MS = 8_000;
const MAX_TOASTS = 3;
// Sin push, la campana se consulta cada minuto mientras la app se ve.
const POLL_MS = 60_000;

function posterUrl(path) {
  return path ? `https://image.tmdb.org/t/p/w185${path}` : null;
}

function Toast({ toast, onClose, onOpen }) {
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);

  // `onClose` es estable: el temporizador solo se reinicia al pausar o reanudar.
  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => onClose(toast.id), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onClose, toast.id]);

  const first = toast.rows?.[0];
  const { Icon, tone, filled } = first ? alertIcon(first.kind, first.item) : { Icon: Bell, tone: "text-amber-400" };
  const image = toast.image || posterUrl(toast.rows?.find((row) => row.item.posterPath)?.item.posterPath);

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex items-stretch overflow-hidden rounded-2xl text-white ${LIQUID_GLASS_PANEL}`}
    >
      <button
        type="button"
        onClick={() => onOpen(toast)}
        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left text-sm transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      >
        <span className="h-16 w-11 shrink-0 overflow-hidden rounded-lg">
          {image ? (
            <OptimizedImage src={image} alt="" width={44} height={64} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-white/5 text-zinc-500">
              <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${tone}`} aria-hidden="true">
          <Icon className={`h-5 w-5 ${filled ? "fill-current" : ""}`} />
        </span>
        <span className="min-w-0 flex-1 leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
          {toast.rows ? (
            toast.rows.map(({ kind, item }) => (
              <span key={item.id} className="line-clamp-2">
                <AlertText kind={kind} item={item} />
              </span>
            ))
          ) : (
            <>
              <span className="block truncate font-bold">{toast.title}</span>
              {toast.body ? <span className="line-clamp-2 text-zinc-300">{toast.body}</span> : null}
            </>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label="Cerrar aviso"
        className="m-2 inline-flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </motion.li>
  );
}

export default function InAppNotifications() {
  const { account } = useAuth();
  const accountId = account?.id || null;
  const router = useRouter();
  const [toasts, setToasts] = useState([]);
  const containerRef = useRef(null);
  // Alertas ya enseñadas (por push o por la campana) en esta sesión de la página.
  const shownRef = useRef(new Set());
  // Solo lo ocurrido con la app abierta: lo anterior ya lo avisó el sistema o
  // está en la campana.
  const openedAtRef = useRef(new Date().toISOString());

  const push = useCallback((toast) => {
    setToasts((current) => [...current.filter((t) => t.key !== toast.key), toast].slice(-MAX_TOASTS));
  }, []);

  const close = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const open = useCallback(
    (toast) => {
      close(toast.id);
      if (toast.url) router.push(toast.url);
    },
    [close, router],
  );

  // Registrar de nuevo el dispositivo con esta cuenta, si ya tenía push.
  useEffect(() => {
    if (!accountId) {
      setToasts([]);
      return undefined;
    }
    openedAtRef.current = new Date().toISOString();
    syncDevicePush().catch(() => {});
    // App de Android: FCM renovó el token con la app abierta.
    const onToken = () => syncDevicePush().catch(() => {});
    window.addEventListener("tsv:push-token", onToken);
    return () => window.removeEventListener("tsv:push-token", onToken);
  }, [accountId]);

  // Mensajes push con la app a la vista.
  useEffect(() => {
    if (!accountId) return undefined;
    const showPush = (message) => {
      if (!message?.title) return;
      const ids = Array.isArray(message.alertIds)
        ? message.alertIds
        : String(message.alertIds || "").split(",").filter(Boolean);
      if (ids.length && ids.every((id) => shownRef.current.has(id))) return;
      ids.forEach((id) => shownRef.current.add(id));
      push({
        id: `push:${message.tag || ""}:${Date.now()}`,
        key: message.tag || `push:${Date.now()}`,
        title: message.title,
        body: message.body,
        url: message.url,
        image: message.image || null,
      });
      // La campana se pone al día con lo que acaba de llegar.
      window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT));
    };

    const onWorkerMessage = (event) => {
      if (event.data?.type === "TSV_PUSH") showPush(event.data.message);
      if (event.data?.type === "TSV_NAVIGATE" && typeof event.data.path === "string") {
        router.push(event.data.path);
      }
    };
    // App de Android: el nativo lanza este evento con el mensaje de FCM.
    const onAndroidPush = (event) => showPush(event.detail);

    const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
    worker?.addEventListener("message", onWorkerMessage);
    window.addEventListener("tsv:push", onAndroidPush);
    return () => {
      worker?.removeEventListener("message", onWorkerMessage);
      window.removeEventListener("tsv:push", onAndroidPush);
    };
  }, [accountId, push, router]);

  // Alertas nuevas que trae la campana.
  useEffect(() => {
    if (!accountId) return undefined;
    const onLoaded = (event) => {
      if (event.detail?.accountId !== accountId) return;
      const groups = freshAlertGroups(event.detail.alerts, {
        since: openedAtRef.current,
        shown: shownRef.current,
      });
      for (const group of groups) {
        group.rows.forEach(({ item }) => shownRef.current.add(item.id));
        const target = group.rows.find((row) => row.kind === "reminder")?.item || group.rows[group.rows.length - 1].item;
        push({
          id: `alerts:${group.key}:${Date.now()}`,
          key: `tsv:${group.key}`,
          rows: group.rows,
          url: getActivityDetailsHref(target),
        });
      }
    };
    window.addEventListener(ALERTS_LOADED_EVENT, onLoaded);
    return () => window.removeEventListener(ALERTS_LOADED_EVENT, onLoaded);
  }, [accountId, push]);

  // Sondeo mientras la app se ve. Con push llega antes por el otro camino;
  // sin push (permiso denegado, navegador sin soporte) es lo único que hay.
  useEffect(() => {
    if (!accountId) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [accountId]);

  // Capa superior (popover manual): por encima de modales y sin cerrarse al
  // pulsar fuera. Sin soporte de popover queda como capa fija normal.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    const isOpen = el.matches(":popover-open");
    if (toasts.length && !isOpen) el.showPopover();
    if (!toasts.length && isOpen) el.hidePopover();
  }, [toasts.length]);

  if (!accountId) return null;

  return (
    <section
      ref={containerRef}
      popover="manual"
      aria-label="Avisos"
      className="pointer-events-none fixed inset-auto right-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100000] m-0 w-[min(24rem,calc(100vw-2rem))] overflow-visible border-0 bg-transparent p-0 text-white"
    >
      <ol aria-live="polite" className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onClose={close} onOpen={open} />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
