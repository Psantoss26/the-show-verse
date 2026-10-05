// Capas del VÍDEO compartible de una ficha (ver lib/details/shareStory).
//
// Cada sección es una capa TRANSPARENTE de 1080×1920 que el cliente compone
// sobre el fondo (la portada difuminada) y bajo la cabecera (marca + logo del
// título), y anima al entrar y salir. Mismo lenguaje que la imagen de portada:
// cristal líquido sin bordes, PT Sans, iconos de lucide y los colores de los
// botones de la ficha.

import { formatUserRating } from "@/lib/details/shareCard";
import { formatRuntime, formatStoryDate } from "@/lib/details/shareStory";
import {
  AmbientBackground,
  BRAND,
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
  W,
  px,
  rgba,
} from "@/lib/share/ogKit";

// Zona de contenido de las secciones: bajo la cabecera y con aire abajo.
const HEADER_TITLE_TOP = BRAND.top + BRAND.height + 44;
const HEADER_TITLE_MAX_H = 180;
const HEADER_TITLE_MAX_W = 760;
const CONTENT_TOP = HEADER_TITLE_TOP + HEADER_TITLE_MAX_H + 70;
const CONTENT_BOTTOM = H - 110;
const PANEL_W = W - SIDE_MARGIN * 2;

const WHITE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
const YELLOW_300 = rgba(COLORS.yellow.secondary, 1);
const GREEN_300 = rgba(COLORS.green.secondary, 1);
// Halo de las cifras grandes: el `glow` de los botones activos (LiquidButton).
const YELLOW_GLOW = rgba(COLORS.yellow.rgb, 0.45);
const GREEN_GLOW = rgba(COLORS.green.rgb, 0.45);

// Capa transparente a tamaño completo.
function Layer({ fonts, children, style }) {
  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        display: "flex",
        color: "#ffffff",
        fontFamily: fonts ? FONT : "sans-serif",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Contenido de una sección, centrado en su zona.
function SceneBody({ fonts, children }) {
  return (
    <Layer fonts={fonts}>
      <div
        style={{
          position: "absolute",
          top: CONTENT_TOP,
          left: SIDE_MARGIN,
          width: PANEL_W,
          height: CONTENT_BOTTOM - CONTENT_TOP,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </Layer>
  );
}

// El mismo cristal que el marcador de la ficha (LIQUID_GLASS_SURFACE).
function Glass({ children, style }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: px(16),
        backgroundColor: GLASS_TINT,
        backgroundImage: GLASS_LAYERS,
        boxShadow: GLASS_ELEVATION,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Etiqueta de la sección: una píldora de cristal con icono, como los títulos de
// sección de la ficha.
function Eyebrow({ icon, label, color = WHITE(0.9) }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 84,
        padding: "0 40px",
        marginBottom: 56,
        borderRadius: 84,
        backgroundColor: GLASS_TINT,
        backgroundImage: GLASS_LAYERS,
        boxShadow: GLASS_ELEVATION,
      }}
    >
      <Icon name={icon} size={38} color={color} />
      <div
        style={{
          display: "flex",
          marginLeft: 18,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: WHITE(0.88),
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Cifra protagonista con su halo de color, como las de los botones activos.
function BigFigure({ value, suffix, color, glow, size = 300 }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
      <div
        style={{
          display: "flex",
          fontSize: size,
          fontWeight: 700,
          letterSpacing: -8,
          color,
          textShadow: `0 0 60px ${glow}`,
        }}
      >
        {value}
      </div>
      {suffix ? (
        <div style={{ display: "flex", marginLeft: 12, fontSize: Math.round(size * 0.32), fontWeight: 700, color: WHITE(0.55) }}>
          {suffix}
        </div>
      ) : null}
    </div>
  );
}

function Caption({ children, style }) {
  return (
    <div style={{ display: "flex", marginTop: 18, fontSize: 52, fontWeight: 700, color: WHITE(0.82), ...style }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- capas

/** Fondo de las secciones: la portada difuminada, más oscura que en la portada. */
export function StoryBackdrop({ ambient, ambientBase }) {
  return (
    <Layer style={{ background: "#0a0a0a" }}>
      <AmbientBackground ambient={ambient} ambientBase={ambientBase} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, ${rgba(SHADE, 0.42)} 28%, ${rgba(SHADE, 0.5)} 100%)`,
        }}
      />
    </Layer>
  );
}

/** Cabecera fija de las secciones: la marca y el logo (o el título). */
export function StoryHeader({ card, logo, brand, fonts }) {
  let box = null;
  if (logo) {
    const ratio = logo.size.width / logo.size.height;
    const width = Math.min(HEADER_TITLE_MAX_W, HEADER_TITLE_MAX_H * ratio);
    box = { width: Math.round(width), height: Math.round(width / ratio) };
  }
  return (
    <Layer fonts={fonts}>
      <Brand src={brand} />
      <div
        style={{
          position: "absolute",
          top: HEADER_TITLE_TOP,
          left: 0,
          width: W,
          height: HEADER_TITLE_MAX_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {box ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.src} width={box.width} height={box.height} alt="" />
        ) : (
          <div
            style={{
              display: "flex",
              maxWidth: 900,
              textAlign: "center",
              justifyContent: "center",
              fontSize: card.title.length > 28 ? 58 : 72,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {card.title}
          </div>
        )}
      </div>
    </Layer>
  );
}

/** Visionados: veces vista y fechas (películas) o progreso (series). */
export function PlaysScene({ plays, fonts }) {
  if (plays.percent != null) {
    return (
      <SceneBody fonts={fonts}>
        <Eyebrow icon="tv" label="Progreso" color={GREEN_300} />
        <BigFigure value={String(plays.percent)} suffix="%" color={GREEN_300} glow={GREEN_GLOW} />
        <Caption>de la serie vista</Caption>
        <Glass style={{ width: PANEL_W, marginTop: 64, padding: "52px 60px" }}>
          <div style={{ display: "flex", width: "100%", height: 30, borderRadius: 30, backgroundColor: WHITE(0.1), overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                width: `${plays.percent}%`,
                height: "100%",
                borderRadius: 30,
                backgroundImage: `linear-gradient(90deg, ${rgba(COLORS.green.rgb, 0.85)}, ${GREEN_300})`,
                boxShadow: `0 0 26px ${rgba(COLORS.green.rgb, 0.6)}`,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 36 }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{plays.watched}</div>
            <div style={{ display: "flex", marginLeft: 14, fontSize: 40, fontWeight: 700, color: WHITE(0.62) }}>
              {`de ${plays.total} episodios`}
            </div>
          </div>
          {plays.last ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
              <Icon name="calendar" size={36} color={WHITE(0.55)} />
              <div style={{ display: "flex", marginLeft: 16, fontSize: 36, color: WHITE(0.7) }}>
                {`Último visionado: ${formatStoryDate(plays.last)}`}
              </div>
            </div>
          ) : null}
        </Glass>
      </SceneBody>
    );
  }

  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="eye" label="Visionados" color={GREEN_300} />
      <BigFigure value={String(plays.count)} color={GREEN_300} glow={GREEN_GLOW} />
      <Caption>{plays.count === 1 ? "vez vista" : "veces vista"}</Caption>
      {plays.dates.length ? (
        <Glass style={{ width: PANEL_W, marginTop: 64, padding: "28px 56px" }}>
          {plays.dates.map((date, index) => (
            <div key={date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <Icon name="calendar" size={40} color={index === 0 ? GREEN_300 : WHITE(0.5)} />
                <div style={{ display: "flex", marginLeft: 22, fontSize: 44, fontWeight: 700, color: WHITE(index === 0 ? 0.95 : 0.78) }}>
                  {formatStoryDate(date)}
                </div>
              </div>
              {index === 0 ? (
                <div
                  style={{
                    display: "flex",
                    padding: "8px 22px",
                    borderRadius: 40,
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: GREEN_300,
                    backgroundColor: rgba(COLORS.green.rgb, 0.18),
                  }}
                >
                  Última
                </div>
              ) : null}
            </div>
          ))}
        </Glass>
      ) : null}
    </SceneBody>
  );
}

/** Puntuación: la nota propia en grande y, debajo, las de la comunidad. */
export function RatingScene({ card, assets, fonts }) {
  const rating = card.actions.rating;
  const scores = ["tmdb", "trakt", "imdb"].filter((key) => card.scores[key]);
  const filled = rating != null ? Math.round(rating) : 0;

  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="star" label={rating != null ? "Mi puntuación" : "Puntuaciones"} color={YELLOW_300} />
      {rating != null ? (
        // Columna explícita: Satori no apila los hijos de un fragmento.
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <BigFigure value={formatUserRating(rating)} suffix="/10" color={YELLOW_300} glow={YELLOW_GLOW} />
          <div style={{ display: "flex", marginTop: 40 }}>
            {Array.from({ length: 10 }, (_, index) => (
              <Icon
                key={index}
                name="star"
                size={66}
                color={index < filled ? YELLOW_300 : WHITE(0.22)}
                filled={index < filled}
                style={{ marginLeft: index ? 10 : 0 }}
              />
            ))}
          </div>
        </div>
      ) : null}
      {scores.length ? (
        <Glass
          style={{
            width: PANEL_W,
            marginTop: rating != null ? 84 : 0,
            padding: rating != null ? `${px(12)}px ${px(14)}px` : "56px 80px",
            flexDirection: rating != null ? "row" : "column",
            alignItems: rating != null ? "center" : "flex-start",
            justifyContent: "space-around",
          }}
        >
          {scores.map((key, index) => (
            <div key={key} style={{ display: "flex", marginTop: rating == null && index ? 52 : 0 }}>
              <ScoreBadge logo={assets[key]} size={SCORE_LOGOS[key]} score={card.scores[key]} />
            </div>
          ))}
        </Glass>
      ) : null}
    </SceneBody>
  );
}

/** Reseña del usuario (solo si la ha incluido y no tiene spoilers). */
export function ReviewScene({ card, review, fonts }) {
  const rating = card.actions.rating;
  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="message" label="Mi reseña" color={rgba(COLORS.orange.secondary, 1)} />
      <Glass style={{ width: PANEL_W, padding: "64px 68px 56px" }}>
        <Icon name="quote" size={76} color={rgba(COLORS.orange.secondary, 0.85)} filled />
        <div style={{ display: "flex", marginTop: 30, fontSize: 48, lineHeight: 1.4, color: WHITE(0.94) }}>
          {review.text}
        </div>
        {review.date || rating != null ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 44 }}>
            {review.date ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                <Icon name="calendar" size={34} color={WHITE(0.5)} />
                <div style={{ display: "flex", marginLeft: 14, fontSize: 34, color: WHITE(0.62) }}>
                  {formatStoryDate(review.date)}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex" }} />
            )}
            {rating != null ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                <Icon name="star" size={38} color={YELLOW_300} filled />
                <div style={{ display: "flex", marginLeft: 12, fontSize: 40, fontWeight: 700, color: YELLOW_300 }}>
                  {formatUserRating(rating)}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Glass>
    </SceneBody>
  );
}

function DetailRow({ icon, label, children, first = false }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: first ? 0 : 40 }}>
      <div style={{ display: "flex", width: 64, paddingTop: 6 }}>
        <Icon name={icon} size={42} color={WHITE(0.55)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: WHITE(0.5) }}>
          {label}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 8, fontSize: 44, fontWeight: 700, color: WHITE(0.94) }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Detalles: año, duración o temporadas, dirección/creación, géneros y sinopsis. */
export function DetailsScene({ card, details, fonts }) {
  const rows = [];
  if (details.year) rows.push({ icon: "calendar", label: "Año", value: String(details.year) });
  if (card.type === "tv" && details.seasons) {
    const seasons = `${details.seasons} ${details.seasons === 1 ? "temporada" : "temporadas"}`;
    rows.push({
      icon: "tv",
      label: "Temporadas",
      value: details.episodes ? `${seasons} · ${details.episodes} episodios` : seasons,
    });
  } else if (details.runtime) {
    rows.push({ icon: "clock", label: "Duración", value: formatRuntime(details.runtime) });
  }
  if (details.people.length) {
    rows.push({ icon: card.type === "tv" ? "users" : "clapperboard", label: details.peopleLabel || "Dirección", value: details.people.join(" · ") });
  }

  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="info" label="Detalles" />
      <Glass style={{ width: PANEL_W, padding: "60px 64px" }}>
        {rows.map((row, index) => (
          <DetailRow key={row.label} icon={row.icon} label={row.label} first={index === 0}>
            {row.value}
          </DetailRow>
        ))}
        {details.genres.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: rows.length ? 44 : 0 }}>
            {details.genres.map((genre) => (
              <div
                key={genre}
                style={{
                  display: "flex",
                  padding: "12px 30px",
                  marginRight: 16,
                  marginBottom: 14,
                  borderRadius: 50,
                  fontSize: 34,
                  fontWeight: 700,
                  color: WHITE(0.9),
                  backgroundColor: WHITE(0.1),
                }}
              >
                {genre}
              </div>
            ))}
          </div>
        ) : null}
        {details.overview ? (
          <div style={{ display: "flex", marginTop: rows.length || details.genres.length ? 30 : 0, fontSize: 38, lineHeight: 1.42, color: WHITE(0.74) }}>
            {details.overview}
          </div>
        ) : null}
      </Glass>
    </SceneBody>
  );
}

