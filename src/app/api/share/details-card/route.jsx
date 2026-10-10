import { ImageResponse } from "next/og";

import { sanitizeShareCard, shareCardActionButtons } from "@/lib/details/shareCard";
import {
  ActionButton,
  AmbientBackground,
  BG,
  BUTTON,
  BUTTON_GAP,
  BUTTONS_TOP,
  Brand,
  FONT,
  GLASS_ELEVATION,
  GLASS_LAYERS,
  GLASS_TINT,
  H,
  PANEL_TOP,
  POSTER_H,
  PosterWithContinuation,
  SCORE_LOGOS,
  SCORE_PANEL_W,
  SHADE,
  ScoreBadge,
  TitleArt,
  W,
  loadAmbient,
  loadAmbientBase,
  loadLocalAssets,
  loadLogo,
  loadPoster,
  loadShareFonts,
  posterFit,
  px,
  rgba,
} from "@/lib/share/ogKit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imagen para compartir una ficha (formato story, 1080×1920).
//
// Es la "captura" de la ficha móvil con la misma estética: portada a sangre que
// se funde con el fondo, logo del título encima, la fila de acciones con los
// estados del usuario (visto, nota, favorito…) y, debajo, el marcador reducido a
// las tres puntuaciones (TMDb, Trakt, IMDb) sin nada más.
//
// Igual que la tarjeta del Recap, recibe los datos YA resueltos por el cliente
// en vez de la sesión (renovar cookies aquí rompería la rotación de tokens: una
// ImageResponse no las devuelve). Todo se valida en `sanitizeShareCard`.
//
// Las piezas (cristal, botones, fondo, marca…) viven en lib/share/ogKit, que
// comparte con las capas del vídeo (/api/share/details-story).
//
// TEMPORADAS (`card.season`): el mismo dibujo que la ficha (botones del mismo
// tamaño y en la misma posición, mismo marcador); solo cambia la fila, que lleva
// las acciones con estado del usuario de la temporada (serie · visto · nota),
// centradas. Sin flechas ni editar.
//
// PÓSTER CON EL TÍTULO IMPRESO (siempre en una temporada; en la ficha, cuando
// no hay portada sin texto): sin logo encima, así que el texto es el del propio
// póster, abajo. El fundido largo y el sombreado de la ficha lo dejaban a medio
// desvanecer («SEASON 1» casi no se leía). Se encaja como el póster de las
// colecciones (`posterFit` + `PosterWithContinuation`): sube lo justo para
// terminar bajo la fila de acciones y se funde solo en su último tramo.

function Card({ card, poster, ambient, ambientBase, logo, assets, fonts }) {
  const buttons = shareCardActionButtons(card);
  const scores = ["tmdb", "trakt", "imdb"].filter((key) => card.scores[key]);
  const rowWidth = buttons.length * BUTTON + (buttons.length - 1) * BUTTON_GAP;
  const burnedTitle = Boolean(poster && !logo && !card.showTitle);
  const size = poster?.size?.width && poster?.size?.height ? poster.size : { width: 2, height: 3 };
  const fit = burnedTitle
    ? posterFit({ ratio: size.height / size.width, stackTop: BUTTONS_TOP })
    : null;

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        display: "flex",
        background: BG,
        color: "#ffffff",
        fontFamily: fonts ? FONT : "sans-serif",
      }}
    >
      {burnedTitle ? (
        <PosterWithContinuation cover={poster} coverBlur={ambientBase} fit={fit} />
      ) : (
        <>
        <AmbientBackground ambient={ambient} ambientBase={ambientBase} />

        {/* Portada a sangre, fundida con el fondo por máscara (la de la ficha
            móvil): no se oscurece hacia negro, se vuelve transparente y deja ver
            el fondo ambiental, así no hay corte entre portada y botones. */}
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster.src}
            width={W}
            height={POSTER_H}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: POSTER_H,
              objectFit: "cover",
              objectPosition: "50% 0%",
              maskImage:
                "linear-gradient(180deg, #000 0%, #000 58%, rgba(0,0,0,0.75) 72%, rgba(0,0,0,0.3) 86%, rgba(0,0,0,0) 98%)",
            }}
          />
        ) : null}

        {/* Sombreados de legibilidad del fondo (los de la ficha): se oscurece
            hacia abajo, donde van el logo, los botones y el marcador. Es un
            degradado MONÓTONO (solo crece hacia abajo): una franja que se
            aclarase otra vez por debajo se leería como una mancha suspendida.
            Va ENCIMA de la portada, como el fundido a oscuro de la ficha: sobre
            una portada clara, el logo blanco necesita ese fondo oscuro debajo. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            backgroundImage: `linear-gradient(0deg, ${rgba(SHADE, 0.86)} 0%, ${rgba(SHADE, 0.7)} 22%, ${rgba(SHADE, 0.45)} 36%, ${rgba(SHADE, 0.2)} 55%, rgba(0,0,0,0) 100%)`,
          }}
        />
        </>
      )}

      {/* Velo suave arriba para que la marca se lea sobre pósters claros. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: 300,
          display: "flex",
          backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)",
        }}
      />

      <Brand src={assets.brand} />

      {/* Logo del título (o el título en texto si no hay logo). */}
      <TitleArt card={card} logo={logo} bottom={BUTTONS_TOP - 44} />

      {/* Fila de acciones con los estados de la ficha. */}
      <div
        style={{
          position: "absolute",
          top: BUTTONS_TOP,
          left: Math.round((W - rowWidth) / 2),
          width: rowWidth,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {buttons.map((button) => (
          <ActionButton key={button.key} button={button} size={BUTTON} />
        ))}
      </div>

      {/* Marcador compacto: solo las puntuaciones. Mismo ancho que la fila de
          acciones y alineado con ella: deja aire a los lados de la imagen en
          vez de ir casi de borde a borde. */}
      {scores.length ? (
        <div
          style={{
            position: "absolute",
            top: PANEL_TOP,
            left: Math.round((W - SCORE_PANEL_W) / 2),
            width: SCORE_PANEL_W,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Mismo cristal que el marcador de la ficha (LIQUID_GLASS_SURFACE,
              `rounded-2xl`): tinte, luz, capas ópticas y elevación; sin borde. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              width: "100%",
              padding: `${px(12)}px ${px(14)}px`,
              borderRadius: px(16),
              backgroundColor: GLASS_TINT,
              backgroundImage: GLASS_LAYERS,
              boxShadow: GLASS_ELEVATION,
            }}
          >
            {scores.map((key) => (
              <ScoreBadge key={key} logo={assets[key]} size={SCORE_LOGOS[key]} score={card.scores[key]} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 8_000) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const card = sanitizeShareCard(body);
  const [fonts, assets, poster, ambient, ambientBase, logo] = await Promise.all([
    loadShareFonts(),
    loadLocalAssets(),
    loadPoster(card.posterPath),
    loadAmbient(card.posterPath),
    loadAmbientBase(card.posterPath),
    loadLogo(card.logoPath),
  ]);

  return new ImageResponse(
    <Card card={card} poster={poster} ambient={ambient} ambientBase={ambientBase} logo={logo} assets={assets} fonts={Boolean(fonts)} />,
    {
      width: W,
      height: H,
      ...(fonts ? { fonts } : {}),
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
