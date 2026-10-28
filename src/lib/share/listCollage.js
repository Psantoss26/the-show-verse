// FONDO DE LA IMAGEN COMPARTIBLE DE UNA LISTA: el mismo que el de su página
// en el móvil (UnifiedListDetailsLayout + MobileHeroCover), recompuesto en el
// servidor sobre el lienzo de la imagen.
//
//   - Arriba, la PORTADA: el mosaico de arte sin texto con la rejilla de la
//     página (`getPosterCollagePlacement`: columnas, filas y tramos), del alto
//     de su portada móvil (150vw) y con sus uniones FUNDIDAS: cada celda se
//     prolonga COLLAGE_FEATHER por fuera y se desvanece sobre la anterior. Se
//     funde hacia abajo con la máscara `--sv-poster-fade`.
//   - Detrás, la PROLONGACIÓN (MobileCollageExtension): la misma rejilla
//     uniforme con más títulos de la lista, muy difuminada y oscurecida, que
//     asoma donde la portada se funde.
//   - Todo con el sobrebarrido de la portada (MOBILE_POSTER_OVERSCAN), desde
//     arriba.
//
// Satori no sabe componer máscaras cruzadas ni desenfocar sin recortar (ver
// ogKit), así que se compone aquí con sharp en una sola foto de fondo, que
// además es lo más barato de pintar para resvg. Sin sharp no hay mosaico y la
// imagen cae al fondo ambiental.

import { buildBackgroundCollageTiles, buildPosterCollageTiles, getPosterCollagePlacement } from "@/lib/lists/posterCollage";
import { H, TMDB, W, download, loadSharp } from "@/lib/share/ogKit";

// Píxeles CSS de la página en px de la imagen, para un teléfono de 390 de ancho.
const CSS_PX = W / 390;
// `MOBILE_POSTER_OVERSCAN` de details/MobileDetailsHero (componente de cliente).
const OVERSCAN = 1.02;
// `--mobile-cover-h` de una lista en el teléfono: 150vw.
export const COLLAGE_COVER_H = Math.round(W * 1.5);
// `COLLAGE_FEATHER_PX` de la página.
const FEATHER = Math.round(12 * CSS_PX);
// El lienzo antes del sobrebarrido.
const LAYOUT_H = Math.ceil(H / OVERSCAN);
const BG = [10, 10, 10]; // bg-neutral-950
// `--sv-poster-fade` (globals.css), en fracciones del alto de la portada.
const POSTER_FADE = [
  [0, 1], [0.6, 1], [0.64, 0.972], [0.68, 0.896], [0.72, 0.784], [0.76, 0.648],
  [0.8, 0.5], [0.84, 0.352], [0.88, 0.216], [0.92, 0.104], [0.96, 0],
];
// MobileCollageExtension: máscara (en altos de portada), estirado, desenfoque y tono.
const EXTENSION_MASK = [[0.5, 0], [0.62, 0.35], [0.76, 0.8], [0.9, 1]];
const EXTENSION_SCALE_X = 1.15;
const EXTENSION_BLUR = 24 * CSS_PX;
const EXTENSION_TONE = { brightness: 0.48, saturate: 1.1 };
// La prolongación va tan difuminada que se compone a un cuarto de resolución.
const EXTENSION_DOWNSCALE = 4;

const TMDB_SIZES = [342, 500, 780];

function interpolate(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let index = 1; index < stops.length; index += 1) {
    const [x1, y1] = stops[index];
    if (t <= x1) {
      const [x0, y0] = stops[index - 1];
      return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return stops.at(-1)[1];
}

// Rampa smoothstep de la prolongación de cada celda (`featherRamp`).
function featherRamp(length, feather) {
  const ramp = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const t = Math.min(1, Math.min(index + 0.5, length - index - 0.5) / feather);
    ramp[index] = t * t * (3 - 2 * t);
  }
  return ramp;
}

async function tilePixels(sharp, image, width, height) {
  return sharp(Buffer.from(image.buffer))
    .resize(width, height, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

function filledCanvas(width, height) {
  const canvas = new Uint8ClampedArray(width * height * 3);
  for (let index = 0; index < canvas.length; index += 3) canvas.set(BG, index);
  return canvas;
}

// Pinta una celda prolongada `feather` px por cada lado, fundida en esa
// prolongación, sobre lo ya pintado y recortada al lienzo.
async function paintTile(sharp, canvas, canvasW, canvasH, image, rect, feather) {
  const left = Math.round(rect.left - feather);
  const top = Math.round(rect.top - feather);
  const width = Math.round(rect.width + feather * 2);
  const height = Math.round(rect.height + feather * 2);
  const pixels = await tilePixels(sharp, image, width, height);
  const rampX = featherRamp(width, feather);
  const rampY = featherRamp(height, feather);
  for (let y = Math.max(0, -top); y < height && top + y < canvasH; y += 1) {
    for (let x = Math.max(0, -left); x < width && left + x < canvasW; x += 1) {
      const alpha = rampX[x] * rampY[y];
      const from = (y * width + x) * 3;
      const to = ((top + y) * canvasW + left + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        canvas[to + channel] += (pixels[from + channel] - canvas[to + channel]) * alpha;
      }
    }
  }
}

// Tamaño de TMDb suficiente para la celda más grande (con su prolongación).
function coverSize(placement) {
  const cellW = W / placement.cols;
  const cellH = COLLAGE_COVER_H / placement.rows;
  const need = Math.max(
    ...placement.cells.map((cell) =>
      Math.max(cell.colSpan * cellW, (cell.rowSpan * cellH) / 1.5) * OVERSCAN + FEATHER * 2,
    ),
  );
  return `w${TMDB_SIZES.find((size) => size >= need) || TMDB_SIZES.at(-1)}`;
}

async function loadTile(path, size, timeout) {
  return (await download(`${TMDB}/${size}${path}`, timeout)) || (size === "w185" ? null : download(`${TMDB}/w185${path}`, 3000));
}

async function paintCover(sharp, tiles, images) {
  const placement = getPosterCollagePlacement(tiles.length);
  const cellW = W / placement.cols;
  const cellH = COLLAGE_COVER_H / placement.rows;
  const canvas = filledCanvas(W, COLLAGE_COVER_H);
  for (const [index, cell] of placement.cells.entries()) {
    const rect = { left: cell.col * cellW, top: cell.row * cellH, width: cell.colSpan * cellW, height: cell.rowSpan * cellH };
    await paintTile(sharp, canvas, W, COLLAGE_COVER_H, images.get(tiles[index]), rect, FEATHER);
  }
  return canvas;
}

// La prolongación, ya difuminada y con su tono, a W×LAYOUT_H.
async function paintExtension(sharp, tiles, extra, images, cols, rows) {
  const scale = EXTENSION_DOWNSCALE;
  const cellW = (W * EXTENSION_SCALE_X) / cols / scale;
  const cellH = COLLAGE_COVER_H / rows / scale;
  // Una fila de más abajo: el desenfoque no se aclara en el borde.
  const gridRows = Math.ceil(LAYOUT_H / scale / cellH) + 1;
  const width = Math.round(cellW * cols);
  const height = Math.round(cellH * gridRows);
  const cells = buildBackgroundCollageTiles(tiles, extra, cols * gridRows);
  const canvas = filledCanvas(width, height);
  for (const [index, path] of cells.entries()) {
    const image = images.get(path);
    if (!image) continue;
    const rect = { left: (index % cols) * cellW, top: Math.floor(index / cols) * cellH, width: cellW, height: cellH };
    await paintTile(sharp, canvas, width, height, image, rect, FEATHER / scale);
  }

  const blurred = await sharp(Buffer.from(canvas.buffer), { raw: { width, height, channels: 3 } })
    .blur(EXTENSION_BLUR / scale)
    .raw()
    .toBuffer();
  // brightness() y luego saturate() (matriz de la especificación de filtros).
  const { brightness: b, saturate: s } = EXTENSION_TONE;
  for (let index = 0; index < blurred.length; index += 3) {
    const r = blurred[index] * b;
    const g = blurred[index + 1] * b;
    const bl = blurred[index + 2] * b;
    blurred[index] = Math.min(255, (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * bl);
    blurred[index + 1] = Math.min(255, (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * bl);
    blurred[index + 2] = Math.min(255, (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * bl);
  }
  // A tamaño real y recortada al centro (el estirado sale por los lados).
  const fullW = Math.round(W * EXTENSION_SCALE_X);
  return sharp(blurred, { raw: { width, height, channels: 3 } })
    .resize(fullW, Math.round(height * scale), { fit: "fill" })
    .extract({ left: Math.round((fullW - W) / 2), top: 0, width: W, height: LAYOUT_H })
    .raw()
    .toBuffer();
}

/**
 * Fondo de la imagen de una lista: `collage` son las celdas de su portada (las
 * de la página, ver prepareListCollage) y `extra`, los títulos siguientes de su
 * fondo. Devuelve `{ src, size }` como fetchImage, o null.
 */
export async function composeListCollage(collage, extra = []) {
  const sharp = await loadSharp();
  if (!sharp || !collage.length) return null;
  try {
    const planned = buildPosterCollageTiles(collage);
    const size = coverSize(getPosterCollagePlacement(planned.length));
    const [coverImages, extraImages] = await Promise.all([
      Promise.all(planned.map((path) => loadTile(path, size, 5000))),
      Promise.all([...planned, ...extra].map((path) => loadTile(path, "w185", 4000))),
    ]);
    // Si alguna no llega, la portada se rehace con las que sí (como la página
    // con las que cargan).
    const tiles = buildPosterCollageTiles(planned.filter((_, index) => coverImages[index]));
    if (!tiles.length) return null;
    const cover = new Map(planned.map((path, index) => [path, coverImages[index]]));
    const small = new Map([...planned, ...extra].map((path, index) => [path, extraImages[index]]));
    const { cols, rows } = getPosterCollagePlacement(tiles.length);

    const [coverPixels, extension] = await Promise.all([
      paintCover(sharp, tiles, cover),
      paintExtension(sharp, tiles, extra.filter((path) => small.get(path)), small, cols, rows),
    ]);

    // La prolongación bajo su máscara, sobre el fondo, y la portada encima con
    // su fundido.
    const out = new Uint8ClampedArray(W * LAYOUT_H * 3);
    for (let y = 0; y < LAYOUT_H; y += 1) {
      const extAlpha = interpolate(EXTENSION_MASK, y / COLLAGE_COVER_H);
      const coverAlpha = y < COLLAGE_COVER_H ? interpolate(POSTER_FADE, (y + 0.5) / COLLAGE_COVER_H) : 0;
      for (let x = 0; x < W; x += 1) {
        const index = (y * W + x) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          const base = BG[channel] + (extension[index + channel] - BG[channel]) * extAlpha;
          out[index + channel] = coverAlpha ? base + (coverPixels[index + channel] - base) * coverAlpha : base;
        }
      }
    }

    const scaledW = Math.round(W * OVERSCAN);
    const buffer = await sharp(Buffer.from(out.buffer), { raw: { width: W, height: LAYOUT_H, channels: 3 } })
      .resize(scaledW, Math.round(LAYOUT_H * OVERSCAN), { fit: "fill" })
      .extract({ left: Math.round((scaledW - W) / 2), top: 0, width: W, height: H })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { src: `data:image/jpeg;base64,${buffer.toString("base64")}`, size: { width: W, height: H } };
  } catch {
    return null;
  }
}
