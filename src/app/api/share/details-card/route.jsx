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
const BG = "#000000";

// --- Geometría (px de la imagen). Proporciones medidas sobre la ficha móvil.
const POSTER_H = 1620;
const BUTTON = 104;
const BUTTON_GAP = 14;
const BUTTONS_TOP = 1536;
const LOGO_MAX_W = Math.round(W * 0.85);
const LOGO_MAX_H = 210;
const LOGO_BOTTOM = BUTTONS_TOP - 44;
const PANEL_TOP = BUTTONS_TOP + BUTTON + 52;

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

  const background = isSolid
    ? "#ffffff"
    : isActive
      ? `linear-gradient(135deg, ${rgba(color.secondary, 0.22)} 0%, ${rgba(color.rgb, 0.3)} 45%, ${rgba(color.rgb, 0.36)} 100%)`
      : "linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.03) 100%)";

  const border = isSolid
    ? "2px solid rgba(255, 255, 255, 1)"
    : isActive
      ? `2px solid ${rgba(color.rgb, 0.55)}`
      : "2px solid rgba(255, 255, 255, 0.12)";

  const glow = isSolid
    ? "0 0 36px rgba(234, 179, 8, 0.35)"
    : isActive
      ? `0 0 40px ${rgba(color.rgb, 0.5)}`
      : "0 18px 40px -16px rgba(0, 0, 0, 0.6)";

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
        backgroundColor: isSolid ? "#ffffff" : "rgba(18, 18, 20, 0.72)",
        backgroundImage: background,
        border,
        boxShadow: glow,
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
              fontSize: button.label.length > 1 ? 42 : 48,
              fontWeight: 700,
              letterSpacing: button.label.length > 1 ? -2 : 0,
            }}
          >
            {button.label}
          </span>
          {button.labelSuffix ? (
            <span style={{ fontSize: 21, fontWeight: 700, color: "#ffffff", marginLeft: 1 }}>
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

const SCORE_LOGOS = {
  tmdb: { width: 72, height: 52 },
  trakt: { width: 52, height: 52 },
  imdb: { width: 100, height: 50 },
};

function ScoreBadge({ logo, size, score }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={size.width} height={size.height} alt="" style={{ objectFit: "contain" }} />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 22, lineHeight: 1 }}>
        <div style={{ display: "flex", fontSize: 50, fontWeight: 700, color: "rgba(255, 255, 255, 0.9)", letterSpacing: -1 }}>
          {score.value}
        </div>
        {score.votes ? (
          <div style={{ display: "flex", fontSize: 29, fontWeight: 700, color: "rgba(255, 255, 255, 0.62)", marginTop: 6, letterSpacing: 1 }}>
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

function Card({ card, poster, logo, assets, fonts }) {
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
      {/* Portada a sangre. */}
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster.src}
          width={W}
          height={POSTER_H}
          alt=""
          style={{ position: "absolute", top: 0, left: 0, width: W, height: POSTER_H, objectFit: "cover", objectPosition: "50% 0%" }}
        />
      ) : null}

      {/* Fundido de la portada con el fondo (la máscara inferior de la ficha)
          y un velo suave arriba para que la marca se lea sobre pósters claros. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: POSTER_H + 2,
          display: "flex",
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 13%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.38) 68%, rgba(0,0,0,0.82) 82%, rgba(0,0,0,1) 96%)",
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

      {/* Marcador compacto: solo las puntuaciones. */}
      {scores.length ? (
        <div
          style={{
            position: "absolute",
            top: PANEL_TOP,
            left: 44,
            width: W - 88,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              width: "100%",
              padding: "30px 40px",
              borderRadius: 44,
              backgroundColor: "rgba(28, 28, 30, 0.78)",
              backgroundImage:
                "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.05) 100%)",
              border: "2px solid rgba(255, 255, 255, 0.10)",
              boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.8), inset 0 2px 0 rgba(255, 255, 255, 0.10)",
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
  const [fonts, assets, poster, logo] = await Promise.all([
    loadGoogleFonts([
      { name: FONT, query: "PT+Sans:wght@400", weight: 400 },
      { name: FONT, query: "PT+Sans:wght@700", weight: 700 },
    ]),
    loadLocalAssets(),
    loadPoster(card.posterPath),
    loadLogo(card.logoPath),
  ]);

  return new ImageResponse(
    <Card card={card} poster={poster} logo={logo} assets={assets} fonts={Boolean(fonts)} />,
    {
      width: W,
      height: H,
      ...(fonts ? { fonts } : {}),
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
