"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  DownloadCloud,
  Eye,
  Globe2,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const GLASS_SURFACE =
  "relative overflow-hidden border border-white/[0.08] bg-black/40 shadow-2xl shadow-black/40 backdrop-blur-xl before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/[0.08] before:via-white/[0.02] before:to-transparent";
const GLASS_PANEL = `${GLASS_SURFACE} transition-colors hover:border-white/15`;

const DEFAULT_PREFERENCES = {
  defaultView: "grid",
  language: "es-ES",
  adultContent: false,
  notificationSettings: {
    weeklySummary: false,
  },
  uiSettings: {
    profileAutoRefresh: true,
    compactProfileCards: false,
    syncTraktActions: false,
  },
};

function mergePreferences(value) {
  return {
    ...DEFAULT_PREFERENCES,
    ...(value || {}),
    notificationSettings: {
      ...DEFAULT_PREFERENCES.notificationSettings,
      ...(value?.notificationSettings || {}),
    },
    uiSettings: {
      ...DEFAULT_PREFERENCES.uiSettings,
      ...(value?.uiSettings || {}),
    },
  };
}

function formatImportStep(step) {
  if (!step) return "Pendiente";
  if (step.status === "loading") return "Cargando";
  if (step.status === "done") {
    const parts = [];
    if (typeof step.imported === "number") parts.push(`${step.imported} nuevos`);
    if (typeof step.updated === "number") parts.push(`${step.updated} actualizados`);
    if (typeof step.skipped === "number") parts.push(`${step.skipped} existentes`);
    if (typeof step.fetched === "number" && parts.length === 0) {
      parts.push(`${step.fetched} leidos`);
    }
    return parts.length ? parts.join(" · ") : "Completado";
  }
  return step.status || "Pendiente";
}

function SettingsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(16,185,129,0.16),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_50%_92%,rgba(168,85,247,0.14),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.18),rgba(0,0,0,0.82))]" />
    </div>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, disabled, onChange }) {
  return (
    <div className={`${GLASS_PANEL} rounded-2xl p-4`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-white/5 p-2 text-emerald-300 ring-1 ring-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-8 w-14 shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
            checked
              ? "border-emerald-400/40 bg-emerald-400/80"
              : "border-white/10 bg-white/10"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
              checked ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function SegmentedField({ label, value, options, disabled, onChange }) {
  return (
    <label className={`${GLASS_PANEL} block rounded-2xl p-4`}>
      <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
              value === option.value
                ? "bg-white text-black"
                : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </label>
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
}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollingRef = useRef(null);
  const startedHereRef = useRef(false);
  const accent = color === "sky" ? "sky" : "emerald";

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch(statusUrl, { cache: "no-store" });
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
          setNotice("Importacion completada. Tus datos ya estan en The Show Verse.");
          onImported?.();
        }
      } else if (nextStatus?.status === "error") {
        clearPolling();
        setLoading(false);
        setError(nextStatus?.error || "La importacion no pudo completarse.");
        startedHereRef.current = false;
      }
    },
    [clearPolling, onImported],
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
    loadStatus()
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
        throw new Error(json?.error || "No se pudo iniciar la importacion.");
      }
      setStatus(json);
      setNotice("Importacion iniciada. Puedes dejar esta pagina abierta para ver el progreso.");
      startPolling();
    } catch (err) {
      setError(err?.message || "No se pudo iniciar la importacion.");
      setLoading(false);
    }
  }, [startBody, startPolling, startUrl]);

  const steps = status?.steps || {};
  const running = loading || status?.status === "running";

  return (
    <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div
              className={`rounded-xl p-2 ring-1 ${
                accent === "sky"
                  ? "bg-sky-500/10 text-sky-400 ring-sky-500/20"
                  : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
              }`}
            >
              <DownloadCloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-sm text-zinc-400">{description}</p>
            </div>
          </div>

          <div
            className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2"
            aria-live="polite"
            aria-atomic="true"
          >
            {stepsConfig.map((step) => (
              <div key={step.key}>
                <span className="font-bold uppercase tracking-wide text-zinc-500">
                  {step.label}
                </span>
                <p className="text-zinc-300">{formatImportStep(steps[step.key])}</p>
              </div>
            ))}
          </div>

          {notice ? (
            <p className={`mt-3 text-sm ${accent === "sky" ? "text-sky-300" : "text-emerald-300"}`}>
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          <a
            href={connectHref}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              accent === "sky" ? "focus-visible:outline-sky-400" : "focus-visible:outline-emerald-400"
            }`}
          >
            {connectLabel}
          </a>
          <button
            type="button"
            onClick={handleImport}
            disabled={running}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              accent === "sky" ? "focus-visible:outline-sky-400" : "focus-visible:outline-emerald-400"
            }`}
          >
            {running ? "Importando..." : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileSettingsClient() {
  const { authenticated, hydrated, user } = useAuth();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar los ajustes.");
      setPreferences(mergePreferences(json?.preferences));
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los ajustes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!authenticated) {
      setLoading(false);
      return;
    }
    loadPreferences();
  }, [authenticated, hydrated, loadPreferences]);

  const savePreferences = useCallback(async (nextPreferences) => {
    setPreferences(nextPreferences);
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPreferences),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudieron guardar los ajustes.");
      setPreferences(mergePreferences(json?.preferences));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err?.message || "No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  }, []);

  const updatePreference = useCallback(
    (patch) => {
      const next = mergePreferences({
        ...preferences,
        ...patch,
      });
      savePreferences(next);
    },
    [preferences, savePreferences],
  );

  const updateUi = useCallback(
    (key, value) => {
      updatePreference({
        uiSettings: {
          ...preferences.uiSettings,
          [key]: value,
        },
      });
    },
    [preferences.uiSettings, updatePreference],
  );

  const updateNotification = useCallback(
    (key, value) => {
      updatePreference({
        notificationSettings: {
          ...preferences.notificationSettings,
          [key]: value,
        },
      });
    },
    [preferences.notificationSettings, updatePreference],
  );

  if (!hydrated || loading) {
    return (
      <main className="min-h-screen bg-black text-zinc-100">
        <SettingsBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-black text-zinc-100">
        <SettingsBackground />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
          <div className={`${GLASS_PANEL} rounded-3xl p-8`}>
            <Settings className="mx-auto mb-4 h-10 w-10 text-emerald-300" />
            <h1 className="text-3xl font-black tracking-tight text-white">Configuracion</h1>
            <p className="mt-3 text-zinc-400">
              Inicia sesion para gestionar tus importaciones y preferencias personales.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent("/profile/settings")}`}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-black transition hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Iniciar sesion
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pb-20 text-zinc-100 selection:bg-emerald-500/30">
      <SettingsBackground />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 lg:py-12">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/profile"
              className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al perfil
            </Link>
            <div className="mb-2 flex items-center gap-3">
              <div className="h-px w-12 bg-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Tu cuenta
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white md:text-6xl">
              Configuracion
              <span className="text-emerald-500">.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Gestiona importaciones, conexiones y preferencias de uso para {user?.displayName || user?.username || "tu cuenta"}.
            </p>
          </div>
          <div className="flex min-h-9 items-center gap-2 text-sm text-zinc-400" aria-live="polite">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                Guardado
              </>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
            {error}
          </div>
        ) : null}

        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <SlidersHorizontal className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 className="text-2xl font-black text-white">Ajustes personales</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SegmentedField
              label="Vista por defecto"
              value={preferences.defaultView}
              disabled={saving}
              options={[
                { value: "grid", label: "Grid" },
                { value: "list", label: "Lista" },
                { value: "compact", label: "Compacta" },
              ]}
              onChange={(defaultView) => updatePreference({ defaultView })}
            />
            <SegmentedField
              label="Idioma"
              value={preferences.language}
              disabled={saving}
              options={[
                { value: "es-ES", label: "Español" },
                { value: "en-US", label: "English" },
                { value: "ca-ES", label: "Catala" },
              ]}
              onChange={(language) => updatePreference({ language })}
            />
            <ToggleRow
              icon={Eye}
              title="Contenido adulto"
              description="Permite incluir contenido adulto en futuras busquedas y recomendaciones compatibles."
              checked={preferences.adultContent}
              disabled={saving}
              onChange={(adultContent) => updatePreference({ adultContent })}
            />
            <ToggleRow
              icon={RotateCcw}
              title="Autorefresco del perfil"
              description="Actualiza estadisticas cuando vuelves desde una importacion o cambio importante."
              checked={Boolean(preferences.uiSettings.profileAutoRefresh)}
              disabled={saving}
              onChange={(value) => updateUi("profileAutoRefresh", value)}
            />
            <ToggleRow
              icon={LayoutGrid}
              title="Tarjetas compactas"
              description="Preferencia preparada para vistas de perfil y biblioteca con mas densidad visual."
              checked={Boolean(preferences.uiSettings.compactProfileCards)}
              disabled={saving}
              onChange={(value) => updateUi("compactProfileCards", value)}
            />
            <ToggleRow
              icon={Shield}
              title="Sincronizar acciones con Trakt"
              description="Mantiene Trakt como integracion opcional para acciones nuevas cuando este conectado."
              checked={Boolean(preferences.uiSettings.syncTraktActions)}
              disabled={saving}
              onChange={(value) => updateUi("syncTraktActions", value)}
            />
            <ToggleRow
              icon={Globe2}
              title="Resumen semanal"
              description="Preferencia de notificaciones para futuros correos o paneles semanales."
              checked={Boolean(preferences.notificationSettings.weeklySummary)}
              disabled={saving}
              onChange={(value) => updateNotification("weeklySummary", value)}
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-3">
            <DownloadCloud className="h-5 w-5 text-sky-300" aria-hidden="true" />
            <h2 className="text-2xl font-black text-white">Importaciones</h2>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ImportPanel
              title="Importar desde Trakt"
              description="Trae tu historial de visionado y tus puntuaciones a The Show Verse."
              color="emerald"
              connectHref={`/api/trakt/auth/start?next=${encodeURIComponent("/profile/settings")}`}
              connectLabel="Conectar Trakt"
              startUrl="/api/trakt/import/start"
              statusUrl="/api/trakt/import/status"
              startBody={{ mode: "history_ratings" }}
              buttonLabel="Importar ahora"
              stepsConfig={[
                { key: "history", label: "Historial" },
                { key: "ratings", label: "Puntuaciones" },
              ]}
            />
            <ImportPanel
              title="Importar desde TMDb"
              description="Trae tus favoritos y pendientes antiguos a The Show Verse."
              color="sky"
              connectHref={`/api/tmdb/auth/start?next=${encodeURIComponent("/profile/settings")}`}
              connectLabel="Conectar TMDb"
              startUrl="/api/tmdb/import/start"
              statusUrl="/api/tmdb/import/status"
              buttonLabel="Importar TMDb"
              stepsConfig={[
                { key: "favorites", label: "Favoritos" },
                { key: "watchlist", label: "Pendientes" },
              ]}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

export default ProfileSettingsClient;
