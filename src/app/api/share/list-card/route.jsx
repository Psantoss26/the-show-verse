import { ImageResponse } from "next/og";

import { LIST_PREVIEW_MAX, sanitizeListShareCard } from "@/lib/lists/shareList";
import {
  H,
  W,
  loadAmbientBase,
  loadAmbientLayers,
  loadLocalAssets,
  loadPoster,
  loadShareFonts,
  shareImageResponse,
} from "@/lib/share/ogKit";
import { composeListCollage } from "@/lib/share/listCollage";
import { ListCard, PosterCard, loadTmdbImages } from "@/lib/share/listScenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imagen para compartir una LISTA o una COLECCIÓN (formato story, 1080×1920).
//
// Hermana de /api/share/details-card. Dos composiciones:
//   - "poster" (colecciones): el póster oficial con su título impreso, entero
//     y sin texto encima; debajo la vista previa y las medias (PosterCard);
//   - "cover" (listas): de fondo, el MISMO de la página de la lista en el
//     móvil (su mosaico de arte sin texto, misma rejilla y uniones fundidas,
//     ver lib/share/listCollage); encima el nombre y el recuento, y en lugar
//     de la fila de acciones de la ficha, la vista previa de los títulos;
//     debajo, las medias (ListCard).
// Recibe los datos ya resueltos por la página y los valida en
// `sanitizeListShareCard`. Si el póster no llega, cae a "cover" (con el nombre
// escrito, que es lo único que identifica la colección).

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 8_000) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const card = sanitizeListShareCard(body);
  // Opaca: JPEG y guardada por el cuerpo validado (ver `shareImageResponse`).
  const response = await shareImageResponse(
    `list-card|${JSON.stringify(card)}`,
    () => renderListCard(card),
    { jpeg: true },
  );
  return response || new Response("Render failed", { status: 500 });
}

async function renderListCard(card) {
  const posterLayout = card.layout === "poster";
  // El fondo ambiental de la composición normal se pide A LA VEZ que lo demás.
  // Antes esperaba a saber si había llegado el póster (solo cae a ella si no
  // llega) y sumaba otra ronda de descargas a cada imagen. Se descarta si al
  // final no hace falta.
  const fallbackAmbientPath =
    card.coverPath || card.collage[0] || card.preview.find((item) => item.posterPath)?.posterPath || null;
  const ambientPromise = loadAmbientLayers(fallbackAmbientPath);
  const [fonts, assets, cover, collage, previews, coverBlur] = await Promise.all([
    loadShareFonts(),
    loadLocalAssets(),
    loadPoster(card.coverPath),
    posterLayout || !card.collage.length ? null : composeListCollage(card.collage, card.collageExtra),
    loadTmdbImages(card.preview.slice(0, LIST_PREVIEW_MAX).map((item) => item.posterPath), "w342"),
    // Composición «póster»: lo de debajo es la continuación del propio póster
    // (su versión diminuta, ver PosterCard), no el fondo ambiental.
    posterLayout ? loadAmbientBase(card.coverPath) : null,
  ]);

  // Fondo ambiental: solo para la composición normal sin mosaico (o si el
  // póster no ha llegado y se cae a ella).
  const usePosterCard = posterLayout && cover;
  const [ambient, ambientBase] = usePosterCard || collage ? [null, null] : await ambientPromise;

  const element =
    usePosterCard ? (
      <PosterCard
        card={card}
        cover={cover}
        coverBlur={coverBlur}
        previews={previews}
        assets={assets}
        fonts={Boolean(fonts)}
      />
    ) : (
      <ListCard
        card={card}
        cover={cover}
        collage={collage}
        previews={previews}
        ambient={ambient}
        ambientBase={ambientBase}
        assets={assets}
        fonts={Boolean(fonts)}
      />
    );

  return new ImageResponse(element, {
    width: W,
    height: H,
    ...(fonts ? { fonts } : {}),
  });
}
