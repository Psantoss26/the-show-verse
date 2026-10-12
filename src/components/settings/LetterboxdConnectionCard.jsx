"use client";

// Ajustes → Conexiones → Letterboxd. Sincronización automática por el feed RSS
// público del perfil: se escribe el usuario, el servidor revisa el feed cada
// pocas horas y añade los visionados y puntuaciones nuevos. El historial
// antiguo (el feed solo trae las últimas ~50 entradas) entra con la
// importación del ZIP (LetterboxdImportPanel).

import { useCallback, useEffect, useId, useState } from "react";
import { DownloadCloud, Loader2, RefreshCw, Unlink } from "lucide-react";

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
      if (json) {
        setUsername("");
        setMessage(`Conectado. ${describeSync(json.sync)}`);
      }
    },
    [run, username],
  );

  const syncNow = useCallback(async () => {
    const json = await run("sync", "/api/letterboxd/sync", { method: "POST" });
    if (json) setMessage(describeSync(json.sync));
  }, [run]);

  const disconnect = useCallback(async () => {
    const json = await run("disconnect", "/api/letterboxd/connection", { method: "DELETE" });
    if (json) setMessage("Letterboxd desconectado. Lo ya importado se queda en tu cuenta.");
  }, [run]);

  const connected = Boolean(connection?.connected);
  const lastSync = formatSyncDate(connection?.lastSyncedAt);

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
                . Lo que registres en tu diario llega solo cada pocas horas
                {lastSync ? ` · última revisión ${lastSync}` : ""}.
              </>
            ) : (
              "Escribe tu usuario y lo que registres en tu diario de Letterboxd llegará solo: visionados, rewatches y puntuaciones. Tu perfil tiene que ser público."
            )}
          </p>
        </div>
      </div>

      {connected ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-online-only="true"
            onClick={syncNow}
            disabled={Boolean(busy)}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Sincronizar ahora
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
          >
            <DownloadCloud className="h-4 w-4" aria-hidden="true" />
            Importar historial antiguo
          </button>
          <button
            type="button"
            data-online-only="true"
            onClick={disconnect}
            disabled={Boolean(busy)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
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
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-5 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "connect" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Conectar
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
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
