import { ImageResponse } from "next/og";

import { sanitizeShareCard } from "@/lib/details/shareCard";
import { sanitizeShareStory } from "@/lib/details/shareStory";
import {
  H,
  W,
  loadAmbientBase,
  loadAmbientLayers,
  loadStoryPoster,
  loadLocalAssets,
  loadLogo,
  loadShareFonts,
  shareImageResponse,
} from "@/lib/share/ogKit";
import {
  DetailsScene,
  EpisodesScene,
  PlaysScene,
  ProductionScene,
  ReviewScene,
  STORY_BASE_TONE,
  STORY_POSTER_TONE,
  StoryBackdrop,
  StoryHeader,
} from "@/lib/share/storyScenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Capas del VÍDEO compartible de una ficha (1080×1920: PNG transparentes; el fondo, JPEG).
//
// El vídeo lo compone y codifica el navegador (ver lib/share/storyVideo): aquí
// solo se pintan sus piezas, cada una en una petición para que se generen en
// paralelo:
//   - "backdrop": el fondo opaco de las secciones (la portada difuminada);
//   - "header":   la cabecera fija (marca + logo del título), transparente;
//   - "plays" | "episodes" | "review" | "details" | "production": una
//     sección, transparente.
// La portada inicial es la imagen de /api/share/details-card.
//
// Igual que la imagen de portada, recibe los datos ya resueltos por el cliente
// (no la sesión) y lo valida todo: `sanitizeShareCard` y `sanitizeShareStory`.

// Sin sección de puntuaciones: ya están en la portada (la primera pantalla).
const SCENES = new Set(["backdrop", "header", "plays", "episodes", "review", "details", "production"]);

async function renderLayer(scene, card, story) {
  if (scene === "backdrop") {
    const [poster, ambientBase] = await Promise.all([
      loadStoryPoster(card.posterPath, STORY_POSTER_TONE),
      loadAmbientBase(card.posterPath, STORY_BASE_TONE),
    ]);
    if (poster) return { element: <StoryBackdrop poster={poster} ambientBase={ambientBase} />, fonts: null };
    // Sin portada a tiempo, el fondo ambiental de siempre (sus dos capas).
    const [ambient, ambientFallback] = await loadAmbientLayers(card.posterPath);
    return { element: <StoryBackdrop poster={null} ambient={ambient} ambientBase={ambientFallback} />, fonts: null };
  }

  const [fonts, assets, logo] = await Promise.all([
    loadShareFonts(),
    loadLocalAssets(),
    scene === "header" ? loadLogo(card.logoPath) : null,
  ]);
  const hasFonts = Boolean(fonts);

  switch (scene) {
    case "header":
      return {
        element: <StoryHeader card={card} logo={logo} brand={assets.brand} fonts={hasFonts} />,
        fonts,
      };
    case "plays":
      return story.plays ? { element: <PlaysScene plays={story.plays} fonts={hasFonts} />, fonts } : null;
    case "episodes":
      return story.episodes
        ? { element: <EpisodesScene episodes={story.episodes} assets={assets} fonts={hasFonts} />, fonts }
        : null;
    case "review":
      return story.review
        ? { element: <ReviewScene card={card} review={story.review} fonts={hasFonts} />, fonts }
        : null;
    case "details":
      return story.details
        ? { element: <DetailsScene card={card} details={story.details} fonts={hasFonts} />, fonts }
        : null;
    case "production":
      return story.details
        ? { element: <ProductionScene card={card} details={story.details} fonts={hasFonts} />, fonts }
        : null;
    default:
      return null;
  }
}

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 16_000) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const scene = typeof body?.scene === "string" ? body.scene : "";
  if (!SCENES.has(scene)) return new Response("Unknown scene", { status: 400 });

  // El título sin logo cae a una versión con `showTitle`: en las secciones el
  // título se escribe siempre, la portada impresa no está detrás.
  const card = { ...sanitizeShareCard(body?.card), showTitle: true };
  const story = sanitizeShareStory(body?.story);
  // El fondo es opaco y sale en JPEG; las demás capas son transparentes y
  // siguen en PNG. Guardadas por el cuerpo validado (ver `shareImageResponse`).
  const response = await shareImageResponse(
    `details-story|${scene}|${JSON.stringify([card, story])}`,
    async () => {
      const layer = await renderLayer(scene, card, story);
      if (!layer) return null;
      return new ImageResponse(layer.element, {
        width: W,
        height: H,
        ...(layer.fonts ? { fonts: layer.fonts } : {}),
      });
    },
    { jpeg: scene === "backdrop" },
  );
  return response || new Response("Nothing to render", { status: 422 });
}
