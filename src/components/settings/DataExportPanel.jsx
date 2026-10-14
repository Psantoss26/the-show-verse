"use client";

// Exportación de favoritos, pendientes y puntuaciones. /api/user/export da los
// datos y el navegador arma el archivo (lib/userExport): CSV, el formato del
// importador de Letterboxd o JSON. En la app de Android la descarga la hace el
// nativo (`saveFile`), porque el WebView no descarga URLs `blob:`.

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { Check, Download, ExternalLink, FileDown, Loader2 } from "lucide-react";
import {
  buildExportFiles,
  EXPORT_SECTIONS,
  fetchUserExport,
  packageExport,
} from "@/lib/userExport";
import { canSaveFileFromApp, isAndroidApp, saveFileFromApp } from "@/lib/android/appBridge";

const SECTIONS = [
  { value: "favorites", label: "Favoritos", one: "favorito", many: "favoritos" },
  { value: "watchlist", label: "Pendientes", one: "pendiente", many: "pendientes" },
  { value: "ratings", label: "Puntuaciones", one: "puntuación", many: "puntuaciones" },
];

const FORMATS = [
  {
    value: "csv",
    label: "CSV",
    description: "Para Excel o Google Sheets. Un archivo por sección, con películas, series, temporadas y episodios.",
  },
  {
    value: "letterboxd",
    label: "Letterboxd",
    description: "Listo para su importador. Solo películas: Letterboxd no tiene series.",
  },
  {
    value: "json",
    label: "JSON",
    description: "Copia completa en un único archivo, para guardar o usar en otras herramientas.",
  },
];

const LETTERBOXD_IMPORT_URL = "https://letterboxd.com/import/";

function plural(count, one, many) {
  return `${count.toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function deliverFile({ name, blob }) {
  if (isAndroidApp()) {
    if (!canSaveFileFromApp()) {
      throw new Error("Actualiza la app para exportar desde ella, o hazlo desde el navegador.");
    }
    const saved = saveFileFromApp({ base64: await blobToBase64(blob), mimeType: blob.type, fileName: name });
    if (!saved) throw new Error("No se pudo guardar el archivo en el dispositivo.");
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari empieza la descarga después del clic: no revocar en el acto.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function DataExportPanel({ className = "" }) {
  const formId = useId();
  const [sections, setSections] = useState(EXPORT_SECTIONS);
  const [format, setFormat] = useState("csv");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const toggleSection = (value, checked) => {
    setResult(null);
    setError("");
    setSections((current) =>
      EXPORT_SECTIONS.filter((section) => (section === value ? checked : current.includes(section))),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (running) return;
    setResult(null);
    if (!sections.length) {
      setError("Elige al menos una sección para exportar.");
      return;
    }
    setError("");
    setRunning(true);
    try {
      const data = await fetchUserExport(sections);
      const { files, counts } = buildExportFiles(data, { format, sections });
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      if (!total) {
        throw new Error(
          format === "letterboxd"
            ? "No hay películas en lo que has elegido: Letterboxd solo admite películas."
            : "No hay nada que exportar en lo que has elegido.",
        );
      }
      const file = packageExport(files, { format });
      await deliverFile(file);
      setResult({ name: file.name, counts, format });
    } catch (err) {
      setError(err?.message || "No se pudo exportar.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={`${formId}-title`}
      className={`${className} rounded-3xl p-5 sm:p-6 group flex flex-col justify-between`}
    >
      <div>
        <div className="mb-4 flex items-start gap-4">
          <div className="shrink-0 h-12 w-12 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-all duration-300">
            <FileDown className="h-8 w-8" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id={`${formId}-title`} className="text-base font-extrabold text-white tracking-wide">
              Exportar tus datos
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Descarga una copia de tus favoritos, pendientes y puntuaciones para guardarla o llevarla a otra app.
            </p>
          </div>
        </div>

        <fieldset disabled={running} className="min-w-0">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Qué exportar</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SECTIONS.map((section) => (
              <label
                key={section.value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 text-xs sm:text-sm font-bold text-zinc-300 transition hover:bg-white/[0.08] has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-emerald-400"
              >
                <input
                  type="checkbox"
                  name="sections"
                  value={section.value}
                  checked={sections.includes(section.value)}
                  onChange={(event) => toggleSection(section.value, event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-emerald-400"
                />
                {section.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={running} className="mt-4 min-w-0">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Formato</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {FORMATS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:bg-white/[0.05] has-[:checked]:bg-emerald-400/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-emerald-400"
              >
                <input
                  type="radio"
                  name={`${formId}-format`}
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => {
                    setResult(null);
                    setError("");
                    setFormat(option.value);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-400"
                />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-bold text-white">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-400">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {format === "letterboxd" && (
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Las puntuaciones se suben en{" "}
            <a
              href={LETTERBOXD_IMPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-zinc-300 underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              letterboxd.com/import
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            ; favoritos y pendientes se pueden importar como lista al crear una lista nueva.
          </p>
        )}

        <div aria-live="polite">
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
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-xs text-zinc-400"
            >
              <p className="flex items-center gap-1.5 font-bold text-emerald-300">
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">Exportado {result.name}</span>
              </p>
              <p className="mt-1 pl-5">
                {SECTIONS.filter((section) => section.value in result.counts)
                  .map((section) => plural(result.counts[section.value], section.one, section.many))
                  .join(" · ")}
                {result.format === "letterboxd" ? " (solo películas)" : ""}
              </p>
            </motion.div>
          )}
        </div>
      </div>

      <div className="mt-6 flex">
        <button
          data-online-only="true"
          type="submit"
          disabled={running}
          className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-xs sm:text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:flex-none sm:min-w-56"
        >
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {running ? "Preparando…" : "Descargar exportación"}
        </button>
      </div>
    </form>
  );
}
