"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  User,
  Bell,
  RefreshCw,
  Layers,
  ChevronRight,
  Database,
  Link2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";

const GLASS_SURFACE =
  "relative overflow-hidden border border-white/[0.08] bg-black/40 shadow-2xl shadow-black/40 backdrop-blur-xl before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/[0.08] before:via-white/[0.02] before:to-transparent";
const GLASS_PANEL = `${GLASS_SURFACE} transition-all duration-300 hover:border-white/15`;

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
    <div className={`${GLASS_PANEL} rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 group`}>
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
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
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
              className={`relative min-h-11 rounded-xl px-4 text-xs sm:text-sm font-bold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 overflow-hidden ${
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
          setNotice(t("settings_imported", "Importación completada. Tus datos ya están en The Show Verse."));
          onImported?.();
        }
      } else if (nextStatus?.status === "error") {
        clearPolling();
        setLoading(false);
        setError(nextStatus?.error || "La importación no pudo completarse.");
        startedHereRef.current = false;
      }
    },
    [clearPolling, onImported, t],
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
            className={`rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center ${
              accent === "sky"
                ? "bg-sky-500/10 text-sky-400 ring-sky-500/20"
                : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
            } group-hover:scale-105 group-hover:bg-opacity-20 transition-all duration-300`}
          >
            {logoSrc ? (
              <img src={logoSrc} alt={title} className="h-6 w-6 object-contain" />
            ) : (
              <DownloadCloud className="h-6 w-6" aria-hidden="true" />
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
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState("personalization");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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
          <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 gap-1.5 border-b lg:border-b-0 lg:border-r border-white/5 scrollbar-none shrink-0 z-10">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 shrink-0 text-left w-full select-none ${
                    active
                      ? "bg-white/10 text-white border border-white/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.1),0_4px_10px_rgba(0,0,0,0.25)]"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="flex-1">{tab.label}</span>
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
                    <SegmentedField
                      label={t("settings_lang", "Idioma")}
                      value={preferences.language}
                      disabled={saving}
                      options={[
                        { value: "es-ES", label: "Español" },
                        { value: "en-US", label: "English" },
                      ]}
                      onChange={(language) => updatePreference({ language })}
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
                      icon={Globe2}
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
                  {/* Plex Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center bg-amber-500/10 ring-amber-500/20 group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Plex.png" alt="Plex" className="h-6 w-6 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Plex</h3>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            Próximamente
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          Conecta tu servidor Plex local o remoto para indexar tu biblioteca y reproducir contenidos directamente en la aplicación.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="min-h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto"
                    >
                      Conectar
                    </button>
                  </div>

                  {/* Spotify Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center bg-emerald-500/10 ring-emerald-500/20 group-hover:scale-105 transition-all duration-300">
                        <img src="/spotify.png" alt="Spotify" className="h-6 w-6 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white tracking-wide">Spotify</h3>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            Próximamente
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          Vincula tu cuenta de Spotify para acceder a las bandas sonoras originales de tus películas y series directamente desde sus fichas.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="min-h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto"
                    >
                      Conectar
                    </button>
                  </div>

                  {/* Trakt Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center bg-red-500/10 ring-red-500/20 group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Trakt.png" alt="Trakt" className="h-6 w-6 object-contain" />
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
                      className="min-h-10 px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-bold text-white transition flex items-center justify-center self-start sm:self-auto shrink-0"
                    >
                      Conectar
                    </Link>
                  </div>

                  {/* Letterboxd Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center bg-orange-500/10 ring-orange-500/20 group-hover:scale-105 transition-all duration-300">
                        <img src="/logo-Letterboxd.png" alt="Letterboxd" className="h-6 w-6 object-contain" />
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
                      className="min-h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto"
                    >
                      Conectar
                    </button>
                  </div>

                  {/* Filmaffinity Connection */}
                  <div className={`${GLASS_PANEL} rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5`}>
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl shrink-0 ring-1 h-12 w-12 flex items-center justify-center bg-blue-500/10 ring-blue-500/20 group-hover:scale-105 transition-all duration-300">
                        <img src="/logoFilmaffinity.png" alt="Filmaffinity" className="h-6 w-6 object-contain" />
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
                      className="min-h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-bold text-zinc-400 cursor-not-allowed opacity-60 self-start sm:self-auto"
                    >
                      Conectar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ProfileSettingsClient;
