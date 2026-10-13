"use client";

// Importación desde Letterboxd: el usuario sube su exportación (el ZIP que
// descarga letterboxd.com/data/export, o diary.csv / watched.csv / ratings.csv /
// watchlist.csv / films.csv de likes),
// el navegador la lee y la manda por tandas a /api/letterboxd/import, que
// resuelve cada película con TMDb y guarda visionados y puntuaciones.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, DownloadCloud, FileArchive, Loader2, X } from "lucide-react";
import { abrirSoloEnNavegadorNativo, isAndroidApp } from "@/lib/android/appBridge";
import { buildLetterboxdImport, readLetterboxdFiles } from "@/lib/letterboxd/export";
import { runLetterboxdImport } from "@/lib/letterboxd/sync";
import { androidBrowserIntentUrl, isAndroidBrowser } from "@/lib/navigation/browserOnlyLink";

// Descarga directa del ZIP de la exportación (requiere la sesión de
// Letterboxd iniciada), sin pasar por Settings → Data → Export your data.
// En el móvil tiene que abrirse en el NAVEGADOR: la app de Letterboxd se queda
// con los enlaces de letterboxd.com, no tiene exportación y se quedaba
// cargando (ver lib/navigation/browserOnlyLink).
const EXPORT_URL = "https://letterboxd.com/data/export";
const MISSING_SAMPLES = 12;


function plural(count, one, many) {
  return `${count.toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

/**
 * Cómo abrir la exportación: "app" (la app de Android de The Show Verse, que
 * la abre en el navegador por el nativo), "android" (navegador de Android:
 * intent:// a Chrome) o "web". Se decide al montar: el servidor no lo sabe.
 */
function useExportLink() {
  const [mode, setMode] = useState("web");
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setMode(isAndroidApp() ? "app" : isAndroidBrowser(navigator.userAgent) ? "android" : "web");
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const onClick = (event) => {
    // Una app anterior sin el método: se sigue con el enlace normal.
    if (mode === "app" && abrirSoloEnNavegadorNativo(EXPORT_URL)) event.preventDefault();
  };
  const android = mode === "android";
  return {
    href: android ? androidBrowserIntentUrl(EXPORT_URL) : EXPORT_URL,
    // Un intent:// no abre pestaña: lo resuelve el sistema.
    target: android ? undefined : "_blank",
    onClick,
    // En el móvil queda la opción de copiar el enlace por si aun así se abre
    // la app de Letterboxd (o el navegador no entiende el intent).
    showCopy: touch || mode !== "web",
  };
}

function CopyExportLink() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EXPORT_URL);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-zinc-500">
      <span>¿Se abre la app de Letterboxd? Copia el enlace y pégalo en el navegador:</span>
      {failed ? (
        <span className="select-all font-mono text-zinc-300">{EXPORT_URL}</span>
      ) : (
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 font-bold text-zinc-200 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copiado" : "Copiar enlace"}</span>
        </button>
      )}
    </p>
  );
}

export default function LetterboxdImportPanel({ className = "" }) {
  const exportLink = useExportLink();
  const inputId = useId();
  const inputRef = useRef(null);
  const cancelRef = useRef(false);
  const [fileLabel, setFileLabel] = useState("");
  const [data, setData] = useState(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totals, setTotals] = useState(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setReading(true);
    setError("");
    setTotals(null);
    setFinished(false);
    setData(null);
    try {
      const texts = await readLetterboxdFiles(files);
      if (!Object.keys(texts).length) {
        throw new Error("No se encontró diary.csv, watched.csv, ratings.csv, reviews.csv, watchlist.csv ni los likes. Sube el ZIP de la exportación de Letterboxd.");
      }
      const next = buildLetterboxdImport(texts);
      if (!next.films.length) throw new Error("La exportación no tiene películas.");
      setData(next);
      setFileLabel(files.length === 1 ? files[0].name : `${files.length} archivos`);
    } catch (err) {
      setError(err?.message || "No se pudo leer la exportación.");
    } finally {
      setReading(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!data || running) return;
    cancelRef.current = false;
    setRunning(true);
    setFinished(false);
    setError("");
    setProgress({ done: 0, total: data.films.length });
    setTotals(null);

    try {
      const { cancelled } = await runLetterboxdImport(data, {
        isCancelled: () => cancelRef.current,
        onChunk: ({ done, total, totals: next }) => {
          setTotals(next);
          setProgress({ done, total });
        },
      });
      setFinished(!cancelled);
    } catch (err) {
      setError(err?.message || "No se pudo importar desde Letterboxd.");
    } finally {
      setRunning(false);
    }
  }, [data, running]);

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const diaryCount = data?.history.filter((item) => !item.undated).length || 0;
  const watchedOnly = data?.history.filter((item) => item.undated).length || 0;

  return (
    <div className={`${className} rounded-3xl p-5 sm:p-6 group flex flex-col justify-between`}>
      <div>
        <div className="mb-4 flex items-start gap-4">
          <div className="shrink-0 h-12 w-12 flex items-center justify-center group-hover:scale-105 transition-all duration-300">
            <img src="/logo-Letterboxd.png" alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-white tracking-wide">Importar desde Letterboxd</h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Trae tu diario de visionados (rewatches incluidos), tus puntuaciones, tus reseñas, tus favoritas y tu watchlist.{" "}
              <a
                href={exportLink.href}
                target={exportLink.target}
                rel="noopener noreferrer"
                onClick={exportLink.onClick}
                className="font-bold text-zinc-200 underline decoration-white/30 underline-offset-2 hover:text-white"
              >
                Descarga tu exportación de Letterboxd
              </a>{" "}
              y sube aquí el ZIP tal cual.
            </p>
            {exportLink.showCopy && <CopyExportLink />}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/[0.02] border border-white/5 p-4 space-y-3 text-xs">
          {data ? (
            <>
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <FileArchive className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <span className="truncate font-bold">{fileLabel}</span>
              </div>
              <Row label="Películas" value={plural(data.films.length, "película", "películas")} />
              <Row
                label="Historial"
                value={`${plural(diaryCount, "visionado", "visionados")}${watchedOnly ? ` + ${plural(watchedOnly, "vista sin fecha", "vistas sin fecha")}` : ""}`}
                status={totals ? plural(totals.historyImported, "nuevo", "nuevos") : null}
                done={finished}
              />
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
              {data.favorites.length > 0 && (
                <Row
                  label="Favoritas"
                  value={plural(data.favorites.length, "película", "películas")}
                  status={totals ? plural(totals.favoritesImported, "nueva", "nuevas") : null}
                  done={finished}
                />
              )}
              {data.reviews.length > 0 && (
                <Row
                  label="Reseñas"
                  value={plural(data.reviews.length, "reseña", "reseñas")}
                  status={totals ? plural(totals.reviewsImported, "nueva", "nuevas") : null}
                  done={finished}
                />
              )}
              {data.watchlist.length > 0 && (
                <Row
                  label="Pendientes"
                  value={plural(data.watchlist.length, "película", "películas")}
                  status={totals ? plural(totals.watchlistImported, "nueva", "nuevas") : null}
                  done={finished}
                />
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
                    {progress.done.toLocaleString("es-ES")} / {progress.total.toLocaleString("es-ES")} películas · {percent}%
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500">
              Se importan las películas del diario con su fecha de visionado, las vistas que no estén en el diario, la puntuación de cada una (½ estrella = 1 punto), tus reseñas en la ficha de cada película, tus películas con «me gusta» como favoritas y tu watchlist como pendientes.
            </p>
          )}
        </div>

        {finished && totals && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs font-bold text-emerald-300"
          >
            Importación completada: {plural(totals.historyImported, "visionado nuevo", "visionados nuevos")},{" "}
            {plural(totals.ratingsImported + totals.ratingsUpdated, "puntuación", "puntuaciones")},{" "}
            {plural(totals.reviewsImported, "reseña", "reseñas")},{" "}
            {plural(totals.favoritesImported, "favorita", "favoritas")} y{" "}
            {plural(totals.watchlistImported, "pendiente", "pendientes")}.
          </motion.p>
        )}
        {totals?.missing.length > 0 && !running && (
          <details className="mt-3 text-xs text-zinc-400">
            <summary className="cursor-pointer font-bold text-amber-300/90">
              {plural(totals.missing.length, "película no encontrada", "películas no encontradas")} en TMDb
            </summary>
            <ul className="mt-2 space-y-0.5">
              {totals.missing.slice(0, MISSING_SAMPLES).map((film) => (
                <li key={`${film.name}-${film.year}`} className="truncate">
                  {film.name}
                  {film.year ? ` (${film.year})` : ""}
                </li>
              ))}
              {totals.missing.length > MISSING_SAMPLES && (
                <li className="text-zinc-500">y {totals.missing.length - MISSING_SAMPLES} más</li>
              )}
            </ul>
          </details>
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
        {/* El MIME del ZIP va PRIMERO: el selector de la app de Android
            (WebView, FileChooserParams.createIntent) solo usa el primer tipo
            del `accept`, y con «.zip» —que no es un MIME— no dejaba elegir el
            archivo descargado. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/zip,application/x-zip-compressed,.zip,text/csv,.csv"
          multiple
          className="sr-only"
          onChange={handleFiles}
          disabled={running || reading}
        />
        <label
          htmlFor={inputId}
          aria-disabled={running || reading}
          className={`flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white/5 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${
            running || reading ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          {reading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileArchive className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {data ? "Cambiar archivo" : "Elegir exportación"}
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
            disabled={!data || reading}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <DownloadCloud className="mr-2 h-4 w-4" aria-hidden="true" />
            {finished ? "Importar de nuevo" : "Importar Letterboxd"}
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
