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
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
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

function ShareOption({ icon: Icon, label, onClick, disabled = false, busy = false, done = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="group/opt flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
    >
      <span
        className={`grid h-14 w-14 place-items-center rounded-full transition duration-300 ${
          done
            ? "bg-emerald-500/25 text-emerald-300"
            : "bg-white/[0.08] text-white group-hover/opt:-translate-y-0.5 group-hover/opt:bg-white/[0.14] group-disabled/opt:translate-y-0"
        }`}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Icon className="h-6 w-6" aria-hidden="true" />
        )}
      </span>
      <span className="text-xs font-bold leading-tight text-zinc-300 group-hover/opt:text-white">
        {label}
      </span>
    </button>
  );
}

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

  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Mismo velo que el resto de modales de la ficha. */}
      <div
        className="sv-fade-in absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`${styles.sheet} relative flex max-h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[2rem] sm:max-h-[92dvh] sm:rounded-[2rem] ${LIQUID_GLASS_PANEL}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
            >
              Compartir
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
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
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {/* Vista previa: la imagen tal cual se va a compartir. */}
          <div className="mx-auto aspect-[9/16] h-[min(52dvh,560px)] max-w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
            {imageReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.objectUrl}
                alt={`Imagen para compartir de ${title}`}
                className="h-full w-full object-cover"
                draggable="false"
              />
            ) : status === "error" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertCircle className="h-7 w-7 text-zinc-400" aria-hidden="true" />
                <p className="text-sm font-bold text-zinc-300">No se pudo preparar la imagen.</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden" role="status">
                <div
                  className={`${styles.shimmer} pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent`}
                  aria-hidden="true"
                />
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Preparando imagen…</p>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="grid auto-cols-fr grid-flow-col gap-1">
            {showShareImage && (
              <ShareOption
                icon={ImageIcon}
                label="Compartir imagen"
                onClick={onShareImage}
                disabled={!imageReady}
                busy={busy === "image"}
              />
            )}
            {showCopyImage && (
              <ShareOption
                icon={Copy}
                label="Copiar imagen"
                onClick={onCopyImage}
                disabled={!imageReady}
                done={done === "copyImage"}
              />
            )}
            {showSave && (
              <ShareOption
                icon={Download}
                label="Guardar imagen"
                onClick={onSave}
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
          <p className="mt-2 min-h-4 text-center text-xs font-bold text-zinc-400" aria-live="polite">
            {message}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
