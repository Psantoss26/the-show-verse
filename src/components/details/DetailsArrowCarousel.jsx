"use client";

// /src/components/details/DetailsArrowCarousel.jsx
// Carrusel horizontal con flechas (aparecen al hacer hover) sobre Swiper.
// Extraído VERBATIM de DetailsClient para compartir EXACTAMENTE el mismo
// comportamiento de desplazamiento horizontal, tamaños y organización de
// tarjetas entre la ficha completa (DetailsClient / EpisodeDetailsClient) y la
// ficha rápida del dashboard (DetailModal).
//
// Acepta todas las props de <Swiper> (slidesPerView, spaceBetween, breakpoints,
// breakpointsBase, …). Las flechas avanzan/retroceden un "paso" =
// floor(slidesPerView). Reexporta SwiperSlide para comodidad del consumidor.

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { motion, AnimatePresence } from "framer-motion";
import "swiper/swiper-bundle.css";

export { SwiperSlide };

export default function DetailsArrowCarousel({
  children,
  className = "",
  arrowClassName = "inset-y-0",
  // Muestra las flechas de navegación (al hover). Se puede desactivar en
  // superficies que solo quieren arrastre/deslizamiento (p. ej. el modal del
  // dashboard, donde las flechas quedan apretadas contra los bordes).
  showArrows = true,
  // Posición/tamaño de las flechas. Por defecto quedan FUERA del carrusel
  // (como en DetailsClient, que tiene margen de sobra). En contenedores
  // estrechos (p. ej. el modal del dashboard) se pueden pasar valores con menos
  // desplazamiento y menor tamaño para que no se corten con los bordes.
  prevArrowClassName = "-left-8 xl:-left-10 w-7",
  nextArrowClassName = "-right-8 xl:-right-10 w-7",
  arrowIconClassName = "text-4xl",
  ...swiperProps
}) {
  const swiperRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const childrenCount = Children.count(children);

  const updateNav = useCallback((swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  }, []);

  const handleSwiper = useCallback(
    (swiper) => {
      swiperRef.current = swiper;
      updateNav(swiper);
      requestAnimationFrame(() => {
        swiper.update?.();
        updateNav(swiper);
      });
    },
    [updateNav],
  );

  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return undefined;

    const refresh = () => {
      swiper.update?.();
      updateNav(swiper);
    };

    const raf = requestAnimationFrame(refresh);
    const t1 = window.setTimeout(refresh, 120);
    const t2 = window.setTimeout(refresh, 450);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [childrenCount, updateNav]);

  const getStep = useCallback((swiper) => {
    const current = swiper?.params?.slidesPerView;
    return typeof current === "number" ? Math.max(1, Math.floor(current)) : 1;
  }, []);

  const handlePrevClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const swiper = swiperRef.current;
      if (!swiper) return;
      swiper.slideTo(Math.max((swiper.activeIndex || 0) - getStep(swiper), 0));
    },
    [getStep],
  );

  const handleNextClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const swiper = swiperRef.current;
      if (!swiper) return;
      const maxIndex = Math.max((swiper.slides?.length || 1) - 1, 0);
      swiper.slideTo(
        Math.min((swiper.activeIndex || 0) + getStep(swiper), maxIndex),
      );
    },
    [getStep],
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ overflowX: "clip", overflowY: "visible" }}>
        <Swiper
          {...swiperProps}
          observer={swiperProps.observer ?? true}
          observeParents={swiperProps.observeParents ?? true}
          resizeObserver={swiperProps.resizeObserver ?? true}
          onSwiper={(swiper) => {
            handleSwiper(swiper);
            swiperProps.onSwiper?.(swiper);
          }}
          onSlideChange={(swiper) => {
            updateNav(swiper);
            swiperProps.onSlideChange?.(swiper);
          }}
          onResize={(swiper) => {
            updateNav(swiper);
            swiperProps.onResize?.(swiper);
          }}
          onReachBeginning={(swiper) => {
            updateNav(swiper);
            swiperProps.onReachBeginning?.(swiper);
          }}
          onReachEnd={(swiper) => {
            updateNav(swiper);
            swiperProps.onReachEnd?.(swiper);
          }}
          className={className}
        >
          {children}
        </Swiper>
      </div>

      <AnimatePresence>
        {showArrows && isHovered && canPrev && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handlePrevClick}
            className={`absolute z-30 hidden items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex ${prevArrowClassName} ${arrowClassName}`}
            aria-label="Anterior"
          >
            <motion.span
              className={`relative font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] ${arrowIconClassName}`}
              whileHover={{ x: -4 }}
            >
              ‹
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showArrows && isHovered && canNext && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handleNextClick}
            className={`absolute z-30 hidden items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex ${nextArrowClassName} ${arrowClassName}`}
            aria-label="Siguiente"
          >
            <motion.span
              className={`relative font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] ${arrowIconClassName}`}
              whileHover={{ x: 4 }}
            >
              ›
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
