"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { navigateDetailsSequence } from "@/lib/navigation/detailsSequenceTransition";
import { warmDetailsSequenceTarget } from "@/lib/navigation/detailsSequenceWarmup";
import { getDetails } from "@/lib/api/tmdb";
import { getUserDetailsSequence } from "@/lib/navigation/userDetailsSequence";
import { LIQUID_GLASS_SURFACE } from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";

// Nombres ya resueltos, por href. Al avanzar, el título actual pasa a ser el
// "anterior" del siguiente y ya está aquí: no se vuelve a pedir.
const titleCache = new Map();

function parseDetailsHref(href) {
  const match = href?.match(/^\/details\/(movie|tv)\/([^/]+)$/);
  return match ? { type: match[1], id: match[2] } : null;
}

async function resolveTitle(href) {
  if (titleCache.has(href)) return titleCache.get(href);
  const parsed = parseDetailsHref(href);
  if (!parsed) return null;
  const data = await getDetails(parsed.type, parsed.id, {
    appendToResponse: "",
  }).catch(() => null);
  const title = data?.title || data?.name || null;
  if (title) titleCache.set(href, title);
  return title;
}

function SequenceBubble({ href, title, direction, onNavigate, onIntent }) {
  const isNext = direction === "next";
  const Icon = isNext ? ChevronRight : ChevronLeft;
  const label = isNext ? "Siguiente" : "Anterior";
  const titleRef = useRef(null);
  const [titleOverflows, setTitleOverflows] = useState(false);

  // ¿El título cabe en la píldora desplegada? Su ancho final ya es el de
  // maquetación (ver `.sv-seq-text-pad`), así que se puede medir en reposo.
  // Depende del ancho de la ventana: se vuelve a medir al redimensionar.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return undefined;
    const measure = () => setTitleOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title]);

  return (
    <Link
      href={href}
      prefetch
      onClick={(event) => onNavigate(event, href, direction)}
      // Intención de ir: se precalienta el título para que la transición no
      // espere a sus imágenes tras el clic.
      onPointerEnter={() => onIntent(href)}
      onFocus={() => onIntent(href)}
      aria-label={title ? `${label}: ${title}` : `${label} título`}
      data-direction={direction}
      // Del menú de secciones (DetailsSectionMenu, que tiene al lado) toma SOLO
      // la carcasa: el mismo cristal (`rounded-2xl` + LIQUID_GLASS_SURFACE +
      // capas ópticas) y el mismo alto (60px). El contenido es el suyo: flecha en
      // círculo y, al pasar por encima (o con foco), crece HACIA FUERA —hacia el
      // borde de la pantalla— y enseña "Anterior/Siguiente" y el título.
      // Posición, tamaños y despliegue: `.sv-seq-*` en globals.css.
      //
      // El fondo NO cambia en hover, igual que la barra del menú: un velo claro
      // encima del cristal la dejaba demasiado brillante al desplegarse. El
      // círculo de la flecha tampoco se ve en reposo: aparece solo en hover/foco.
      //
      // Sin `opacity` ni `filter` en la carcasa: los dos la convierten en
      // Backdrop Root y apagan la refracción de sus capas ópticas.
      className={`sv-seq-bubble group items-center rounded-2xl text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${LIQUID_GLASS_SURFACE} ${
        // La flecha queda siempre junto al menú; el texto se abre al otro lado.
        isNext ? "text-left" : "flex-row-reverse text-right"
      }`}
      style={{ contain: "layout style" }}
    >
      <LiquidGlassOpticalLayers />
      <span
        aria-hidden="true"
        className="sv-seq-icon relative flex shrink-0 items-center justify-center rounded-full bg-transparent transition-colors duration-300 group-hover:bg-white/10 group-focus-visible:bg-white/10"
      >
        <Icon className="h-[1.15em] w-[1.15em]" strokeWidth={2.25} />
      </span>
      <span className="sv-seq-reveal relative min-w-0">
        <span className="sv-seq-text">
          <span className="sv-seq-text-pad leading-tight">
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              {label}
            </span>
            {title ? (
              // Sin "…": si no cabe, el final se desvanece (`.sv-seq-title-fade`).
              <span
                ref={titleRef}
                className={`overflow-hidden whitespace-nowrap text-[13px] font-bold text-white ${
                  titleOverflows ? "sv-seq-title-fade" : ""
                }`}
              >
                {title}
              </span>
            ) : (
              // Hueco del nombre mientras llega: misma altura de línea.
              <span
                aria-hidden="true"
                className={`my-[3px] h-3 w-24 rounded-full bg-white/10 ${isNext ? "" : "ml-auto"}`}
              />
            )}
          </span>
        </span>
      </span>
    </Link>
  );
}

/**
 * Navegación de escritorio entre títulos de la lista desde la que se abrió la
 * ficha. Es la misma secuencia que recorre el gesto horizontal en móvil
 * (MobileUserPageSwipeNavigation): solo existe al venir de una página personal.
 * Dos flechas a la altura del menú de secciones (va dentro de su contenedor
 * sticky), fuera de la columna central: si no caben, no se pintan (en teléfono
 * manda el deslizamiento).
 */
export default function DetailsSequenceNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sequence, setSequence] = useState(null);
  const [titles, setTitles] = useState({});

  useEffect(() => {
    // sessionStorage solo existe en cliente: se lee tras montar.
    const next = getUserDetailsSequence(pathname);
    setSequence(next?.previous || next?.next ? next : null);
  }, [pathname]);

  useEffect(() => {
    if (!sequence) return;
    let cancelled = false;
    const hrefs = [sequence.previous, sequence.next].filter(Boolean);
    setTitles(
      Object.fromEntries(
        hrefs.map((href) => [href, titleCache.get(href) || null]),
      ),
    );
    hrefs.forEach((href) => {
      if (titleCache.has(href)) return;
      resolveTitle(href).then((title) => {
        if (!cancelled && title) {
          setTitles((current) => ({ ...current, [href]: title }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sequence]);

  if (!sequence) return null;

  const handleIntent = (href) => {
    router.prefetch?.(href);
    warmDetailsSequenceTarget(href);
  };

  const handleNavigate = (event, href, direction) => {
    // Cmd/Ctrl/Mayús/clic central: comportamiento nativo del enlace.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    // Mismo router que el gesto móvil: respeta la ficha embebida y el modo
    // sin conexión.
    void navigateDetailsSequence({ href, direction, navigate: router.push }).catch(() => {});
  };

  return (
    // FUERA DEL FLUJO: no ocupa sitio ni mueve nada de la ficha.
    <nav aria-label="Navegar entre títulos de la lista" className="sv-seq-nav">
      {sequence.previous && (
        <SequenceBubble
          href={sequence.previous}
          title={titles[sequence.previous]}
          direction="previous"
          onNavigate={handleNavigate}
          onIntent={handleIntent}
        />
      )}
      {sequence.next && (
        <SequenceBubble
          href={sequence.next}
          title={titles[sequence.next]}
          direction="next"
          onNavigate={handleNavigate}
          onIntent={handleIntent}
        />
      )}
    </nav>
  );
}
