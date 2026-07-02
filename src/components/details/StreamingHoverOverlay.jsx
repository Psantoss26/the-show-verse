"use client";

import OptimizedImage from "@/components/OptimizedImage";
import { Play as PlayIcon, CheckCheck } from "lucide-react";
import { platformWordmark } from "@/lib/streaming/platformWordmark";

// Overlay al hover sobre una portada. Se coloca DENTRO de un contenedor que
// expone el grupo `still` (AnimatedPosterFrame lo hace, o se añade `group/still`
// al marco). Aparece solo al pasar el ratón (desktop) y queda inerte en móvil.
//
// - Arriba: "Ver en" + wordmark de la plataforma (o su nombre si no hay *-text.png).
// - Centro: botón play con el COLOR de la plataforma (netflix rojo, prime azul,
//   crunchyroll naranja, max morado, disney azul oscuro).
// - Abajo: chip "Visto" si `watched`.
//
// El overlay se divide en DOS partes para que el diseño quede integrado con la
// imagen (se inclina con ella) PERO sea clicable de forma fiable:
//
//   - part="visual" (por defecto): SOLO el diseño, sin eventos. Va DENTRO del
//     marco 3D, así se inclina con la imagen y queda integrado.
//   - part="hit": SOLO la zona clicable (transparente). Va en una capa FIJA
//     fuera del marco 3D. Como no se mueve con la inclinación, el clic siempre
//     se registra (un elemento que se mueve entre mousedown y mouseup no dispara
//     `click`). El botón play está en el centro = eje de giro, por lo que la
//     zona fija coincide siempre con el botón visible.
//
// `mode`:
//   - "cover" (por defecto): TODA la portada es clicable → abre el deeplink.
//     Ideal cuando la portada no tiene otra interacción (episodios, temporadas).
//   - "button": SOLO el botón play abre la plataforma; el resto deja pasar los
//     clics (para portadas con interacción propia, p. ej. el póster de detalles
//     que cambia entre póster/backdrop por las zonas laterales).
export default function StreamingHoverOverlay({
  provider,
  watched = false,
  mode = "cover",
  part = "visual",
}) {
  if (!provider?.url || typeof provider.url !== "string") return null;

  const wm = platformWordmark(provider);
  const name = provider.provider_name || wm.name;

  // ---- Capa CLICABLE (fija, fuera del marco 3D) ----
  if (part === "hit") {
    const linkAttrs = {
      href: provider.url,
      target: "_blank",
      rel: "noreferrer",
      "aria-label": `Reproducir en ${name}`,
      // Evita que el marco 3D capture el puntero al pulsar (setPointerCapture),
      // que podría anular el clic del enlace. El tilt sigue con onPointerMove
      // (el evento sigue burbujeando al contenedor del marco).
      onPointerDown: (event) => event.stopPropagation(),
    };

    if (mode === "button") {
      // Zona central (sobre el botón play, en el eje de giro) enlaza; el resto
      // deja pasar los clics a las flechas laterales de cambio de imagen.
      return (
        <a
          {...linkAttrs}
          className="pointer-events-none group-hover/still:pointer-events-auto absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none"
        />
      );
    }

    // cover: toda la portada enlaza.
    return (
      <a
        {...linkAttrs}
        className="pointer-events-none group-hover/still:pointer-events-auto absolute inset-0 block focus-visible:outline-none"
      />
    );
  }

  // ---- Capa VISUAL (dentro del marco 3D, integrada, sin eventos) ----
  const playVisualClass = `absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 scale-90 items-center justify-center rounded-full text-white ring-1 ring-white/20 transition-transform duration-300 group-hover/still:scale-100 sm:h-24 sm:w-24 ${wm.color.className}`;
  const playStyle = { boxShadow: `0 12px 44px -8px ${wm.color.glow}` };

  return (
    <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/still:opacity-100">
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/40" />

      {/* Arriba: "Ver en" + wordmark (o nombre) */}
      <div className="absolute inset-x-0 top-0 flex -translate-y-2 items-center justify-center gap-2 px-4 pt-3 transition-transform duration-300 group-hover/still:translate-y-0">
        <span className="text-base font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-lg">
          Ver en
        </span>
        {wm.wordmarkSrc ? (
          <OptimizedImage
            src={wm.wordmarkSrc}
            alt={wm.name}
            className="h-5 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:h-6"
          />
        ) : (
          <span className="text-base font-black uppercase tracking-wide text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-lg">
            {wm.name}
          </span>
        )}
      </div>

      {/* Centro: botón play con el color de la plataforma */}
      <div className={playVisualClass} style={playStyle}>
        <PlayIcon className="h-9 w-9 translate-x-0.5 fill-current sm:h-11 sm:w-11" />
      </div>

      {/* Abajo: "Visto" (solo si procede) */}
      {watched && (
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center px-4 pb-3 transition-transform duration-300 group-hover/still:translate-y-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1 text-xs font-black uppercase tracking-wider text-white backdrop-blur-md">
            <CheckCheck className="h-3.5 w-3.5" /> Visto
          </span>
        </div>
      )}
    </div>
  );
}
