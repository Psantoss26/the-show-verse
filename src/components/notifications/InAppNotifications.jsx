"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BookmarkMinus,
  BookmarkPlus,
  CheckCircle2,
  DownloadCloud,
  Eye,
  EyeOff,
  Heart,
  HeartOff,
  History,
  ImageIcon,
  Layers,
  Link2,
  ListPlus,
  ListX,
  MessageSquarePlus,
  MessageSquareX,
  MonitorPlay,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  StarOff,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Unlink,
  UserMinus,
  UserPlus,
  UserRound,
  X as XIcon,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  ALERTS_LOADED_EVENT,
  ALERTS_REFRESH_EVENT,
  alertLook,
  describeAlertGroup,
  freshAlertGroups,
} from "@/lib/notifications/alerts";
import {
  TOAST_EVENT,
  installActionFeedback,
  isRecentLocalAction,
  resolveTitleArt,
} from "@/lib/notifications/actionFeedbackClient";
import { getActivityDetailsHref } from "@/lib/profile/activityRatingTarget";

// VENTANAS EMERGENTES de la app: el único sitio donde se avisa de algo mientras
// la app está abierta. Tres fuentes, un solo aspecto (el cristal de la web):
//
//   1. Acciones de este dispositivo: cualquier cambio que termine bien
//      (favoritas, notas, vistos, listas, reseñas, ajustes…). Ver
//      installActionFeedback.
//   2. Push con la app a la vista: el service worker (Web Push) o la app de
//      Android (FCM) se lo pasan a la página en vez de pintar la notificación
//      del sistema.
//   3. Alertas de la campana: lo ocurrido desde que se abrió la app (sondeo
//      cada minuto, al navegar o al volver a la pestaña), incluida la actividad
//      hecha desde otro dispositivo.
//
// Otras partes de la web avisan con showToast (actionFeedbackClient.js).

const VISIBLE_MS = 6_000;
const MAX_TOASTS = 3;
const POLL_MS = 60_000;

// Colores de cada aviso: los mismos tonos que la campana y la Actividad del
// perfil (visto verde, pendientes azul, favoritas rojo, nota ámbar…).
const TONES = {
  emerald: { text: "text-emerald-400", bar: "bg-emerald-400", glow: "bg-emerald-500" },
  sky: { text: "text-sky-400", bar: "bg-sky-400", glow: "bg-sky-500" },
  red: { text: "text-red-400", bar: "bg-red-400", glow: "bg-red-500" },
  amber: { text: "text-amber-400", bar: "bg-amber-400", glow: "bg-amber-500" },
  purple: { text: "text-purple-400", bar: "bg-purple-400", glow: "bg-purple-500" },
  orange: { text: "text-orange-400", bar: "bg-orange-400", glow: "bg-orange-500" },
  pink: { text: "text-pink-400", bar: "bg-pink-400", glow: "bg-pink-500" },
  zinc: { text: "text-zinc-300", bar: "bg-zinc-300", glow: "bg-zinc-400" },
};

const ICONS = {
  favorite: { Icon: Heart, tone: "red", filled: true },
  unfavorite: { Icon: HeartOff, tone: "red" },
  watchlist: { Icon: BookmarkPlus, tone: "sky", filled: true },
  unwatchlist: { Icon: BookmarkMinus, tone: "sky" },
  rate: { Icon: Star, tone: "amber", filled: true },
  unrate: { Icon: StarOff, tone: "amber" },
  watched: { Icon: Eye, tone: "emerald" },
  autoWatched: { Icon: CheckCircle2, tone: "emerald" },
  unwatched: { Icon: EyeOff, tone: "zinc" },
  history: { Icon: History, tone: "emerald" },
  progress: { Icon: MonitorPlay, tone: "emerald" },
  completed: { Icon: Trophy, tone: "amber", filled: true },
  saga: { Icon: Layers, tone: "purple" },
  reminder: { Icon: Star, tone: "amber", filled: true },
  reminderReview: { Icon: MessageSquarePlus, tone: "orange" },
  dismiss: { Icon: ThumbsDown, tone: "zinc" },
  recommend: { Icon: Sparkles, tone: "purple" },
  list: { Icon: ListPlus, tone: "purple" },
  listRemove: { Icon: ListX, tone: "purple" },
  review: { Icon: MessageSquarePlus, tone: "orange" },
  reviewRemove: { Icon: MessageSquareX, tone: "orange" },
  like: { Icon: ThumbsUp, tone: "pink", filled: true },
  unlike: { Icon: ThumbsUp, tone: "zinc" },
  follow: { Icon: UserPlus, tone: "sky" },
  unfollow: { Icon: UserMinus, tone: "zinc" },
  profile: { Icon: UserRound, tone: "emerald" },
  settings: { Icon: SlidersHorizontal, tone: "emerald" },
  security: { Icon: Shield, tone: "emerald" },
  artwork: { Icon: ImageIcon, tone: "purple" },
  connect: { Icon: Link2, tone: "emerald" },
  disconnect: { Icon: Unlink, tone: "zinc" },
  import: { Icon: DownloadCloud, tone: "sky" },
  bell: { Icon: Bell, tone: "zinc" },
};

function posterSrc(toast) {
  if (toast.image) return toast.image;
  return toast.posterPath ? `https://image.tmdb.org/t/p/w185${toast.posterPath}` : null;
}

function Toast({ toast, onClose, onOpen }) {
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(VISIBLE_MS);

  // Se cierra solo; al pasar el ratón o enfocarlo se detiene y luego sigue
  // desde donde iba (la barra inferior se detiene con él).
  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onClose(toast.id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, onClose, toast.id]);

  const { Icon, tone: toneKey, filled } = ICONS[toast.icon] || ICONS.bell;
  const tone = TONES[toneKey] || TONES.zinc;
  const src = posterSrc(toast);
  // La acción en una frase corta. Sin texto (raro), el rótulo de la sección.
  const action = toast.text || toast.label || "Aviso";
  const hasRating = typeof toast.rating === "number" && toast.rating > 0;

  // UNA SOLA FILA, como las de la campana: cartel, icono de la acción y la
  // frase «Título · acción». El rótulo en mayúsculas y el texto aparte en
  // otra línea hacían del aviso una tarjeta de tres pisos para decir lo mismo
  // que la campana dice en una. Sin cartel (ajustes, conexiones, social…) el
  // icono ocupa su hueco y no se repite.
  const body = (
    <>
      {src ? (
        <span className="h-11 w-[30px] shrink-0 overflow-hidden rounded-md bg-white/[0.04]">
          <OptimizedImage src={src} alt="" width={30} height={44} className="h-full w-full object-cover" />
        </span>
      ) : null}
      {/* Una puntuación se ve como su nota en el hueco del icono, igual que en
          la campana (AlertsMenu), y no repetida en el texto. */}
      {hasRating ? (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums ${tone.text}`} aria-hidden="true">
          {toast.rating}
        </span>
      ) : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${tone.text}`} aria-hidden="true">
          <Icon className={`h-5 w-5 ${filled ? "fill-current" : ""}`} />
        </span>
      )}
      {/* Texto corrido, como en la campana (AlertsMenu): «Título · acción»
          completo y, si no cabe, en dos líneas. Antes iba en una sola línea y
          título y acción se recortaban con «…». El tope de tres líneas es solo
          para casos extremos (título y nombre de lista muy largos a la vez). */}
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-300 md:text-sm [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
        <span className="line-clamp-3 break-words">
          <span className="sr-only">{toast.label ? `${toast.label}: ` : ""}</span>
          {toast.title ? (
            <>
              <span className="font-bold text-white">{toast.title}</span>
              <span aria-hidden="true"> · </span>
              {action}
            </>
          ) : (
            <span className="font-semibold text-white">{action}</span>
          )}
          {hasRating ? <span className="sr-only"> · {toast.rating}/10</span> : null}
        </span>
      </span>
    </>
  );

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      // RADIOS CONCÉNTRICOS: 6px del cartel (rounded-md) + 8px de relleno
      // (p-2) = 14px de borde, para que las dos curvas vayan paralelas.
      className={`pointer-events-auto relative overflow-hidden rounded-[14px] text-white ${LIQUID_GLASS_PANEL}`}
    >
      {/* Reflejo del color de la acción detrás del cartel. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -left-10 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl ${tone.glow}`}
      />
      <div className="relative flex items-center gap-1 p-2 pr-1.5 pb-1">
        {toast.url ? (
          <button
            type="button"
            onClick={() => onOpen(toast)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{body}</div>
        )}
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          aria-label="Cerrar aviso"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {/* TIEMPO RESTANTE en su PROPIO carril, debajo de la fila y alineado con
          su relleno. Antes iba superpuesto (absoluto a 4-6px del borde): en
          móvil caía encima del canto del cartel y bajo el texto. Así no toca
          nada ni dibuja un filo en el borde del panel. */}
      <span aria-hidden="true" className="relative mx-3 mb-1.5 mt-0.5 block h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
        <span
          className={`sv-toast-timer block h-full origin-left rounded-full opacity-70 ${tone.bar}`}
          style={{ animationDuration: `${VISIBLE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
        />
      </span>
    </motion.li>
  );
}

let toastSeq = 0;

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

  const push = useCallback((incoming) => {
    toastSeq += 1;
    const toast = { ...incoming, id: `t${toastSeq}` };
    // Mismo `key`: el aviso nuevo sustituye al anterior en vez de apilarse.
    setToasts((current) =>
      [...current.filter((t) => !toast.key || t.key !== toast.key), toast].slice(-MAX_TOASTS),
    );
    // Completar título y cartel si la acción solo traía el id.
    if (toast.tmdbId && (!toast.title || !toast.posterPath) && !toast.image) {
      resolveTitleArt(toast.mediaType, toast.tmdbId).then((art) => {
        if (!art) return;
        setToasts((current) =>
          current.map((t) =>
            t.id === toast.id
              ? { ...t, title: t.title || art.title, posterPath: t.posterPath || art.posterPath }
              : t,
          ),
        );
      });
    }
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

  // Avisos de acciones (fetch) y de cualquier parte de la web (showToast).
  useEffect(() => {
    if (!accountId) return undefined;
    installActionFeedback();
    const onToast = (event) => {
      const detail = event.detail;
      if (!detail || (!detail.text && !detail.title)) return;
      push({
        ...detail,
        url: detail.url || (detail.tmdbId ? getActivityDetailsHref(detail) : null),
      });
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [accountId, push]);

  // Cambio de cuenta: se descartan los avisos de la anterior.
  useEffect(() => {
    if (!accountId) {
      setToasts([]);
      return;
    }
    openedAtRef.current = new Date().toISOString();
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
        ...alertLook(message.type),
        key: message.tag || null,
        title: message.title === "The Show Verse" ? null : message.title,
        text: message.body,
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
        skip: isRecentLocalAction,
      });
      for (const group of groups) {
        group.rows.forEach(({ item }) => shownRef.current.add(item.id));
        const content = describeAlertGroup(group.rows);
        if (!content?.text) continue;
        const { target, ...rest } = content;
        push({
          ...rest,
          key: `tsv:${group.key}`,
          tmdbId: target.tmdbId,
          mediaType: target.mediaType,
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
  // pulsar fuera.
  //
  // Siempre BAJO la barra superior, sin taparla. Desde 768px (tablet y
  // escritorio) a la derecha y con 24rem de ancho; en móvil, a todo el ancho
  // con margen lateral y en versión compacta (menos alto). Sin soporte de
  // popover queda como capa fija normal.
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
      className="pointer-events-none fixed inset-auto left-3 right-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100000] m-0 w-auto max-w-none overflow-visible border-0 bg-transparent p-0 text-white md:left-auto md:right-4 md:w-[24rem]"
    >
      <ol aria-live="polite" className="flex flex-col gap-1.5 md:gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onClose={close} onOpen={open} />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
