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
  SHADE,
  SIDE_MARGIN,
  W,
  px,
  rgba,
} from "@/lib/share/ogKit";

// Zona de contenido de las secciones: bajo la cabecera y con aire abajo.
const HEADER_TITLE_TOP = BRAND.top + BRAND.height + 44;
const HEADER_TITLE_MAX_H = 180;
const HEADER_TITLE_MAX_W = 760;
export const CONTENT_TOP = HEADER_TITLE_TOP + HEADER_TITLE_MAX_H + 70;
export const CONTENT_BOTTOM = H - 110;
export const PANEL_W = W - SIDE_MARGIN * 2;

const WHITE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
const YELLOW_300 = rgba(COLORS.yellow.secondary, 1);
const GREEN_300 = rgba(COLORS.green.secondary, 1);
// Halo de las cifras grandes: el `glow` de los botones activos (LiquidButton).
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
export function SceneBody({ fonts, children }) {
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
export function Glass({ children, style }) {
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
export function Eyebrow({ icon, label, color = WHITE(0.9) }) {
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

export function Caption({ children, style }) {
  return (
    <div style={{ display: "flex", marginTop: 18, fontSize: 52, fontWeight: 700, color: WHITE(0.82), ...style }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- capas

// Fondo de las secciones: la PORTADA del título, reconocible. Antes era la
// misma portada difuminada a 32px y atenuada al 62%, con un velo encima: un
// fondo oscuro casi liso en el que no se distinguía la imagen.
const STORY_POSTER_FILTER = "blur(3px) brightness(0.72) saturate(1.1)";
// Más oscuro arriba (marca y título) y abajo, y más claro en el centro, donde
// los paneles de cristal ya dan contraste y la portada luce.
const STORY_SCRIM = `linear-gradient(180deg, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.42) 20%, ${rgba(SHADE, 0.3)} 48%, ${rgba(SHADE, 0.42)} 76%, rgba(0,0,0,0.72) 100%)`;

/** Fondo de las secciones: la portada del título con un velo para leer encima. */
export function StoryBackdrop({ poster, ambient, ambientBase }) {
  return (
    <Layer style={{ background: "#0a0a0a" }}>
      {poster ? (
        <>
          {/* Base opaca (la portada mínima, ya borrosa al ampliarse): donde el
              desenfoque de encima pierde opacidad en el borde del lienzo asoma
              ella y no el negro. Ver AMBIENT_BLUR. */}
          {ambientBase ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ambientBase.src}
              width={W}
              height={H}
              alt=""
              style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", filter: "brightness(0.72) saturate(1.1)" }}
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster.src}
            width={W}
            height={H}
            alt=""
            style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", filter: STORY_POSTER_FILTER }}
          />
        </>
      ) : (
        // Sin portada a tiempo: el fondo ambiental de siempre.
        <AmbientBackground ambient={ambient} ambientBase={ambientBase} />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: poster
            ? STORY_SCRIM
            : `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, ${rgba(SHADE, 0.42)} 28%, ${rgba(SHADE, 0.5)} 100%)`,
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

function episodeCode(season, episode) {
  return `T${season} · E${String(episode).padStart(2, "0")}`;
}

function ResumeBar({ percent, height = 22, style }) {
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height, backgroundColor: WHITE(0.12), overflow: "hidden", ...style }}>
      <div
        style={{
          display: "flex",
          width: `${percent}%`,
          height: "100%",
          borderRadius: height,
          backgroundImage: `linear-gradient(90deg, ${rgba(COLORS.green.rgb, 0.85)}, ${GREEN_300})`,
          boxShadow: `0 0 22px ${rgba(COLORS.green.rgb, 0.6)}`,
        }}
      />
    </div>
  );
}

// «Continuar viendo»: lo que lleva visto del título (o del episodio en curso),
// con la misma píldora «Viendo» y barra verde que la ficha.
function ResumeBlock({ resume, style }) {
  return (
    <Glass style={{ width: PANEL_W, padding: "40px 56px 46px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 24px",
              borderRadius: 40,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#000000",
              backgroundColor: rgba(COLORS.green.rgb, 1),
            }}
          >
            <Icon name="play" size={26} color="#000000" filled />
            <div style={{ display: "flex", marginLeft: 10 }}>Viendo</div>
          </div>
          {resume.season != null ? (
            <div style={{ display: "flex", marginLeft: 22, fontSize: 38, fontWeight: 700, color: WHITE(0.86) }}>
              {episodeCode(resume.season, resume.episode)}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: WHITE(0.95) }}>{resume.percent}</div>
          <div style={{ display: "flex", marginLeft: 6, fontSize: 34, fontWeight: 700, color: GREEN_300 }}>%</div>
        </div>
      </div>
      <ResumeBar percent={resume.percent} style={{ marginTop: 30 }} />
    </Glass>
  );
}

/**
 * Visionados: veces vista y fechas (películas) o progreso (series), y lo que
 * lleva visto si el título está en «Continuar viendo».
 */
export function PlaysScene({ plays, fonts }) {
  const resume = plays.resume || null;

  // Película a medias que aún no cuenta como vista: el porcentaje es lo único
  // que hay que contar, y se cuenta en grande.
  if (plays.percent == null && !plays.count && resume) {
    return (
      <SceneBody fonts={fonts}>
        <Eyebrow icon="play" label="Viendo" color={GREEN_300} />
        <BigFigure value={String(resume.percent)} suffix="%" color={GREEN_300} glow={GREEN_GLOW} />
        <Caption>{resume.season != null ? `de ${episodeCode(resume.season, resume.episode)}` : "de la película vista"}</Caption>
        {/* Solo la barra: repetir aquí la píldora y la cifra decía dos veces lo mismo. */}
        <Glass style={{ width: PANEL_W, marginTop: 64, padding: "52px 60px" }}>
          <ResumeBar percent={resume.percent} height={30} />
        </Glass>
      </SceneBody>
    );
  }

  if (plays.percent != null) {
    return (
      <SceneBody fonts={fonts}>
        <Eyebrow icon="tv" label="Progreso" color={GREEN_300} />
        <BigFigure value={String(plays.percent)} suffix="%" color={GREEN_300} glow={GREEN_GLOW} />
        <Caption>{plays.season ? "de la temporada vista" : "de la serie vista"}</Caption>
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
        {resume ? <ResumeBlock resume={resume} style={{ marginTop: 28 }} /> : null}
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
          {/* Con el bloque de «Viendo» debajo, una fecha menos para que quepa. */}
          {plays.dates.slice(0, resume ? 3 : 4).map((date, index) => (
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
      {resume ? <ResumeBlock resume={resume} style={{ marginTop: plays.dates.length ? 28 : 64 }} /> : null}
    </SceneBody>
  );
}

/**
 * Episodios vistos de una serie: código, nombre, nota de IMDb de cada uno y la
 * del usuario (solo de los vistos). Con más de los que caben, los últimos y un
 * «+N más».
 */
export function EpisodesScene({ episodes, assets, fonts }) {
  const { items, more } = episodes;
  const hasMine = items.some((item) => item.mine != null);
  // Con muchas filas, más compactas para que la lista no toque el borde.
  const rowSize = items.length > 10 ? 36 : 42;
  const rowPad = items.length > 10 ? 12 : 20;
  // IMDb siempre con un decimal («9.0»), como en su web; la nota propia, entera
  // si lo es («10»).
  const imdbScore = (value) => (value == null ? "–" : value.toFixed(1));
  const myScore = (value) => (value == null ? "–" : value.toFixed(1).replace(/\.0$/, ""));

  return (
    <SceneBody fonts={fonts}>
      <Glass style={{ width: PANEL_W, padding: "40px 48px 34px" }}>
        {/* MISMO TÍTULO QUE EL MODAL DE EPISODIOS VISTOS: «Episodios vistos»
            en negrita y sin versalitas, en la cabecera de la lista (no en la
            píldora de las otras secciones, que lo escribía en mayúsculas y se
            leía como otro título). A su derecha, las columnas de notas. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 18 }}>
          <div style={{ display: "flex", fontSize: 50, fontWeight: 700, color: "#ffffff", letterSpacing: -0.5 }}>
            Episodios vistos
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", width: 130, justifyContent: "center" }}>
            {assets?.imdb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assets.imdb} width={74} height={37} alt="" style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: YELLOW_300 }}>IMDb</div>
            )}
          </div>
          {hasMine ? (
            <div style={{ display: "flex", width: 130, justifyContent: "center", alignItems: "center" }}>
              <Icon name="star" size={34} color={YELLOW_300} filled />
            </div>
          ) : null}
          </div>
        </div>
        {items.map((item, index) => (
          <div
            key={`${item.season}-${item.episode}`}
            style={{
              display: "flex",
              alignItems: "center",
              padding: `${rowPad}px 0`,
              borderTop: `1px solid ${WHITE(index ? 0.08 : 0.14)}`,
            }}
          >
            <div style={{ display: "flex", width: 210, fontSize: rowSize - 6, fontWeight: 700, color: WHITE(0.55) }}>
              {episodeCode(item.season, item.episode)}
            </div>
            <div
              style={{
                display: "block",
                flex: 1,
                minWidth: 0,
                fontSize: rowSize,
                fontWeight: 700,
                color: WHITE(0.92),
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.name || `Episodio ${item.episode}`}
            </div>
            <div style={{ display: "flex", width: 130, justifyContent: "center", fontSize: rowSize, fontWeight: 700, color: item.imdb != null ? WHITE(0.9) : WHITE(0.35) }}>
              {imdbScore(item.imdb)}
            </div>
            {hasMine ? (
              <div style={{ display: "flex", width: 130, justifyContent: "center", fontSize: rowSize, fontWeight: 700, color: item.mine != null ? YELLOW_300 : WHITE(0.35) }}>
                {myScore(item.mine)}
              </div>
            ) : null}
          </div>
        ))}
        {more > 0 ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 18, fontSize: 32, fontWeight: 700, color: WHITE(0.6) }}>
            {`+ ${more} ${more === 1 ? "episodio visto" : "episodios vistos"} más`}
          </div>
        ) : null}
      </Glass>
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

// Celda de una tarjeta de la ficha: icono, etiqueta y valor. Las anchas
// (`wide`) ocupan la fila; el resto va de dos en dos, como en la ficha.
function FactCell({ fact, size }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: fact.wide ? "100%" : "50%",
        paddingRight: fact.wide ? 0 : 28,
        marginBottom: size.gap,
      }}
    >
      <div style={{ display: "flex", width: size.icon + 22, paddingTop: 4, flexShrink: 0 }}>
        <Icon name={fact.icon} size={size.icon} color={WHITE(0.55)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: size.label, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: WHITE(0.5) }}>
          {fact.label}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 6, fontSize: size.value, lineHeight: 1.22, fontWeight: 700, color: WHITE(0.94) }}>
          {fact.value}
        </div>
      </div>
    </div>
  );
}

// Tamaño de las celdas según cuántas filas haya que meter.
function factSize(facts) {
  let rows = 0;
  let half = 0;
  for (const fact of facts) {
    if (fact.wide) {
      rows += half ? 2 : 1;
      half = 0;
    } else if (half) {
      rows += 1;
      half = 0;
    } else {
      half = 1;
    }
  }
  rows += half;
  return rows > 4
    ? { rows, icon: 36, label: 23, value: 38, gap: 34 }
    : { rows, icon: 40, label: 25, value: 42, gap: 40 };
}

export function FactGrid({ facts }) {
  const size = factSize(facts);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginBottom: -size.gap }}>
      {facts.map((fact) => (
        <FactCell key={fact.label} fact={fact} size={size} />
      ))}
    </div>
  );
}

function GenreChips({ genres, style }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...style }}>
      {genres.map((genre) => (
        <div
          key={genre}
          style={{
            display: "flex",
            padding: "12px 30px",
            marginRight: 16,
            marginBottom: 14,
            borderRadius: 50,
            fontSize: 32,
            fontWeight: 700,
            color: WHITE(0.9),
            backgroundColor: WHITE(0.1),
          }}
        >
          {genre}
        </div>
      ))}
    </div>
  );
}

// Corta un texto largo en el último límite de palabra (la sinopsis ya llega
// recortada; aquí se ajusta al hueco que dejan las celdas).
export function clip(value, max) {
  if (!value || value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/**
 * Celdas de la tarjeta «Detalles» de la ficha: título original, fechas,
 * formato, duración y estado. Lo que no hay, no se pinta.
 */
export function detailsFacts(card, details) {
  const facts = details.facts || {};
  const tv = card.type === "tv";
  const list = [];
  const push = (value, fact) => {
    if (value) list.push({ ...fact, value });
  };
  push(facts.originalTitle, { icon: tv ? "tv" : "film", label: "Título original", wide: true });
  push(facts.release || (details.year ? String(details.year) : null), {
    icon: "calendar",
    label: facts.release ? (tv ? "Inicio" : "Estreno") : "Año",
  });
  if (tv) push(facts.end, { icon: "calendar", label: details.endLabel || "Última emisión" });
  let format = facts.format;
  if (!format && tv && details.seasons) {
    format = `${details.seasons} Temp.${details.episodes ? ` · ${details.episodes} Eps.` : ""}`;
  }
  if (tv) push(format, { icon: "layers", label: "Formato" });
  push(facts.duration || (!tv && details.runtime ? formatRuntime(details.runtime) : null), { icon: "clock", label: "Duración" });
  push(facts.status, { icon: "badgeCheck", label: "Estado" });
  return list;
}

/**
 * Celdas de la tarjeta «Producción»: dirección o creadores, premios,
 * presupuesto y recaudación (películas) o canal (series), y productoras.
 */
export function productionFacts(card, details) {
  const facts = details.facts || {};
  const tv = card.type === "tv";
  const list = [];
  const push = (value, fact) => {
    if (value) list.push({ ...fact, value });
  };
  push(details.people?.length ? details.people.join(" · ") : null, {
    icon: tv ? "users" : "clapperboard",
    label: details.peopleLabel || (tv ? "Creadores" : "Director"),
    wide: true,
  });
  if (tv) {
    push(facts.network, { icon: "monitorPlay", label: "Canal", wide: true });
  } else {
    push(facts.budget, { icon: "dollar", label: "Presupuesto" });
    push(facts.revenue, { icon: "trending", label: "Recaudación" });
  }
  push(facts.awards, { icon: "trophy", label: "Premios", wide: true });
  push(facts.production, { icon: "building", label: "Producción", wide: true });
  return list;
}

/** Detalles: la tarjeta «Detalles» de la ficha, con géneros y sinopsis. */
export function DetailsScene({ card, details, fonts }) {
  const facts = detailsFacts(card, details);
  const { rows } = factSize(facts);
  // Cuantas más filas, menos sinopsis: todo tiene que caber en la sección.
  const overview = clip(details.overview, rows >= 4 ? 200 : 260);

  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="info" label="Detalles" />
      <Glass style={{ width: PANEL_W, padding: "56px 60px" }}>
        {facts.length ? <FactGrid facts={facts} /> : null}
        {details.genres.length ? (
          <GenreChips genres={details.genres} style={{ marginTop: facts.length ? 44 : 0 }} />
        ) : null}
        {overview ? (
          <div style={{ display: "flex", marginTop: facts.length || details.genres.length ? 28 : 0, fontSize: 36, lineHeight: 1.42, color: WHITE(0.74) }}>
            {overview}
          </div>
        ) : null}
      </Glass>
    </SceneBody>
  );
}

/** Producción: la tarjeta «Producción» de la ficha. */
export function ProductionScene({ card, details, fonts }) {
  const facts = productionFacts(card, details);
  return (
    <SceneBody fonts={fonts}>
      <Eyebrow icon="building" label="Producción" />
      <Glass style={{ width: PANEL_W, padding: "56px 60px" }}>
        <FactGrid facts={facts} />
      </Glass>
    </SceneBody>
  );
}

