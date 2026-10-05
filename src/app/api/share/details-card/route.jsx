import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import {
  SHARE_CARD_HEIGHT as H,
  SHARE_CARD_WIDTH as W,
  sanitizeShareCard,
  shareCardActionButtons,
} from "@/lib/details/shareCard";
import { loadGoogleFonts } from "@/lib/og/googleFonts";

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
// Las imágenes se descargan aquí y entran como data URI: así un póster que no
// llega solo deja su hueco (fondo negro) en vez de tumbar la imagen entera, y el
// logo se dimensiona con su tamaño real.

const TMDB = "https://image.tmdb.org/t/p";
const FONT = "PT Sans";
// Fondo de la ficha (`bg-[#0a0a0a]`) y color de sus sombreados (`#101010`).
const BG = "#0a0a0a";
const SHADE = [16, 16, 16];

// --- Geometría (px de la imagen). Proporciones medidas sobre la ficha móvil.
const POSTER_H = 1620;
// La fila de acciones (8 botones) y el marcador ocupan todo el ancho salvo un
// margen lateral: en una imagen que se ve en pequeño (historias, chats) a la
// escala exacta del teléfono se quedaban diminutos.
const SIDE_MARGIN = 40;
const ACTION_COUNT = 8;
const BUTTON_GAP = 14;
const BUTTON = Math.floor((W - SIDE_MARGIN * 2 - (ACTION_COUNT - 1) * BUTTON_GAP) / ACTION_COUNT);
// Escala del texto y los logos del marcador respecto al diseño original.
const SCORE_SCALE = 1.2;
const BUTTONS_TOP = 1509;
const LOGO_MAX_W = Math.round(W * 0.85);
const LOGO_MAX_H = 210;
const LOGO_BOTTOM = BUTTONS_TOP - 44;
const PANEL_TOP = BUTTONS_TOP + BUTTON + 48;
// Fondo ambiental con un 12% de escala (como `.hero-bg-base` en móvil).
const AMBIENT = {
  width: Math.round(W * 1.12),
  height: Math.round(H * 1.12),
  left: -Math.round(W * 0.06),
  top: -Math.round(H * 0.06),
};

// Logotipo con nombre: el contenido visible ocupa ~(95..810, 95..300) del PNG.
const BRAND_SCALE = 0.36;
const BRAND = {
  imageWidth: Math.round(896 * BRAND_SCALE),
  imageHeight: Math.round(448 * BRAND_SCALE),
  offsetX: Math.round(90 * BRAND_SCALE),
  offsetY: Math.round(88 * BRAND_SCALE),
  width: Math.round(725 * BRAND_SCALE),
  height: Math.round(218 * BRAND_SCALE),
};

// Colores de LiquidButton (rgb primario + secundario).
const COLORS = {
  green: { rgb: [34, 197, 94], secondary: [134, 239, 172] },
  yellow: { rgb: [234, 179, 8], secondary: [253, 224, 71] },
  red: { rgb: [239, 68, 68], secondary: [252, 165, 165] },
  blue: { rgb: [59, 130, 246], secondary: [147, 197, 253] },
  purple: { rgb: [168, 85, 247], secondary: [216, 180, 254] },
  orange: { rgb: [249, 115, 22], secondary: [253, 186, 116] },
};
const EMERALD_300 = "rgb(110, 231, 183)";
const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

// px de la ficha móvil -> px de la imagen (los botones miden 38px en un
// teléfono de 393px y aquí BUTTON).
const S = BUTTON / 38;
const px = (value) => Math.round(value * S);

// CRISTAL LÍQUIDO de la app (lib/ui/liquidGlass + LiquidGlassOpticalLayers),
// traducido a lo que Satori sabe pintar. Sin `backdrop-filter`: el desenfoque lo
// pone el fondo ambiental, que ya es la portada difuminada, igual que lo que el
// cristal de la ficha tiene detrás. Encima van las mismas capas y en el mismo
// orden que en la página, SIN borde: el canto lo dan la luz y el halo.
const GLASS_TINT = "rgba(0, 0, 0, 0.15)"; // bg-black/15
const GLASS_LAYERS = [
  // Luz superior (volumen).
  "radial-gradient(130% 100% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 68%)",
  // Especular de las esquinas.
  "linear-gradient(125deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 16%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.02) 86%, rgba(255,255,255,0.04) 100%)",
  // Refracción del canto: una franja estrecha que se aclara hacia el borde.
  "radial-gradient(115% 135% at 50% 50%, rgba(255,255,255,0) 66%, rgba(255,255,255,0.04) 100%)",
  // bg-gradient-to-b from-white/[0.14] via-white/[0.03] to-black/15
  "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 50%, rgba(0,0,0,0.15) 100%)",
].join(", ");
// LIQUID_GLASS_ELEVATION: sombra amplia hacia abajo + halo blanco tenue.
const GLASS_ELEVATION = `0 ${px(16)}px ${px(40)}px -${px(8)}px rgba(0,0,0,0.75), 0 0 ${px(32)}px rgba(255,255,255,0.06)`;

// Iconos de lucide-react (mismos trazados, viewBox 24).
const ICONS = {
  play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
  music: [
    ["circle", { cx: "8", cy: "18", r: "4" }],
    ["path", { d: "M12 18V2l7 4" }],
  ],
  chart: [
    ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }],
    ["path", { d: "M18 17V9" }],
    ["path", { d: "M13 17V5" }],
    ["path", { d: "M8 17v-3" }],
  ],
  eye: [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  eyeOff: [
    ["path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }],
    ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
    ["path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }],
    ["path", { d: "m2 2 20 20" }],
  ],
  star: [
    ["path", { d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" }],
  ],
  heart: [
    ["path", { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }],
  ],
  bookmark: [
    ["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" }],
    ["line", { x1: "12", x2: "12", y1: "7", y2: "13" }],
    ["line", { x1: "15", x2: "9", y1: "10", y2: "10" }],
  ],
  list: [
    ["path", { d: "M12 12H3" }],
    ["path", { d: "M16 6H3" }],
    ["path", { d: "M12 18H3" }],
    ["path", { d: "m16 12 5 3-5 3v-6Z" }],
  ],
  message: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
};

function Icon({ name, size, color, filled = false, style }) {
  const nodes = ICONS[name] || [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {nodes.map(([Tag, attrs], index) => (
        <Tag key={index} {...attrs} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- imágenes

function imageSize(buffer) {
  const bytes = new Uint8Array(buffer);
  // PNG: cabecera IHDR.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(buffer);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: primer marcador SOF.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function mimeOf(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return null;
}

async function fetchImage(url, timeout) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime = mimeOf(buffer);
    if (!mime || buffer.byteLength > 12_000_000) return null;
    return {
      src: `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`,
      size: imageSize(buffer),
    };
  } catch {
    return null;
  }
}

// Póster a la máxima calidad; si el original no llega a tiempo, w780.
async function loadPoster(posterPath) {
  if (!posterPath) return null;
  return (
    (await fetchImage(`${TMDB}/original${posterPath}`, 6000)) ||
    fetchImage(`${TMDB}/w780${posterPath}`, 4000)
  );
}

// El fondo ambiental va desenfocado: basta una versión pequeña.
function loadAmbient(posterPath) {
  return posterPath ? fetchImage(`${TMDB}/w342${posterPath}`, 4000) : null;
}

// TMDb sirve los logos SVG también como PNG cambiando la extensión; Satori
// necesita un raster con tamaño conocido para encajarlo.
async function loadLogo(logoPath) {
  if (!logoPath) return null;
  const pngPath = logoPath.replace(/\.svg$/i, ".png");
  const image =
    (await fetchImage(`${TMDB}/original${pngPath}`, 5000)) ||
    (await fetchImage(`${TMDB}/w500${pngPath}`, 4000));
  return image?.size?.width && image.size.height ? image : null;
}

// Logos locales del marcador y de la marca, leídos una vez por proceso.
const LOCAL_ASSETS = {
  tmdb: { file: "logo-TMDb.png", mime: "image/png" },
  trakt: { file: "logo-Trakt.png", mime: "image/png" },
  imdb: { file: "logo-IMDb.svg", mime: "image/svg+xml" },
  brand: { file: "logo-final-titulo-sinFondo.png", mime: "image/png" },
};
let localAssetsPromise = null;

function loadLocalAssets() {
  if (!localAssetsPromise) {
    localAssetsPromise = Promise.all(
      Object.entries(LOCAL_ASSETS).map(async ([key, { file, mime }]) => {
        try {
          const data = await readFile(path.join(process.cwd(), "public", file));
          return [key, `data:${mime};base64,${data.toString("base64")}`];
        } catch {
          return [key, null];
        }
      }),
    ).then((entries) => Object.fromEntries(entries));
  }
  return localAssetsPromise;
}

// ------------------------------------------------------------------- piezas

function ActionButton({ button }) {
  const color = COLORS[button.color];
  const isSolid = button.variant === "solid";
  const isActive = button.variant === "active" && color;
  const isDisabled = button.variant === "disabled";

  const foreground = isSolid
    ? "#000000"
    : isActive
      ? rgba(color.secondary, 1)
      : isDisabled
        ? "rgba(255, 255, 255, 0.3)"
        : "#e4e4e7";

  // Igual que LiquidButton: el cristal siempre; activo, su color al 30% como
  // fondo, el brillo diagonal y el aro de color; `!bg-white` en los de
  // reproducción. El halo sustituye a la elevación cuando hay estado.
  const backgroundColor = isSolid ? "#ffffff" : isActive ? rgba(color.rgb, 0.3) : GLASS_TINT;
  const backgroundImage = isSolid
    ? undefined
    : isActive
      ? `linear-gradient(135deg, ${rgba(color.secondary, 0.2)} 0%, rgba(0,0,0,0) 40%, ${rgba(color.rgb, 0.1)} 60%, rgba(0,0,0,0) 100%), ${GLASS_LAYERS}`
      : GLASS_LAYERS;
  const boxShadow = isSolid
    ? `0 0 ${px(20)}px rgba(234, 179, 8, 0.5)`
    : isActive
      ? `0 0 ${px(20)}px ${rgba(color.rgb, 0.5)}, inset 0 0 0 ${px(1.5)}px ${rgba(color.rgb, 0.45)}`
      : isDisabled
        ? undefined
        : GLASS_ELEVATION;

  const fill = isActive && Number.isFinite(button.fill) && button.fill > 0 ? Math.min(100, button.fill) : 0;
  const iconSize = Math.round(BUTTON * 0.46);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON,
        backgroundColor,
        // Satori no admite propiedades a `undefined`: solo se pasan si existen.
        ...(backgroundImage ? { backgroundImage } : {}),
        ...(boxShadow ? { boxShadow } : {}),
        overflow: "hidden",
      }}
    >
      {fill ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: `${fill}%`,
            display: "flex",
            backgroundImage: `linear-gradient(to top, ${rgba(color.rgb, 0.4)}, ${rgba(color.rgb, 0.15)})`,
          }}
        />
      ) : null}
      {button.label ? (
        <div style={{ display: "flex", alignItems: "baseline", color: foreground, lineHeight: 1 }}>
          <span
            style={{
              fontSize: Math.round(BUTTON * (button.label.length > 1 ? 0.4 : 0.46)),
              fontWeight: 700,
              letterSpacing: button.label.length > 1 ? -2 : 0,
            }}
          >
            {button.label}
          </span>
          {button.labelSuffix ? (
            <span style={{ fontSize: Math.round(BUTTON * 0.2), fontWeight: 700, color: "#ffffff", marginLeft: 1 }}>
              {button.labelSuffix}
            </span>
          ) : null}
        </div>
      ) : (
        <Icon
          name={button.icon}
          size={iconSize}
          color={button.iconColor === "emerald" ? EMERALD_300 : foreground}
          filled={button.icon === "play" ? isSolid : !!button.filledIcon}
          // El triángulo de "play" se centra ópticamente, como `ml-0.5` en la ficha.
          style={button.icon === "play" ? { marginLeft: 5 } : undefined}
        />
      )}
    </div>
  );
}

const scoreSize = (value) => Math.round(value * SCORE_SCALE);
const SCORE_LOGOS = {
  tmdb: { width: scoreSize(72), height: scoreSize(52) },
  trakt: { width: scoreSize(52), height: scoreSize(52) },
  imdb: { width: scoreSize(100), height: scoreSize(50) },
};

function ScoreBadge({ logo, size, score }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={size.width} height={size.height} alt="" style={{ objectFit: "contain" }} />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: scoreSize(22), lineHeight: 1 }}>
        <div style={{ display: "flex", fontSize: scoreSize(50), fontWeight: 700, color: "rgba(255, 255, 255, 0.9)", letterSpacing: -1 }}>
          {score.value}
        </div>
        {score.votes ? (
          <div style={{ display: "flex", fontSize: scoreSize(29), fontWeight: 700, color: "rgba(255, 255, 255, 0.62)", marginTop: scoreSize(6), letterSpacing: 1 }}>
            {score.votes}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Logo del título encajado en su caja máxima, apoyado sobre la fila de
// acciones; sin logo, el título en texto (salvo que la portada ya lo traiga).
function TitleArt({ card, logo }) {
  let box = null;
  if (logo) {
    const ratio = logo.size.width / logo.size.height;
    const width = Math.min(LOGO_MAX_W, LOGO_MAX_H * ratio);
    box = { width: Math.round(width), height: Math.round(width / ratio) };
  }
  if (!box && !card.showTitle) return null;
  const height = box ? box.height : 220;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        width: W,
        top: LOGO_BOTTOM - height,
        height,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {box ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo.src}
          width={box.width}
          height={box.height}
          alt=""
          style={{ filter: "drop-shadow(0 6px 26px rgba(0,0,0,0.85))" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            maxWidth: "88%",
            textAlign: "center",
            justifyContent: "center",
            fontSize: card.title.length > 28 ? 66 : 84,
            fontWeight: 700,
            lineHeight: 1.08,
            textShadow: "0 4px 28px rgba(0,0,0,0.9)",
          }}
        >
          {card.title}
        </div>
      )}
    </div>
  );
}

function Card({ card, poster, ambient, logo, assets, fonts }) {
  const buttons = shareCardActionButtons(card);
  const scores = ["tmdb", "trakt", "imdb"].filter((key) => card.scores[key]);
  const rowWidth = buttons.length * BUTTON + (buttons.length - 1) * BUTTON_GAP;

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
      {/* Fondo ambiental: la misma portada difuminada y atenuada que la ficha
          pinta detrás de todo (`.hero-bg-base`, con su escala para que el
          desenfoque no deje halo en los bordes). Es lo que el cristal de los
          botones y del marcador tiene detrás. */}
      {ambient ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ambient.src}
          width={AMBIENT.width}
          height={AMBIENT.height}
          alt=""
          style={{
            position: "absolute",
            top: AMBIENT.top,
            left: AMBIENT.left,
            width: AMBIENT.width,
            height: AMBIENT.height,
            objectFit: "cover",
            filter: "blur(44px) brightness(0.62) saturate(1.15)",
          }}
        />
      ) : null}

      {/* Sombreados de legibilidad del fondo (los de la ficha): se oscurece
          hacia abajo, donde van los botones y el marcador. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: `linear-gradient(0deg, ${rgba(SHADE, 0.72)} 0%, ${rgba(SHADE, 0.36)} 45%, rgba(0,0,0,0.12) 100%)`,
        }}
      />

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

      {/* Marca, en el sitio de los controles superiores de la ficha. El PNG
          (896×448) trae mucho margen transparente: se recorta con la caja. */}
      {assets.brand ? (
        <div
          style={{
            position: "absolute",
            top: 58,
            left: 50,
            width: BRAND.width,
            height: BRAND.height,
            display: "flex",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assets.brand}
            width={BRAND.imageWidth}
            height={BRAND.imageHeight}
            alt=""
            style={{ position: "absolute", left: -BRAND.offsetX, top: -BRAND.offsetY }}
          />
        </div>
      ) : null}

      {/* Logo del título (o el título en texto si no hay logo). */}
      <TitleArt card={card} logo={logo} />

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
          <ActionButton key={button.key} button={button} />
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
            left: Math.round((W - rowWidth) / 2),
            width: rowWidth,
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
  const [fonts, assets, poster, ambient, logo] = await Promise.all([
    loadGoogleFonts([
      { name: FONT, query: "PT+Sans:wght@400", weight: 400 },
      { name: FONT, query: "PT+Sans:wght@700", weight: 700 },
    ]),
    loadLocalAssets(),
    loadPoster(card.posterPath),
    loadAmbient(card.posterPath),
    loadLogo(card.logoPath),
  ]);

  return new ImageResponse(
    <Card card={card} poster={poster} ambient={ambient} logo={logo} assets={assets} fonts={Boolean(fonts)} />,
    {
      width: W,
      height: H,
      ...(fonts ? { fonts } : {}),
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
