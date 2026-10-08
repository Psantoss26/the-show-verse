import { ImageResponse } from "next/og";

import { LIST_PREVIEW_MAX, sanitizeListShareCard } from "@/lib/lists/shareList";
import {
  H,
  W,
  loadAmbient,
  loadAmbientBase,
  loadLocalAssets,
  loadPoster,
  loadShareFonts,
} from "@/lib/share/ogKit";
import { ListCard, PosterCard, loadTmdbImages } from "@/lib/share/listScenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imagen para compartir una LISTA o una COLECCIÓN (formato story, 1080×1920).
//
// Hermana de /api/share/details-card. Dos composiciones:
//   - "poster" (colecciones): el póster oficial con su título impreso, entero
//     y sin texto encima; debajo la vista previa y las medias (PosterCard);
//   - "cover" (listas): mosaico a sangre con los pósters de la lista, el
//     nombre y el recuento, y en lugar de la fila de acciones de la ficha, la
//     vista previa de los títulos; debajo, las medias (ListCard).
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
  // Fondo ambiental: en la composición «póster», el póster SIN texto; con el
  // oficial, su título blanco difuminado dejaba manchas claras alrededor.
  const ambientPath =
    (card.layout === "poster" ? card.backdropPath : null) ||
    card.coverPath ||
    card.collage[0] ||
    card.preview.find((item) => item.posterPath)?.posterPath ||
    null;
  // El mosaico se ve grande (hasta media imagen por póster): w780.
  const collageSize = card.collage.length >= 6 ? "w500" : "w780";
  const [fonts, assets, cover, collage, previews, ambient, ambientBase] = await Promise.all([
    loadShareFonts(),
    loadLocalAssets(),
    loadPoster(card.coverPath),
    loadTmdbImages(card.collage, collageSize, 5000),
    loadTmdbImages(card.preview.slice(0, LIST_PREVIEW_MAX).map((item) => item.posterPath), "w342"),
    loadAmbient(ambientPath),
    loadAmbientBase(ambientPath),
  ]);

  const element =
    card.layout === "poster" && cover ? (
      <PosterCard
        card={card}
        cover={cover}
        previews={previews}
        ambient={ambient}
        ambientBase={ambientBase}
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
    headers: { "Cache-Control": "private, no-store" },
  });
}
