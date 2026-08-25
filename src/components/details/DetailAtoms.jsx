"use client";

import OptimizedImage from "@/components/OptimizedImage";
import { motion } from "framer-motion";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import {
  LIQUID_GLASS_BAR,
  LIQUID_GLASS_SURFACE_CARD,
} from "@/lib/ui/liquidGlass";

// TARJETA DE METADATO (Título original, Estreno, Duración, Género…). Es la
// pieza más repetida de la ficha: las filas de Detalles y Producción, las de
// temporada y episodio y las de la ficha rápida del dashboard son todas esta.
//
// UN SOLO ACABADO, el de DetailsSectionMenu: mismo cristal, `rounded-2xl` y las
// mismas capas ópticas. Antes había dos —el cristal completo si le
// pasabas `liquidGlass` y, si no, un vidrio pobre de `bg-black/[0.04]` con 6px
// de desenfoque—, y quién recibía cuál dependía de quién montara la tarjeta:
// DetailsInfoTabs pedía el bueno y temporada, episodio y el modal del dashboard
// se quedaban con el pobre. Eran las MISMAS tarjetas con dos aspectos, así que
// la bifurcación desaparece en vez de duplicarse.
//
// LA ÚNICA DIFERENCIA CON LA PIEZA DE REFERENCIA ES LA SOMBRA, y está medida:
// con la de DetailsSectionMenu (`LIQUID_GLASS_SURFACE`), estas tarjetas apiladas
// en la columna móvil rellenaban de sombra los 12px de hueco entre ellas y el
// grupo dejaba de leerse como piezas sueltas sobre el cartel para parecer un
// panel oscuro con separadores. `LIQUID_GLASS_SURFACE_CARD` es el mismo cristal
// —mismo tinte, desenfoque, saturación y capas ópticas— sin esa elevación.
export function VisualMetaCard({
  icon: Icon,
  iconContent = null,
  label,
  value,
  isLoading = false,
  className = "",
}) {
  // Sin valor NO se pinta la tarjeta, ni siquiera cargando. Antes `isLoading`
  // dibujaba el cristal vacío con una barra pulsando dentro, y al recargar la
  // ficha se veía la fila de tarjetas como cajas vacías. Es preferible que
  // aparezcan ya con su contenido.
  if (!value) return null;

  return (
    <div
      className={`flex h-full items-center gap-3.5 rounded-2xl p-3.5 pl-4 ${LIQUID_GLASS_SURFACE_CARD} ${className}`}
    >
      <LiquidGlassOpticalLayers />

      <motion.div
      // SIN entrada propia: el contenido aparece A LA VEZ que su cristal.
      // Animarlo desde opacity 0 dejaba la cáscara visible y vacía durante ese
      // cuarto de segundo, que es justo lo que se veía al cargar la ficha.
        initial={false}
        className="relative z-10 shrink-0 text-zinc-300"
      >
        {iconContent || (Icon ? <Icon className="w-5 h-5" /> : null)}
      </motion.div>

      <motion.div
        initial={false}
        className="relative z-10 flex min-w-0 flex-1 flex-col"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">
          {label}
        </span>
        {isLoading ? (
          <span
            aria-label={`Cargando ${label.toLowerCase()}`}
            className="mt-1 block h-3.5 w-20 animate-pulse rounded-full bg-white/15"
          />
        ) : (
          <span className="text-sm font-bold text-white leading-tight whitespace-normal break-words">
            {value}
          </span>
        )}
      </motion.div>
    </div>
  );
}

export const SectionTitle = ({ title, icon: Icon, className = "" }) => (
  <div
    className={`flex items-center gap-3 mb-3 sm:mb-5 md:mb-6 border-l-4 border-yellow-500 pl-4 py-1 ${className}`}
  >
    {Icon && <Icon className="text-yellow-500 w-6 h-6" />}
    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">
      {title}
    </h2>
  </div>
);

export const MetaItem = ({
  icon: Icon,
  label,
  value,
  colorClass = "text-gray-400",
  className = "",
}) => {
  if (!value) return null;
  return (
    <div
      className={`min-w-0 max-w-full flex items-center gap-3 bg-neutral-800/40 p-3 rounded-xl
      border border-neutral-700/50 hover:bg-neutral-800 transition-colors h-[68px] md:h-[72px] ${className}`}
    >
      <div
        className={`p-2 rounded-lg bg-neutral-900/80 shrink-0 ${colorClass}`}
      >
        <Icon size={18} />
      </div>
      <div className="flex flex-col min-w-0 overflow-hidden">
        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider truncate">
          {label}
        </span>
        <span
          className="text-sm text-gray-200 font-medium leading-tight truncate whitespace-nowrap"
          title={typeof value === "string" ? value : ""}
        >
          {value}
        </span>
      </div>
    </div>
  );
};

export const toneStyles = {
  tmdb: "border-emerald-500/25 bg-emerald-500/10",
  trakt: "border-red-500/25 bg-red-500/10",
  imdb: "border-yellow-500/25 bg-yellow-500/10",
  rt: "border-rose-500/25 bg-rose-500/10",
  mc: "border-lime-500/25 bg-lime-500/10",
  jw: "border-emerald-500/25 bg-emerald-500/10",
  neutral: "border-white/10 bg-white/5",
};

export function ScoreBadge({
  tone = "neutral",
  logo,
  alt,
  label,
  value,
  suffix,
  sublabel,
  subvalue,
  href,
  title,
}) {
  if (value == null || value === "") return null;

  const Box = ({ children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title || label}
        className="group"
      >
        {children}
      </a>
    ) : (
      children
    );

  return (
    <Box>
      <div
        className={`shrink-0 rounded-2xl border ${toneStyles[tone] || toneStyles.neutral}
        px-3 py-2 flex items-center gap-2 transition hover:bg-white/10`}
      >
        {logo ? (
          <OptimizedImage
            src={logo}
            alt={alt || label}
            className="h-3 w-auto opacity-90"
          />
        ) : null}

        <div className="leading-none">
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-extrabold text-white">
              {value}
              {suffix ? (
                <span className="text-[11px] text-zinc-300 ml-0.5">
                  {suffix}
                </span>
              ) : null}
            </span>
            {subvalue != null && (
              <span className="text-[11px] text-zinc-400 ml-1">{subvalue}</span>
            )}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            {sublabel || label}
          </div>
        </div>
      </div>
    </Box>
  );
}

export function StatChip({ icon: Icon, label, value }) {
  if (value == null) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-zinc-200" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-white leading-none">
          {value}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {label}
        </div>
      </div>
    </div>
  );
}

// MENÚ DE PESTAÑAS de la ficha (Detalles · Producción · Sinopsis · Plataformas
// · Premios). Compartido por la ficha completa, la ficha rápida del dashboard,
// temporadas y episodios: cambiarlo aquí lo cambia en las cuatro.
//
// EL PROBLEMA: era texto suelto sobre la imagen —la activa en blanco y las demás
// en `text-zinc-500`—. Sobre un backdrop OSCURO se leía, pero sobre un cartel
// claro ese gris medio quedaba a un paso del fondo y las pestañas no
// seleccionadas desaparecían: solo se veía la activa, así que el menú no parecía
// un menú y no había forma de saber que había más secciones.
//
// DOS ACABADOS, UNO POR VIEWPORT, y el corte es `sm` (640px) porque es el mismo
// que usa DetailsClient para decidir entre su diseño móvil y el de escritorio:
//
//   MÓVIL: cristal, y es EXACTAMENTE el de DetailsSectionMenu —el menú de
//   secciones que va justo debajo en la misma pantalla—: mismo token
//   (`LIQUID_GLASS_BAR`), mismo `rounded-2xl`, las mismas capas ópticas y el
//   mismo `transform-gpu`. Los dos menús se ven a la vez, así que cualquier
//   desviación (un tinte más oscuro, otro radio) se lee como un error, no como
//   una variante. Por eso reutiliza el token y NO uno propio.
//
//   ESCRITORIO: la tira de siempre —sin fondo, con la línea inferior— porque el
//   menú vive dentro de una columna ya delimitada por el scoreboard de arriba y
//   las tarjetas de abajo, y un cristal más ahí solo añade peso.
//
// CÓMO SE APAGA EL CRISTAL EN `sm`, y por qué así: cuatro utilidades que anulan
// una PROPIEDAD entera cada una (`bg-transparent`, `bg-none`,
// `[backdrop-filter:none]`, `shadow-none`). No enumeran las clases del token, así
// que si mañana LIQUID_GLASS_BAR cambia de tinte o de desenfoque, el escritorio
// sigue apagándolo entero sin tocar nada aquí.
//
// EL CRISTAL VA EN EL PROPIO CONTENEDOR, no en una capa hija, y esto NO es
// indiferente: `isolate` convierte al contenedor en backdrop root, así que el
// `backdrop-filter` de un hijo no tendría fondo que muestrear y el desenfoque no
// se aplicaría. Medido en Chromium con `backdrop-filter: invert(1)`: en la capa
// hija no invierte nada; en el contenedor sí. (Dentro del bloque móvil de
// DetailsClient tampoco surte efecto, porque ese bloque ya es backdrop root por
// su `transform-gpu` + `will-change` — ahí el cristal lo sostienen el tinte, el
// degradado y la sombra, y a DetailsSectionMenu le pasa exactamente lo mismo.)
//
// LO QUE SOSTIENE LA LEGIBILIDAD EN AMBOS, ya sin depender del fondo:
//   1) COLOR: activa en blanco puro, inactivas en `text-white/70`. Blanco al 70%
//      es MÁS claro que el `zinc-500` anterior y a la vez se distingue del 100%
//      de la activa, así que sube el contraste sin borrar la jerarquía.
//   2) HALO OSCURO en todas: el `drop-shadow` anterior (alfa 0.4) apenas
//      despegaba las letras. Dos sombras —una cerrada para el filo y otra
//      abierta para el halo— dibujan un borde oscuro alrededor del texto, y eso
//      es lo que hace legible el blanco sobre un cartel claro. En móvil es
//      además lo que compensa que este cristal tiña menos que un panel opaco.
//   3) SUBRAYADO ÁMBAR, intacto: sigue siendo el indicador principal y conserva
//      su animación compartida (`layoutId`).
export function DetailsTabsMenu({
  tabs,
  activeTab,
  onChangeTab,
  layoutId = "activeTabIndicator",
  swipeHandlers = {},
}) {
  return (
    <div
      {...swipeHandlers}
      className={`relative isolate mb-4 flex w-full touch-pan-y flex-wrap items-center gap-x-6 gap-y-0 overflow-hidden rounded-2xl px-4 py-1 max-sm:transform-gpu md:gap-x-8 ${LIQUID_GLASS_BAR} sm:touch-auto sm:rounded-none sm:border-b sm:border-white/10 sm:bg-transparent sm:bg-none sm:px-2 sm:py-0 sm:shadow-none sm:[backdrop-filter:none]`}
    >
      {/* Capas ópticas del cristal, las mismas de DetailsSectionMenu. Solo móvil:
          en escritorio no hay cristal que rematar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] sm:hidden"
      >
        <LiquidGlassOpticalLayers />
      </div>

      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChangeTab(tab.id)}
          className={`relative z-10 rounded-md px-0.5 pb-2 pt-2 text-xs font-bold uppercase tracking-wider transition-colors duration-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_10px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 sm:pt-0 md:text-sm ${
            activeTab === tab.id
              ? "text-white font-extrabold"
              : "text-white/70 hover:text-white"
          }`}
        >
          <span className="relative z-10">{tab.label}</span>

          {activeTab === tab.id && (
            <motion.div
              layoutId={layoutId}
              className="absolute bottom-0.5 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full shadow-[0_1.5px_6px_rgba(245,158,11,0.5)] z-20 sm:bottom-0"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
