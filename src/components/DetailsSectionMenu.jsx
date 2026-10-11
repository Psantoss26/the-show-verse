"use client";

import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { useDetailsStaticMotion } from "@/components/details/AnimatedSection";
import { LIQUID_GLASS_SURFACE } from "@/lib/ui/liquidGlass";

export default function DetailsSectionMenu({
  items = [],
  activeId,
  onChange,
  className = "",
  maxWidthClass = "max-w-[1400px]",
  colorScheme = "yellow",
  showLabelsOnMobile = false,
  // SOLO ICONOS, sin rótulos, independientemente del ancho de VENTANA.
  //
  // `showLabelsOnMobile` no sirve para esto: su alternativa es `hidden
  // sm:inline`, que mira el viewport. En la ficha de teléfono del drawer el
  // ancho lo pone el panel (320-639px) dentro de una ventana de escritorio, así
  // que ese `sm:` casa siempre y los rótulos volvían. Con diez secciones en esa
  // anchura cada botón se encoge por debajo de su texto y, como lleva
  // `overflow-hidden`, lo recorta a media palabra.
  iconsOnly = false,
}) {
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter(Boolean) : []),
    [items],
  );

  const containerRef = useRef(null);
  const innerRef = useRef(null);
  // Indicador de la sección activa (fondo + subrayado): UN solo elemento que se
  // desliza por CSS hasta el botón activo. Antes era un `layoutId` de framer
  // por botón: en cada cambio de sección framer medía el layout y escribía
  // estilos en el hilo principal durante todo el muelle (~0,5 s). Como la
  // sección activa cambia al cruzar cada una mientras se desplaza la ficha, el
  // menú estaba animándose casi siempre en pleno scroll y lo dejaba a tirones
  // (medido en la ficha de teléfono del drawer). Ahora se lee la posición del
  // botón al cambiar y el resto lo hace una transición de `transform`.
  const indicatorRef = useRef(null);
  const buttonRefs = useRef(new Map());
  // La ficha recuperada al volver atrás se pinta estática (sin la entrada).
  const isStaticDetails = useDetailsStaticMotion();
  const shouldReduceMotion = useReducedMotion() || isStaticDetails;

  const [scale, setScale] = useState(1);
  const [fits, setFits] = useState(true);

  const colors = useMemo(() => {
    if (colorScheme === "indigo") {
      return {
        focusRing: "focus-visible:ring-indigo-500/50",
        activeBg:
          "bg-black/20 from-indigo-500/40 via-white/10 to-indigo-500/10 shadow-[0_10px_30px_-10px_rgba(129,140,248,0.55)]",
        iconActive:
          "text-indigo-300 drop-shadow-[0_0_6px_rgba(129,140,248,0.75)]",
        badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
        indicator:
          "from-indigo-500 via-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(129,140,248,0.65)]",
      };
    }

    if (colorScheme === "emerald") {
      return {
        focusRing: "focus-visible:ring-emerald-500/50",
        activeBg:
          "bg-black/20 from-emerald-500/40 via-white/10 to-emerald-500/10 shadow-[0_10px_30px_-10px_rgba(52,211,153,0.5)]",
        iconActive:
          "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]",
        badgeBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        indicator:
          "from-emerald-500 via-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
      };
    }
    return {
      focusRing: "focus-visible:ring-yellow-500/50",
      activeBg:
        "bg-black/20 from-yellow-500/40 via-white/10 to-yellow-500/10 shadow-[0_10px_30px_-10px_rgba(250,204,21,0.5)]",
      iconActive: "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]",
      badgeBg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      indicator:
        "from-yellow-500 via-yellow-400 to-orange-500 shadow-[0_0_8px_rgba(250,204,21,0.5)]",
    };
  }, [colorScheme]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const available = el.clientWidth || 0;
        const needed = inner.scrollWidth || 0;

        if (!available || !needed) {
          setFits(true);
          setScale(1);
        } else if (needed <= available) {
          setFits(true);
          setScale(1);
        } else {
          setFits(false);
          setScale(Math.min(1, available / needed));
        }
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(inner);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [safeItems.length]);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const button = activeId != null ? buttonRefs.current.get(activeId) : null;
    if (!indicator) return undefined;
    if (!button) {
      indicator.style.visibility = "hidden";
      return undefined;
    }
    // offsetLeft/Top son coordenadas de maquetación, sin el `scale` con el que
    // se encoge la fila: el indicador vive dentro de la misma fila escalada.
    const place = () => {
      indicator.style.visibility = "visible";
      indicator.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`;
      indicator.style.width = `${button.offsetWidth}px`;
      indicator.style.height = `${button.offsetHeight}px`;
    };
    place();
    // La primera colocación es directa; a partir de ahí, se desliza.
    let frame = 0;
    if (!indicator.hasAttribute("data-placed")) {
      frame = requestAnimationFrame(() => indicator.setAttribute("data-placed", ""));
    }
    const ro = new ResizeObserver(place);
    ro.observe(button);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [activeId, safeItems, fits]);

  if (safeItems.length === 0) return null;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { y: 10 }}
      animate={{ y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={["w-full", className].join(" ")}
    >
      <nav className={["mx-auto w-full", maxWidthClass].join(" ")}>
        <div
          // Mismo cristal que el Scoreboard, las pestañas y las tarjetas de la
          // ficha: `LIQUID_GLASS_SURFACE` (base LIQUID_GLASS_BAR + envoltura) más
          // las capas ópticas en su versión contenida (canto al brillo del propio
          // cristal, reflejos a la mitad). Con la variante PLANA la barra se veía
          // transparente y sin cuerpo sobre el backdrop. Esta es la pieza de
          // REFERENCIA: el resto de superficies de la ficha copian de aquí, y por
          // eso comparten constante en vez de repetir las clases.
          className={["rounded-2xl", LIQUID_GLASS_SURFACE].join(" ")}
          style={{ contain: "layout style" }}
        >
          <LiquidGlassOpticalLayers />
          <div className="relative">
            <div>
              <div className="py-2.5">
                <div ref={containerRef} className="w-full overflow-hidden">
                  <div className="flex w-full justify-center">
                    <div
                      ref={innerRef}
                      className={[
                        "relative flex flex-nowrap items-center whitespace-nowrap",
                        fits
                          ? "w-full justify-between"
                          : "w-max justify-center",
                        "gap-1.5 sm:gap-2",
                        "px-3 sm:px-4",
                      ].join(" ")}
                      style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                        willChange: "transform",
                      }}
                    >
                      <div
                        ref={indicatorRef}
                        aria-hidden="true"
                        data-static={shouldReduceMotion ? "" : undefined}
                        className="sv-menu-indicator pointer-events-none absolute left-0 top-0"
                        style={{ visibility: "hidden" }}
                      >
                        <div
                          className={`absolute inset-0 rounded-xl bg-gradient-to-br ${colors.activeBg}`}
                        />
                        <span
                          className={`absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r ${colors.indicator}`}
                        />
                      </div>
                      {safeItems.map((item, index) => {
                        const Icon = item.icon;
                        const active = item.id === activeId;

                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              if (el) buttonRefs.current.set(item.id, el);
                              else buttonRefs.current.delete(item.id);
                            }}
                            onClick={() => onChange?.(item.id)}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            // Las secciones aparecen CON la barra, no después: el
                            // movimiento de entrada lo hace el contenedor. El
                            // hover y la pulsación son CSS (antes gestos de
                            // framer, que se disparaban al pasar las filas bajo
                            // el puntero durante el scroll).
                            className={[
                              "group relative flex items-center justify-center overflow-hidden rounded-xl",
                              "hover:scale-[1.03] active:scale-[0.97]",
                              "px-3 py-2 sm:px-3.5 sm:py-2.5",
                              "transition-all duration-300 ease-out",
                              "outline-none focus-visible:ring-2",
                              colors.focusRing,
                              "whitespace-nowrap",
                              active ? "" : "hover:bg-white/5",
                            ].join(" ")}
                            aria-label={item.label}
                          >
                            <div className="relative z-10 flex items-center gap-2">
                              {Icon && (
                                <div
                                  className="sv-menu-icon"
                                  data-active={active ? "" : undefined}
                                  data-static={shouldReduceMotion ? "" : undefined}
                                >
                                  <Icon
                                    className={[
                                      "h-5 w-5 transition-all duration-300",
                                      // Halo oscuro: el cristal deja pasar el
                                      // backdrop, y sobre un fotograma claro un
                                      // icono gris desaparece. La sombra lo
                                      // recorta sin ensuciar el fondo oscuro,
                                      // donde es invisible.
                                      "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.75))]",
                                      active
                                        ? colors.iconActive
                                        : "text-zinc-300 group-hover:text-white",
                                    ].join(" ")}
                                  />
                                </div>
                              )}

                              <span
                                className={[
                                  iconsOnly
                                    ? "hidden"
                                    : showLabelsOnMobile
                                      ? "inline"
                                      : "hidden sm:inline",
                                  "text-[11px] sm:text-sm font-semibold tracking-wide sm:tracking-wider uppercase transition-all duration-300",
                                  // MISMO PROBLEMA QUE EL ICONO. Aclarar el gris
                                  // no bastaba —sobre un fondo claro empeora—:
                                  // lo que separa las letras de CUALQUIER fondo
                                  // es el contorno oscuro. El gris sube de 400 a
                                  // 300 para ganar algo de peso sobre oscuro.
                                  "[text-shadow:0_1px_3px_rgba(0,0,0,0.85)]",
                                  active
                                    ? "text-white font-bold"
                                    : "text-zinc-300 group-hover:text-white",
                                ].join(" ")}
                              >
                                {item.label}
                              </span>

                              {item.badge && (
                                <motion.span
                                  initial={
                                    isStaticDetails ? false : { scale: 0, opacity: 0 }
                                  }
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{
                                    duration: 0.15,
                                    ease: "easeOut",
                                  }}
                                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold border ${colors.badgeBg}`}
                                >
                                  {item.badge}
                                </motion.span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </motion.div>
  );
}
