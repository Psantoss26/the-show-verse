"use client";

// Ajustes → Conexiones → Letterboxd.
//
//   - Sincronización por RSS (servidor): al conectar y cada pocas horas trae
//     las entradas nuevas del diario (visionados, rewatches, reseñas con
//     visionado y notas) y las notas editadas de las entradas que siguen en el
//     feed. Solo cubre las últimas ~50 entradas y no detecta eliminaciones.
//   - Historial completo: la exportación oficial de Letterboxd, con la
//     extensión de The Show Verse (la descarga sola con la sesión de este
//     navegador y se repite cada día, ver LetterboxdAutoSync) o subiendo el ZIP.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DownloadCloud, History, Loader2, Puzzle, RefreshCw, Unlink } from "lucide-react";
import {
  detectShowVerseExtension,
  syncLetterboxdWithExtension,
  writeLastAutoSync,
} from "@/lib/letterboxd/sync";

const EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_URL ||
  (process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_ID
    ? `https://chromewebstore.google.com/detail/${process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_ID}`
    : "");

function describeExtensionSync(state) {
  const n = (value) => Number(value || 0).toLocaleString("es-ES");
  if (!state || state.phase === "export") return "Descargando tu exportación de Letterboxd…";
  if (state.phase === "read") return "Leyendo tu historial…";
  if (!state.total) return "Comprobando cambios…";
  return `Importando… ${n(state.done)} de ${n(state.total)} películas`;
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
  const [hasExtension, setHasExtension] = useState(null);
  const [extSync, setExtSync] = useState(null);
  const autoTriedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    detectShowVerseExtension().then((present) => {
      if (alive) setHasExtension(present);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refreshConnection = useCallback(async () => {
    const res = await fetch("/api/letterboxd/connection", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json && typeof json.connected === "boolean") setConnection(json);
  }, []);

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
        if (json.sync) setMessage(`Conectado. ${describeSync(json.sync)}`);
      }
    },
    [run, username],
  );

  const syncNow = useCallback(async () => {
    const json = await run("sync", "/api/letterboxd/sync", { method: "POST" });
    if (json) setMessage(describeSync(json.sync));
  }, [run]);

  // Historial completo con la exportación oficial (extensión).
  const syncWithExtension = useCallback(
    async ({ full = false } = {}) => {
      if (!connection?.username) return;
      setError("");
      setMessage("");
      setExtSync({ phase: "export" });
      writeLastAutoSync();
      try {
        const result = await syncLetterboxdWithExtension({
          username: connection.username,
          full,
          onPhase: (phase, progress) => setExtSync({ phase, ...progress }),
        });
        await refreshConnection();
        setMessage(
          result.pending
            ? `Sincronización terminada: ${plural(result.history, "visionado nuevo", "visionados nuevos")} y ${plural(result.ratings, "puntuación", "puntuaciones")}.`
            : "Historial completo al día: no había cambios en Letterboxd.",
        );
      } catch (err) {
        setError(err?.message || "No se pudo sincronizar con Letterboxd.");
      } finally {
        setExtSync(null);
      }
    },
    [connection?.username, refreshConnection],
  );

  // Recién conectada y con la extensión en este navegador: se trae todo el
  // historial con la exportación sin esperar (el RSS solo da lo último).
  useEffect(() => {
    if (autoTriedRef.current || !hasExtension || !connection?.connected || connection.extensionSync) return;
    autoTriedRef.current = true;
    void syncWithExtension();
  }, [connection, hasExtension, syncWithExtension]);

  const disconnect = useCallback(async () => {
    const json = await run("disconnect", "/api/letterboxd/connection", { method: "DELETE" });
    if (json) setMessage("Letterboxd desconectado. Lo ya importado se queda en tu cuenta.");
  }, [run]);

  const connected = Boolean(connection?.connected);
  const extensionDone = connection?.extensionSync || null;
  const extRunning = Boolean(extSync);
  const lastSync = formatSyncDate(connection?.lastSyncedAt);
  const lastResult = connection?.lastResult || null;

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
                . Tu diario se sincroniza por RSS cada pocas horas
                {lastSync ? ` · última revisión ${lastSync}` : ""}.
              </>
            ) : (
              "Escribe tu usuario y lo que registres en tu diario de Letterboxd llegará solo por RSS: visionados, rewatches, reseñas y puntuaciones. Tu perfil tiene que ser público."
            )}
          </p>
        </div>
      </div>

      {connected && !extRunning && lastResult && !connection?.lastError && (
        <p className="text-xs text-zinc-400">
          <span className="font-bold text-zinc-200">Última revisión del RSS:</span>{" "}
          {lastResult.entries || lastResult.edited
            ? `${plural(lastResult.history || 0, "visionado nuevo", "visionados nuevos")} y ${plural(lastResult.ratings || 0, "puntuación", "puntuaciones")}${lastResult.edited ? ` (${plural(lastResult.edited, "entrada editada", "entradas editadas")})` : ""}.`
            : "sin entradas nuevas."}
        </p>
      )}
      {connected && extRunning && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3.5 text-xs" aria-live="polite">
          <p className="flex items-center gap-2 font-bold text-zinc-200">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" aria-hidden="true" />
            {describeExtensionSync(extSync)}
          </p>
          <progress
            {...(extSync.total ? { value: extSync.done || 0, max: extSync.total } : {})}
            aria-label="Progreso de la sincronización completa"
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full accent-emerald-400 [&::-moz-progress-bar]:bg-emerald-400 [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-emerald-400"
          />
          <p className="mt-1.5 text-zinc-500">Con la exportación oficial de Letterboxd. Deja esta página abierta hasta que termine.</p>
        </div>
      )}
      {connected && !extRunning && extensionDone && (
        <p className="text-xs text-zinc-400">
          <span className="font-bold text-emerald-300">Historial completo sincronizado</span>
          {` · ${Number(extensionDone.films || 0).toLocaleString("es-ES")} películas en tu exportación de Letterboxd`}
          {formatSyncDate(extensionDone.finishedAt) ? ` (${formatSyncDate(extensionDone.finishedAt)})` : ""}. Se repite solo cada día al abrir The Show Verse en este navegador.
        </p>
      )}
      {connected && !extRunning && !extensionDone && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3.5 text-xs text-zinc-300">
          <p className="font-bold text-zinc-100">El RSS solo trae tus últimas ~50 entradas del diario.</p>
          {hasExtension ? (
            <p className="mt-1 leading-relaxed">
              Pulsa <strong className="text-white">Sincronizar todo el historial</strong>: la extensión descargará tu
              exportación oficial de Letterboxd con la sesión de letterboxd.com de este navegador.
            </p>
          ) : (
            <p className="mt-1 leading-relaxed">
              Para traer todo tu historial, importa el ZIP de tu exportación o instala la extensión de The Show Verse
              (versión 3.2 o posterior) con la sesión de letterboxd.com iniciada en este navegador.
            </p>
          )}
          {!hasExtension && EXTENSION_INSTALL_URL && (
            <a
              href={EXTENSION_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex min-h-9 items-center gap-2 rounded-xl bg-white px-4 font-bold text-black transition hover:bg-zinc-200"
            >
              <Puzzle className="h-4 w-4" aria-hidden="true" />
              Instalar la extensión
            </a>
          )}
        </div>
      )}

      {connected ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-online-only="true"
            onClick={syncNow}
            disabled={Boolean(busy) || extRunning}
            className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Sincronizar ahora
          </button>
          {hasExtension && (
            <button
              type="button"
              data-online-only="true"
              onClick={() => syncWithExtension({ full: true })}
              disabled={Boolean(busy) || extRunning}
              className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {extRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <History className="h-4 w-4" aria-hidden="true" />}
              Sincronizar todo el historial
            </button>
          )}
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
            disabled={Boolean(busy) || extRunning}
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
