"use client";

// Hoja de COMPARTIR de la ficha, al estilo de Spotify: arriba la imagen que se
// va a compartir (la "captura" de la ficha que genera /api/share/details-card)
// y debajo las formas de mandarla: la imagen por el selector del sistema,
// guardarla o copiarla, y el enlace de siempre.
//
// La imagen se pide al abrir y se guarda mientras el botón siga montado: volver
// a abrir la hoja del mismo título con los mismos estados no la regenera.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
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
  canShareImageFromApp,
  isAndroidApp,
  shareFromApp,
  shareImageFromApp,
} from "@/lib/android/appBridge";
import { shareCardFileName } from "@/lib/details/shareCard";
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

// Se sondea con un JPEG vacío: así se sabe antes de tener la imagen y la fila
// de opciones no cambia al terminar de generarse.
function canShareImageFiles() {
  try {
    const probe = new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" });
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
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

export default function DetailsShareSheet({ open, onClose, card, title, text, getUrl }) {
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

  useModalGuard({ open, onClose });
  useEffect(() => setPortalReady(true), []);

  const cardKey = card ? JSON.stringify(card) : "";
  const imageReady = status === "ready" && image?.key === cardKey;

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

  // Liberar la URL de la vista previa al cambiarla o al desmontar.
  const objectUrl = image?.objectUrl;
  useEffect(() => () => objectUrl && URL.revokeObjectURL(objectUrl), [objectUrl]);
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

  const inApp = portalReady && isAndroidApp();
  const appCanShareImage = inApp && canShareImageFromApp();
  const webCanShareImage = portalReady && !inApp && canShareImageFiles();
  const showShareImage = appCanShareImage || webCanShareImage;
  const showCopyImage = !inApp && !webCanShareImage && portalReady && canCopyImage();
  const showSave = !inApp;
  const showShareLink =
    inApp || (portalReady && typeof navigator !== "undefined" && typeof navigator.share === "function");

  // --- Acciones. Cada una se lanza directamente desde el clic: la Web Share
  // API exige la activación del usuario, por eso la imagen ya está preparada.
  const onShareImage = async () => {
    if (!imageReady) return;
    setMessage("");
    if (appCanShareImage) {
      setBusy("image");
      try {
        const base64 = await blobToBase64(image.file);
        const ok = shareImageFromApp({
          base64,
          mimeType: image.file.type,
          fileName: image.file.name,
          text,
          url: url(),
        });
        if (!ok) setMessage("No se pudo compartir la imagen.");
      } catch {
        setMessage("No se pudo compartir la imagen.");
      } finally {
        setBusy(null);
      }
      return;
    }
    try {
      await navigator.share({ files: [image.file], title, text: shareText() });
    } catch (error) {
      if (error?.name !== "AbortError") setMessage("No se pudo compartir la imagen.");
    }
  };

  const onSave = () => {
    if (!imageReady) return;
    const link = document.createElement("a");
    link.href = image.objectUrl;
    link.download = image.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    flashDone("save", "Imagen guardada.");
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

  if (!open || !portalReady) return null;

  // La principal es la primera forma de mandar la IMAGEN que haya disponible.
  const primaryImageAction = showShareImage ? "share" : showCopyImage ? "copy" : showSave ? "save" : null;

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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Vista previa: la imagen tal cual se va a compartir, sin marco. */}
          <div className="relative mx-auto aspect-[9/16] h-[min(calc(85dvh-18rem),34rem)] max-w-full">
            {imageReady ? (
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
        </div>

        <div className="shrink-0 px-5 pb-6 pt-5 sm:px-8 sm:pb-7">
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {showShareImage && (
              <ShareOption
                icon={ImageIcon}
                label="Compartir imagen"
                onClick={onShareImage}
                primary={primaryImageAction === "share"}
                disabled={!imageReady}
                busy={busy === "image"}
              />
            )}
            {showCopyImage && (
              <ShareOption
                icon={Copy}
                label="Copiar imagen"
                onClick={onCopyImage}
                primary={primaryImageAction === "copy"}
                disabled={!imageReady}
                done={done === "copyImage"}
              />
            )}
            {showSave && (
              <ShareOption
                icon={Download}
                label="Guardar imagen"
                onClick={onSave}
                primary={primaryImageAction === "save"}
                disabled={!imageReady}
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
