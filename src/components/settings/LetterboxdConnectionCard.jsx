"use client";

// Ajustes → Conexiones → Letterboxd. Al escribir el usuario, el servidor trae
// TODO el historial del perfil público (diario, películas vistas y notas) en
// segundo plano; aquí se ve su progreso. Después, el feed RSS mantiene al día
// lo nuevo cada pocas horas. El ZIP (LetterboxdImportPanel) queda como
// alternativa si Letterboxd no deja leer el perfil.

import { useCallback, useEffect, useId, useState } from "react";
import { DownloadCloud, History, Loader2, RefreshCw, Unlink } from "lucide-react";

const POLL_MS = 3000;

function describeBackfill(backfill) {
  if (!backfill) return "Preparando la sincronización de todo tu historial…";
  const n = (value) => Number(value || 0).toLocaleString("es-ES");
  if (backfill.phase === "diary") return `Leyendo tu diario… ${n(backfill.diary)} visionados (página ${n(backfill.pages)})`;
  if (backfill.phase === "films") return `Leyendo tus películas vistas… ${n(backfill.films)} películas`;
  if (backfill.phase === "resolve") return `Identificando películas… ${n(backfill.resolved)} de ${n(backfill.total)}`;
  if (backfill.phase === "save") return "Guardando visionados y puntuaciones…";
  return "Sincronizando todo tu historial…";
}

function formatSyncDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function describeSync(sync) {
  if (!sync) return "";
  if (!sync.ok) return sync.error || "No se pudo sincronizar.";
  if (!sync.history && !sync.ratings) return "Todo al día: no había nada nuevo.";
  return `Añadidos ${plural(sync.history, "visionado", "visionados")} y ${plural(sync.ratings, "puntuación", "puntuaciones")}.`;
}

export default function LetterboxdConnectionCard({ className = "", onOpenImport }) {
  const inputId = useId();
  const [connection, setConnection] = useState(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/letterboxd/connection", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((json) => setConnection(json))
      .catch(() => {
        if (!controller.signal.aborted) setConnection({ connected: false });
      });
    return () => controller.abort();
  }, []);

  // Mientras la sincronización completa está en marcha, se consulta su progreso.
  const backfillRunning =
    Boolean(connection?.connected) && (!connection.backfill || connection.backfill.status === "running");
  useEffect(() => {
    if (!backfillRunning) return undefined;
    const timer = window.setInterval(() => {
      fetch("/api/letterboxd/connection", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json && typeof json.connected === "boolean") setConnection(json);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [backfillRunning]);

  const run = useCallback(async (kind, url, init) => {
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => ({}));
      if (json && typeof json.connected === "boolean") setConnection(json);
      if (!res.ok) throw new Error(json?.sync?.error || json?.error || "No se pudo completar la acción.");
      return json;
    } catch (err) {
      setError(err?.message || "No se pudo completar la acción.");
      return null;
    } finally {
      setBusy("");
    }
  }, []);

  const connect = useCallback(
    async (event) => {
      event.preventDefault();
      if (!username.trim()) return;
      const json = await run("connect", "/api/letterboxd/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (json) setUsername("");
    },
    [run, username],
  );

  const syncNow = useCallback(async () => {
    const json = await run("sync", "/api/letterboxd/sync", { method: "POST" });
    if (json) setMessage(describeSync(json.sync));
  }, [run]);

  const resyncAll = useCallback(async () => {
    await run("backfill", "/api/letterboxd/backfill", { method: "POST" });
  }, [run]);

  const disconnect = useCallback(async () => {
    const json = await run("disconnect", "/api/letterboxd/connection", { method: "DELETE" });
    if (json) setMessage("Letterboxd desconectado. Lo ya importado se queda en tu cuenta.");
  }, [run]);

  const connected = Boolean(connection?.connected);
  const lastSync = formatSyncDate(connection?.lastSyncedAt);
  const backfill = connection?.backfill || null;
  const progress =
    backfill?.phase === "resolve" && backfill.total ? Math.round((backfill.resolved / backfill.total) * 100) : null;

  return (
    <div className={`${className} rounded-3xl p-5 sm:p-6 flex flex-col gap-4`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
          <img src="/logo-Letterboxd.png" alt="Letterboxd" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold text-white tracking-wide">Letterboxd</h3>
            {connected ? (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sincronizado
              </span>
            ) : (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 text-zinc-400">
                Automático
              </span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
            {connected ? (
              <>
                Conectado como{" "}
                <a
                  href={`https://letterboxd.com/${connection.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-zinc-200 hover:text-white"
                >
                  @{connection.username}
                </a>
                . Todo tu historial se sincroniza al conectar y lo nuevo llega solo cada pocas horas
                {lastSync ? ` · última revisión ${lastSync}` : ""}.
              </>
            ) : (
              "Escribe tu usuario y se sincroniza todo tu historial de Letterboxd: diario, películas vistas y puntuaciones. Después, lo nuevo llega solo. Tu perfil tiene que ser público."
            )}
          </p>
        </div>
      </div>

      {connected && backfillRunning && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3.5 text-xs" aria-live="polite">
          <p className="flex items-center gap-2 font-bold text-zinc-200">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" aria-hidden="true" />
            {describeBackfill(backfill)}
          </p>
          <progress
            {...(progress != null ? { value: progress, max: 100 } : {})}
            aria-label="Progreso de la sincronización completa"
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full accent-emerald-400 [&::-moz-progress-bar]:bg-emerald-400 [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-emerald-400"
          />
          <p className="mt-1.5 text-zinc-500">Puede tardar unos minutos con perfiles grandes. Puedes salir de esta página.</p>
        </div>
      )}
      {connected && backfill?.status === "done" && (
        <p className="text-xs text-zinc-400">
          <span className="font-bold text-emerald-300">Historial completo sincronizado</span>
          {` · ${Number(backfill.matched ?? backfill.resolved ?? 0).toLocaleString("es-ES")} películas, ${Number(backfill.history || 0).toLocaleString("es-ES")} visionados nuevos y ${Number(backfill.ratings || 0).toLocaleString("es-ES")} puntuaciones`}
          {formatSyncDate(backfill.finishedAt) ? ` (${formatSyncDate(backfill.finishedAt)})` : ""}.
        </p>
      )}
      {connected && backfill?.status === "error" && (
        <p className="text-xs font-bold text-amber-300/90" role="alert">
          No se pudo traer todo el historial: {backfill.error} Se reintentará automáticamente; también puedes importar el ZIP.
        </p>
      )}

      {connected ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-online-only="true"
            onClick={syncNow}
            disabled={Boolean(busy) || backfillRunning}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Sincronizar ahora
          </button>
          <button
            type="button"
            data-online-only="true"
            onClick={resyncAll}
            disabled={Boolean(busy) || backfillRunning}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "backfill" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <History className="h-4 w-4" aria-hidden="true" />}
            Sincronizar todo el historial
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
          >
            <DownloadCloud className="h-4 w-4" aria-hidden="true" />
            Importar ZIP
          </button>
          <button
            type="button"
            data-online-only="true"
            onClick={disconnect}
            disabled={Boolean(busy)}
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
          >
            {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlink className="h-4 w-4" aria-hidden="true" />}
            Desconectar
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            Usuario de Letterboxd
          </label>
          <div className="flex min-h-10 flex-1 items-center rounded-xl bg-white/5 px-3 focus-within:ring-2 focus-within:ring-emerald-400/60">
            <span className="text-sm text-zinc-500" aria-hidden="true">@</span>
            <input
              id={inputId}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="usuario o enlace del perfil"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={!connection || Boolean(busy)}
              className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-white placeholder:text-zinc-500 outline-none"
            />
          </div>
          <button
            type="submit"
            data-online-only="true"
            disabled={!connection || Boolean(busy) || !username.trim()}
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-5 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "connect" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Conectar
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
          >
            <DownloadCloud className="h-4 w-4" aria-hidden="true" />
            Importar ZIP
          </button>
        </form>
      )}

      {connected && connection?.lastError && !message && !error && (
        <p className="text-xs font-bold text-amber-300/90">Última revisión con error: {connection.lastError}</p>
      )}
      {message && (
        <p className="text-xs font-bold text-emerald-300" aria-live="polite">
          {message}
        </p>
      )}
      {error && (
        <p className="text-xs font-bold text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
