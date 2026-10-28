"use client";

import { useCallback, useEffect, useRef } from "react";

// BUSCADOR DE LA BARRA DE FILTROS: O CON TEXTO, O SOLO ICONO.
//
// En la barra compacta el buscador rellenaba el hueco que sobraba. Cuando ese
// hueco no llegaba para el texto de ayuda, quedaba una caja ancha y vacía: ni
// dejaba sitio a nada ni decía qué era. Ahora solo hay dos estados:
//
//   - Cabe el texto ENTERO: el buscador ocupa el hueco y lo muestra. Lo que
//     necesita se MIDE (texto de ayuda con su fuente real + el hueco de la lupa
//     a la izquierda y el de la X a la derecha): con un umbral fijo de 10rem el
//     texto "Buscar por título..." quedaba cortado, porque pide unos 205px.
//   - No cabe: el buscador es un botón cuadrado con la lupa, y el hueco lo
//     reparten los desplegables (Tipo, Agrupar, Ordenar…), que se estiran un
//     poco. Así tampoco vuelve el espacio vacío a la derecha.
//
// Al recibir el foco, el buscador cuadrado se abre a su ancho de escritura.
//
// Se mide la barra REAL porque cada página lleva botones distintos (el
// Historial tiene secciones, calendario y papelera), y se aplica con estilos en
// línea para no depender de reglas globales. Devuelve una ref de callback para
// el contenedor `.sv-page-toolbar`.

const ICON_SIZE_REM = 2.75;
// Compactar o ampliar la barra al abrir o cerrar el buscador.
const FIT_ANIMATION_MS = 260;
const FIT_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
// Relleno del campo a cada lado (`pl-10` para la lupa, `pr-10` para la X) y
// su borde.
const INPUT_SIDE_PADDING_REM = 2.5;
const INPUT_BORDER_PX = 2;

let measureCanvas = null;

// Ancho que necesita el buscador para mostrar su texto de ayuda sin cortarlo.
function labelWidthPx(input) {
  const text =
    input?.dataset.fitPlaceholder ?? input?.getAttribute("placeholder") ?? "";
  const padding = 2 * remToPx(INPUT_SIDE_PADDING_REM) + INPUT_BORDER_PX;
  if (!text) return padding + remToPx(6);
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  const style = getComputedStyle(input);
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = style.letterSpacing;
  // +2px de margen para el suavizado del texto.
  return Math.ceil(ctx.measureText(text).width + padding + 2);
}

function remToPx(rem) {
  const root = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return rem * (Number.isFinite(root) ? root : 16);
}

export default function usePageToolbarSearchFit() {
  const toolbarRef = useRef(null);
  const cleanupRef = useRef(null);

  const attach = useCallback((toolbar) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    toolbarRef.current = toolbar;
    if (!toolbar || typeof window === "undefined") return;

    let frame = 0;
    let focused = false;

    // Los desplegables se reconocen por su valor seleccionado: los del
    // Historial van siempre en modo compacto y no llevan
    // `sv-page-toolbar-trigger`, así que con esa clase no se encontraban (ni
    // se compactaban ni se estiraban para llenar la fila).
    const parts = () => {
      const search = toolbar.querySelector(":scope > .sv-page-toolbar-search");
      const dropdowns = [...toolbar.children].filter((child) =>
        child.querySelector(":scope > button .sv-page-toolbar-value"),
      );
      return { search, dropdowns };
    };

    // El campo en modo icono: relleno solo para la lupa, sin texto de ayuda y
    // sin la X (caería encima de la lupa). Va en línea para no depender de las
    // reglas globales de la barra.
    const setSearchIconMode = (search, iconMode) => {
      const input = search.querySelector("input");
      if (input) {
        if (iconMode) {
          if (input.dataset.fitPlaceholder == null) {
            input.dataset.fitPlaceholder = input.getAttribute("placeholder") || "";
          }
          input.setAttribute("placeholder", "");
          input.style.paddingLeft = "2.5rem";
          input.style.paddingRight = "0";
        } else {
          if (input.dataset.fitPlaceholder != null) {
            input.setAttribute("placeholder", input.dataset.fitPlaceholder);
            delete input.dataset.fitPlaceholder;
          }
          input.style.paddingLeft = "";
          input.style.paddingRight = "";
        }
      }
      for (const button of search.querySelectorAll("button")) {
        button.style.display = iconMode ? "none" : "";
      }
    };

    // Un desplegable nunca se estrecha por debajo de su botón: su envoltorio
    // lleva `min-w-0` y, con `flex-shrink`, el botón asomaba sobre el
    // siguiente. Lo que falte se resuelve compactando (ver `fitStage`).
    const setDropdownsGrow = (dropdowns, grow) => {
      for (const wrapper of dropdowns) {
        const trigger = wrapper.querySelector(":scope > button");
        wrapper.style.flexGrow = grow ? "1" : "";
        wrapper.style.flexShrink = "0";
        if (trigger) trigger.style.width = grow ? "100%" : "";
      }
    };

    // Lo que pide la fila con el buscador a `searchPx`. Se suma lo que pide
    // cada pieza (`scrollWidth` incluye el botón que asoma fuera de su
    // envoltorio), no lo que ocupa.
    const neededWidth = (searchPx) => {
      const children = [...toolbar.children].filter(
        (child) => child.offsetParent !== null,
      );
      const gap = Number.parseFloat(getComputedStyle(toolbar).columnGap) || 0;
      return children.reduce((sum, child) => {
        if (child.matches(".sv-page-toolbar-search")) return sum + searchPx;
        return (
          sum + Math.max(child.getBoundingClientRect().width, child.scrollWidth)
        );
      }, gap * Math.max(0, children.length - 1));
    };

    // CUÁNTO SE COMPACTA LA BARRA, MIDIENDO. Los umbrales de globals.css
    // compactan por el ancho de la barra, pero no saben lo que piden sus
    // piezas: los títulos del selector de secciones (Historial · Continuar
    // viendo) o el buscador abierto para escribir. Aquí se prueba de menos a
    // más hasta que la fila cabe:
    //   ""          tal cual
    //   "no-labels" sin rótulos ("TIPO:", "ORDENAR:")
    //   "icons"     desplegables en icono y flecha
    //   "bare"      además, el selector de secciones sin títulos
    const STAGES = ["", "no-labels", "icons", "bare"];
    const fitStage = (searchPx) => {
      for (const stage of STAGES) {
        if (stage) toolbar.dataset.fit = stage;
        else delete toolbar.dataset.fit;
        if (neededWidth(searchPx) <= toolbar.clientWidth + 0.5) return true;
      }
      return false;
    };

    // EL CAMBIO AL ABRIR O CERRAR EL BUSCADOR SE ANIMA. La medida pone el
    // estado final de golpe; luego cada pieza que cambia de ancho va de su
    // ancho anterior al nuevo con WAAPI (`flex: 0 0` en los fotogramas, que
    // mandan sobre los estilos en línea mientras dura), y los textos que
    // reaparecen entran con un fundido para no asomar sobre la pieza vecina
    // mientras su caja aún crece. Al redimensionar la ventana sigue siendo
    // inmediato: animado iría con retraso detrás del ratón.
    let animateNext = false;
    let animations = [];
    const TEXT_SELECTOR =
      ".sv-page-toolbar-label, .sv-page-toolbar-value, .sv-page-toolbar-section-label";
    const isShown = (el) => el.getClientRects().length > 0;

    const cancelAnimations = () => {
      for (const animation of animations) animation.cancel();
      animations = [];
    };

    const inputPadding = (input) => {
      const style = getComputedStyle(input);
      return { paddingLeft: style.paddingLeft, paddingRight: style.paddingRight };
    };

    const animateFrom = (widths, texts, input, padding) => {
      const children = [...toolbar.children].filter(
        (child) => child.offsetParent !== null,
      );
      const options = { duration: FIT_ANIMATION_MS, easing: FIT_ANIMATION_EASING };
      // Todos los anchos finales ANTES de animar nada: cada animación que
      // arranca devuelve su pieza al ancho de partida y apretaría a las demás.
      const targets = children.map((child) => child.getBoundingClientRect().width);
      for (const [index, child] of children.entries()) {
        const from = widths.get(child);
        const to = targets[index];
        if (from == null || Math.abs(from - to) < 0.5) continue;
        const keyframe = (width) => ({
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: `${width}px`,
          minWidth: 0,
        });
        animations.push(child.animate([keyframe(from), keyframe(to)], options));
        // El botón de un desplegable sigue a su envoltorio mientras dura (sin
        // estirar mide su contenido y saltaría a su ancho final de golpe), y
        // recorta lo que aún no cabe.
        const trigger = child.querySelector(":scope > button .sv-page-toolbar-value")
          ? child.querySelector(":scope > button")
          : null;
        if (trigger) {
          // `min-width: 0`: en Favoritos el botón lleva `lg:min-w-[140px]`.
          const fill = { width: "100%", minWidth: 0, overflow: "hidden" };
          animations.push(trigger.animate([fill, fill], options));
        }
      }
      // El campo del buscador pasa de su relleno de cuadrado (solo la lupa) al
      // de escritura con su caja: con el relleno final de golpe, el campo no
      // cabía en el cuadrado de partida y asomaba sobre el desplegable vecino.
      if (input && padding) {
        const to = inputPadding(input);
        if (
          to.paddingLeft !== padding.paddingLeft ||
          to.paddingRight !== padding.paddingRight
        ) {
          animations.push(input.animate([padding, to], options));
        }
      }
      for (const text of toolbar.querySelectorAll(TEXT_SELECTOR)) {
        if (texts.has(text) || !isShown(text)) continue;
        animations.push(
          text.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], options),
        );
      }
      if (!animations.length) return;
      const running = animations;
      Promise.all(running.map((animation) => animation.finished))
        .then(() => {
          if (animations !== running) return;
          animations = [];
          // Por si la barra cambió mientras tanto (el observador calla
          // durante la animación).
          schedule();
        })
        .catch(() => {});
    };

    const update = () => {
      frame = 0;
      const { search, dropdowns } = parts();
      if (!search) return;
      const iconPx = remToPx(ICON_SIZE_REM);
      const labelPx = labelWidthPx(search.querySelector("input"));

      // Anchos y textos tal como se VEN ahora (a mitad de una animación, si la
      // hay), para que la siguiente parta de ahí sin saltos.
      const animate =
        animateNext &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      animateNext = false;
      const widths = new Map();
      const texts = new Set();
      const input = search.querySelector("input");
      let padding = null;
      if (animate) {
        if (input) padding = inputPadding(input);
        for (const child of toolbar.children) {
          widths.set(child, child.getBoundingClientRect().width);
        }
        for (const text of toolbar.querySelectorAll(TEXT_SELECTOR)) {
          if (isShown(text)) texts.add(text);
        }
      }
      cancelAnimations();

      // Sin transiciones mientras se mide: las reglas globales de la barra
      // animaban `flex-basis` y el ancho mínimo de los desplegables, y aquí se
      // cambian un instante. Con la animación se medía a medio camino y el
      // observador lo volvía a medir mientras tanto, atascándolo en un tamaño
      // intermedio.
      toolbar.dataset.fitMeasuring = "";
      search.style.transition = "none";
      // Estado NATURAL para medir: buscador en cuadrado (o a su ancho de
      // escritura si tiene el foco) y desplegables sin estirar.
      search.style.flex = `0 0 ${iconPx}px`;
      search.style.minWidth = `${iconPx}px`;
      setDropdownsGrow(dropdowns, false);

      if (focused) {
        // Abierto para escribir: los desplegables ceden lo que haga falta
        // para que el buscador tenga su ancho sin que nada se toque.
        const fits = fitStage(labelPx);
        search.style.flex = `1 1 ${labelPx}px`;
        search.style.minWidth = fits ? `${labelPx}px` : `${iconPx}px`;
        search.dataset.searchFit = "label";
        setSearchIconMode(search, false);
      } else {
        fitStage(iconPx);
        const free = toolbar.clientWidth - neededWidth(iconPx);
        if (iconPx + free >= labelPx) {
          // Con texto: ocupa el hueco, al menos lo que necesita el texto.
          search.style.flex = `1 1 ${labelPx}px`;
          search.dataset.searchFit = "label";
          setSearchIconMode(search, false);
        } else {
          // Solo icono: cuadrado, y el sobrante para los desplegables, así la
          // fila ocupa siempre todo el ancho.
          search.dataset.searchFit = "icon";
          setSearchIconMode(search, true);
          setDropdownsGrow(dropdowns, true);
        }
      }
      // Se fija el estado final antes de devolver las transiciones, para que
      // no se anime el salto desde el estado de medida.
      toolbar.getBoundingClientRect();
      delete toolbar.dataset.fitMeasuring;
      if (animate) animateFrom(widths, texts, input, padding);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    // Mientras se anima, las piezas cambian de tamaño en cada fotograma y el
    // observador volvería a medir (y a cortar la animación). Al acabar se
    // mide una vez.
    const onResize = () => {
      if (!animations.length) schedule();
    };

    // El foco se atiende en el acto, no en el fotograma siguiente: esperando,
    // se pintaba un fotograma con el buscador ya abierto y la barra sin ceder.
    const updateNow = () => {
      if (frame) window.cancelAnimationFrame(frame);
      update();
    };
    const onFocusIn = (event) => {
      if (!event.target.closest?.(".sv-page-toolbar-search")) return;
      focused = true;
      animateNext = true;
      updateNow();
    };
    const onFocusOut = (event) => {
      if (!event.target.closest?.(".sv-page-toolbar-search")) return;
      focused = false;
      animateNext = true;
      updateNow();
    };

    update();
    // Se observa la barra Y CADA UNO DE SUS ELEMENTOS. Solo con la barra no
    // bastaba: en el Historial, al salir del buscador los desplegables vuelven
    // a mostrar su rótulo con una transición de 200ms. El cálculo del fotograma
    // siguiente los medía aún estrechos, dejaba el buscador ancho, y al
    // terminar la transición nada volvía a calcular (la barra no cambia de
    // tamaño): buscador grande y vacío y desplegables montados unos sobre
    // otros. El observador no entra en bucle: solo avisa si el tamaño FINAL de
    // un fotograma difiere del anterior.
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    const observeChildren = () => {
      if (!observer) return;
      observer.disconnect();
      observer.observe(toolbar);
      for (const child of toolbar.children) observer.observe(child);
    };
    observeChildren();
    // Los desplegables cambian de ancho con su valor ("Todo" → "Películas"),
    // y pueden aparecer o desaparecer elementos.
    const mutations = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList" && r.target === toolbar)) {
        observeChildren();
      }
      schedule();
    });
    mutations.observe(toolbar, { subtree: true, childList: true, characterData: true });
    // Al acabar cualquier transición de la barra, cálculo con el tamaño final.
    toolbar.addEventListener("transitionend", onResize);
    toolbar.addEventListener("focusin", onFocusIn);
    toolbar.addEventListener("focusout", onFocusOut);

    cleanupRef.current = () => {
      if (frame) window.cancelAnimationFrame(frame);
      cancelAnimations();
      observer?.disconnect();
      mutations.disconnect();
      toolbar.removeEventListener("transitionend", onResize);
      toolbar.removeEventListener("focusin", onFocusIn);
      toolbar.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return attach;
}
