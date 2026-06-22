"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  DownloadCloud,
  Eye,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
  Bell,
  Layers,
  ChevronRight,
  Database,
  Link2,
  Chrome,
  Unlink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import {
  getPlexConnection,
  clearPlexConnectionCache,
  connectPlexInteractive,
  syncPlexHistory,
} from "@/lib/plex/client";

const GLASS_SURFACE =
  "relative overflow-hidden border border-white/[0.08] bg-black/40 shadow-2xl shadow-black/40 backdrop-blur-xl before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/[0.08] before:via-white/[0.02] before:to-transparent";
const GLASS_PANEL = `${GLASS_SURFACE} transition-all duration-300 hover:border-white/15`;
const NETFLIX_EXTENSION_ID = process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_ID || "";
const NETFLIX_EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_URL ||
  (NETFLIX_EXTENSION_ID
    ? `https://chromewebstore.google.com/detail/${NETFLIX_EXTENSION_ID}`
    : "");

// Plataformas de streaming que la extensión sincroniza en tiempo real. El `id`
// coincide con el que envía la extensión (metadata.lastPlatform).
const STREAMING_PLATFORMS = [
  { id: "netflix", name: "Netflix", icon: "/netflix.png" },
  { id: "prime", name: "Prime Video", icon: "/amazonprimevideo.png" },
  { id: "max", name: "Max", icon: "/hbomax.png" },
  { id: "disney", name: "Disney+", icon: "/disney.png" },
  { id: "plex", name: "Plex", icon: "/plex.png" },
];

function PlatformBadges({ activeId = null, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${className}`}>
      {STREAMING_PLATFORMS.map((platform) => {
        const active = activeId === platform.id;
        return (
          <div
            key={platform.id}
            title={active ? `${platform.name} · último visionado` : platform.name}
            className="flex items-center gap-2"
          >
            <img
              src={platform.icon}
              alt={platform.name}
              className={`h-7 w-7 object-contain ${active ? "" : "opacity-90"}`}
            />
            <span className="hidden sm:inline text-xs sm:text-sm font-bold text-zinc-300">
              {platform.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function sendNetflixExtensionMessage(message) {
  return new Promise((resolve) => {
    if (
      !NETFLIX_EXTENSION_ID ||
      typeof window === "undefined" ||
      !window.chrome?.runtime?.sendMessage
    ) {
      resolve(null);
      return;
    }

    try {
      window.chrome.runtime.sendMessage(NETFLIX_EXTENSION_ID, message, (response) => {
        if (window.chrome?.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Detección de presencia de la extensión por petición/respuesta vía el content
// script (no muta el DOM, así no rompe la hidratación de React).
function pingExtensionBridge(timeout = 700) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("response-tsv-ext-ping", onResponse);
      resolve(value);
    };
    const onResponse = () => finish(true);
    document.addEventListener("response-tsv-ext-ping", onResponse);
    document.dispatchEvent(new CustomEvent("request-tsv-ext-ping"));
    window.setTimeout(() => finish(false), timeout);
  });
}

// Comprueba si la extensión está instalada. La mensajería externa (por ID)
// funciona incluso en pestañas ya abiertas justo tras instalarla desde la Store;
// el puente del content script es la señal secundaria.
async function detectNetflixExtension() {
  const ping = await sendNetflixExtensionMessage({ action: "ping" });
  if (ping?.installed || ping?.success) return true;
  return pingExtensionBridge(700);
}

function SettingsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-black z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(16,185,129,0.14),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(56,189,248,0.14),transparent_35%),radial-gradient(circle_at_50%_92%,rgba(168,85,247,0.12),transparent_40%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.85))]" />
    </div>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, disabled, onChange }) {
  return (
    <div className={`${GLASS_PANEL} rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4 group`}>
      <div className="flex min-w-0 items-start gap-4">
        <div className="rounded-xl bg-white/5 p-2.5 text-emerald-400 ring-1 ring-white/10 group-hover:scale-105 group-hover:bg-white/10 transition-all duration-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 mt-1 ${
          checked
            ? "border-emerald-400/40 bg-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            : "border-white/10 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function SegmentedField({ label, value, options, disabled, onChange }) {
  const colsClass = options.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`${GLASS_PANEL} rounded-2xl p-4 sm:p-5`}>
      <span className="mb-3.5 block text-xs font-black uppercase tracking-widest text-emerald-400/80">
        {label}
      </span>
      <div className={`grid gap-2 ${colsClass}`}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`relative min-h-11 rounded-xl px-2 sm:px-4 text-xs sm:text-sm font-bold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 overflow-hidden ${
                active
                  ? "bg-white text-black shadow-lg shadow-white/10"
                  : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {active && (
                <motion.div
                  layoutId={`active-seg-${label}`}
                  className="absolute inset-0 bg-white -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImportPanel({
  title,
  description,
  color = "emerald",
  connectHref,
  connectLabel,
  startUrl,
  statusUrl,
  startBody,
  buttonLabel,
  stepsConfig,
  onImported,
  logoSrc,
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollingRef = useRef(null);
  const startedHereRef = useRef(false);
  const onImportedRef = useRef(onImported);
  const tRef = useRef(t);
  const accent = color === "sky" ? "sky" : "emerald";

  useEffect(() => {
    onImportedRef.current = onImported;
    tRef.current = t;
  }, [onImported, t]);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const loadStatus = useCallback(async (options = {}) => {
    const res = await fetch(statusUrl, {
      cache: "no-store",
      priority: "low",
      signal: options.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "No se pudo consultar el progreso.");
    setStatus(json);
    return json;
  }, [statusUrl]);

  const stopIfFinal = useCallback(
    (nextStatus) => {
      if (nextStatus?.status === "done") {
        clearPolling();
        setLoading(false);
        if (startedHereRef.current) {
          startedHereRef.current = false;
          setNotice(tRef.current("settings_imported", "Importación completada. Tus datos ya están en The Show Verse."));
          onImportedRef.current?.();
        }
      } else if (nextStatus?.status === "error") {
        clearPolling();
        setLoading(false);
        setError(nextStatus?.error || "La importación no pudo completarse.");
        startedHereRef.current = false;
      }
    },
    [clearPolling],
  );

  const startPolling = useCallback(() => {
    clearPolling();
    pollingRef.current = window.setInterval(async () => {
      try {
        const nextStatus = await loadStatus();
        stopIfFinal(nextStatus);
      } catch (err) {
        setError(err?.message || "No se pudo consultar el progreso.");
      }
    }, 2500);
  }, [clearPolling, loadStatus, stopIfFinal]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    loadStatus({ signal: controller.signal })
      .then((nextStatus) => {
        if (ignore) return;
        const isRunning = nextStatus?.status === "running";
        setLoading(isRunning);
        if (isRunning) startPolling();
        else stopIfFinal(nextStatus);
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
      clearPolling();
    };
  }, [clearPolling, loadStatus, startPolling, stopIfFinal]);

  const handleImport = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    startedHereRef.current = true;

    try {
      const res = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(startBody ? { body: JSON.stringify(startBody) } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "No se pudo iniciar la importación.");
      }
      setStatus(json);
      setNotice(t("settings_importing", "Importación iniciada. Puedes dejar esta página abierta para ver el progreso."));
      startPolling();
    } catch (err) {
      setError(err?.message || "No se pudo iniciar la importación.");
      setLoading(false);
    }
  }, [startBody, startPolling, startUrl, t]);

  const steps = status?.steps || {};
  const running = loading || status?.status === "running";

  return (
    <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 group flex flex-col justify-between`}>
      <div>
        <div className="mb-4 flex items-start gap-4">
          <div
            className={`shrink-0 h-12 w-12 flex items-center justify-center ${
              accent === "sky"
                ? "text-sky-400"
                : "text-emerald-400"
            } group-hover:scale-105 group-hover:bg-opacity-20 transition-all duration-300`}
          >
            {logoSrc ? (
              <img src={logoSrc} alt={title} className="h-8 w-8 object-contain" />
            ) : (
              <DownloadCloud className="h-8 w-8" aria-hidden="true" />
            )}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white tracking-wide">{title}</h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/[0.02] border border-white/5 p-4 space-y-3">
          {stepsConfig.map((step) => {
            const stepData = steps[step.key];
            const isStepRunning = stepData?.status === "loading";
            const isStepDone = stepData?.status === "done";
            
            return (
              <div key={step.key} className="flex items-center justify-between gap-4 text-xs">
                <span className="font-bold uppercase tracking-wider text-zinc-500">
                  {step.label}
                </span>
                <div className="flex items-center gap-2">
                  {isStepRunning && <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />}
                  <span className={`font-medium ${isStepDone ? "text-emerald-400" : isStepRunning ? "text-zinc-300" : "text-zinc-500"}`}>
                    {stepData ? (
                      isStepDone ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          {t("settings_imported", "Completado")}
                        </span>
                      ) : (
                        stepData.status || "Pendiente"
                      )
                    ) : (
                      "Pendiente"
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {notice && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 text-xs font-bold ${accent === "sky" ? "text-sky-300" : "text-emerald-300"}`}
          >
            {notice}
          </motion.p>
        )}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs font-bold text-red-400"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
        <a
          href={connectHref}
          className={`flex-1 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            accent === "sky" ? "focus-visible:outline-sky-400" : "focus-visible:outline-emerald-400"
          }`}
        >
          <Link2 className="mr-2 h-4 w-4" />
          {connectLabel}
        </a>
        <button
          type="button"
          onClick={handleImport}
          disabled={running}
          className={`flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            accent === "sky" ? "focus-visible:outline-sky-400" : "focus-visible:outline-emerald-400"
          }`}
        >
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("settings_importing", "Importando...")}
            </>
          ) : (
            <>
              <DownloadCloud className="mr-2 h-4 w-4" />
              {buttonLabel}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ProfileSettingsClient() {
  const { preferences, updatePreference, loadingPreferences, authenticated, hydrated, user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("personalization");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [connections, setConnections] = useState([]);
  const [loadingConnections, setLoadingConnections] = useState(false);

  // Estado de la conexión OAuth de Spotify (tokens por usuario en cookies).
  const [spotify, setSpotify] = useState({ loading: true, connected: false, profile: null });

  const fetchSpotifyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/auth/status", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setSpotify({
        loading: false,
        connected: Boolean(json?.connected),
        profile: json?.profile || null,
      });
    } catch {
      setSpotify({ loading: false, connected: false, profile: null });
    }
  }, []);

  const handleDisconnectSpotify = useCallback(async () => {
    if (!confirm("¿Seguro que deseas desconectar tu cuenta de Spotify?")) return;
    try {
      await fetch("/api/spotify/auth/disconnect", { method: "POST" });
    } catch {
      // noop
    } finally {
      setSpotify({ loading: false, connected: false, profile: null });
    }
  }, []);

  // Estado de la conexión de Plex (token por usuario en cookie, flujo PIN).
  // `link` indica si el servidor (local/relay) es accesible DESDE EL NAVEGADOR.
  const [plex, setPlex] = useState({
    loading: true,
    connected: false,
    account: null,
    server: null,
    link: undefined,
  });

  const fetchPlexStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/plex/auth/status", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const connected = Boolean(json?.connected);
      setPlex({
        loading: false,
        connected,
        account: json?.account || null,
        server: json?.server || null,
        link: connected ? undefined : null,
      });
      if (connected) {
        // Probar acceso real al servidor desde el navegador (local → relay).
        const conn = await getPlexConnection({ force: true }).catch(() => null);
        setPlex((prev) => ({
          ...prev,
          link: conn ? { kind: conn.kind, name: conn.serverName } : null,
        }));
      }
    } catch {
      setPlex({ loading: false, connected: false, account: null, server: null, link: null });
    }
  }, []);

  const [plexConnecting, setPlexConnecting] = useState(false);

  const handleConnectPlex = useCallback(async () => {
    setPlexConnecting(true);
    try {
      const result = await connectPlexInteractive();
      if (result?.ok) {
        await fetchPlexStatus();
        setActiveTab("connections");
      } else if (result?.error && result.error !== "cancelled" && result.error !== "popup_blocked") {
        alert("No se pudo conectar con Plex. Inténtalo de nuevo.");
      }
    } finally {
      setPlexConnecting(false);
    }
  }, [fetchPlexStatus]);

  const [plexSync, setPlexSync] = useState({ running: false, result: null });

  const handleSyncPlex = useCallback(async () => {
    setPlexSync({ running: true, result: null });
    try {
      const result = await syncPlexHistory();
      if (!result?.ok) {
        setPlexSync({ running: false, result: { error: true, message: "No se pudo leer el historial de Plex desde tu navegador. Asegúrate de estar en la misma red que el servidor." } });
        return;
      }
      const { added = 0, duplicates = 0, skipped = 0, empty } = result;
      const message = empty
        ? "No se encontró historial reciente en tu servidor de Plex."
        : `Sincronizado: ${added} nuevo${added === 1 ? "" : "s"}, ${duplicates} ya estaba${duplicates === 1 ? "" : "n"}${skipped ? `, ${skipped} sin coincidencia` : ""}.`;
      setPlexSync({ running: false, result: { error: false, message } });
    } catch {
      setPlexSync({ running: false, result: { error: true, message: "Error al sincronizar el historial de Plex." } });
    }
  }, []);

  const handleDisconnectPlex = useCallback(async () => {
    if (!confirm("¿Seguro que deseas desconectar tu servidor de Plex?")) return;
    try {
      await fetch("/api/plex/auth/disconnect", { method: "POST" });
    } catch {
      // noop
    } finally {
      clearPlexConnectionCache();
      setPlex({ loading: false, connected: false, account: null, server: null, link: null });
    }
  }, []);

  // Netflix connection modal states
  const [showNetflixModal, setShowNetflixModal] = useState(false);
  const [connectStep, setConnectStep] = useState(0);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectedEmail, setConnectedEmail] = useState("");
  // Esperando a que el usuario instale la extensión desde la Chrome Web Store.
  const [awaitingInstall, setAwaitingInstall] = useState(false);

  const fetchConnections = useCallback(async () => {
    if (!authenticated) return;
    setLoadingConnections(true);
    try {
      const res = await fetch("/api/auth/connections", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.connections)) {
        setConnections(json.connections);
      }
    } catch (e) {
      console.error("Error loading connections:", e);
    } finally {
      setLoadingConnections(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (hydrated && authenticated) {
      fetchConnections();
    }
  }, [hydrated, authenticated, fetchConnections]);

  useEffect(() => {
    const onFocus = () => {
      fetchSpotifyStatus();
      fetchPlexStatus();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchSpotifyStatus, fetchPlexStatus]);

  useEffect(() => {
    if (!hydrated) return;
    fetchSpotifyStatus();
    fetchPlexStatus();
    // Tras volver del OAuth de Spotify/Plex: abre la pestaña Conexiones para que
    // se vea el estado actualizado y limpia el parámetro de la URL.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("spotify") || params.has("plex")) {
        setActiveTab("connections");
        params.delete("spotify");
        params.delete("plex");
        const qs = params.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${qs ? `?${qs}` : ""}`,
        );
      }
    }
  }, [hydrated, fetchSpotifyStatus, fetchPlexStatus]);

  const requestNetflixExtensionDetails = useCallback(() => {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener("response-netflix-details", handleResponse);
        resolve(value);
      };
      const handleResponse = (event) => {
        finish(event.detail || null);
      };

      document.addEventListener("response-netflix-details", handleResponse);
      document.dispatchEvent(new CustomEvent("request-netflix-details"));

      sendNetflixExtensionMessage({ action: "getNetflixDetails" }).then((response) => {
        if (response) finish(response);
      });

      // La detección lee dos páginas de Netflix (cuenta + perfil); damos margen.
      window.setTimeout(() => finish(null), 8000);
    });
  }, []);

  const bindNetflixExtension = useCallback((payload) => {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener("response-netflix-bind", handleResponse);
        resolve(value);
      };
      const handleResponse = (event) => {
        finish(event.detail || null);
      };

      document.addEventListener("response-netflix-bind", handleResponse);
      document.dispatchEvent(new CustomEvent("request-netflix-bind", { detail: payload }));

      sendNetflixExtensionMessage({
        action: "storeSyncConfig",
        origin: window.location.origin,
        ...payload,
      }).then((response) => {
        if (response) finish(response);
      });

      window.setTimeout(() => finish(null), 6000);
    });
  }, []);

  const openNetflixExtensionInstall = useCallback(() => {
    if (!NETFLIX_EXTENSION_INSTALL_URL) {
      setConnectError(
        "La URL pública de la extensión no está configurada. Define NEXT_PUBLIC_NETFLIX_EXTENSION_URL o NEXT_PUBLIC_NETFLIX_EXTENSION_ID.",
      );
      return;
    }

    window.open(NETFLIX_EXTENSION_INSTALL_URL, "_blank", "noopener,noreferrer");
  }, []);

  // Realiza la conexión propiamente dicha asumiendo que la extensión ya está
  // instalada: genera el token de sincronización del navegador y lo vincula.
  // La detección de Netflix es OPCIONAL: si hay sesión activa, la usamos para
  // mostrar la cuenta y habilitar el backfill de historial de Netflix; si no, la
  // conexión funciona igualmente para el resto de plataformas (Prime, Max,
  // Disney+, Plex) en tiempo real.
  const proceedNetflixConnect = useCallback(async () => {
    setAwaitingInstall(false);
    setConnectLoading(true);
    setConnectError("");
    setConnectStep(0);

    const timers = [];

    try {
      const [detailsResult] = await Promise.all([
        requestNetflixExtensionDetails(),
        new Promise((resolve) => {
          timers.push(window.setTimeout(resolve, 900));
        }),
      ]);

      let hasNetflix = Boolean(detailsResult && detailsResult.success && detailsResult.email);

      // Si la extensión no respondió en absoluto, confirmamos su presencia con un
      // ping. Si tampoco está → todavía no está instalada; si está, seguimos sin
      // sesión de Netflix.
      if (!detailsResult) {
        const present = await detectNetflixExtension();
        if (!present) {
          timers.forEach(clearTimeout);
          setConnectLoading(false);
          setAwaitingInstall(true);
          return;
        }
        hasNetflix = false;
      }

      const selectedEmail = hasNetflix
        ? detailsResult.email
        : user?.email || `tsv-${user?.id || "user"}@users.theshowverse.local`;
      const selectedProfile = hasNetflix ? detailsResult.profileName || "Principal" : "Streaming";

      setConnectedEmail(selectedEmail);

      setConnectStep(1);
      await new Promise((resolve) => {
        timers.push(window.setTimeout(resolve, 700));
      });

      setConnectStep(2);

      const res = await fetch("/api/netflix/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: selectedEmail,
          profileName: selectedProfile,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo establecer la conexión.");
      if (!json.syncToken) throw new Error("El servidor no devolvió el token de sincronización.");

      const bindResult = await bindNetflixExtension({
        syncToken: json.syncToken,
        email: selectedEmail,
        profileName: selectedProfile,
      });
      if (!bindResult?.success) {
        throw new Error(bindResult?.error || "No se pudo guardar la vinculación en la extensión.");
      }

      setConnectStep(3);
      await new Promise((resolve) => {
        timers.push(window.setTimeout(resolve, 900));
      });

      window.dispatchEvent(
        new CustomEvent("netflix-connection-changed", { detail: { connected: true } }),
      );

      await fetchConnections();
      setShowNetflixModal(false);
      setConnectLoading(false);
    } catch (err) {
      timers.forEach(clearTimeout);
      setConnectError(err?.message || "No se pudo conectar la cuenta. Inténtalo de nuevo.");
      setConnectLoading(false);
    }
  }, [requestNetflixExtensionDetails, bindNetflixExtension, fetchConnections, user]);

  const handleConnectNetflix = useCallback(async () => {
    setShowNetflixModal(true);
    setConnectError("");
    setConnectStep(0);
    setConnectedEmail("");
    setConnectLoading(true);
    setAwaitingInstall(false);

    const present = await detectNetflixExtension();
    if (!present) {
      // No instalada: abrimos la Chrome Web Store para instalación de un clic y
      // pasamos a estado de espera; un poller continuará en cuanto se instale.
      setConnectLoading(false);
      setAwaitingInstall(true);
      if (NETFLIX_EXTENSION_INSTALL_URL) {
        window.open(NETFLIX_EXTENSION_INSTALL_URL, "_blank", "noopener,noreferrer");
      }
      return;
    }

    await proceedNetflixConnect();
  }, [proceedNetflixConnect]);

  // Mientras esperamos la instalación, sondeamos la presencia de la extensión y
  // continuamos automáticamente en cuanto el usuario la añade desde la Store.
  useEffect(() => {
    if (!showNetflixModal || !awaitingInstall) return undefined;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      const present = await detectNetflixExtension();
      if (present && !cancelled) {
        window.clearInterval(intervalId);
        setAwaitingInstall(false);
        proceedNetflixConnect();
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [showNetflixModal, awaitingInstall, proceedNetflixConnect]);


  const handleDisconnectNetflix = async () => {
    if (!confirm("¿Seguro que deseas desvincular tu cuenta de Netflix?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/netflix/disconnect", { method: "POST" });
      if (res.ok) {
        document.dispatchEvent(new CustomEvent("request-netflix-unbind"));
        void sendNetflixExtensionMessage({ action: "clearSyncConfig" });
        window.dispatchEvent(
          new CustomEvent("netflix-connection-changed", { detail: { connected: false } })
        );
        await fetchConnections();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Hook up dynamic saving feedback
  useEffect(() => {
    if (loadingPreferences) {
      setSaving(true);
      setSaved(false);
    } else if (saving) {
      setSaving(false);
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [loadingPreferences]);

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center relative">
        <SettingsBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center px-4 relative">
        <SettingsBackground />
        <div className="relative z-10 w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${GLASS_PANEL} rounded-[2.5rem] p-8 text-center border border-white/10`}
          >
            <Settings className="mx-auto mb-5 h-12 w-12 text-emerald-400 animate-[spin_6s_linear_infinite]" />
            <h1 className="text-2xl font-black tracking-tight text-white">{t("settings_title", "Configuración")}</h1>
            <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
              Inicia sesión para gestionar tus importaciones y preferencias personales de The Show Verse.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent("/profile/settings")}`}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98] shadow-lg shadow-indigo-500/10"
            >
              {t("nav_login", "Iniciar sesión")}
            </Link>
          </motion.div>
        </div>
      </main>
    );
  }

  const tabs = [
    { id: "personalization", label: t("settings_personal", "Preferencias"), icon: SlidersHorizontal },
    { id: "imports", label: t("settings_imports", "Importaciones"), icon: DownloadCloud },
    { id: "connections", label: t("settings_connections", "Conexiones"), icon: Link2 },
  ];

  const netflixAccountInfo = connections.find((c) => c.provider === "netflix");
  const isNetflixConnected = !!netflixAccountInfo?.connected;

  return (
    <main className="min-h-screen bg-black pb-24 text-zinc-100 selection:bg-emerald-500/30 relative overflow-hidden font-sans">
      <SettingsBackground />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 lg:py-12">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/profile"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5 text-zinc-300 shadow-lg backdrop-blur-lg transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 shrink-0"
                aria-label={t("settings_back", "Volver al perfil")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="h-px w-10 bg-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                {t("settings_account", "Tu cuenta")}
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              {t("settings_title", "Configuración")}
              <span className="text-emerald-500">.</span>
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-zinc-400 bg-white/5 border border-white/10 rounded-full py-1.5 px-4 h-9 shadow-inner self-start sm:self-auto">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>{t("settings_saving", "Guardando")}</span>
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t("settings_saved", "Guardado")}</span>
              </>
            ) : (
              <span className="text-emerald-400/80">● {t("settings_saved", "Sincronizado")}</span>
            )}
          </div>
        </header>

        {/* Profile Info Summary Card */}
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-emerald-950/20 to-indigo-950/20 border border-white/[0.06] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.04] to-indigo-500/[0.04] pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-lg text-emerald-400">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
              ) : (
                <User className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white leading-tight">
                {user?.displayName || user?.username || "Usuario"}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 truncate max-w-sm sm:max-w-md">
                {user?.email}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full shadow-sm">
              Plan {user?.plan || "free"}
            </span>
          </div>
        </div>

        {/* Primary Settings Workspace */}
        <div className="grid gap-6 lg:grid-cols-[200px_1fr] items-start">
          {/* Navigation Sidebar */}
          <nav className="flex flex-row lg:flex-col pb-3 lg:pb-0 gap-1.5 lg:gap-2 border-b lg:border-b-0 lg:border-r border-white/5 shrink-0 z-10 w-full lg:w-auto overflow-x-auto lg:overflow-x-visible scrollbar-none">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center lg:justify-start gap-1.5 lg:gap-3 px-2.5 sm:px-4 py-2 lg:py-2.5 rounded-xl text-[11px] sm:text-xs lg:text-sm font-bold transition-all duration-300 shrink-0 text-center lg:text-left flex-1 lg:flex-none lg:w-full select-none ${
                    active
                      ? "bg-white/10 text-white border border-white/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.1),0_4px_10px_rgba(0,0,0,0.25)]"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4 lg:h-4.5 lg:w-4.5" />
                  <span className="lg:flex-1">{tab.label}</span>
                  <ChevronRight className={`hidden lg:block h-3.5 w-3.5 transition-transform duration-300 ${active ? "translate-x-0.5 text-emerald-400" : "opacity-0"}`} />
                </button>
              );
            })}
          </nav>

          {/* Main Settings Display */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {activeTab === "personalization" && (
                <motion.div
                  key="personalization"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {error && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs sm:text-sm text-red-200" role="alert">
                      {error}
                    </div>
      )}

                  <div className="flex flex-col gap-4">
                    <SegmentedField
                      label={t("settings_def_view", "Vista por defecto")}
                      value={preferences.defaultView}
                      disabled={saving}
                      options={[
                        { value: "grid", label: t("view_grid", "Grid") },
                        { value: "list", label: t("view_list", "Lista") },
                        { value: "compact", label: t("view_compact", "Compacta") },
                      ]}
                      onChange={(defaultView) => updatePreference({ defaultView })}
                    />
                  </div>

                  <div className="space-y-4">
                    <ToggleRow
                      icon={Eye}
                      title={t("settings_adult", "Contenido adulto")}
                      description={t("settings_adult_desc", "Permite incluir contenido adulto en futuras búsquedas y recomendaciones compatibles.")}
                      checked={preferences.adultContent}
                      disabled={saving}
                      onChange={(adultContent) => updatePreference({ adultContent })}
                    />
                    <ToggleRow
                      icon={RotateCcw}
                      title={t("settings_refresh", "Autorefresco del perfil")}
                      description={t("settings_refresh_desc", "Actualiza estadísticas cuando vuelves desde una importación o cambio importante.")}
                      checked={Boolean(preferences.uiSettings.profileAutoRefresh)}
                      disabled={saving}
                      onChange={(value) =>
                        updatePreference({
                          uiSettings: { ...preferences.uiSettings, profileAutoRefresh: value },
                        })
                      }
                    />
                    <ToggleRow
                      icon={LayoutGrid}
                      title={t("settings_compact", "Tarjetas compactas")}
                      description={t("settings_compact_desc", "Preferencia preparada para vistas de perfil y biblioteca con más densidad visual.")}
                      checked={Boolean(preferences.uiSettings.compactProfileCards)}
                      disabled={saving}
                      onChange={(value) =>
                        updatePreference({
                          uiSettings: { ...preferences.uiSettings, compactProfileCards: value },
                        })
                      }
                    />
                    <ToggleRow
                      icon={Shield}
                      title={t("settings_sync_trakt", "Sincronizar acciones con Trakt")}
                      description={t("settings_sync_trakt_desc", "Mantiene Trakt como integración opcional para acciones nuevas cuando esté conectado.")}
                      checked={Boolean(preferences.uiSettings.syncTraktActions)}
                      disabled={saving}
                      onChange={(value) =>
                        updatePreference({
                          uiSettings: { ...preferences.uiSettings, syncTraktActions: value },
                        })
                      }
                    />
                    <ToggleRow
                      icon={Bell}
                      title={t("settings_weekly", "Resumen semanal")}
                      description={t("settings_weekly_desc", "Preferencia de notificaciones para futuros correos o paneles semanales.")}
                      checked={Boolean(preferences.notificationSettings.weeklySummary)}
                      disabled={saving}
                      onChange={(value) =>
                        updatePreference({
                          notificationSettings: {
                            ...preferences.notificationSettings,
                            weeklySummary: value,
                          },
                        })
                      }
                    />
                  </div>
                </motion.div>
              )}

              {activeTab === "imports" && (
                <motion.div
                  key="imports"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="grid gap-6 grid-cols-1"
                >
                  <ImportPanel
                    title={t("settings_import_trakt", "Importar desde Trakt")}
                    description={t("settings_import_trakt_desc", "Trae tu historial de visionado y tus puntuaciones a The Show Verse.")}
                    color="emerald"
                    connectHref={`/api/trakt/auth/start?next=${encodeURIComponent("/profile/settings")}`}
                    connectLabel={t("settings_connect", "Conectar Trakt")}
                    startUrl="/api/trakt/import/start"
                    statusUrl="/api/trakt/import/status"
                    startBody={{ mode: "history_ratings" }}
                    buttonLabel={t("settings_import_now", "Importar ahora")}
                    stepsConfig={[
                      { key: "history", label: t("nav_history", "Historial") },
                      { key: "ratings", label: "Ratings" },
                    ]}
                    logoSrc="/logo-Trakt.png"
                  />
                  <ImportPanel
                    title={t("settings_import_tmdb", "Importar desde TMDb")}
                    description={t("settings_import_tmdb_desc", "Trae tus favoritos, pendientes y puntuaciones antiguas a The Show Verse.")}
                    color="sky"
                    connectHref={`/api/tmdb/auth/start?next=${encodeURIComponent("/profile/settings")}`}
                    connectLabel={t("settings_connect", "Conectar TMDb")}
                    startUrl="/api/tmdb/import/start"
                    statusUrl="/api/tmdb/import/status"
                    buttonLabel={t("settings_import_now", "Importar TMDb")}
                    stepsConfig={[
                      { key: "favorites", label: t("nav_favorites", "Favoritos") },
                      { key: "watchlist", label: t("nav_watchlist", "Pendientes") },
                      { key: "ratings", label: "Ratings" },
                    ]}
                    logoSrc="/logo-TMDb.png"
                  />
                </motion.div>
              )}

              {activeTab === "connections" && (
                <motion.div
                  key="connections"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* Streaming sync Connection (principal) */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col gap-5`}>
                    <div className="flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="shrink-0 h-12 w-12 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-all duration-300">
                          <Layers className="h-8 w-8" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-extrabold text-white tracking-wide">Plataformas de streaming</h3>
                            {isNetflixConnected ? (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Sincronizado
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                                Automático
                              </span>
                            )}
                          </div>
                          <p className="mt-1 hidden sm:block text-xs sm:text-sm text-zinc-400 leading-relaxed">
                            {isNetflixConnected
                              ? `Vinculado como ${netflixAccountInfo.email}. Registrando en tiempo real lo que ves en tus plataformas de streaming.`
                              : "Vincula la extensión oficial (instalación guiada) para registrar automáticamente y en tiempo real lo que ves en tus plataformas de streaming, sin subir archivos."}
                          </p>
                        </div>
                      </div>
                      {isNetflixConnected ? (
                        <button
                          type="button"
                          onClick={handleDisconnectNetflix}
                          aria-label="Desconectar"
                          title="Desconectar"
                          className="min-h-10 px-3 sm:px-5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-xs sm:text-sm font-bold text-red-400 transition flex items-center justify-center self-start sm:self-auto shrink-0"
                        >
                          <Unlink className="h-4 w-4 sm:hidden" aria-hidden="true" />
                          <span className="hidden sm:inline">Desconectar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectNetflix}
                          aria-label="Conectar"
                          title="Conectar"
                          className="min-h-10 px-3 sm:px-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs sm:text-sm font-bold text-emerald-300 transition flex items-center justify-center self-start sm:self-auto shrink-0"
                        >
                          <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                          <span className="hidden sm:inline">Conectar</span>
                        </button>
                      )}
                    </div>

                    <PlatformBadges
                      activeId={isNetflixConnected ? netflixAccountInfo?.metadata?.lastPlatform || null : null}
                      className="pl-16"
                    />
                  </div>

                  {/* Plex Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Plex.png" alt="Plex" className="h-8 w-8 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Plex</h3>
                          {plex.connected && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Conectado
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          {plex.connected
                            ? `Conectado${plex.account?.username ? ` como ${plex.account.username}` : ""}${plex.server?.name ? ` · Servidor: ${plex.server.name}` : " · No se detectó ningún servidor"}.`
                            : "Conecta tu cuenta de Plex (inicio de sesión en plex.tv) y detectaremos tu servidor local automáticamente, sin tokens ni configuración manual."}
                        </p>
                        {plex.connected && plex.server && (
                          <p className="mt-1.5 text-[11px] font-bold">
                            {plex.link === undefined ? (
                              <span className="text-zinc-500">Comprobando acceso al servidor…</span>
                            ) : plex.link?.kind === "local" ? (
                              <span className="text-emerald-400">● Servidor local accesible desde este dispositivo</span>
                            ) : plex.link?.kind === "relay" ? (
                              <span className="text-amber-400">● Accesible vía relay de Plex (no estás en la red local)</span>
                            ) : plex.link?.kind === "remote" ? (
                              <span className="text-emerald-400">● Servidor accesible (conexión remota)</span>
                            ) : (
                              <span className="text-zinc-500">
                                ○ No accesible desde este dispositivo. Conéctate a la misma red que tu servidor para acceso local.
                              </span>
                            )}
                          </p>
                        )}
                        {plexSync.result && (
                          <p className={`mt-2 text-xs sm:text-sm leading-relaxed ${plexSync.result.error ? "text-red-400" : "text-emerald-400"}`}>
                            {plexSync.result.message}
                          </p>
                        )}
                      </div>
                    </div>
                    {plex.connected ? (
                      <div className="flex flex-col gap-2 self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={handleSyncPlex}
                          disabled={plexSync.running}
                          aria-label="Sincronizar historial"
                          title="Sincronizar historial de Plex"
                          className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {plexSync.running ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">{plexSync.running ? "Sincronizando…" : "Sincronizar"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectPlex}
                          aria-label="Desconectar"
                          title="Desconectar"
                          className="min-h-10 px-3 sm:px-5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-xs sm:text-sm font-bold text-red-400 transition flex items-center justify-center"
                        >
                          <Unlink className="h-4 w-4 sm:hidden" aria-hidden="true" />
                          <span className="hidden sm:inline">Desconectar</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConnectPlex}
                        disabled={plexConnecting}
                        aria-label="Conectar"
                        title="Conectar"
                        className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-bold text-white transition flex items-center justify-center self-start sm:self-auto shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {plexConnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                            <span className="hidden sm:inline">Conectar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Spotify Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                        <img src="/spotify.png" alt="Spotify" className="h-8 w-8 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Spotify</h3>
                          {spotify.connected && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Conectado
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          {spotify.connected
                            ? `Vinculado${spotify.profile?.displayName ? ` como ${spotify.profile.displayName}` : ""}. Las bandas sonoras usan tu propia cuenta de Spotify.`
                            : "Vincula tu cuenta de Spotify para acceder a las bandas sonoras originales de tus películas y series directamente desde sus fichas, usando tu propia cuenta."}
                        </p>
                      </div>
                    </div>
                    {spotify.connected ? (
                      <button
                        type="button"
                        onClick={handleDisconnectSpotify}
                        aria-label="Desconectar"
                        title="Desconectar"
                        className="min-h-10 px-3 sm:px-5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-xs sm:text-sm font-bold text-red-400 transition flex items-center justify-center self-start sm:self-auto shrink-0"
                      >
                        <Unlink className="h-4 w-4 sm:hidden" aria-hidden="true" />
                        <span className="hidden sm:inline">Desconectar</span>
                      </button>
                    ) : (
                      <a
                        href="/api/spotify/login?next=/profile/settings"
                        aria-label="Conectar"
                        title="Conectar"
                        className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-bold text-white transition flex items-center justify-center self-start sm:self-auto shrink-0"
                      >
                        <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                        <span className="hidden sm:inline">Conectar</span>
                      </a>
                    )}
                  </div>

                  {/* Trakt Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Trakt.png" alt="Trakt" className="h-8 w-8 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Trakt.tv</h3>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          Vincula tu cuenta de Trakt para registrar automáticamente tu historial de visionado, listas y calificaciones en tiempo real.
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/api/trakt/auth/start?next=${encodeURIComponent("/profile/settings")}`}
                      aria-label="Conectar"
                      title="Conectar"
                      className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-bold text-white transition flex items-center justify-center self-start sm:self-auto shrink-0"
                    >
                      <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">Conectar</span>
                    </Link>
                  </div>

                  {/* Letterboxd Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Letterboxd.png" alt="Letterboxd" className="h-8 w-8 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Letterboxd</h3>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            Próximamente
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          Importa tu diario cinéfilo y películas valoradas desde Letterboxd mediante archivo CSV o integración directa.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      aria-label="Conectar"
                      title="Conectar"
                      className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto shrink-0 flex items-center justify-center"
                    >
                      <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">Conectar</span>
                    </button>
                  </div>

                  {/* Filmaffinity Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-row items-start justify-between gap-4 sm:items-center sm:gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                        <img src="/logoFilmaffinity.png" alt="Filmaffinity" className="h-8 w-8 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Filmaffinity</h3>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            Próximamente
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          Sincroniza tus calificaciones e historial de visionado desde Filmaffinity importando tus listas directamente.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      aria-label="Conectar"
                      title="Conectar"
                      className="min-h-10 px-3 sm:px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto shrink-0 flex items-center justify-center"
                    >
                      <Link2 className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">Conectar</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Modal de Conexión a Netflix */}
      <AnimatePresence>
        {showNetflixModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !connectLoading && setShowNetflixModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative overflow-hidden border border-red-500/20 bg-zinc-950/95 text-white max-w-md w-full rounded-[2rem] p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10"
            >
              {/* Decorative side bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-[#E50914]" />

              {awaitingInstall ? (
                <div className="py-6 flex flex-col items-center text-center font-sans">
                  <div className="rounded-2xl h-12 w-12 flex items-center justify-center bg-red-500/10 text-red-400 ring-1 ring-red-500/20 mb-5">
                    <Chrome className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-black text-white leading-tight">
                    Instala la extensión oficial
                  </h3>
                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    {NETFLIX_EXTENSION_INSTALL_URL
                      ? "Te hemos abierto la Chrome Web Store en una pestaña nueva. Pulsa «Añadir a Chrome» y, en cuanto se instale, continuaremos la conexión automáticamente — no tienes que hacer nada más aquí."
                      : "La extensión oficial todavía no está publicada en la Chrome Web Store. Configura NEXT_PUBLIC_NETFLIX_EXTENSION_ID (o NEXT_PUBLIC_NETFLIX_EXTENSION_URL) para habilitar la instalación de un clic."}
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                    Esperando la instalación…
                  </div>
                  <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowNetflixModal(false)}
                      className="flex-1 min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    {NETFLIX_EXTENSION_INSTALL_URL && (
                      <button
                        type="button"
                        onClick={openNetflixExtensionInstall}
                        className="inline-flex flex-1 min-h-11 items-center justify-center rounded-xl bg-red-600 text-xs sm:text-sm font-bold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                      >
                        Abrir Chrome Web Store
                      </button>
                    )}
                  </div>
                </div>
              ) : connectLoading ? (
                <div className="py-8 flex flex-col items-center text-center">
                  <div className="relative flex items-center justify-center mb-6">
                    <Loader2 className="h-12 w-12 animate-spin text-red-500" />
                    <img src="/netflix.png" alt="" className="absolute h-5 w-5 object-contain" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide font-sans">
                    Estableciendo integración
                  </h3>
                  
                  <div className="mt-6 w-full space-y-4 text-left bg-white/[0.02] border border-white/5 rounded-2xl p-4 font-sans">
                    <div className="flex items-center gap-3 text-xs">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${
                        connectStep > 0 ? "bg-emerald-500 border-emerald-500 text-black font-bold" : "border-red-500 text-red-500"
                      }`}>
                        {connectStep > 0 ? "✓" : "●"}
                      </div>
                      <span className={connectStep === 0 ? "text-white font-bold" : "text-zinc-400"}>
                        Comprobando la extensión de The Show Verse...
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${
                        connectStep > 1 ? "bg-emerald-500 border-emerald-500 text-black font-bold" : connectStep === 1 ? "border-red-500 text-red-500" : "border-white/10 text-zinc-600"
                      }`}>
                        {connectStep > 1 ? "✓" : "●"}
                      </div>
                      <span className={connectStep === 1 ? "text-white font-bold" : connectStep < 1 ? "text-zinc-600" : "text-zinc-400"}>
                        Cuenta vinculada: {connectedEmail || "tu cuenta"}. Autorizando sincronización...
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${
                        connectStep > 2 ? "bg-emerald-500 border-emerald-500 text-black font-bold" : connectStep === 2 ? "border-red-500 text-red-500" : "border-white/10 text-zinc-600"
                      }`}>
                        {connectStep > 2 ? "✓" : "●"}
                      </div>
                      <span className={connectStep === 2 ? "text-white font-bold" : connectStep < 2 ? "text-zinc-600" : "text-zinc-400"}>
                        Activando sincronización automática en la extensión...
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${
                        connectStep > 3 ? "bg-emerald-500 border-emerald-500 text-black font-bold" : connectStep === 3 ? "border-red-500 text-red-500" : "border-white/10 text-zinc-600"
                      }`}>
                        {connectStep > 3 ? "✓" : "●"}
                      </div>
                      <span className={connectStep === 3 ? "text-white font-bold" : connectStep < 3 ? "text-zinc-600" : "text-zinc-400"}>
                        ¡Sincronización configurada con éxito!
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {connectError && (
                    <div className="space-y-4 text-center font-sans">
                      <div className="rounded-2xl shrink-0 h-12 w-12 flex items-center justify-center bg-red-500/10 text-red-400 ring-red-500/20 mx-auto">
                        <img src="/netflix.png" alt="Netflix" className="h-6 w-6 object-contain" />
                      </div>
                      <h3 className="text-lg font-black text-white leading-tight">
                        Error al conectar Netflix
                      </h3>
                      <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 p-3 rounded-xl leading-relaxed">
                        {connectError}
                      </p>
                      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setShowNetflixModal(false)}
                          className="flex-1 min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleConnectNetflix}
                          className="flex-1 min-h-11 items-center justify-center rounded-xl bg-red-600 text-xs sm:text-sm font-bold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default ProfileSettingsClient;
