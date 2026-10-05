"use client";

// Corrección de una detección de streaming (extensión del navegador o app
// Android). Se llega desde el botón «No es correcto» de la notificación o del
// indicador, o desde Detecciones recientes. Dos veredictos:
//   - «No había ninguna ficha abierta»: la detección no era nada. Se borra lo
//     que guardó y ese texto deja de tomarse por un título.
//   - «El título es otro»: el usuario elige el correcto (y, en series, el
//     episodio). Lo guardado se mueve allí y esa huella se resuelve a él.
// El aprendizaje vive en el backend (routes/streamingDetections.js).

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronLeft,
  Film,
  HelpCircle,
  Loader2,
  Replace,
  Search,
  Tv,
  X,
} from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import { useAuth } from "@/context/AuthContext";
import { notifyDetectionCorrected } from "@/lib/android/appBridge";
import { searchProgressTitles } from "@/lib/api/progressClient";
import {
  correctDetection,
  detectionPlatformLabel,
  fetchDetection,
} from "@/lib/api/detectionsClient";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

const POSTER = (path, size = "w185") => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

function episodeLabel(season, episode) {
  if (!season || !episode) return null;
  return `T${season} · E${episode}`;
}

function PosterThumb({ path, isTv, className = "h-24 w-16" }) {
  const src = POSTER(path);
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-md`}>
      {src ? (
        <OptimizedImage src={src} alt="" width={128} height={192} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          {isTv ? <Tv className="h-6 w-6" aria-hidden="true" /> : <Film className="h-6 w-6" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}

function DetectedSummary({ detection }) {
  const isTv = detection.mediaType === "tv";
  const ep = episodeLabel(detection.season, detection.episode);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-3 shadow-lg">
      <PosterThumb path={detection.posterPath} isTv={isTv} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          {detection.kind === "detail" ? "Ficha detectada" : "Reproducción detectada"} ·{" "}
          {detectionPlatformLabel(detection)}
        </p>
        <p className="mt-1 line-clamp-2 text-base font-bold leading-tight text-white sm:text-lg">
          {detection.title || "Sin título"}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-zinc-300">
          {isTv ? "Serie" : "Película"}
          {ep ? <span className="text-zinc-400">· {ep}</span> : null}
        </p>
        {detection.triggerText && detection.triggerText !== detection.title ? (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-400">
            En pantalla ponía «{detection.triggerText}»
          </p>
        ) : null}
      </div>
    </div>
  );
}

function VerdictOption({ name, value, checked, onChange, icon: Icon, title, description }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
        checked
          ? "border-emerald-400/60 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-emerald-400`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
      />
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${checked ? "text-emerald-300" : "text-zinc-400"}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{description}</span>
      </span>
    </label>
  );
}

function TitleSearch({ onSelect, excludeKey }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setError("");
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const next = await searchProgressTitles(trimmed, { signal: controller.signal });
        setResults(next.slice(0, 12));
      } catch (searchError) {
        if (searchError?.name !== "AbortError") {
          setResults([]);
          setError(searchError?.message || "No se pudieron buscar títulos");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="space-y-3">
      <label htmlFor="detection-search" className="block text-sm font-bold text-zinc-200">
        ¿Qué título habías abierto?
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="detection-search"
          name="query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre de la película o serie"
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby="detection-search-status"
          className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/25 focus:bg-black/60 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {searching ? (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400 motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
            className={`absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white ${FOCUS_RING}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p id="detection-search-status" aria-live="polite" className="text-xs text-zinc-400">
        {error
          ? error
          : query.trim().length < 2
            ? "Escribe al menos dos caracteres."
            : searching
              ? "Buscando…"
              : results.length === 0
                ? "No se encontraron títulos. Prueba con otro nombre."
                : `${results.length} resultados`}
      </p>
      {results.length > 0 && (
        <ul className="grid gap-2" aria-label="Resultados de la búsqueda">
          {results.map((item) => {
            const key = `${item.media_type}:${item.id}`;
            const isTv = item.media_type === "tv";
            const year = String(item.release_date || "").slice(0, 4);
            const isDetected = key === excludeKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-2 text-left transition hover:bg-white/10 ${FOCUS_RING}`}
                >
                  <PosterThumb path={item.poster_path} isTv={isTv} className="h-16 w-11" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-bold text-white">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      {isTv ? "Serie" : "Película"}
                      {year ? ` · ${year}` : ""}
                      {isDetected ? " · el detectado" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NumberField({ id, name, label, value, onChange, disabled }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white tabular-nums outline-none transition focus:border-white/25 focus:bg-black/60 disabled:opacity-40"
      />
    </div>
  );
}

function CorrectionDone({ detection }) {
  const correction = detection.correction;
  const ep = correction ? episodeLabel(correction.season, correction.episode) : null;
  return (
    <div role="status" className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" aria-hidden="true" />
      <div>
        <p className="text-lg font-bold text-white">Corrección guardada</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-300">
          {correction?.verdict === "not_a_title"
            ? "Se ha quitado lo que se guardó por esta detección y ese texto ya no se tomará por un título."
            : correction?.tmdbId
              ? `Lo guardado ahora es de «${correction.title || "el título elegido"}»${ep ? ` (${ep})` : ""}. La próxima vez se reconocerá directamente.`
              : "Ese título no volverá a proponerse para lo que había en pantalla."}
        </p>
      </div>
    </div>
  );
}

export default function DetectionCorrectionClient({ detectionId }) {
  const { authenticated, hydrated } = useAuth();
  const [detection, setDetection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [verdict, setVerdict] = useState("");
  const [selected, setSelected] = useState(null);
  const [unknownTitle, setUnknownTitle] = useState(false);
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [unknownEpisode, setUnknownEpisode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!hydrated || !authenticated) return undefined;
    const controller = new AbortController();
    fetchDetection(detectionId, { signal: controller.signal })
      .then((row) => {
        if (!row) throw new Error("No se encontró la detección");
        setDetection(row);
        setSeason(row.detectedSeason ? String(row.detectedSeason) : "");
        setEpisode(row.detectedEpisode ? String(row.detectedEpisode) : "");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setLoadError(
          error?.status === 404
            ? "Esta detección ya no existe o es de otra cuenta. Las detecciones se guardan 30 días."
            : error?.status === 401
              ? "Tu sesión ha caducado. Vuelve a iniciar sesión para corregir esta detección."
              : error?.message || "No se pudo cargar la detección",
        );
      });
    return () => controller.abort();
  }, [detectionId, hydrated, authenticated]);

  const selectedIsTv = selected?.media_type === "tv";
  const hasEpisode = selectedIsTv && !unknownEpisode && Number(season) > 0 && Number(episode) > 0;
  const canSubmit =
    verdict === "not_a_title" ||
    (verdict === "wrong_title" && (unknownTitle || Boolean(selected)));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!canSubmit) {
      setSubmitError(
        verdict === "wrong_title"
          ? "Elige el título correcto o marca que no sabes cuál era."
          : "Indica qué estaba mal en la detección.",
      );
      return;
    }
    if (selectedIsTv && !unknownEpisode && (Number(season) > 0) !== (Number(episode) > 0)) {
      setSubmitError("Indica temporada y episodio, o marca que no sabes el episodio.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const updated = await correctDetection(detectionId, {
        verdict,
        item: verdict === "wrong_title" && !unknownTitle ? selected : null,
        season: hasEpisode ? Number(season) : null,
        episode: hasEpisode ? Number(episode) : null,
      });
      notifyDetectionCorrected(detectionId);
      setDetection(updated || detection);
      setDone(true);
    } catch (error) {
      setSubmitError(error?.message || "No se pudo guardar la corrección");
    } finally {
      setSubmitting(false);
    }
  };

  const detectedKey = detection ? `${detection.mediaType}:${detection.tmdbId}` : "";

  let body;
  if (hydrated && !authenticated) {
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm text-zinc-300">Inicia sesión para corregir esta detección.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/detections/${detectionId}`)}`}
          className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500/15 px-5 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/25 ${FOCUS_RING}`}
        >
          Iniciar sesión
        </Link>
      </div>
    );
  } else if (loadError) {
    body = (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {loadError}
      </p>
    );
  } else if (!detection) {
    body = (
      <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Cargando">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400 motion-reduce:animate-none" aria-hidden="true" />
      </div>
    );
  } else if (done) {
    body = <CorrectionDone detection={detection} />;
  } else {
    body = (
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <DetectedSummary detection={detection} />

        {detection.status === "corrected" && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            Ya corregiste esta detección. Puedes cambiar la corrección: la nueva sustituye a la anterior.
          </p>
        )}

        <fieldset className="space-y-2.5">
          <legend className="mb-2.5 text-sm font-bold text-zinc-200">¿Qué estaba mal?</legend>
          <VerdictOption
            name="verdict"
            value="not_a_title"
            checked={verdict === "not_a_title"}
            onChange={setVerdict}
            icon={Ban}
            title="No había ninguna ficha abierta"
            description="Se tomó por un título algo que no lo era (un carrusel, un banner, el inicio de la app…)."
          />
          <VerdictOption
            name="verdict"
            value="wrong_title"
            checked={verdict === "wrong_title"}
            onChange={setVerdict}
            icon={Replace}
            title="El título detectado es otro"
            description="Sí había una ficha o una reproducción, pero de otro título."
          />
        </fieldset>

        {verdict === "wrong_title" && (
          <div className="space-y-4 rounded-2xl bg-white/[0.03] p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <PosterThumb path={selected.poster_path} isTv={selectedIsTv} className="h-16 w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Título correcto</p>
                    <p className="line-clamp-2 text-sm font-bold text-white">{selected.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className={`flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-200 transition hover:bg-white/10 hover:text-white ${FOCUS_RING}`}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Cambiar
                  </button>
                </div>

                {selectedIsTv && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-bold text-zinc-200">Episodio</legend>
                    <p className="text-xs leading-relaxed text-zinc-400">
                      Rellenado con lo que mostraba el reproductor; cámbialo si no es correcto.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberField
                        id="detection-season"
                        name="season"
                        label="Temporada"
                        value={season}
                        onChange={setSeason}
                        disabled={unknownEpisode}
                      />
                      <NumberField
                        id="detection-episode"
                        name="episode"
                        label="Episodio"
                        value={episode}
                        onChange={setEpisode}
                        disabled={unknownEpisode}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        name="unknownEpisode"
                        checked={unknownEpisode}
                        onChange={(event) => setUnknownEpisode(event.target.checked)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      No sé el episodio (se guarda a nivel de serie)
                    </label>
                  </fieldset>
                )}
              </div>
            ) : unknownTitle ? (
              <p className="text-sm leading-relaxed text-zinc-300">
                Solo se descartará «{detection.title}» para lo que había en pantalla.
              </p>
            ) : (
              <TitleSearch onSelect={setSelected} excludeKey={detectedKey} />
            )}

            {!selected && (
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  name="unknownTitle"
                  checked={unknownTitle}
                  onChange={(event) => setUnknownTitle(event.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                <HelpCircle className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                No sé cuál era
              </label>
            )}
          </div>
        )}

        <div aria-live="assertive">
          {submitError ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {submitError}
            </p>
          ) : null}
        </div>

        <button
          data-online-only="true"
          type="submit"
          disabled={submitting}
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          Guardar corrección
        </button>
      </form>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 sm:pt-10">
      <Link
        href="/detections"
        className={`mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-zinc-400 transition hover:text-white ${FOCUS_RING}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Detecciones recientes
      </Link>
      <section className={`${LIQUID_GLASS_PANEL} rounded-[2rem] p-5 sm:p-7`} aria-labelledby="detection-title">
        <h1 id="detection-title" className="mb-1 text-xl font-bold text-white">
          Corregir detección
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-zinc-400">
          Tu corrección arregla lo que se guardó y enseña a la sincronización a no repetir el error.
        </p>
        {body}
      </section>
    </main>
  );
}
