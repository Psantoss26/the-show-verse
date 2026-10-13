"use client";

// Importación desde IMDb: el usuario exporta cada lista desde su página de
// IMDb (valoraciones, watchlist, check-ins y listas propias), descarga los CSV
// en imdb.com/exports y los sube aquí. El navegador los lee (lib/imdb/export)
// y los manda por tandas a /api/imdb/import, que resuelve cada título con TMDb
// por su id de IMDb.

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, DownloadCloud, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { buildImdbImport, IMDB_LIST_NAME_MAX, readImdbFiles, runImdbImport } from "@/lib/imdb/export";

// Atajos de IMDb a las páginas del usuario: con la sesión iniciada llevan a la
// suya (sin ella, IMDb pide entrar y vuelve). Comprobados el 2026-10-13.
const IMDB_EXPORTS_URL = "https://www.imdb.com/exports/";
const IMDB_SOURCES = [
  { label: "Valoraciones", href: "https://www.imdb.com/list/ratings" },
  { label: "Watchlist", href: "https://www.imdb.com/list/watchlist" },
  { label: "Check-ins", href: "https://www.imdb.com/list/checkins" },
  { label: "Tus listas", href: "https://www.imdb.com/profile/lists" },
];
const LIST_TARGETS = [
  { value: "watchlist", label: "Pendientes" },
  { value: "watched", label: "Vistos" },
  { value: "list", label: "Lista propia" },
];
const MISSING_SAMPLES = 12;

function plural(count, one, many) {
  return `${count.toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

export default function ImdbImportPanel({ className = "" }) {
  const inputId = useId();
  const markWatchedId = useId();
  const cancelRef = useRef(false);
  const [files, setFiles] = useState([]);
  const [markWatched, setMarkWatched] = useState(true);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totals, setTotals] = useState(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");

  const data = useMemo(() => (files.length ? buildImdbImport(files) : null), [files]);

  const resetResult = () => {
    setTotals(null);
    setFinished(false);
  };

  const handleFiles = useCallback(async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length) return;
    setReading(true);
    setError("");
    setTotals(null);
    setFinished(false);
    try {
      const next = await readImdbFiles(picked);
      if (!next.length) {
        throw new Error("No se reconoció ningún CSV de IMDb. Sube los archivos que descargas en «Tus exportaciones».");
      }
      setFiles(next);
    } catch (err) {
      setFiles([]);
      setError(err?.message || "No se pudieron leer los archivos.");
    } finally {
      setReading(false);
    }
  }, []);

  const updateFile = (id, patch) => {
    resetResult();
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  };

  const handleImport = useCallback(async () => {
    if (!data?.titles.length || running) return;
    cancelRef.current = false;
    setRunning(true);
    setFinished(false);
    setError("");
    setProgress({ done: 0, total: data.titles.length });
    setTotals(null);
    try {
      const { cancelled } = await runImdbImport(data, {
        markWatched,
        isCancelled: () => cancelRef.current,
        onChunk: ({ done, total, totals: next }) => {
          setTotals(next);
          setProgress({ done, total });
        },
      });
      setFinished(!cancelled);
    } catch (err) {
      setError(err?.message || "No se pudo importar desde IMDb.");
    } finally {
      setRunning(false);
    }
  }, [data, markWatched, running]);

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const listItems = data?.lists.reduce((sum, list) => sum + list.items.length, 0) || 0;
  const busy = running || reading;

  return (
    <div className={`${className} rounded-3xl p-5 sm:p-6 group flex flex-col justify-between`}>
      <div>
        <div className="mb-4 flex items-start gap-4">
          <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
            <img src="/logo-IMDb.png" alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-white tracking-wide">Importar desde IMDb</h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Trae tus valoraciones (películas, series y episodios), tu watchlist, tus check-ins y tus listas. En IMDb
              pulsa <strong className="text-zinc-200">Exportar</strong> en cada una, descarga los CSV en{" "}
              <a
                href={IMDB_EXPORTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-zinc-200 underline decoration-white/30 underline-offset-2 hover:text-white"
              >
                Tus exportaciones
              </a>{" "}
              y súbelos aquí juntos.
            </p>
          </div>
        </div>

        {/* Atajos a las páginas desde las que se exporta (IMDb solo lo
            permite en su web de escritorio). */}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {IMDB_SOURCES.map((source, index) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-10 items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                <span className="truncate">
                  <span className="mr-1.5 tabular-nums text-zinc-500">{index + 1}</span>
                  {source.label}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
        <a
          href={IMDB_EXPORTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#f5c518]/10 px-3 text-xs font-bold text-[#f5c518] transition hover:bg-[#f5c518]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5c518]"
        >
          <DownloadCloud className="h-4 w-4" aria-hidden="true" />
          Descargar mis exportaciones de IMDb
        </a>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          IMDb solo permite exportar desde su web de escritorio. Cada exportación tarda unos segundos en aparecer en
          «Tus exportaciones».
        </p>

        <div className="mt-4 rounded-2xl bg-white/[0.02] border border-white/5 p-4 space-y-3 text-xs">
          {data ? (
            <>
              <ul className="space-y-2">
                {files.map((file) => (
                  <li key={file.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                      <span className="truncate font-bold">{file.name}</span>
                      <span className="ml-auto shrink-0 text-zinc-500">
                        {file.kind === "ratings" ? "Valoraciones" : plural(file.rows.length, "título", "títulos")}
                      </span>
                    </div>
                    {file.kind === "list" && (
                      <div className="flex flex-col gap-2 pl-6 sm:flex-row">
                        <label className="sr-only" htmlFor={`${inputId}-${file.id}-target`}>
                          Destino de {file.name}
                        </label>
                        <select
                          id={`${inputId}-${file.id}-target`}
                          value={file.target}
                          disabled={busy}
                          onChange={(event) => updateFile(file.id, { target: event.target.value })}
                          className="min-h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-xs font-bold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        >
                          {LIST_TARGETS.map((target) => (
                            <option key={target.value} value={target.value}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                        {file.target === "list" && (
                          <>
                            <label className="sr-only" htmlFor={`${inputId}-${file.id}-name`}>
                              Nombre de la lista
                            </label>
                            <input
                              id={`${inputId}-${file.id}-name`}
                              type="text"
                              value={file.listName}
                              maxLength={IMDB_LIST_NAME_MAX}
                              disabled={busy}
                              onChange={(event) => updateFile(file.id, { listName: event.target.value })}
                              placeholder="Nombre de la lista"
                              className="min-h-9 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                            />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="space-y-3 border-t border-white/5 pt-3">
                <Row label="Títulos" value={plural(data.titles.length, "título", "títulos")} />
                {data.ratings.length > 0 && (
                  <Row
                    label="Puntuaciones"
                    value={plural(data.ratings.length, "puntuación", "puntuaciones")}
                    status={
                      totals
                        ? `${plural(totals.ratingsImported, "nueva", "nuevas")} · ${plural(totals.ratingsUpdated, "actualizada", "actualizadas")}`
                        : null
                    }
                    done={finished}
                  />
                )}
                {(data.watched.length > 0 || (markWatched && data.ratings.length > 0)) && (
                  <Row
                    label="Vistos"
                    value={
                      data.watched.length
                        ? plural(data.watched.length, "check-in", "check-ins")
                        : "Películas y episodios puntuados"
                    }
                    status={totals ? plural(totals.historyImported, "nuevo", "nuevos") : null}
                    done={finished}
                  />
                )}
                {data.watchlist.length > 0 && (
                  <Row
                    label="Pendientes"
                    value={plural(data.watchlist.length, "título", "títulos")}
                    status={totals ? plural(totals.watchlistImported, "nuevo", "nuevos") : null}
                    done={finished}
                  />
                )}
                {data.lists.length > 0 && (
                  <Row
                    label="Listas"
                    value={`${plural(data.lists.length, "lista", "listas")} · ${plural(listItems, "título", "títulos")}`}
                    status={
                      totals
                        ? `${plural(totals.listsCreated, "creada", "creadas")} · ${plural(totals.listItemsImported, "título nuevo", "títulos nuevos")}`
                        : null
                    }
                    done={finished}
                  />
                )}
              </div>

              {data.ratings.length > 0 && (
                <label htmlFor={markWatchedId} className="flex cursor-pointer items-start gap-2.5 pt-1 text-zinc-300">
                  <input
                    id={markWatchedId}
                    type="checkbox"
                    checked={markWatched}
                    disabled={busy}
                    onChange={(event) => {
                      resetResult();
                      setMarkWatched(event.target.checked);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-400"
                  />
                  <span>
                    Marcar como vistas las películas y episodios puntuados, con la fecha de la valoración (si aún no
                    los tienes vistos).
                  </span>
                </label>
              )}

              {(running || totals) && (
                <div className="pt-1">
                  <progress
                    value={progress.done}
                    max={progress.total || 1}
                    aria-label="Progreso de la importación"
                    className="h-1.5 w-full overflow-hidden rounded-full accent-emerald-400 [&::-moz-progress-bar]:bg-emerald-400 [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-emerald-400"
                  />
                  <p className="mt-1.5 text-zinc-500 tabular-nums" aria-live="polite">
                    {progress.done.toLocaleString("es-ES")} / {progress.total.toLocaleString("es-ES")} títulos · {percent}%
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500">
              Se importan tus puntuaciones (de 1 a 10, como en IMDb), tu watchlist como pendientes, tus check-ins como
              vistos y cada lista como una lista privada tuya. Repetir la importación no duplica nada.
            </p>
          )}
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs text-red-300"
            role="alert"
          >
            {error}
          </motion.p>
        )}
        {finished && totals && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs font-bold text-emerald-300"
          >
            Importación completada: {plural(totals.ratingsImported + totals.ratingsUpdated, "puntuación", "puntuaciones")},{" "}
            {plural(totals.historyImported, "visto nuevo", "vistos nuevos")},{" "}
            {plural(totals.watchlistImported, "pendiente", "pendientes")} y{" "}
            {plural(totals.listItemsImported, "título en listas", "títulos en listas")}.
          </motion.p>
        )}
        {totals?.missing.length > 0 && !running && (
          <details className="mt-3 text-xs text-zinc-400">
            <summary className="cursor-pointer font-bold text-amber-300/90">
              {plural(totals.missing.length, "título no encontrado", "títulos no encontrados")} en TMDb
            </summary>
            <ul className="mt-2 space-y-0.5">
              {totals.missing.slice(0, MISSING_SAMPLES).map((title) => (
                <li key={`${title.title}-${title.year}`} className="truncate">
                  {title.title}
                  {title.year ? ` (${title.year})` : ""}
                </li>
              ))}
              {totals.missing.length > MISSING_SAMPLES && (
                <li className="text-zinc-500">y {totals.missing.length - MISSING_SAMPLES} más</li>
              )}
            </ul>
          </details>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
        {/* Un MIME va PRIMERO: el selector de la app de Android (WebView,
            FileChooserParams.createIntent) solo usa el primer tipo del
            `accept` (ver LetterboxdImportPanel). `text/*` y no `text/csv`:
            Android etiqueta muchos CSV como text/comma-separated-values. */}
        <input
          id={inputId}
          type="file"
          accept="text/*,.csv,application/zip,.zip"
          multiple
          className="sr-only"
          onChange={handleFiles}
          disabled={busy}
        />
        <label
          htmlFor={inputId}
          aria-disabled={busy}
          className={`flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${
            busy ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          {reading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {data ? "Cambiar archivos" : "Elegir CSV de IMDb"}
        </label>
        {running ? (
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
            }}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white/10 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Detener
          </button>
        ) : (
          <button
            data-online-only="true"
            type="button"
            onClick={handleImport}
            disabled={!data?.titles.length || reading}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <DownloadCloud className="mr-2 h-4 w-4" aria-hidden="true" />
            {finished ? "Importar de nuevo" : "Importar IMDb"}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, status, done }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-300">
        {value}
        {status && (
          <span className={`mt-0.5 flex items-center justify-end gap-1 ${done ? "text-emerald-400" : "text-zinc-500"}`}>
            {done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {status}
          </span>
        )}
      </span>
    </div>
  );
}
