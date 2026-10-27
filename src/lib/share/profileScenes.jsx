// Imagen compartible de un PERFIL (ver lib/profile/shareProfile). Mismo
// lenguaje que las de la ficha y las listas (ogKit): fondo ambiental con la
// portada difuminada, cristal líquido sin bordes, PT Sans e iconos de lucide.
//
// De arriba abajo: la marca, la foto con el aro del color de su rango, el
// nombre con el punto verde de la cabecera del perfil, @usuario y nivel; las
// cuatro cifras de la cabecera; y las filas de películas y series favoritas.

import { PROFILE_FAVORITES_ROW_MAX } from "@/lib/profile/shareProfile";
import { tierVisual } from "@/lib/level/tiers.mjs";
import {
  AmbientBackground,
  Brand,
  FONT,
  GLASS_ELEVATION,
  GLASS_LAYERS,
  GLASS_TINT,
  H,
  Icon,
  SHADE,
  SIDE_MARGIN,
  W,
  rgba,
} from "@/lib/share/ogKit";

const WHITE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
// `text-emerald-400` del punto que cierra el nombre en la cabecera del perfil.
const EMERALD_400 = "#34d399";

// --- Geometría (px de la imagen).
const ROW_W = W - SIDE_MARGIN * 2;
const AVATAR = 300;
const STAT_GAP = 18;
const STAT_W = Math.floor((ROW_W - STAT_GAP * 3) / 4);
const POSTER_GAP = 20;
const POSTER_W = Math.floor((ROW_W - (PROFILE_FAVORITES_ROW_MAX - 1) * POSTER_GAP) / PROFILE_FAVORITES_ROW_MAX);
const POSTER_H = Math.round(POSTER_W * 1.5);
const POSTER_SHADOW = "0 26px 56px -14px rgba(0,0,0,0.85)";
const POSTER_SHEEN = "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.03) 100%)";

// Los colores de los iconos de las cifras de la cabecera del perfil.
const STATS = [
  { key: "films", label: "Películas", icon: "film", color: "#38bdf8" },
  { key: "shows", label: "Series", icon: "badgeCheck", color: "#a78bfa" },
  { key: "episodes", label: "Episodios", icon: "tv", color: "#34d399" },
  { key: "followers", label: "Seguidores", icon: "users", color: "#fbbf24" },
];

const NUMBER = new Intl.NumberFormat("es-ES");

// `#rrggbb` + opacidad → rgba (el halo del aro).
function hexAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

// Inicial de respaldo sin foto, con el criterio de components/ui/Avatar.
function initialOf(...sources) {
  for (const source of sources) {
    const first = Array.from(String(source ?? "").trim())[0];
    if (first) return first.toUpperCase();
  }
  return "?";
}

function Fill({ style }) {
  return <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", ...style }} />;
}

function Avatar({ avatar, card, ring }) {
  const inner = AVATAR - 16;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR,
        backgroundImage: `linear-gradient(160deg, ${ring.hex} 0%, ${ring.hexDeep} 100%)`,
        boxShadow: `0 30px 80px -20px rgba(0,0,0,0.9), 0 0 70px ${hexAlpha(ring.hex, 0.33)}`,
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar.src}
          width={inner}
          height={inner}
          alt=""
          style={{ width: inner, height: inner, borderRadius: inner, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: inner,
            height: inner,
            borderRadius: inner,
            backgroundColor: "#18181b",
            fontSize: 140,
            fontWeight: 700,
            color: WHITE(0.85),
          }}
        >
          {initialOf(card.displayName, card.username)}
        </div>
      )}
    </div>
  );
}

function LevelChip({ level, ring }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginTop: 30,
        padding: "14px 30px",
        borderRadius: 999,
        backgroundColor: GLASS_TINT,
        backgroundImage: GLASS_LAYERS,
        boxShadow: GLASS_ELEVATION,
      }}
    >
      <Icon name="trophy" size={34} color={ring.hex} />
      <div style={{ display: "flex", marginLeft: 14, fontSize: 34, fontWeight: 700, color: "#ffffff" }}>
        {`Nivel ${level.level}`}
      </div>
      <div style={{ display: "flex", marginLeft: 14, fontSize: 34, fontWeight: 700, color: ring.hex }}>
        {`· ${level.tierName || ring.name}`}
      </div>
    </div>
  );
}

function StatCell({ stat, value }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: STAT_W,
        height: 200,
        borderRadius: 32,
        backgroundColor: GLASS_TINT,
        backgroundImage: GLASS_LAYERS,
        boxShadow: GLASS_ELEVATION,
      }}
    >
      <Icon name={stat.icon} size={40} color={stat.color} />
      <div style={{ display: "flex", marginTop: 14, fontSize: value >= 10_000 ? 52 : 62, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>
        {NUMBER.format(value)}
      </div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: WHITE(0.6) }}>
        {stat.label}
      </div>
    </div>
  );
}

function Poster({ image }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: POSTER_W,
        height: POSTER_H,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: image ? "#18181b" : GLASS_TINT,
        ...(image ? {} : { backgroundImage: GLASS_LAYERS }),
        boxShadow: POSTER_SHADOW,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          width={POSTER_W}
          height={POSTER_H}
          alt=""
          // El radio va también en la imagen: Satori no recorta un <img>
          // absoluto con el `overflow: hidden` redondeado del padre.
          style={{ position: "absolute", top: 0, left: 0, width: POSTER_W, height: POSTER_H, objectFit: "cover", borderRadius: 18 }}
        />
      ) : (
        <Icon name="film" size={Math.round(POSTER_W * 0.3)} color={WHITE(0.3)} />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: POSTER_W,
          height: POSTER_H,
          display: "flex",
          borderRadius: 18,
          backgroundImage: POSTER_SHEEN,
        }}
      />
    </div>
  );
}

function FavoritesRow({ label, icon, color, images }) {
  const count = images.length;
  const rowWidth = count * POSTER_W + Math.max(0, count - 1) * POSTER_GAP;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 56 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <Icon name={icon} size={30} color={color} />
        <div style={{ display: "flex", marginLeft: 12, fontSize: 26, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: WHITE(0.75) }}>
          {label}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: rowWidth }}>
        {images.map((image, index) => (
          <Poster key={index} image={image} />
        ))}
      </div>
    </div>
  );
}

/** Imagen de un perfil (/api/share/profile-card). */
export function ProfileCard({ card, avatar, movies, series, ambient, ambientBase, assets, fonts }) {
  const ring = tierVisual(card.level?.tier);
  const nameSize = card.displayName.length > 24 ? 64 : card.displayName.length > 16 ? 76 : 92;

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
      {ambient || ambientBase ? (
        <AmbientBackground ambient={ambient} ambientBase={ambientBase} />
      ) : (
        // Sin favoritos no hay portada que difuminar: un halo del color del rango.
        <Fill style={{ backgroundImage: `radial-gradient(90% 55% at 50% 18%, ${ring.hexDeep} 0%, #0a0a0a 100%)` }} />
      )}
      <Fill
        style={{
          backgroundImage: `linear-gradient(180deg, ${rgba(SHADE, 0.55)} 0%, ${rgba(SHADE, 0.35)} 30%, ${rgba(SHADE, 0.55)} 60%, ${rgba(SHADE, 0.85)} 100%)`,
        }}
      />

      <Brand src={assets.brand} />

      <div
        style={{
          position: "absolute",
          top: 150,
          left: SIDE_MARGIN,
          width: ROW_W,
          height: H - 150 - 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Avatar avatar={avatar} card={card} ring={ring} />

        <div
          style={{
            display: "flex",
            marginTop: 40,
            maxWidth: ROW_W,
            fontSize: nameSize,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -2,
            textShadow: "0 4px 28px rgba(0,0,0,0.85)",
          }}
        >
          {card.displayName}
          <span style={{ color: EMERALD_400 }}>.</span>
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 38, fontWeight: 700, color: WHITE(0.6) }}>
          {`@${card.username}`}
        </div>
        {card.level ? <LevelChip level={card.level} ring={ring} /> : null}

        <div style={{ display: "flex", justifyContent: "space-between", width: ROW_W, marginTop: 56 }}>
          {STATS.map((stat) => (
            <StatCell key={stat.key} stat={stat} value={card.stats[stat.key]} />
          ))}
        </div>

        {movies.length ? (
          <FavoritesRow label="Películas favoritas" icon="film" color="#38bdf8" images={movies} />
        ) : null}
        {series.length ? (
          <FavoritesRow label="Series favoritas" icon="tv" color="#a78bfa" images={series} />
        ) : null}
      </div>
    </div>
  );
}
