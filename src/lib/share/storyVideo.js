"use client";

// Composición y codificación del VÍDEO compartible de una ficha, en el
// navegador (WebCodecs + mediabunny para el contenedor).
//
// El servidor pinta las capas (/api/share/details-card para la portada y
// /api/share/details-story para el resto) y aquí se montan fotograma a
// fotograma siguiendo `storyFrame`: la portada con un acercamiento, el fundido
// al fondo de las secciones y cada sección entrando y saliendo. Se codifica más
// rápido que en tiempo real (no hay que reproducir nada) y sin pasar por el
// servidor, que en el NAS no tiene por qué cargar con un codificador de vídeo.
//
// `mediabunny` se carga solo al pedir un vídeo: la ficha no paga su peso.

import { SHARE_CARD_HEIGHT as H, SHARE_CARD_WIDTH as W } from "@/lib/details/shareCard";
import { STORY_FPS, storyFrame, storyFrameCount, storyTimeline } from "@/lib/details/shareStory";

// Texto y degradados sobre fondos casi quietos: 5 Mbps sobra para que no se vea
// bloque y deja un archivo de ~6-9 MB para ~15 s.
const BITRATE = 5_000_000;
const KEY_FRAME_INTERVAL = 2;

let mediabunnyPromise = null;
function loadMediabunny() {
  if (!mediabunnyPromise) {
    mediabunnyPromise = import("mediabunny").catch((error) => {
      mediabunnyPromise = null;
      throw error;
    });
  }
  return mediabunnyPromise;
}

function abortError() {
  return new DOMException("Cancelado", "AbortError");
}

/**
 * Formato de vídeo que este navegador sabe codificar, o null si ninguno.
 * H.264 en MP4 es lo que aceptan todas las apps (historias, mensajería); VP9 en
 * WebM es el respaldo de los navegadores sin codificador H.264.
 */
export async function detectStoryVideoFormat() {
  if (typeof window === "undefined" || typeof window.VideoEncoder !== "function") return null;
  try {
    const { canEncodeVideo, Quality } = await loadMediabunny();
    const options = { width: W, height: H, frameRate: STORY_FPS, quality: new Quality({ bitrate: BITRATE }) };
    if (await canEncodeVideo("avc", options)) {
      return { codec: "avc", container: "mp4", mimeType: "video/mp4", extension: "mp4" };
    }
    if (await canEncodeVideo("vp9", options)) {
      return { codec: "vp9", container: "webm", mimeType: "video/webm", extension: "webm" };
    }
  } catch {
    // Sin WebCodecs utilizables: la hoja solo ofrece la imagen.
  }
  return null;
}

async function postLayer(scene, payload, signal) {
  const res = await fetch("/api/share/details-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, scene }),
    signal,
  });
  if (!res.ok) throw new Error(`layer ${scene} ${res.status}`);
  return res.blob();
}

function drawLayer(ctx, bitmap, { alpha = 1, scale = 1, offsetY = 0 } = {}) {
  if (!bitmap || alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(W / 2, H / 2 + offsetY);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(bitmap, -W / 2, -H / 2, W, H);
  ctx.restore();
}

/**
 * Genera el vídeo. `cover` es el PNG de la portada (ya generado para la imagen).
 * `onProgress(fracción 0..1)` informa de capas y codificación.
 */
export async function createStoryVideo({ card, story, sceneIds, cover, format, onProgress, signal }) {
  if (!format) throw new Error("No hay un formato de vídeo disponible");
  const report = (value) => onProgress?.(Math.max(0, Math.min(1, value)));
  report(0);

  // 1) Capas, en paralelo (≈ 15% del progreso).
  const payload = { card, story };
  const scenes = ["backdrop", "header", ...sceneIds];
  let ready = 0;
  const [mediabunny, ...blobs] = await Promise.all([
    loadMediabunny(),
    ...scenes.map((scene) =>
      postLayer(scene, payload, signal).then((blob) => {
        ready += 1;
        report((ready / scenes.length) * 0.15);
        return blob;
      }),
    ),
  ]);
  if (signal?.aborted) throw abortError();

  const bitmaps = await Promise.all([cover, ...blobs].map((blob) => createImageBitmap(blob)));
  const [coverBitmap, backdropBitmap, headerBitmap, ...sceneBitmaps] = bitmaps;
  const sceneById = Object.fromEntries(sceneIds.map((id, index) => [id, sceneBitmaps[index]]));

  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, Quality } = mediabunny;
  const canvas =
    typeof OffscreenCanvas === "function" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";

  const output = new Output({
    format: format.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: format.codec,
    quality: new Quality({ bitrate: BITRATE }),
    keyFrameInterval: KEY_FRAME_INTERVAL,
  });
  output.addVideoTrack(source, { frameRate: STORY_FPS });

  try {
    await output.start();

    // 2) Fotogramas (≈ 85% del progreso).
    const timeline = storyTimeline(sceneIds);
    const total = storyFrameCount(timeline);
    const frameDuration = 1 / STORY_FPS;
    for (let index = 0; index < total; index += 1) {
      if (signal?.aborted) throw abortError();
      const t = index * frameDuration;
      const frame = storyFrame(timeline, t);

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, W, H);
      // Debajo el mundo de las secciones; encima la portada, que es opaca y
      // con su opacidad hace el fundido de entrada y el de vuelta.
      if (frame.cover.alpha < 1) {
        drawLayer(ctx, backdropBitmap, { scale: frame.backdrop.scale });
        drawLayer(ctx, headerBitmap, { alpha: frame.header.alpha });
        for (const scene of frame.scenes) {
          drawLayer(ctx, sceneById[scene.id], { alpha: scene.alpha, offsetY: scene.offsetY });
        }
      }
      drawLayer(ctx, coverBitmap, { alpha: frame.cover.alpha, scale: frame.cover.scale });

      await source.add(t, frameDuration);
      if (index % 6 === 0) report(0.15 + (index / total) * 0.85);
    }

    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close?.());
  }

  report(1);
  return new Blob([output.target.buffer], { type: format.mimeType });
}
