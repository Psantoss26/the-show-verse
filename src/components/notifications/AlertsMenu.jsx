"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  BookmarkPlus,
  CheckCircle2,
  Eye,
  Heart,
  ImageOff,
  Layers,
  Loader2,
  MessageSquarePlus,
  MonitorPlay,
  Sparkles,
  Star,
  Trophy,
  X as XIcon,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { useTranslation } from "@/lib/i18n";
import {
  addDismissed,
  alertsDismissedKey,
  alertsLastSeenKey,
  alertsUnreadKey,
  countUnread,
  episodeCode,
  normalizeAlerts,
  platformLabel,
  relativeTime,
  upcomingRelease,
} from "@/lib/notifications/alerts";
import {
  formatActivityRatingTarget,
  getActivityDetailsHref,
} from "@/lib/profile/activityRatingTarget";
import { profileTabHref } from "@/app/u/[username]/profileRoutes";

// Icono y tono de cada acción: los MISMOS que la Actividad del perfil, para
// que una acción se reconozca igual en los dos sitios.
const ACTIONS = {
  watched: { Icon: Eye, tone: "text-emerald-400" },
  watchlist: { Icon: BookmarkPlus, tone: "text-sky-400", filled: true },
  favorite: { Icon: Heart, tone: "text-red-400", filled: true },
  rating: { Icon: Star, tone: "text-amber-400", filled: true },
};

// Novedades: lo que ha pasado solo (sincronización, cálculo de series y
// colecciones). Continuar viendo y Completadas usan el icono y el color de su
// sección en el menú de Perfil.
const EVENTS = {
  cw_added: { Icon: MonitorPlay, tone: "text-emerald-400" },
  auto_watched: { Icon: CheckCircle2, tone: "text-emerald-400" },
  show_completed: { Icon: Trophy, tone: "text-amber-400", filled: true },
  collection_next: { Icon: Layers, tone: "text-purple-400" },
};

// Sin volver a pedir las alertas más de una vez en este intervalo por foco o
// navegación. Abrir el desplegable siempre pide datos frescos.
const REFRESH_THROTTLE_MS = 30_000;

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: las alertas funcionan igual, solo no se recuerdan */
  }
}

// Mismas piezas que el desplegable de secciones de Perfil (Navbar): separador
// entre grupos, fila `rounded-xl px-3 py-2 text-sm` gris que se aclara al pasar
// por encima, e icono de 16px con el color de su sección.
function MenuDivider() {
  return <div className="my-2.5 h-px bg-white/5" />;
}

// Sombra casi imperceptible sobre fondo oscuro que mantiene el texto legible
// cuando la página de detrás es clara (el cristal es translúcido).
const READABLE = "[text-shadow:0_1px_2px_rgba(0,0,0,0.6)]";

function Title({ item }) {
  return <span className="font-bold text-white">{item.title || "Sin título"}</span>;
}

// Frase de cada alerta, con la misma construcción que la Actividad del perfil
// ("Has visto S01E02 de <título>"), en primera persona.
function AlertText({ kind, item }) {
  const code = episodeCode(item);
  if (kind === "reminder") {
    const verb = item.needsRating && item.needsReview
      ? "Puntúa y reseña "
      : item.needsRating
        ? "Puntúa "
        : "Escribe tu reseña de ";
    return <>{verb}{item.needsRating ? code : ""}<Title item={item} /></>;
  }
  if (kind === "event") {
    if (item.type === "cw_added") {
      const platform = platformLabel(item.platform);
      return (
        <>
          {code ? `${code.charAt(0).toUpperCase()}${code.slice(1)}` : ""}<Title item={item} /> se ha añadido a Continuar viendo
          {platform ? ` · ${platform}` : null}
        </>
      );
    }
    if (item.type === "auto_watched") {
      return <>Has terminado {code}<Title item={item} />: pasa de Continuar viendo a visto</>;
    }
    if (item.type === "show_completed") return <>Has completado la serie <Title item={item} /></>;
    if (item.type === "collection_next") {
      const upcoming = upcomingRelease(item.releaseDate);
      return (
        <>
          {item.afterTitle ? `Después de ${item.afterTitle}, ` : "Siguiente de la saga: "}
          sigue con <Title item={item} />
          {upcoming ? ` · se estrena el ${upcoming}` : null}
        </>
      );
    }
  }
  if (item.type === "rating") {
    return (
      <>
        Has puntuado {formatActivityRatingTarget(item)} <Title item={item} />
        {typeof item.rating === "number" ? ` · ${item.rating}/10` : null}
      </>
    );
  }
  if (item.type === "watchlist") return <>Has añadido <Title item={item} /> a Pendientes</>;
  if (item.type === "favorite") return <>Has añadido <Title item={item} /> a Favoritas</>;
  if (item.completedShow) return <>Has completado <Title item={item} /></>;
  return <>Has visto {code}<Title item={item} /></>;
}

function alertIcon(kind, item) {
  if (kind === "reminder") {
    return item.needsRating
      ? { Icon: Star, tone: "text-amber-400", filled: true }
      : { Icon: MessageSquarePlus, tone: "text-orange-400" };
  }
  if (kind === "event") return EVENTS[item.type] || { Icon: Sparkles, tone: "text-zinc-300" };
  return ACTIONS[item.type] || ACTIONS.watched;
}

// Fila con la misma forma que las del desplegable de secciones de Perfil,
// en orden cartel, icono y texto. `isNew` marca lo llegado desde la última apertura.
function AlertRow({ kind, item, isNew, onNavigate, onDismiss }) {
  const href = getActivityDetailsHref(item);
  const { Icon, tone, filled } = alertIcon(kind, item);
  const src = item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;
  const body = (
    <>
      <span className="h-16 w-11 shrink-0 overflow-hidden rounded-lg">
        {src ? (
          <OptimizedImage src={src} alt="" width={44} height={64} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-zinc-600">
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <Icon className={`h-4 w-4 shrink-0 ${tone} ${filled ? "fill-current" : ""}`} aria-hidden="true" />
      <span className={`min-w-0 flex-1 ${READABLE}`}>
        <span className="line-clamp-2 leading-snug">
          <AlertText kind={kind} item={item} />
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
          {isNew ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="Nueva" /> : null}
          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
        </span>
      </span>
    </>
  );
  const rowClass = "flex min-w-0 flex-1 items-center gap-3.5 px-3 py-2.5";

  return (
    <li className="flex items-center rounded-xl text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white">
      {href ? (
        <Link
          href={href}
          prefetch={false}
          role="menuitem"
          onClick={onNavigate}
          className={`${rowClass} rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
        >
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Descartar recordatorio: ${item.title || "sin título"}`}
          className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

// Clases del botón de la campana. Las comparten el botón real y el marcador de
// arranque (AlertsMenuBoot), para que el relevo entre los dos no se note.
function alertsButtonClass({ variant, open = false, heroNavMode = false }) {
  return variant === "mobile"
    ? "relative grid h-11 w-11 place-items-center rounded-full text-white transition-[background-color,transform] duration-200 hover:bg-white/10 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
    : `relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        open ? "bg-white/10 text-white" : "text-zinc-300"
      } ${heroNavMode ? "drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]" : ""}`;
}

/**
 * La campana YA PINTADA EN EL PRIMER FOTOGRAMA, mientras la sesión arranca.
 *
 * El botón real depende de la cuenta, que no existe hasta que AuthContext
 * hidrata: sin esto, la campana aparecía unas décimas después que Buscar y el
 * perfil. Este marcador es idéntico y sale con el HTML del servidor; solo se
 * muestra si el dispositivo tiene una sesión guardada (`html[data-avatar-boot]`,
 * que marca AvatarBootScript antes de hidratar, igual que el avatar), porque
 * sin sesión ahí no habrá campana.
 */
export function AlertsMenuBoot({ variant = "desktop", heroNavMode = false }) {
  return (
    <div className="alerts-boot relative" aria-hidden="true">
      <span className={alertsButtonClass({ variant, heroNavMode })}>
        <Bell className="h-6 w-6" strokeWidth={variant === "mobile" ? 2.2 : 2} />
      </span>
    </div>
  );
}

/**
 * Botón de alertas del navbar con su desplegable. Mismo cristal, radio y
 * mecánica de portal que los desplegables de búsqueda y de perfil.
 *
 * `variant` solo cambia el tamaño del botón para que case con los controles
 * de cada barra (escritorio: 40px como Buscar; móvil: 44px como Menú).
 */
export default function AlertsMenu({ account, variant = "desktop", heroNavMode = false }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const accountId = account?.id || null;
  const panelId = useId();

  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState(null);
  // Último contador conocido: el globo sale con la campana, sin esperar a que
  // termine la petición de alertas.
  const [cachedUnread, setCachedUnread] = useState(0);
  // Última apertura ANTERIOR a la actual: marca qué filas son nuevas mientras el
  // panel está abierto, aunque abrirlo ya las haya dado por leídas.
  const [seenBeforeOpen, setSeenBeforeOpen] = useState(null);
  const [position, setPosition] = useState(null);
  const [portalReady, setPortalReady] = useState(false);

  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const requestRef = useRef(0);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!accountId) return;
    // Primera vez en este navegador: se parte de AHORA. Si no, todo el historial
    // previo de la cuenta aparecería de golpe como "nuevo".
    let seen = readStorage(alertsLastSeenKey(accountId), null);
    if (!seen) {
      seen = new Date().toISOString();
      writeStorage(alertsLastSeenKey(accountId), seen);
    }
    setLastSeenAt(seen);
    setCachedUnread(Number(readStorage(alertsUnreadKey(accountId), 0)) || 0);
  }, [accountId]);

  const load = useCallback(async () => {
    if (!accountId) return;
    const request = ++requestRef.current;
    lastFetchAtRef.current = Date.now();
    setLoading(true);
    try {
      const res = await fetch("/api/users/notifications", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (request !== requestRef.current) return;
      if (!res.ok) {
        // Un fallo conserva lo que ya hubiera en vez de vaciar el panel.
        setError("No se pudieron cargar las alertas.");
        return;
      }
      const dismissed = new Set(readStorage(alertsDismissedKey(accountId), []));
      setAlerts(normalizeAlerts(json, dismissed));
      setError("");
    } catch {
      if (request === requestRef.current) setError("No se pudieron cargar las alertas.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [accountId]);

  // Refresco discreto: al entrar, al navegar y al volver a la pestaña (con
  // límite de frecuencia). Así el aviso de un visto automático llega aunque
  // la reproducción haya ocurrido en otro dispositivo.
  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastFetchAtRef.current >= REFRESH_THROTTLE_MS) load();
  }, [load]);

  useEffect(() => {
    if (!accountId) {
      setAlerts(null);
      return;
    }
    load();
  }, [accountId, load]);

  useEffect(() => {
    refreshIfStale();
    setOpen(false);
  }, [pathname, refreshIfStale]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshIfStale]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const now = new Date().toISOString();
    setSeenBeforeOpen(lastSeenAt);
    setLastSeenAt(now);
    if (accountId) writeStorage(alertsLastSeenKey(accountId), now);
    setOpen(true);
    load();
  };

  const close = useCallback(() => setOpen(false), []);

  // Cierre al pulsar fuera y con Escape, como el desplegable de Perfil. El panel
  // va por portal, así que se comprueban los dos refs.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Posición: bajo la barra (con el mismo aire que el menú de Perfil) y con el
  // borde derecho alineado al botón, sin salirse de la pantalla.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) {
      setPosition(null);
      return undefined;
    }
    let frameId = 0;
    const update = () => {
      frameId = 0;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const padding = 16;
      const width = Math.min(420, window.innerWidth - padding * 2);
      const left = Math.min(
        window.innerWidth - width - padding,
        Math.max(padding, rect.right - width),
      );
      // Mismo aire respecto a la barra que el desplegable de Perfil.
      const top = rect.bottom + 20;
      const next = { top, left, width };
      setPosition((current) =>
        current && current.top === top && current.left === left && current.width === width
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (!frameId) frameId = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open]);

  const computedUnread = alerts && lastSeenAt ? countUnread(alerts, lastSeenAt) : null;
  useEffect(() => {
    if (!accountId || computedUnread == null) return;
    writeStorage(alertsUnreadKey(accountId), computedUnread);
  }, [accountId, computedUnread]);

  const dismiss = (id) => {
    if (!accountId) return;
    const next = addDismissed(readStorage(alertsDismissedKey(accountId), []), id);
    writeStorage(alertsDismissedKey(accountId), next);
    setAlerts((current) =>
      current ? { ...current, reminders: current.reminders.filter((item) => item.id !== id) } : current,
    );
  };

  if (!accountId) return null;

  const unread = alerts ? countUnread(alerts, lastSeenAt) : open ? 0 : cachedUnread;
  const isNew = (item) =>
    new Date(item.createdAt).getTime() > new Date(seenBeforeOpen || 0).getTime();
  const total = alerts
    ? alerts.reminders.length + alerts.events.length + alerts.actions.length
    : 0;
  const label = t("nav_alerts", "Alertas");
  const activityHref = account?.username ? profileTabHref(account.username, "activity") : null;

  const buttonClass = alertsButtonClass({ variant, open, heroNavMode });

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="menu"
        aria-label={unread > 0 ? `${label} (${unread} nuevas)` : label}
        title={label}
        className={buttonClass}
      >
        <Bell className="h-6 w-6" strokeWidth={variant === "mobile" ? 2.2 : 2} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {portalReady &&
        createPortal(
          <AnimatePresence>
            {open && position ? (
              <motion.div
                ref={panelRef}
                id={panelId}
                role="menu"
                aria-label={label}
                style={position}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                // MISMO CRISTAL, FORMA Y RELLENO que el desplegable de secciones
                // de Perfil (Navbar): LIQUID_GLASS_PANEL, rounded-2xl y p-2.
                className={`fixed z-[99999] overflow-hidden rounded-2xl p-2 text-white ${LIQUID_GLASS_PANEL}`}
              >
                <div className="flex flex-col">
                  <div className="max-h-[65vh] overflow-y-auto no-scrollbar">
                    {!alerts ? (
                      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 ${READABLE}`}>
                        {loading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" aria-hidden="true" />
                        ) : (
                          <Bell className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                        )}
                        <span>{error || "Cargando alertas…"}</span>
                      </div>
                    ) : total === 0 ? (
                      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 ${READABLE}`}>
                        <Bell className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                        <span>{error || "No tienes alertas."}</span>
                      </div>
                    ) : (
                      [
                        { key: "events", kind: "event", items: alerts.events, label: "Novedades" },
                        { key: "reminders", kind: "reminder", items: alerts.reminders, label: "Recordatorios" },
                        { key: "actions", kind: "action", items: alerts.actions, label: "Actividad reciente" },
                      ]
                        .filter((group) => group.items.length > 0)
                        .map((group, index) => (
                          <div key={group.key}>
                            {index > 0 ? <MenuDivider /> : null}
                            <ul role="group" aria-label={group.label} className="space-y-1">
                              {group.items.map((item) => (
                                <AlertRow
                                  key={item.id}
                                  kind={group.kind}
                                  item={item}
                                  isNew={isNew(item)}
                                  onNavigate={close}
                                  onDismiss={group.kind === "reminder" ? () => dismiss(item.id) : undefined}
                                />
                              ))}
                            </ul>
                          </div>
                        ))
                    )}
                  </div>

                  {activityHref ? (
                    <>
                      <MenuDivider />
                      <Link
                        href={activityHref}
                        prefetch={false}
                        role="menuitem"
                        onClick={close}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <Activity className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span className={`truncate ${READABLE}`}>Ver toda tu actividad</span>
                      </Link>
                    </>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
