// Imagen y capas del VÍDEO compartibles de una LISTA o una COLECCIÓN (ver
// lib/lists/shareList). Mismo lenguaje que las de la ficha (ogKit y
// storyScenes): portada a sangre fundida con el fondo, cristal líquido sin
// bordes, PT Sans e iconos de lucide.
//
// Donde la ficha pinta su fila de acciones, aquí va la VISTA PREVIA de los
// títulos que contiene la lista; debajo, el marcador con las medias.

import { LIST_PREVIEW_MAX, countLabel } from "@/lib/lists/shareList";
import {
  AmbientBackground,
  Brand,
  COLORS,
  FONT,
  GLASS_ELEVATION,
  GLASS_LAYERS,
  GLASS_TINT,
  H,
  Icon,
  SCORE_LOGOS,
  SHADE,
  SIDE_MARGIN,
  ScoreBadge,
  TMDB,
  W,
  fetchImage,
  px,
  rgba,
} from "@/lib/share/ogKit";
import { Eyebrow, FactGrid, Glass, PANEL_W, SceneBody, clip } from "@/lib/share/storyScenes";

const WHITE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
// `text-yellow-300` de la etiqueta de origen de la página de la lista.
const YELLOW_300 = rgba(COLORS.yellow.secondary, 1);

// --- Geometría de la imagen (px de la imagen).
const COVER_H = 1440;
const ROW_W = W - SIDE_MARGIN * 2;
const PREVIEW_GAP = 22;
const PREVIEW_W = Math.floor((ROW_W - (LIST_PREVIEW_MAX - 1) * PREVIEW_GAP) / LIST_PREVIEW_MAX);
const PREVIEW_H = Math.round(PREVIEW_W * 1.5);
const PANEL_TOP = 1664;
const PREVIEW_TOP = PANEL_TOP - 52 - PREVIEW_H;
const TITLE_GAP = 48;
// Sin marcador, la vista previa y el título bajan para no dejar un hueco.
const NO_SCORES_SHIFT = 120;
// Separación entre las piezas del mosaico (la `gap-px` sobre negro de la página).
const COLLAGE_GAP = 4;

// Misma máscara que la portada de la ficha: se vuelve transparente hacia abajo
// y deja ver el fondo ambiental, sin corte.
const COVER_MASK =
  "linear-gradient(180deg, #000 0%, #000 56%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.3) 85%, rgba(0,0,0,0) 98%)";

// La sombra de la portada de la página (`shadow-[0_24px_70px_rgba(0,0,0,0.35)]`),
// más marcada: los pósters de la vista previa flotan sobre una portada clara.
const POSTER_SHADOW = "0 26px 56px -14px rgba(0,0,0,0.85)";
// El brillo diagonal del marco de la portada (from-white/10 via-transparent).
const POSTER_SHEEN = "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.03) 100%)";

// ---------------------------------------------------------------- imágenes

/**
 * Descarga varias rutas de TMDb a un tamaño, sin repetir las coincidentes. Con
 * muchas descargas a la vez alguna se pierde de forma pasajera: se reintenta
 * una vez a w185, que en un hueco de vista previa apenas se distingue.
 */
export async function loadTmdbImages(paths, size, timeout = 4000) {
  const unique = [...new Set(paths.filter(Boolean))];
  const loaded = await Promise.all(
    unique.map(
      async (path) =>
        (await fetchImage(`${TMDB}/${size}${path}`, timeout)) ||
        (size === "w185" ? null : fetchImage(`${TMDB}/w185${path}`, 3000)),
    ),
  );
  const byPath = new Map(unique.map((path, index) => [path, loaded[index]]));
  return paths.map((path) => (path ? byPath.get(path) || null : null));
}

// ------------------------------------------------------------------- piezas

function Fill({ style }) {
  return <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", ...style }} />;
}

// Rectángulos del mosaico de portada según cuántos pósters haya: uno a sangre,
// dos columnas, uno alto y dos apilados, 2×2 o 3×2.
function collageRects(count) {
  const g = COLLAGE_GAP;
  const half = (W - g) / 2;
  const halfH = (COVER_H - g) / 2;
  if (count <= 1) return [{ left: 0, top: 0, width: W, height: COVER_H }];
  if (count === 2) {
    return [
      { left: 0, top: 0, width: half, height: COVER_H },
      { left: half + g, top: 0, width: half, height: COVER_H },
    ];
  }
  if (count === 3) {
    return [
      { left: 0, top: 0, width: half, height: COVER_H },
      { left: half + g, top: 0, width: half, height: halfH },
      { left: half + g, top: halfH + g, width: half, height: halfH },
    ];
  }
  if (count < 6) {
    return [0, 1, 2, 3].map((index) => ({
      left: (index % 2) * (half + g),
      top: Math.floor(index / 2) * (halfH + g),
      width: half,
      height: halfH,
    }));
  }
  const third = (W - g * 2) / 3;
  return [0, 1, 2, 3, 4, 5].map((index) => ({
    left: (index % 3) * (third + g),
    top: Math.floor(index / 3) * (halfH + g),
    width: third,
    height: halfH,
  }));
}

function Cover({ cover, collage }) {
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cover.src}
        width={W}
        height={COVER_H}
        alt=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: COVER_H,
          objectFit: "cover",
          objectPosition: "50% 0%",
          maskImage: COVER_MASK,
        }}
      />
    );
  }
  const tiles = collage.filter(Boolean);
  if (!tiles.length) return null;
  const rects = collageRects(tiles.length);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: W,
        height: COVER_H,
        display: "flex",
        backgroundColor: "rgba(0,0,0,0.7)",
        maskImage: COVER_MASK,
      }}
    >
      {rects.map((rect, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={index}
          src={tiles[index].src}
          width={Math.round(rect.width)}
          height={Math.round(rect.height)}
          alt=""
          style={{
            position: "absolute",
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            objectFit: "cover",
            objectPosition: "50% 20%",
            // Varios pósters con su propio título impreso compiten con el
            // nombre de la lista: un punto más apagados que una portada única.
            filter: "brightness(0.8) saturate(1.05)",
          }}
        />
      ))}
    </div>
  );
}

// Póster con el marco de la portada de la página: esquinas redondeadas, brillo
// diagonal y sombra. Sin imagen, el icono de respaldo sobre cristal.
function PosterTile({ image, width, height, radius = 20, children }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        flexShrink: 0,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: image ? "#18181b" : GLASS_TINT,
        // Satori no admite propiedades a `undefined`.
        ...(image ? {} : { backgroundImage: GLASS_LAYERS }),
        boxShadow: POSTER_SHADOW,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          width={width}
          height={height}
          alt=""
          // El radio va también en la imagen: Satori no recorta un <img>
          // absoluto con el `overflow: hidden` redondeado del padre.
          style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover", borderRadius: radius }}
        />
      ) : (
        <Icon name="film" size={Math.round(width * 0.3)} color={WHITE(0.3)} />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          display: "flex",
          borderRadius: radius,
          backgroundImage: POSTER_SHEEN,
        }}
      />
      {children}
    </div>
  );
}

// Último hueco de la vista previa cuando la lista tiene más títulos: el póster
// siguiente, apagado, con «+N».
function MoreTile({ image, more, width = PREVIEW_W, height = PREVIEW_H }) {
  const scale = width / PREVIEW_W;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: GLASS_TINT,
        backgroundImage: GLASS_LAYERS,
        boxShadow: GLASS_ELEVATION,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          width={width}
          height={height}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            objectFit: "cover",
            borderRadius: 20,
            filter: "blur(5px) brightness(0.38) saturate(1.1)",
          }}
        />
      ) : null}
      <div style={{ display: "flex", fontSize: Math.round((more > 99 ? 58 : 72) * scale), fontWeight: 700, lineHeight: 1, letterSpacing: -2, color: "#ffffff" }}>
        {`+${more}`}
      </div>
      <div style={{ display: "flex", marginTop: Math.round(10 * scale), fontSize: Math.round(26 * scale), fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: WHITE(0.7) }}>
        más
      </div>
    </div>
  );
}

// Huecos de la vista previa: con más títulos que huecos, el último se
// convierte en «+N».
function previewSlots(card) {
  const shown = card.preview.slice(0, LIST_PREVIEW_MAX);
  const hasMore = shown.length === LIST_PREVIEW_MAX && card.count > LIST_PREVIEW_MAX;
  const posters = hasMore ? shown.slice(0, LIST_PREVIEW_MAX - 1) : shown;
  return {
    posters,
    hasMore,
    more: card.count - posters.length,
    tileCount: posters.length + (hasMore ? 1 : 0),
  };
}

// Marcador con las MEDIAS de la lista: el cristal del de la imagen de la ficha.
function ScorePanel({ card, assets, width, padY = px(12) }) {
  const scores = ["tmdb", "imdb"].filter((key) => card.scores[key]);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        width,
        padding: `${padY}px ${px(14)}px`,
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
  );
}

// --- Composición «póster» (colecciones). El póster oficial lleva su título
// impreso, así que va A SANGRE: pegado arriba y a los lados, a todo el ancho y
// con su proporción. Debajo quedan ~300 px y la vista previa y el marcador,
// compactos contra el borde inferior, ocupan ~390: algo hay que ceder.
// Abajo suelen estar el título y los rótulos («COLECCIÓN» en Harry Potter
// quedaba medio tapado); arriba, cielo o espacio. Así que el póster SUBE lo
// justo para que su final caiga bajo el arranque de la vista previa (recorte
// arriba de ~60 px, un 4%) y el fundido del borde inferior es corto y pasa
// casi entero bajo los pósters de la vista previa. El marcador nunca lo pisa.
const POSTER_ROW_W = 860;
const POSTER_BOTTOM_MARGIN = 36;
const POSTER_TILE_GAP = 18;
const POSTER_PANEL_GAP = 18;
// Marcador compacto: ScoreBadge solo con la cifra (el logo, 62 px, es lo más
// alto) + relleno.
const POSTER_PANEL_PAD = 20;
const POSTER_PANEL_H = SCORE_LOGOS.tmdb.height + POSTER_PANEL_PAD * 2;
const POSTER_TILE_W = Math.floor((POSTER_ROW_W - (LIST_PREVIEW_MAX - 1) * POSTER_TILE_GAP) / LIST_PREVIEW_MAX);
const POSTER_TILE_H = Math.round(POSTER_TILE_W * 1.5);
// Fundido del borde inferior: empieza FADE_LEAD por encima de la vista previa
// y acaba FADE_TAIL por debajo, que es donde termina el póster.
const POSTER_FADE_LEAD = 40;
const POSTER_FADE_TAIL = 34;
// Lo máximo que se recorta arriba: un póster más alargado que 2:3 cede el resto
// por abajo (bajo la vista previa) en vez de perder más cabeza.
const POSTER_MAX_SHIFT = 140;
// Hasta dónde se ve el reflejo del póster bajo la costura (ver PosterCard).
const MIRROR_FADE_PX = 150;

/** Medidas de la composición «póster» (px de la imagen). */
export function posterLayout({ ratio = 1.5, tiles = LIST_PREVIEW_MAX, scores = true }) {
  const height = Math.round(W * ratio);
  const panelTop = H - POSTER_BOTTOM_MARGIN - (scores ? POSTER_PANEL_H : 0);
  const previewTop = (scores ? panelTop - POSTER_PANEL_GAP : panelTop) - (tiles ? POSTER_TILE_H : 0);
  const stackTop = tiles ? previewTop : panelTop;
  // Dónde debería acabar el póster y cuánto hay que subirlo para ello (nada si
  // ya cabe: un póster más bajo no se baja, se queda pegado arriba).
  const end = stackTop + POSTER_FADE_TAIL;
  const shift = Math.max(0, Math.min(POSTER_MAX_SHIFT, height - end));
  const bottom = height - shift;
  const fadeStart = Math.max(0, Math.min(bottom, stackTop) - POSTER_FADE_LEAD);
  return {
    height,
    top: -shift,
    previewTop,
    panelTop,
    // Recorte arriba y lo que la vista previa tapa del póster (px de imagen).
    cropTop: shift,
    covered: Math.max(0, bottom - stackTop),
    // Fundido en px del PROPIO póster (la máscara va en la imagen).
    fadeStart: fadeStart + shift,
    fadeEnd: height,
  };
}

/** Imagen de una colección con su póster oficial (composición «póster»). */
//
// COSTURA SIN ESCALÓN. Debajo del póster no va otra imagen (el fondo
// ambiental era el póster sin texto, de otro tono: el fundido dejaba un escalón
// visible), sino la CONTINUACIÓN del propio póster: su versión diminuta (w92)
// ampliada —borrosa por sí sola— detrás del póster nítido y, bajo la costura,
// su REFLEJO vertical. En la costura las dos muestran la misma fila del póster,
// así que no hay corte; el nítido se funde con una versión borrosa de SÍ MISMO.
// Sin `filter: blur` a propósito: en Satori el desenfoque se recorta al borde
// de cada imagen y lo oscurece, justo en la costura.
export function PosterCard({ card, cover, coverBlur, previews, assets, fonts }) {
  const hasScores = !!(card.scores.tmdb || card.scores.imdb);
  const { posters, hasMore, more, tileCount } = previewSlots(card);
  const size = cover.size?.width && cover.size?.height ? cover.size : { width: 2, height: 3 };
  const layout = posterLayout({ ratio: size.height / size.width, tiles: tileCount, scores: hasScores });
  const rowWidth = tileCount * POSTER_TILE_W + Math.max(0, tileCount - 1) * POSTER_TILE_GAP;
  const fade = (layout.fadeStart / layout.height) * 100;
  const mid = fade + (100 - fade) * 0.45;
  const posterBottom = layout.top + layout.height;

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        display: "flex",
        background: "#0a0a0a",
        color: "#ffffff",
        fontFamily: fonts ? FONT : "sans-serif",
      }}
    >
      {/* La continuación del póster (ver arriba): borroso detrás y reflejado
          debajo, oscureciéndose desde la costura hacia la vista previa y el
          marcador. */}
      {coverBlur ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverBlur.src}
            width={W}
            height={layout.height}
            alt=""
            style={{ position: "absolute", top: layout.top, left: 0, width: W, height: layout.height, objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              top: posterBottom,
              left: 0,
              width: W,
              height: Math.max(0, H - posterBottom),
              display: "flex",
              overflow: "hidden",
            }}
          >
            {/* Volteado: la fila de arriba de esta caja es la última del póster. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverBlur.src}
              width={W}
              height={layout.height}
              alt=""
              style={{ position: "absolute", top: 0, left: 0, width: W, height: layout.height, objectFit: "cover", transform: "scaleY(-1)" }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              top: posterBottom,
              left: 0,
              width: W,
              height: Math.max(0, H - posterBottom),
              display: "flex",
              // El reflejo solo hace falta junto a la costura: más abajo se leería
              // el texto del póster al revés. Transparente en la costura y casi
              // opaco a ~150 px (`MIRROR_FADE_PX`).
              backgroundImage: `linear-gradient(180deg, ${rgba(SHADE, 0)} 0px, ${rgba(SHADE, 0.6)} ${Math.round(MIRROR_FADE_PX * 0.45)}px, ${rgba(SHADE, 0.92)} ${MIRROR_FADE_PX}px, ${rgba(SHADE, 1)} ${Math.round(MIRROR_FADE_PX * 1.6)}px)`,
            }}
          />
        </>
      ) : null}

      {/* El póster a sangre, con su proporción (solo cede `cropTop` arriba),
          fundido por máscara: no se oscurece hacia negro, se vuelve
          transparente y deja ver el fondo. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.src}
        width={W}
        height={layout.height}
        alt=""
        style={{
          position: "absolute",
          top: layout.top,
          left: 0,
          width: W,
          height: layout.height,
          objectFit: "cover",
          maskImage: `linear-gradient(180deg, #000 0%, #000 ${fade}%, rgba(0,0,0,0.55) ${mid}%, rgba(0,0,0,0) 100%)`,
        }}
      />

      {/* Velo suave arriba para que la marca se lea sobre pósters claros. */}
      <Fill style={{ height: 240, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 100%)" }} />
      <Brand src={assets.brand} />

      {tileCount ? (
        <div
          style={{
            position: "absolute",
            top: layout.previewTop,
            left: Math.round((W - rowWidth) / 2),
            width: rowWidth,
            height: POSTER_TILE_H,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {posters.map((item, index) => (
            <PosterTile key={index} image={previews[index]} width={POSTER_TILE_W} height={POSTER_TILE_H} radius={16} />
          ))}
          {hasMore ? (
            <MoreTile image={previews[LIST_PREVIEW_MAX - 1]} more={more} width={POSTER_TILE_W} height={POSTER_TILE_H} />
          ) : null}
        </div>
      ) : null}

      {hasScores ? (
        <div
          style={{
            position: "absolute",
            top: layout.panelTop,
            left: Math.round((W - POSTER_ROW_W) / 2),
            width: POSTER_ROW_W,
            display: "flex",
          }}
        >
          <ScorePanel card={card} assets={assets} width={POSTER_ROW_W} padY={POSTER_PANEL_PAD} />
        </div>
      ) : null}
    </div>
  );
}

/** Imagen de portada de una lista o colección (/api/share/list-card). */
export function ListCard({ card, cover, collage, previews, ambient, ambientBase, assets, fonts }) {
  const scores = ["tmdb", "imdb"].filter((key) => card.scores[key]);
  const shift = scores.length ? 0 : NO_SCORES_SHIFT;

  const { posters, hasMore, more, tileCount } = previewSlots(card);
  const rowWidth = tileCount * PREVIEW_W + Math.max(0, tileCount - 1) * PREVIEW_GAP;

  const previewTop = PREVIEW_TOP + shift;
  const titleBottom = tileCount ? previewTop - TITLE_GAP : PANEL_TOP + shift - TITLE_GAP;
  const meta = [countLabel(card.count, card.noun), ...card.meta].join("  ·  ");
  const titleSize = card.title.length > 40 ? 68 : card.title.length > 22 ? 80 : 96;

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        display: "flex",
        background: "#0a0a0a",
        color: "#ffffff",
        fontFamily: fonts ? FONT : "sans-serif",
      }}
    >
      <AmbientBackground ambient={ambient} ambientBase={ambientBase} />
      <Cover cover={cover} collage={collage} />

      {/* Sombreados de la imagen de la ficha: oscurece hacia abajo, donde van
          el título, la vista previa y el marcador; velo suave arriba para la
          marca. */}
      <Fill
        style={{
          backgroundImage: `linear-gradient(0deg, ${rgba(SHADE, 0.9)} 0%, ${rgba(SHADE, 0.76)} 24%, ${rgba(SHADE, 0.5)} 40%, ${rgba(SHADE, 0.2)} 58%, rgba(0,0,0,0) 100%)`,
        }}
      />
      <Fill style={{ height: 300, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)" }} />

      <Brand src={assets.brand} />

      {/* Título: la etiqueta de origen en amarillo (como en la página), el
          nombre y el recuento. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: SIDE_MARGIN,
          width: ROW_W,
          height: titleBottom,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {card.label ? (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
            <Icon name="film" size={34} color={YELLOW_300} />
            <div
              style={{
                display: "flex",
                marginLeft: 14,
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: YELLOW_300,
              }}
            >
              {card.label}
            </div>
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            maxWidth: 960,
            textAlign: "center",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -1,
            textShadow: "0 4px 28px rgba(0,0,0,0.85)",
          }}
        >
          {card.title}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 38, fontWeight: 700, color: WHITE(0.74) }}>{meta}</div>
      </div>

      {/* Vista previa de los títulos, en el sitio de la fila de acciones. */}
      {tileCount ? (
        <div
          style={{
            position: "absolute",
            top: previewTop,
            left: Math.round((W - rowWidth) / 2),
            width: rowWidth,
            height: PREVIEW_H,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {posters.map((item, index) => (
            <PosterTile key={index} image={previews[index]} width={PREVIEW_W} height={PREVIEW_H} />
          ))}
          {hasMore ? <MoreTile image={previews[LIST_PREVIEW_MAX - 1]} more={more} /> : null}
        </div>
      ) : null}

      {/* Marcador con las MEDIAS de la lista: el mismo cristal que el de la
          imagen de la ficha. */}
      {scores.length ? (
        <div style={{ position: "absolute", top: PANEL_TOP, left: SIDE_MARGIN, width: ROW_W, display: "flex" }}>
          <ScorePanel card={card} assets={assets} width={ROW_W} />
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- vídeo

// «Contenido»: los primeros títulos en una cuadrícula de 4 columnas, con su año
// debajo si lo hay, y «+N más» si la lista sigue.
const GRID_COLS = 4;
const GRID_GAP = 26;
const GRID_W = 212;
const GRID_H = Math.round(GRID_W * 1.5);

export function TitlesScene({ story, posters, fonts }) {
  const withYears = story.items.some((item) => item.year);
  const rows = [];
  for (let index = 0; index < story.items.length; index += GRID_COLS) {
    rows.push(story.items.slice(index, index + GRID_COLS).map((item, offset) => ({ item, image: posters[index + offset] })));
  }
  const rowWidth = GRID_COLS * GRID_W + (GRID_COLS - 1) * GRID_GAP;

  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="layers" label={countLabel(story.count, story.noun)} />
      <div style={{ display: "flex", flexDirection: "column", width: rowWidth }}>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", justifyContent: "center", marginTop: rowIndex ? 24 : 0 }}>
            {row.map(({ item, image }, index) => (
              <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", marginLeft: index ? GRID_GAP : 0 }}>
                <PosterTile image={image} width={GRID_W} height={GRID_H} radius={18} />
                {withYears ? (
                  <div style={{ display: "flex", height: 44, alignItems: "flex-end", fontSize: 30, fontWeight: 700, color: WHITE(0.7) }}>
                    {item.year ? String(item.year) : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      {story.more > 0 ? (
        <div style={{ display: "flex", marginTop: 36, fontSize: 36, fontWeight: 700, color: WHITE(0.66) }}>
          {`+ ${countLabel(story.more, story.noun)} más`}
        </div>
      ) : null}
    </SceneBody>
  );
}

// «Mejor valoradas»: misma tabla que «Episodios vistos» de la ficha, con el
// póster de cada título y las notas de IMDb y TMDb en columnas.
export function TopScene({ story, posters, assets, fonts }) {
  const hasImdb = story.top.some((item) => item.imdb != null);
  const hasTmdb = story.top.some((item) => item.tmdb != null);
  const scoreText = (value) => (value == null ? "–" : value.toFixed(1));
  const column = (key, logo, size) => (
    <div key={key} style={{ display: "flex", width: 140, justifyContent: "center" }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={size.width} height={size.height} alt="" style={{ objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: YELLOW_300 }}>{key.toUpperCase()}</div>
      )}
    </div>
  );

  return (
    <SceneBody fonts={fonts}>
      <Glass style={{ width: PANEL_W, padding: "40px 44px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20 }}>
          <div style={{ display: "flex", fontSize: 50, fontWeight: 700, letterSpacing: -0.5 }}>Mejor valoradas</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            {hasImdb ? column("imdb", assets?.imdb, { width: 74, height: 37 }) : null}
            {hasTmdb ? column("tmdb", assets?.tmdb, { width: 64, height: 46 }) : null}
          </div>
        </div>
        {story.top.map((item, index) => (
          <div
            key={index}
            style={{ display: "flex", alignItems: "center", padding: "18px 0", borderTop: `1px solid ${WHITE(index ? 0.08 : 0.14)}` }}
          >
            <div style={{ display: "flex", width: 62, fontSize: 44, fontWeight: 700, color: index === 0 ? YELLOW_300 : WHITE(0.45) }}>
              {String(index + 1)}
            </div>
            <PosterTile image={posters[index]} width={92} height={138} radius={12} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, marginLeft: 26 }}>
              <div
                style={{
                  display: "block",
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: WHITE(0.94),
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.title}
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 30, fontWeight: 700, color: WHITE(0.5) }}>
                {[item.year, item.mediaType === "tv" ? "Serie" : "Película"].filter(Boolean).join("  ·  ")}
              </div>
            </div>
            {hasImdb ? (
              <div style={{ display: "flex", width: 140, justifyContent: "center", fontSize: 44, fontWeight: 700, color: item.imdb != null ? YELLOW_300 : WHITE(0.35) }}>
                {scoreText(item.imdb)}
              </div>
            ) : null}
            {hasTmdb ? (
              <div style={{ display: "flex", width: 140, justifyContent: "center", fontSize: 44, fontWeight: 700, color: item.tmdb != null ? WHITE(0.9) : WHITE(0.35) }}>
                {scoreText(item.tmdb)}
              </div>
            ) : null}
          </div>
        ))}
      </Glass>
    </SceneBody>
  );
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// «Reparto destacado» de una colección: caras redondas con el nombre y en
// cuántas películas sale.
const FACE = 220;
const CAST_COL = 300;

export function CastScene({ story, profiles, fonts }) {
  const rows = [story.cast.slice(0, 3), story.cast.slice(3, 6)].filter((row) => row.length);
  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="users" label="Reparto destacado" />
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: "flex", justifyContent: "center", marginTop: rowIndex ? 54 : 0 }}>
          {row.map((member, index) => {
            const image = profiles[rowIndex * 3 + index];
            return (
              <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: CAST_COL, marginLeft: index ? 50 : 0 }}>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: FACE,
                    height: FACE,
                    borderRadius: FACE,
                    overflow: "hidden",
                    backgroundColor: GLASS_TINT,
                    backgroundImage: GLASS_LAYERS,
                    boxShadow: GLASS_ELEVATION,
                  }}
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.src}
                      width={FACE}
                      height={FACE}
                      alt=""
                      style={{ position: "absolute", top: 0, left: 0, width: FACE, height: FACE, objectFit: "cover", objectPosition: "50% 20%", borderRadius: FACE }}
                    />
                  ) : (
                    <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: WHITE(0.55) }}>{initials(member.name)}</div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 24, maxWidth: CAST_COL, textAlign: "center", fontSize: 38, fontWeight: 700, lineHeight: 1.15 }}>
                  {member.name}
                </div>
                {member.count ? (
                  <div style={{ display: "flex", marginTop: 8, fontSize: 30, fontWeight: 700, color: WHITE(0.55) }}>
                    {countLabel(member.count, "movie")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </SceneBody>
  );
}

/** «En cifras»: la fila de stats de la página de la lista, en celdas. */
export function StatsScene({ story, fonts }) {
  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="trending" label="En cifras" />
      <Glass style={{ width: PANEL_W, padding: "56px 60px" }}>
        <FactGrid facts={story.facts} />
      </Glass>
    </SceneBody>
  );
}

/** «Descripción» de la lista o la colección. */
export function AboutScene({ story, fonts }) {
  const description = clip(story.description, 420);
  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="info" label="Descripción" />
      <Glass style={{ width: PANEL_W, padding: "64px 68px 60px" }}>
        <Icon name="quote" size={76} color={WHITE(0.5)} filled />
        <div style={{ display: "flex", marginTop: 30, fontSize: description.length > 300 ? 42 : 48, lineHeight: 1.4, color: WHITE(0.92) }}>
          {description}
        </div>
      </Glass>
    </SceneBody>
  );
}
