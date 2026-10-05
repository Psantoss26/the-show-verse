"use client";

// Hoja de COMPARTIR de la ficha, al estilo de Spotify: arriba lo que se va a
// compartir y debajo las formas de mandarlo.
//   - Imagen: la "captura" de la ficha (/api/share/details-card).
//   - Vídeo: una historia corta que empieza con esa imagen y sigue con
//     visionados, puntuación, la reseña (si el usuario la incluye) y detalles
//     (ver lib/details/shareStory y lib/share/storyVideo). Solo se ofrece si el
//     navegador sabe codificar vídeo.
//
// Imagen y vídeo se generan al pedirlos y se guardan mientras el botón siga
// montado: volver a abrir la hoja con los mismos estados no los regenera.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  Clapperboard,
  Copy,
  Download,
  Image as ImageIcon,
  Link2,
  Loader2,
  RotateCw,
  Share2,
  X,
} from "lucide-react";

import useModalGuard from "@/hooks/useModalGuard";
import {
  canShareFileFromApp,
  canShareImageFromApp,
  isAndroidApp,
  shareFileFromApp,
  shareFromApp,
  shareImageFromApp,
} from "@/lib/android/appBridge";
import { shareCardFileName } from "@/lib/details/shareCard";
import { buildShareStoryPayload, sanitizeShareStory, storySceneIds } from "@/lib/details/shareStory";
import { getLocalInProgress } from "@/lib/api/progressClient";
import { createStoryVideo, detectStoryVideoFormat } from "@/lib/share/storyVideo";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_MODAL_HEADER } from "@/lib/ui/liquidGlass";
import styles from "./DetailsShareSheet.module.css";

// La ruta devuelve PNG (~3 MB por el póster a sangre). Para compartir se pasa a
// JPEG, que con el fondo opaco queda igual a la vista y pesa una fracción: se
// envía antes y las apps no lo recomprimen tanto. La PNG se conserva para
// copiar al portapapeles, que solo admite ese formato.
async function toJpeg(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return jpeg && jpeg.size < blob.size ? jpeg : blob;
  } catch {
    return blob;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function extensionOf(blob) {
  return blob.type === "image/jpeg" ? "jpg" : "png";
}

// Se sondea con un fichero vacío del mismo tipo: así se sabe antes de tenerlo y
// la fila de opciones no cambia al terminar de generarse.
function canShareFiles(mimeType, extension) {
  try {
    const probe = new File([new Uint8Array(1)], `probe.${extension}`, { type: mimeType });
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

function downloadBlob(href, fileName) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function canCopyImage() {
  return (
    typeof window !== "undefined" &&
    typeof window.ClipboardItem === "function" &&
    typeof navigator.clipboard?.write === "function"
  );
}

// Opción redonda con etiqueta debajo. Mismo lenguaje que los botones de los
// modales de acciones (StarRating, listas): cristal `bg-white/5` para las
// secundarias y la píldora blanca de "Guardar" para la principal.
function ShareOption({
  icon: Icon,
  label,
  onClick,
  primary = false,
  disabled = false,
  busy = false,
  done = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="group/opt flex min-w-0 flex-col items-center gap-2.5 rounded-2xl px-1 py-1 text-center outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full transition duration-300 group-active/opt:scale-95 ${
          done
            ? "bg-emerald-500/15 text-emerald-300 backdrop-blur-xl"
            : primary
              ? "bg-white/90 text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] group-hover/opt:bg-white"
              : "bg-white/5 text-white/70 backdrop-blur-xl group-hover/opt:bg-white/10 group-hover/opt:text-white"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Icon className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
      <span className="text-balance text-[10px] font-bold uppercase leading-tight tracking-wider text-white/50 transition-colors group-hover/opt:text-white/80">
        {label}
      </span>
    </button>
  );
}

// Bordes de la vista previa FUNDIDOS con el cristal del modal: la imagen no se
// recorta en seco con un rectángulo (ni lleva aro), se desvanece en un margen
// estrecho por los cuatro lados, igual que la portada de la ficha se funde con
// su fondo. Es la intersección de un degradado horizontal y uno vertical.
const PREVIEW_FEATHER = {
  WebkitMaskImage:
    "linear-gradient(to right, transparent, #000 5%, #000 95%, transparent), linear-gradient(to bottom, transparent, #000 2.5%, #000 96%, transparent)",
  WebkitMaskComposite: "source-in",
  maskImage:
    "linear-gradient(to right, transparent, #000 5%, #000 95%, transparent), linear-gradient(to bottom, transparent, #000 2.5%, #000 96%, transparent)",
  maskComposite: "intersect",
};

// Selector Imagen / Vídeo: la misma píldora que las opciones principales.
function ModeSwitch({ mode, onChange }) {
  const options = [
    { id: "image", label: "Imagen", icon: ImageIcon },
    { id: "video", label: "Vídeo", icon: Clapperboard },
  ];
  return (
    <div role="radiogroup" aria-label="Formato" className="mx-auto mb-5 grid w-full max-w-[16rem] grid-cols-2 gap-1 rounded-full bg-white/5 p-1 backdrop-blur-xl">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          onClick={() => onChange(id)}
          className={`flex h-9 items-center justify-center gap-2 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${
            mode === id
              ? "bg-white/90 text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)]"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

// Interruptor "Incluir mi reseña" (es texto del usuario que se va a publicar,
// así que va apagado por defecto).
function ReviewToggle({ checked, disabled, onChange }) {
  return (
    <label
      className={`mx-auto mt-5 flex max-w-[24rem] items-center justify-between gap-4 rounded-2xl bg-white/5 px-4 py-3 backdrop-blur-xl ${
        disabled ? "opacity-60" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white/85">Incluir mi reseña</span>
        <span className="block text-[11px] font-semibold text-white/45">
          {disabled ? "Tiene spoilers: no se incluye" : "Se mostrará en el vídeo"}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-400 ${
          checked ? "bg-orange-400/80" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </label>
  );
}

export default function DetailsShareSheet({ open, onClose, card, story, title, text, getUrl }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const [portalReady, setPortalReady] = useState(false);
  // { key, png, file, objectUrl } de la última imagen generada.
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [message, setMessage] = useState("");
  const doneTimer = useRef(null);

  // --- Vídeo.
  const [mode, setMode] = useState("image");
  // undefined: comprobando; null: este navegador no sabe codificar vídeo.
  const [videoFormat, setVideoFormat] = useState(undefined);
  const [includeReview, setIncludeReview] = useState(false);
  // { key, file, objectUrl } del último vídeo generado.
  const [video, setVideo] = useState(null);
  const [videoStatus, setVideoStatus] = useState("idle");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoAttempt, setVideoAttempt] = useState(0);

  useModalGuard({ open, onClose });
  useEffect(() => setPortalReady(true), []);

  // DATOS DEL VÍDEO QUE LA FICHA NO TIENE CARGADOS. Se piden al abrir la hoja
  // (no al cargar la ficha, que no los necesita): el progreso de «Continuar
  // viendo» del título y, en las series, las notas que el usuario ha dado a sus
  // episodios. El vídeo espera a tenerlos para no generarse dos veces.
  const extrasKey = story?.tmdbId ? `${story.type}:${story.tmdbId}` : "";
  const [storyExtras, setStoryExtras] = useState(null);
  useEffect(() => {
    if (!open) {
      setStoryExtras(null);
      return undefined;
    }
    if (!extrasKey) return undefined;
    let cancelled = false;
    const tmdbId = Number(story.tmdbId);
    (async () => {
      const [rows, ratings] = await Promise.all([
        getLocalInProgress().catch(() => []),
        story.type === "tv"
          ? fetch(`/api/trakt/ratings?type=episode&tmdbId=${tmdbId}`, { cache: "no-store" })
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null)
          : null,
      ]);
      if (cancelled) return;
      // El progreso más reciente del título (en una serie, su episodio).
      const current = (Array.isArray(rows) ? rows : [])
        .filter((row) => Number(row?.tmdbId) === tmdbId && row?.mediaType === story.type)
        .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")))[0];
      const episodeUserRatings = {};
      for (const row of Array.isArray(ratings?.results) ? ratings.results : []) {
        const season = Number(row?.season);
        const episode = Number(row?.episode);
        const rating = Number(row?.rating);
        if (Number.isInteger(season) && Number.isInteger(episode) && Number.isFinite(rating)) {
          episodeUserRatings[`S${season}E${episode}`] = rating;
        }
      }
      setStoryExtras({
        key: extrasKey,
        continueWatching:
          current && typeof current.percent === "number"
            ? { percent: current.percent * 100, season: current.season ?? null, episode: current.episode ?? null }
            : null,
        episodeUserRatings,
      });
    })();
    return () => {
      cancelled = true;
    };
    // `story` se lee al pedir; su identidad (tipo + id) va en `extrasKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extrasKey]);
  const extrasReady = !extrasKey || storyExtras?.key === extrasKey;

  const cardKey = card ? JSON.stringify(card) : "";
  const imageReady = status === "ready" && image?.key === cardKey;

  // La reseña solo se ofrece si existe; con spoilers, el interruptor se bloquea.
  const reviewAvailable = !!(story?.review?.comment || story?.review?.text);
  const reviewSpoiler = !!story?.review?.spoiler;
  const storyPayload = story
    ? sanitizeShareStory(
        buildShareStoryPayload({
          ...story,
          continueWatching: extrasReady ? storyExtras?.continueWatching : null,
          episodeUserRatings: extrasReady ? storyExtras?.episodeUserRatings : null,
          includeReview: includeReview && !reviewSpoiler,
        }),
      )
    : null;
  const sceneIds = storyPayload ? storySceneIds(card, storyPayload) : [];
  const videoKey = storyPayload ? `${cardKey}|${JSON.stringify(storyPayload)}` : "";
  const videoReady = videoStatus === "ready" && video?.key === videoKey;

  // Generar (o reutilizar) la imagen al abrir.
  useEffect(() => {
    if (!open || !card) return undefined;
    if (image?.key === cardKey) {
      setStatus("ready");
      return undefined;
    }
    const controller = new AbortController();
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch("/api/share/details-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: cardKey,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`card ${res.status}`);
        const png = await res.blob();
        const shareBlob = await toJpeg(png);
        if (controller.signal.aborted) return;
        const file = new File([shareBlob], shareCardFileName(title, extensionOf(shareBlob)), {
          type: shareBlob.type || "image/png",
        });
        setImage({ key: cardKey, png, file, objectUrl: URL.createObjectURL(shareBlob) });
        setStatus("ready");
      } catch (error) {
        if (error?.name !== "AbortError") setStatus("error");
      }
    })();
    return () => controller.abort();
    // `image` se lee solo para no regenerar: no debe relanzar la petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardKey, attempt]);

  // ¿Sabe este navegador codificar vídeo? Se pregunta una vez, al abrir.
  useEffect(() => {
    if (!open || !story || videoFormat !== undefined) return undefined;
    let cancelled = false;
    detectStoryVideoFormat().then((format) => {
      if (!cancelled) setVideoFormat(format);
    });
    return () => {
      cancelled = true;
    };
  }, [open, story, videoFormat]);

  // Generar (o reutilizar) el vídeo al elegirlo. Parte de la imagen de portada,
  // así que espera a que esté. Cerrar o cambiar de modo cancela la generación.
  useEffect(() => {
    if (!open || mode !== "video" || !videoFormat || !imageReady || !storyPayload || !extrasReady) return undefined;
    if (video?.key === videoKey) {
      setVideoStatus("ready");
      return undefined;
    }
    const controller = new AbortController();
    setVideoStatus("loading");
    setVideoProgress(0);
    (async () => {
      try {
        const blob = await createStoryVideo({
          card,
          story: storyPayload,
          sceneIds,
          cover: image.png,
          format: videoFormat,
          onProgress: setVideoProgress,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const file = new File([blob], shareCardFileName(title, videoFormat.extension), {
          type: videoFormat.mimeType,
        });
        setVideo({ key: videoKey, file, objectUrl: URL.createObjectURL(blob) });
        setVideoStatus("ready");
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.error("No se pudo crear el vídeo", error);
          setVideoStatus("error");
        }
      }
    })();
    return () => controller.abort();
    // Igual que la imagen: `video`, `card`, `storyPayload` y `sceneIds` van
    // dentro de `videoKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, videoFormat, imageReady, videoKey, videoAttempt, extrasReady]);

  // Liberar las URL de las vistas previas al cambiarlas o al desmontar.
  const objectUrl = image?.objectUrl;
  useEffect(() => () => objectUrl && URL.revokeObjectURL(objectUrl), [objectUrl]);
  const videoUrl = video?.objectUrl;
  useEffect(() => () => videoUrl && URL.revokeObjectURL(videoUrl), [videoUrl]);
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  // Foco al botón de cerrar al abrir (en la primera apertura, cuando el portal
  // ya está montado); al cerrar limpia los avisos.
  useEffect(() => {
    if (open) {
      if (portalReady) closeRef.current?.focus({ preventScroll: true });
    } else {
      setBusy(null);
      setDone(null);
      setMessage("");
    }
  }, [open, portalReady]);

  const flashDone = useCallback((key, note) => {
    setDone(key);
    setMessage(note);
    clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setDone(null), 2000);
  }, []);

  const url = useCallback(() => getUrl?.() || "", [getUrl]);
  const shareText = useCallback(() => [text, url()].filter(Boolean).join("\n"), [text, url]);

  const isVideo = mode === "video" && !!videoFormat;
  const media = isVideo
    ? { ready: videoReady, file: video?.file, objectUrl: video?.objectUrl, noun: "vídeo" }
    : { ready: imageReady, file: image?.file, objectUrl: image?.objectUrl, noun: "imagen" };
  const mediaMime = isVideo ? videoFormat.mimeType : "image/jpeg";
  const mediaExtension = isVideo ? videoFormat.extension : "jpg";

  const inApp = portalReady && isAndroidApp();
  // En la app: `shareFile` (imagen o vídeo) y, en versiones anteriores, solo
  // `shareImage` para la imagen.
  const appCanShareMedia = inApp && (canShareFileFromApp() || (!isVideo && canShareImageFromApp()));
  const webCanShareMedia = portalReady && !inApp && canShareFiles(mediaMime, mediaExtension);
  const showShareMedia = appCanShareMedia || webCanShareMedia;
  const showCopyImage = !isVideo && !inApp && !webCanShareMedia && portalReady && canCopyImage();
  const showSave = !inApp;
  const showShareLink =
    inApp || (portalReady && typeof navigator !== "undefined" && typeof navigator.share === "function");

  // --- Acciones. Cada una se lanza directamente desde el clic: la Web Share
  // API exige la activación del usuario, por eso imagen y vídeo ya están hechos.
  const onShareMedia = async () => {
    if (!media.ready) return;
    setMessage("");
    const failed = `No se pudo compartir ${isVideo ? "el vídeo" : "la imagen"}.`;
    if (appCanShareMedia) {
      setBusy("media");
      try {
        const base64 = await blobToBase64(media.file);
        const options = { base64, mimeType: media.file.type, fileName: media.file.name, text, url: url() };
        const ok = canShareFileFromApp() ? shareFileFromApp(options) : shareImageFromApp(options);
        if (!ok) setMessage(failed);
      } catch {
        setMessage(failed);
      } finally {
        setBusy(null);
      }
      return;
    }
    try {
      await navigator.share({ files: [media.file], title, text: shareText() });
    } catch (error) {
      if (error?.name !== "AbortError") setMessage(failed);
    }
  };

  const onSave = () => {
    if (!media.ready) return;
    downloadBlob(media.objectUrl, media.file.name);
    flashDone("save", isVideo ? "Vídeo guardado." : "Imagen guardada.");
  };

  const onCopyImage = async () => {
    if (!imageReady) return;
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": image.png })]);
      flashDone("copyImage", "Imagen copiada al portapapeles.");
    } catch {
      setMessage("No se pudo copiar la imagen.");
    }
  };

  const onCopyLink = async () => {
    const href = url();
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      flashDone("copyLink", "Enlace copiado.");
    } catch {
      setMessage("No se pudo copiar el enlace.");
    }
  };

  const onShareLink = async () => {
    const href = url();
    if (!href) return;
    if (inApp) {
      shareFromApp(text || title, href);
      return;
    }
    try {
      await navigator.share({ title, text, url: href });
    } catch (error) {
      if (error?.name !== "AbortError") setMessage("No se pudo compartir el enlace.");
    }
  };

  const changeMode = (next) => {
    setMode(next);
    setMessage("");
    setDone(null);
  };

  if (!open || !portalReady) return null;

  // La principal es la primera forma de mandar la imagen o el vídeo que haya.
  const primaryAction = showShareMedia ? "share" : showCopyImage ? "copy" : showSave ? "save" : null;
  const showModeSwitch = !!videoFormat && !!storyPayload;
  const progressPct = Math.round(videoProgress * 100);

  // Misma estructura y acabado que los modales de las acciones de la ficha
  // (puntuación, listas, enlaces): portal, velo `bg-black/60` difuminado,
  // tarjeta centrada `rounded-[2rem]` de LIQUID_GLASS_PANEL y cabecera
  // LIQUID_GLASS_MODAL_HEADER.
  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
      >
        <div className={`flex w-full shrink-0 items-center justify-between gap-3 ${LIQUID_GLASS_MODAL_HEADER} p-6 sm:px-8 sm:pb-6 sm:pt-8`}>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
            >
              Compartir
            </h2>
            <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
              {title}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {showModeSwitch && <ModeSwitch mode={mode} onChange={changeMode} />}

          {/* Vista previa: lo que se va a compartir, sin marco. */}
          <div
            className={`relative mx-auto aspect-[9/16] max-w-full ${
              showModeSwitch ? "h-[min(calc(85dvh-21rem),32rem)]" : "h-[min(calc(85dvh-18rem),34rem)]"
            }`}
          >
            {isVideo ? (
              videoReady ? (
                <video
                  key={video.objectUrl}
                  src={video.objectUrl}
                  className="h-full w-full rounded-[1.5rem] object-cover"
                  style={PREVIEW_FEATHER}
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-label={`Vídeo para compartir de ${title}`}
                />
              ) : videoStatus === "error" ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[1.5rem] bg-white/[0.03] p-6 text-center">
                  <AlertCircle className="h-7 w-7 text-white/40" aria-hidden="true" />
                  <p className="text-sm font-bold text-white/70">No se pudo crear el vídeo.</p>
                  <button
                    type="button"
                    onClick={() => setVideoAttempt((value) => value + 1)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-xs font-extrabold uppercase tracking-wide text-white/80 backdrop-blur-xl transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                    Reintentar
                  </button>
                </div>
              ) : (
                <div
                  className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[1.5rem] bg-white/[0.03] px-8"
                  style={PREVIEW_FEATHER}
                  role="status"
                >
                  {/* Mientras: la portada, que es el primer fotograma del vídeo. */}
                  {imageReady && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.objectUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-30"
                      draggable="false"
                    />
                  )}
                  <Clapperboard className="relative h-7 w-7 text-yellow-300" aria-hidden="true" />
                  <p className="relative text-[10px] font-bold uppercase tracking-widest text-white/70">
                    Creando vídeo… {progressPct}%
                  </p>
                  <div
                    className="relative h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-black/35 backdrop-blur-md"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPct}
                    aria-label="Progreso del vídeo"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-200/80 via-yellow-100 to-white shadow-[0_0_14px_rgba(250,204,21,0.45)] transition-[width] duration-200 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )
            ) : imageReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.objectUrl}
                alt={`Imagen para compartir de ${title}`}
                className="h-full w-full rounded-[1.5rem] object-cover"
                style={PREVIEW_FEATHER}
                draggable="false"
              />
            ) : status === "error" ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[1.5rem] bg-white/[0.03] p-6 text-center">
                <AlertCircle className="h-7 w-7 text-white/40" aria-hidden="true" />
                <p className="text-sm font-bold text-white/70">No se pudo preparar la imagen.</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-xs font-extrabold uppercase tracking-wide text-white/80 backdrop-blur-xl transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  Reintentar
                </button>
              </div>
            ) : (
              <div
                className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.5rem] bg-white/[0.03]"
                style={PREVIEW_FEATHER}
                role="status"
              >
                <div
                  className={`${styles.shimmer} pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent`}
                  aria-hidden="true"
                />
                <Loader2 className="h-6 w-6 animate-spin text-yellow-300" aria-hidden="true" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Preparando imagen…</p>
              </div>
            )}
          </div>

          {isVideo && reviewAvailable && (
            <ReviewToggle checked={includeReview && !reviewSpoiler} disabled={reviewSpoiler} onChange={setIncludeReview} />
          )}
        </div>

        <div className="shrink-0 px-5 pb-6 pt-5 sm:px-8 sm:pb-7">
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {showShareMedia && (
              <ShareOption
                icon={isVideo ? Clapperboard : ImageIcon}
                label={isVideo ? "Compartir vídeo" : "Compartir imagen"}
                onClick={onShareMedia}
                primary={primaryAction === "share"}
                disabled={!media.ready}
                busy={busy === "media"}
              />
            )}
            {showCopyImage && (
              <ShareOption
                icon={Copy}
                label="Copiar imagen"
                onClick={onCopyImage}
                primary={primaryAction === "copy"}
                disabled={!imageReady}
                done={done === "copyImage"}
              />
            )}
            {showSave && (
              <ShareOption
                icon={Download}
                label={isVideo ? "Guardar vídeo" : "Guardar imagen"}
                onClick={onSave}
                primary={primaryAction === "save"}
                disabled={!media.ready}
                done={done === "save"}
              />
            )}
            <ShareOption
              icon={Link2}
              label="Copiar enlace"
              onClick={onCopyLink}
              done={done === "copyLink"}
            />
            {showShareLink && (
              <ShareOption icon={Share2} label="Enviar enlace" onClick={onShareLink} />
            )}
          </div>
          <p className="mt-3 min-h-4 text-center text-xs font-semibold text-white/50" aria-live="polite">
            {message}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
