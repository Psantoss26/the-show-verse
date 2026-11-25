"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { recordSlide, resumableSlide } from "@/lib/ui/slidingIndicatorFlight";
import { SLIDE_EASING, SLIDE_MS } from "@/lib/ui/siblingToolbarShift";

// Pastilla de la sección activa de un selector de secciones (Listas, En
// progreso · Completadas) que SE DESLIZA de un botón a otro en vez de saltar.
//
// Uso: el `<nav>` lleva `ref={navRef}` y `relative`, cada botón
// `data-section-key` y `relative z-10`, y el `indicator` va dentro del nav.
// Mientras no está medida (`ready` a false: HTML del servidor, primer render)
// el botón activo pinta su propio fondo, como antes.
//
// Entre páginas hermanas (/in-progress ↔ /completed) el selector se monta de
// nuevo; `groupId` recuerda dónde estaba la pastilla para que la nueva salga
// de ahí y se deslice hasta su botón. Solo si se acaba de dejar la otra (aún
// montada o desmontada hace un instante): al llegar desde otra página sale
// quieta. Los selectores ocultos (el de escritorio en móvil y al revés) miden
// 0 y no cuentan.
//
// EL DESLIZAMIENTO ES WAAPI SOBRE `transform`, no framer: framer calcula `x`
// y `width` en JS, fotograma a fotograma en el hilo principal, y justo al
// cambiar de sección ese hilo está montando la página nueva; en la app de
// Android (WebView) la pastilla iba a tirones y se frenaba. Con `transform`
// la animación corre en el compositor aunque React esté ocupado. El ancho solo
// se anima si cambia (escritorio, con títulos); en móvil todos los botones son
// iconos del mismo ancho y queda solo el `transform`.
const HANDOFF_MAX_AGE_MS = 1500;
const PRESSED_MAX_AGE_MS = 5000;
const lastByGroup = new Map(); // groupId → { key, left, width, leftAt }
// groupId → deslizamiento en curso, para que el selector de la ruta hermana
// lo retome a mitad en vez de saltar al final (slidingIndicatorFlight.js).
const slideFlights = new Map();

// Al ritmo del contenido: la sección vieja sale en 160 ms y la nueva entra en
// 280 ms (ListsClient), así que la pastilla tarda lo mismo que ese relevo
// entero y llega cuando el contenido se asienta. Curva de frenado suave: sale
// ya moviéndose (pendiente inicial ~2,4) y frena largo, sin fases. Ni la de
// 0.22, 1, 0.36, 1 (pendiente ~4,5: casi todo el recorrido en 100 ms, brusca)
// ni una de entrada y salida (0.45, 0, 0.2, 1: arranca parada y acelera a
// mitad, se veía rara y acelerada).
// (Compartidas con el relevo de la barra entre páginas hermanas,
// siblingToolbarShift.js, para que selector y pastilla vayan a la par.)

function measure(nav, activeKey) {
  const button = nav?.querySelector(`[data-section-key="${activeKey}"]`);
  if (!button || !button.offsetWidth) return null;
  return {
    left: button.offsetLeft,
    top: button.offsetTop,
    width: button.offsetWidth,
    height: button.offsetHeight,
  };
}

// Posición pintada ahora mismo (a mitad de un deslizamiento, la intermedia).
function currentBox(el, fallback) {
  if (!el?.getAnimations?.().length) return fallback;
  const style = getComputedStyle(el);
  const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
  const width = parseFloat(style.width);
  return { left: matrix.m41, width: Number.isFinite(width) ? width : fallback.width };
}

export function useSlidingSectionIndicator({ navRef, activeKey: committedKey, groupId, className = "" }) {
  // { to, from, instant, id }: `from` es de dónde sale el deslizamiento.
  const [box, setBox] = useState(null);
  const pillRef = useRef(null);
  const animatedIdRef = useRef(0);

  // LA PASTILLA SALE AL TOCAR, no cuando llega la sección nueva. El cambio va
  // en una transición (startTransition, o la navegación del router) y la
  // sección activa no cambia hasta que React termina de pintar la página
  // nueva: medido en /lists, hasta 1 s con la pastilla quieta, y más en la app
  // de Android. Aquí el toque es una actualización urgente de este hook (solo
  // re-renderiza el selector) y la página nueva se monta después sin frenar el
  // deslizamiento, que va en el compositor. `base` ata el toque a la sección
  // de entonces: en cuanto cambia, manda la de verdad.
  const [pressed, setPressed] = useState(null); // { key, base }
  const activeKey = pressed && pressed.base === committedKey ? pressed.key : committedKey;

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button > 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const key = event.target.closest?.("[data-section-key]")?.getAttribute("data-section-key");
      if (key && key !== committedKey) setPressed({ key, base: committedKey });
    };
    nav.addEventListener("click", onClick, true);
    return () => nav.removeEventListener("click", onClick, true);
  }, [navRef, committedKey]);

  // Llegó la sección (o cambió por otra vía): el toque ya no cuenta.
  useEffect(() => {
    setPressed((p) => (p && p.base !== committedKey ? null : p));
  }, [committedKey]);
  // Navegación cancelada: el toque caduca.
  useEffect(() => {
    if (!pressed) return undefined;
    const timer = setTimeout(() => setPressed(null), PRESSED_MAX_AGE_MS);
    return () => clearTimeout(timer);
  }, [pressed]);
  // Pantalla oculta en el keep-alive (<Activity>) o desmontada: al volver a
  // ella la pastilla está en su sección, no en la que se tocó al irse.
  useEffect(() => () => setPressed(null), []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const update = (instant) => {
      const next = measure(nav, activeKey);
      if (!next) return;
      setBox((prev) => {
        if (prev) {
          // Misma medida (el ResizeObserver avisa también al empezar a
          // observar): no se toca, para no cortar el deslizamiento en curso.
          const same = ["left", "top", "width", "height"].every((k) => prev.to[k] === next[k]);
          if (same) return prev;
          return {
            from: instant ? next : currentBox(pillRef.current, prev.to),
            to: next,
            instant,
            id: prev.id + 1,
            key: activeKey,
            startedAt: null,
          };
        }
        // Selector recién montado en la ruta hermana mientras la pastilla del
        // anterior aún se deslizaba hacia aquí (el toque la lanzó allí):
        // sigue ese mismo deslizamiento, con su origen y su reloj.
        const flight = resumableSlide(
          slideFlights,
          groupId,
          activeKey,
          document.timeline?.currentTime ?? null,
          SLIDE_MS,
        );
        if (flight) {
          return { from: flight.from, to: next, instant: false, id: 1, key: activeKey, startedAt: flight.startedAt };
        }
        const last = lastByGroup.get(groupId);
        const fresh =
          last &&
          last.key !== activeKey &&
          (last.leftAt == null || Date.now() - last.leftAt < HANDOFF_MAX_AGE_MS);
        return {
          from: fresh ? { left: last.left, width: last.width } : next,
          to: next,
          instant: false,
          id: 1,
          key: activeKey,
          startedAt: null,
        };
      });
      lastByGroup.set(groupId, { key: activeKey, left: next.left, width: next.width, leftAt: null });
    };

    update(false);
    // Los botones cambian de ancho sin cambiar de sección (títulos que se
    // recogen a icono, viewport): ahí la pastilla se recoloca sin animar.
    const observer = new ResizeObserver(() => update(true));
    observer.observe(nav);
    nav.querySelectorAll("[data-section-key]").forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [navRef, activeKey, groupId]);

  useLayoutEffect(
    () => () => {
      const last = lastByGroup.get(groupId);
      if (last?.key === activeKey) lastByGroup.set(groupId, { ...last, leftAt: Date.now() });
    },
    [groupId, activeKey],
  );

  // El estilo en línea ya deja la pastilla en su destino; la animación solo
  // pinta el camino desde `from`.
  useLayoutEffect(() => {
    const el = pillRef.current;
    if (!el || !box || animatedIdRef.current === box.id) return;
    animatedIdRef.current = box.id;
    el.getAnimations().forEach((animation) => animation.cancel());
    slideFlights.delete(groupId);
    const { from, to } = box;
    if (box.instant || typeof el.animate !== "function") return;
    if (Math.abs(from.left - to.left) < 0.5 && Math.abs(from.width - to.width) < 0.5) return;
    const options = { duration: SLIDE_MS, easing: SLIDE_EASING };
    // Reloj explícito: el del deslizamiento que se retoma, o ahora. Así el
    // selector de la ruta hermana puede seguir este mismo en el punto exacto.
    const startedAt = box.startedAt ?? document.timeline?.currentTime ?? null;
    const animations = [
      el.animate(
        [{ transform: `translate3d(${from.left}px,0,0)` }, { transform: `translate3d(${to.left}px,0,0)` }],
        options,
      ),
    ];
    // Animación aparte: una con `width` dejaría también el `transform` fuera
    // del compositor.
    if (Math.abs(from.width - to.width) >= 0.5) {
      animations.push(el.animate([{ width: `${from.width}px` }, { width: `${to.width}px` }], options));
    }
    if (startedAt != null) {
      animations.forEach((animation) => {
        animation.startTime = startedAt;
      });
    }
    recordSlide(slideFlights, groupId, { key: box.key, from, to, startedAt });
  }, [box, groupId]);

  const indicator = box ? (
    <span
      ref={pillRef}
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 rounded-xl will-change-transform ${className}`}
      style={{
        top: box.to.top,
        height: box.to.height,
        width: box.to.width,
        transform: `translate3d(${box.to.left}px,0,0)`,
      }}
    />
  ) : null;

  return { ready: box !== null, indicator };
}
