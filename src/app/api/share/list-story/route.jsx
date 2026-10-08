import { ImageResponse } from "next/og";

import { sanitizeListShareCard, sanitizeListShareStory } from "@/lib/lists/shareList";
import {
  H,
  W,
  loadAmbient,
  loadAmbientBase,
  loadLocalAssets,
  loadShareFonts,
  loadStoryPoster,
} from "@/lib/share/ogKit";
import {
  AboutScene,
  CastScene,
  StatsScene,
  TitlesScene,
  TopScene,
  loadTmdbImages,
} from "@/lib/share/listScenes";
import { StoryBackdrop, StoryHeader } from "@/lib/share/storyScenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Capas del VÍDEO compartible de una lista o una colección (1080×1920, PNG).
// Mismo reparto que /api/share/details-story: el navegador compone y codifica
// (lib/share/storyVideo) y aquí se pinta cada pieza en su petición:
//   - "backdrop": la portada de la lista apenas difuminada;
//   - "header":   la marca y el nombre de la lista, transparente;
//   - "titles" | "top" | "cast" | "stats" | "about": una sección, transparente.
// La portada inicial es la imagen de /api/share/list-card.

const SCENES = new Set(["backdrop", "header", "titles", "top", "cast", "stats", "about"]);

function backdropPath(card, story) {
  return (
    card.backdropPath ||
    card.coverPath ||
    card.collage[0] ||
    card.preview.find((item) => item.posterPath)?.posterPath ||
    story.items.find((item) => item.posterPath)?.posterPath ||
    null
  );
}

async function renderLayer(scene, card, story) {
  if (scene === "backdrop") {
    const path = backdropPath(card, story);
    const [poster, ambientBase] = await Promise.all([loadStoryPoster(path), loadAmbientBase(path)]);
    const ambient = poster ? null : await loadAmbient(path);
    return { element: <StoryBackdrop poster={poster} ambient={ambient} ambientBase={ambientBase} />, fonts: null };
  }

  const [fonts, assets] = await Promise.all([loadShareFonts(), loadLocalAssets()]);
  const hasFonts = Boolean(fonts);

  switch (scene) {
    case "header":
      return {
        element: <StoryHeader card={card} logo={null} brand={assets.brand} fonts={hasFonts} />,
        fonts,
      };
    case "titles": {
      if (!story.items.length) return null;
      const posters = await loadTmdbImages(story.items.map((item) => item.posterPath), "w342");
      return { element: <TitlesScene story={story} posters={posters} fonts={hasFonts} />, fonts };
    }
    case "top": {
      if (story.top.length < 2) return null;
      const posters = await loadTmdbImages(story.top.map((item) => item.posterPath), "w185");
      return { element: <TopScene story={story} posters={posters} assets={assets} fonts={hasFonts} />, fonts };
    }
    case "cast": {
      if (story.cast.length < 3) return null;
      const profiles = await loadTmdbImages(story.cast.map((member) => member.profilePath), "w185");
      return { element: <CastScene story={story} profiles={profiles} fonts={hasFonts} />, fonts };
    }
    case "stats":
      return story.facts.length >= 2 ? { element: <StatsScene story={story} fonts={hasFonts} />, fonts } : null;
    case "about":
      return story.description ? { element: <AboutScene story={story} fonts={hasFonts} />, fonts } : null;
    default:
      return null;
  }
}

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 24_000) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const scene = typeof body?.scene === "string" ? body.scene : "";
  if (!SCENES.has(scene)) return new Response("Unknown scene", { status: 400 });

  const card = sanitizeListShareCard(body?.card);
  const story = sanitizeListShareStory(body?.story);
  const layer = await renderLayer(scene, card, story);
  if (!layer) return new Response("Nothing to render", { status: 422 });

  return new ImageResponse(layer.element, {
    width: W,
    height: H,
    ...(layer.fonts ? { fonts: layer.fonts } : {}),
    headers: { "Cache-Control": "private, no-store" },
  });
}
