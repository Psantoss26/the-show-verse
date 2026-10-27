import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ImageResponse } from "next/og";

import {
  AVATAR_DATA_URL_MAX_CHARS,
  avatarDataUrl,
  avatarHttpsUrl,
  sanitizeProfileShareCard,
} from "@/lib/profile/shareProfile";
import {
  H,
  W,
  loadAmbientLayers,
  loadLocalAssets,
  loadShareFonts,
  mimeOf,
  shareImageResponse,
} from "@/lib/share/ogKit";
import { loadTmdbImages } from "@/lib/share/listScenes";
import { ProfileCard } from "@/lib/share/profileScenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imagen para compartir un PERFIL (formato story, 1080×1920).
//
// Hermana de /api/share/list-card: recibe los datos ya resueltos por la página
// (foto, nombre, nivel, cifras y favoritos), los valida en
// `sanitizeProfileShareCard` y pinta `ProfileCard`.
//
// La foto de perfil es una URL cualquiera (el usuario puede pegarla a mano), así
// que NO se descarga como las de TMDb: solo https, sin seguir redirecciones, y
// solo si el host resuelve a direcciones públicas (nada de localhost ni de la
// red interna). La subida desde un archivo llega ya como `data:image/…;base64`
// y se decodifica sin descargar nada. Si no llega, la imagen lleva la inicial.

const AVATAR_MAX_BYTES = 5_000_000;
const AVATAR_SIZE = 480;

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  // La foto subida desde un archivo viaja en el cuerpo (ver `avatarDataUrl`).
  if (raw.length > 8_000 + AVATAR_DATA_URL_MAX_CHARS) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const card = sanitizeProfileShareCard(body);
  if (!card.username) return new Response("Missing username", { status: 400 });
  // Opaca: JPEG y guardada por el cuerpo validado (ver `shareImageResponse`).
  const response = await shareImageResponse(
    `profile-card|${JSON.stringify({ ...card, avatarUrl: cacheId(card.avatarUrl) })}`,
    () => renderProfileCard(card),
    { jpeg: true },
  );
  return response || new Response("Render failed", { status: 500 });
}

// La foto en base64 pesa cientos de KB: en la clave de caché va su huella.
function cacheId(avatarUrl) {
  if (!avatarUrl?.startsWith("data:")) return avatarUrl;
  return `sha1:${createHash("sha1").update(avatarUrl).digest("hex")}`;
}

async function renderProfileCard(card) {
  const ambientPath = card.movies[0]?.posterPath || card.series[0]?.posterPath || null;
  const [fonts, assets, avatar, movies, series, [ambient, ambientBase]] = await Promise.all([
    loadShareFonts(),
    loadLocalAssets(),
    loadAvatar(card.avatarUrl),
    loadTmdbImages(card.movies.map((item) => item.posterPath), "w342"),
    loadTmdbImages(card.series.map((item) => item.posterPath), "w342"),
    ambientPath ? loadAmbientLayers(ambientPath) : [null, null],
  ]);

  return new ImageResponse(
    (
      <ProfileCard
        card={card}
        avatar={avatar}
        movies={movies}
        series={series}
        ambient={ambient}
        ambientBase={ambientBase}
        assets={assets}
        fonts={Boolean(fonts)}
      />
    ),
    {
      width: W,
      height: H,
      ...(fonts ? { fonts } : {}),
    },
  );
}

// --- Foto de perfil.

function isPublicIPv4(address) {
  const [a, b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // enlace local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function isPublicAddress(address) {
  if (isIP(address) === 4) return isPublicIPv4(address);
  const value = address.toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  if (value === "::" || value === "::1") return false;
  // fc00::/7 (privadas) y fe80::/10 (enlace local).
  if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value)) return false;
  return true;
}

async function hostIsPublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch {
    return false;
  }
}

async function readLimited(response, max) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Recorte cuadrado y reducido (el aro la pinta a ~280 px). Con sharp vale
// cualquier formato (WebP, AVIF, GIF…); sin él, solo PNG o JPEG tal cual.
async function squareAvatar(buffer) {
  try {
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(buffer, { failOn: "none", animated: false })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .flatten({ background: "#18181b" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { src: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
  } catch {
    const mime = mimeOf(buffer);
    return mime ? { src: `data:${mime};base64,${buffer.toString("base64")}` } : null;
  }
}

// Las fotos de las cuentas de Google llegan a 96 px (`=s96-c`): se pide la de
// AVATAR_SIZE, que el mismo servidor sirve cambiando el sufijo.
function largerAvatar(url) {
  if (url.hostname.endsWith(".googleusercontent.com")) {
    url.pathname = url.pathname.replace(/=s\d+(-c)?$/, `=s${AVATAR_SIZE}-c`);
  }
  return url;
}

async function loadAvatar(value) {
  const dataUrl = avatarDataUrl(value);
  if (dataUrl) {
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    return buffer.length ? squareAvatar(buffer) : null;
  }
  const href = avatarHttpsUrl(value);
  if (!href) return null;
  try {
    const url = largerAvatar(new URL(href));
    if (!(await hostIsPublic(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) return null;
    const buffer = await readLimited(response, AVATAR_MAX_BYTES);
    return buffer ? squareAvatar(buffer) : null;
  } catch {
    return null;
  }
}
