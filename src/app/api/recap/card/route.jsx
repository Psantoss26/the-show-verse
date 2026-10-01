import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imagen para compartir "Mi año en The Show Verse" (formato story, 1080×1920).
//
// Recibe el resumen YA calculado que tiene el cliente, no la sesión: así no
// hace falta volver a pedirlo al backend ni tocar las cookies (renovarlas aquí
// rompería la rotación de tokens, porque una ImageResponse no las devuelve).
// Como cualquiera puede llamarla, todo se valida y recorta: textos cortos,
// números finitos y solo rutas de imagen de TMDb.

const W = 1080;
const H = 1920;
const LIME = "#c6f432";
const INK = "#0b0b0b";
const TMDB = "https://image.tmdb.org/t/p";
const PATH_RE = /^\/[\w-]+\.(?:jpg|jpeg|png|webp)$/i;

function text(value, max = 60) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function int(value, max = 10_000_000) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : 0;
}

function imagePath(value) {
  return typeof value === "string" && PATH_RE.test(value) ? value : null;
}

function titles(list) {
  return (Array.isArray(list) ? list : [])
    .slice(0, 5)
    .map((item) => ({ title: text(item?.title, 42), posterPath: imagePath(item?.posterPath) }))
    .filter((item) => item.title);
}

function sanitize(body) {
  const year = int(body?.year, 2100);
  return {
    year: year >= 1990 ? year : new Date().getFullYear(),
    username: text(body?.username, 30).replace(/[^\w.-]/g, ""),
    name: text(body?.name, 40),
    persona: text(body?.persona, 40),
    minutes: int(body?.minutes),
    titles: int(body?.titles, 100_000),
    genre: text(body?.genre, 24),
    shows: titles(body?.shows),
    movies: titles(body?.movies),
    // Arte SIN idioma del título del año (póster textless o fondo textless).
    backgroundPath: imagePath(body?.backgroundPath),
  };
}

const nf = new Intl.NumberFormat("es-ES");

// Tipografías de la experiencia (Anton para los titulares, PT Sans para el
// texto). El proyecto solo las tiene en woff2, que Satori no lee: se piden una
// vez en TTF a Google Fonts y se guardan en memoria. Si falla, la imagen sale
// con la fuente por defecto en vez de no salir.
const DISPLAY_FONT = "Anton";
const BODY_FONT = "PT Sans";
let fontsPromise = null;

async function fetchTtf(family) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}`, {
    signal: AbortSignal.timeout(4000),
  }).then((res) => (res.ok ? res.text() : ""));
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error(`no ttf for ${family}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`font ${res.status}`);
  return res.arrayBuffer();
}

function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([fetchTtf("Anton"), fetchTtf("PT+Sans:wght@700")])
      .then(([anton, ptSans]) => [
        { name: DISPLAY_FONT, data: anton, weight: 400, style: "normal" },
        { name: BODY_FONT, data: ptSans, weight: 700, style: "normal" },
      ])
      .catch(() => {
        fontsPromise = null; // se reintenta en la siguiente imagen
        return null;
      });
  }
  return fontsPromise;
}

function Column({ label, items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", marginBottom: 22 }}>
        {label}
      </div>
      {items.length ? (
        items.map((item, index) => (
          <div key={`${item.title}-${index}`} style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
            <div style={{ display: "flex", width: 34, fontSize: 34, fontWeight: 700 }}>{index + 1}</div>
            {item.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${TMDB}/w154${item.posterPath}`}
                width={56}
                height={84}
                alt=""
                style={{ borderRadius: 8, objectFit: "cover", marginRight: 16 }}
              />
            ) : (
              <div style={{ display: "flex", width: 56, height: 84, borderRadius: 8, background: "rgba(0,0,0,0.15)", marginRight: 16 }} />
            )}
            <div
              style={{
                display: "flex",
                flex: 1,
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.title}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: "flex", fontSize: 30 }}>—</div>
      )}
    </div>
  );
}

function Card(data) {
  // `data.fonts`: hay tipografías propias cargadas.
  const hours = Math.round(data.minutes / 60);
  return (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: INK, color: "#fff", fontFamily: data.fonts ? BODY_FONT : "sans-serif" }}>
      {/* Cabecera con el arte sin idioma del título del año. */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 760, padding: "0 72px 56px" }}>
        {data.backgroundPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${TMDB}/original${data.backgroundPath}`}
            width={W}
            height={760}
            alt=""
            style={{ position: "absolute", top: 0, left: 0, width: W, height: 760, objectFit: "cover", objectPosition: "50% 22%" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: 760,
            display: "flex",
            background: "linear-gradient(180deg, rgba(11,11,11,0.55) 0%, rgba(11,11,11,0.2) 40%, rgba(11,11,11,1) 100%)",
          }}
        />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: LIME }}>
          The Show Verse
        </div>
        <div style={{ display: "flex", fontSize: 250, fontWeight: 900, lineHeight: 0.9, letterSpacing: data.fonts ? 0 : -6, marginTop: 12, fontFamily: data.fonts ? DISPLAY_FONT : undefined }}>
          {`MI ${data.year}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
          {data.username ? (
            <div style={{ display: "flex", fontSize: 38, fontWeight: 700, marginRight: 24 }}>{`@${data.username}`}</div>
          ) : null}
          {data.persona ? (
            <div style={{ display: "flex", fontSize: 32, fontWeight: 700, background: LIME, color: INK, padding: "10px 26px", borderRadius: 999 }}>
              {data.persona}
            </div>
          ) : null}
        </div>
      </div>

      {/* Tops. */}
      <div style={{ display: "flex", flex: 1, margin: "0 48px", padding: "52px 44px 20px", background: LIME, color: INK, borderRadius: 44 }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ display: "flex", gap: 40 }}>
            <Column label="Top series" items={data.shows} />
            <Column label="Top películas" items={data.movies} />
          </div>
          <div style={{ display: "flex", marginTop: "auto", paddingTop: 28, borderTop: "3px solid rgba(0,0,0,0.18)" }}>
            {[
              [nf.format(data.minutes), "minutos"],
              [nf.format(hours), "horas"],
              [nf.format(data.titles), "títulos"],
              [data.genre || "—", "género top"],
            ].map(([value, label]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", fontSize: data.fonts ? 64 : 50, fontWeight: 900, lineHeight: 1, overflow: "hidden", whiteSpace: "nowrap", fontFamily: data.fonts ? DISPLAY_FONT : undefined }}>{value}</div>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 700, marginTop: 8 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0 56px", fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
        Tu año en series y películas · The Show Verse
      </div>
    </div>
  );
}

export async function POST(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 20_000) return new Response("Payload too large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const fonts = await loadFonts();
  const data = { ...sanitize(body), fonts: Boolean(fonts) };
  return new ImageResponse(<Card {...data} />, {
    width: W,
    height: H,
    ...(fonts ? { fonts } : {}),
    headers: { "Cache-Control": "private, no-store" },
  });
}
