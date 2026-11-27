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
      const dropdowns = [...toolbar.children].filter(
        (child) =>
          !isCollapsed(child) &&
          child.querySelector(":scope > button .sv-page-toolbar-value"),
      );
      return { search, dropdowns };
    };

    // BOTONES QUE APARECEN Y DESAPARECEN («Subagrupar», unido a «Agrupar»).
    // Llevan `data-toolbar-collapse="open" | "closed"`: cerrados siguen en la
    // fila con ancho 0 y un margen que anula su hueco (globals.css), así que no
    // cuentan para la medida; al cambiar el atributo, su ancho y su margen se
    // animan como el resto de la barra (ver `animateFrom`).
    const isCollapsed = (el) => el.dataset?.toolbarCollapse === "closed";
    const marginLeftOf = (el) =>
      Number.parseFloat(getComputedStyle(el).marginLeft) || 0;
    // Anchos y márgenes de la barra en reposo tras cada medida: React cambia el
    // atributo antes de que el hook se entere, así que el «antes» de esa
    // animación no se puede medir ya, se recuerda.
    let settled = new Map();
    let toggled = new Set();
    const rememberSettled = () => {
      settled = new Map();
      for (const child of toolbar.children) {
        settled.set(child, {
          width: child.getBoundingClientRect().width,
          marginLeft: marginLeftOf(child),
        });
      }
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
          // En cuadrado es un botón más de la barra: la flecha, como los demás
          // (el cursor de texto lo hacía parecer un campo).
          input.style.cursor = "default";
        } else {
          if (input.dataset.fitPlaceholder != null) {
            input.setAttribute("placeholder", input.dataset.fitPlaceholder);
            delete input.dataset.fitPlaceholder;
          }
          input.style.paddingLeft = "";
          input.style.paddingRight = "";
          input.style.cursor = "";
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
    // Los márgenes cuentan: el botón unido a su vecino se mete en el hueco
    // con uno negativo.
    const neededWidth = (searchPx) => {
      const children = [...toolbar.children].filter(
        (child) => child.offsetParent !== null && !isCollapsed(child),
      );
      const gap = Number.parseFloat(getComputedStyle(toolbar).columnGap) || 0;
      return children.reduce((sum, child) => {
        if (child.matches(".sv-page-toolbar-search")) return sum + searchPx;
        return (
          sum +
          Math.max(child.getBoundingClientRect().width, child.scrollWidth) +
          marginLeftOf(child)
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
    //   "lean"      además, los botones sueltos ("Filtros") en icono: los
    //               desplegables conservan su valor, que es lo que dice cómo
    //               está filtrada, agrupada y ordenada la lista. En el
    //               Historial a 1920px faltaban ~40px y, sin este paso, los
    //               desplegables quedaban en icono y el buscador se llevaba
    //               ~230px vacíos.
    //   "icons"     desplegables en icono y flecha
    //   "bare"      además, el selector de secciones sin títulos
    const STAGES = ["", "no-labels", "lean", "icons", "bare"];
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

    const animateFrom = (widths, margins, toggledNow, texts, input, padding) => {
      const children = [...toolbar.children].filter(
        (child) => child.offsetParent !== null,
      );
      const options = { duration: FIT_ANIMATION_MS, easing: FIT_ANIMATION_EASING };
      // Todos los anchos finales ANTES de animar nada: cada animación que
      // arranca devuelve su pieza al ancho de partida y apretaría a las demás.
      const targets = children.map((child) => ({
        width: child.getBoundingClientRect().width,
        marginLeft: marginLeftOf(child),
      }));
      for (const [index, child] of children.entries()) {
        const from = widths.get(child);
        const to = targets[index].width;
        const fromMargin = margins.get(child) ?? targets[index].marginLeft;
        const toMargin = targets[index].marginLeft;
        if (
          from == null ||
          (Math.abs(from - to) < 0.5 && Math.abs(fromMargin - toMargin) < 0.5)
        ) {
          continue;
        }
        const appearing = toggledNow.has(child);
        const keyframe = (width, marginLeft) => ({
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: `${width}px`,
          minWidth: 0,
          marginLeft: `${marginLeft}px`,
          // Cerrado lleva `visibility: hidden`: mientras se pliega, se ve.
          ...(appearing ? { visibility: "visible", overflow: "hidden" } : null),
        });
        animations.push(
          child.animate(
            [keyframe(from, fromMargin), keyframe(to, toMargin)],
            options,
          ),
        );
        // Lo que entra o sale funde su contenido (icono, rótulo, flecha), no
        // la caja: con `opacity` en la caja, su cristal se quedaba plano
        // mientras dura (el botón es su propio «backdrop root»).
        if (appearing) {
          const opening = !isCollapsed(child);
          const fade = opening
            ? [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }]
            : [{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }];
          for (const part of child.querySelectorAll(":scope > button > *")) {
            animations.push(part.animate(fade, options));
          }
        }
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
      const toggledNow = toggled;
      toggled = new Set();
      const widths = new Map();
      const margins = new Map();
      const texts = new Set();
      const input = search.querySelector("input");
      let padding = null;
      if (animate) {
        if (input) padding = inputPadding(input);
        // Un botón que aparece o desaparece ya cambió en el DOM: se parte de
        // la barra en reposo recordada. A mitad de otra animación, de lo que
        // se ve.
        const fromSettled = toggledNow.size > 0 && !animations.length;
        for (const child of toolbar.children) {
          const remembered = fromSettled ? settled.get(child) : null;
          widths.set(
            child,
            remembered ? remembered.width : child.getBoundingClientRect().width,
          );
          margins.set(
            child,
            remembered ? remembered.marginLeft : marginLeftOf(child),
          );
        }
        for (const text of toolbar.querySelectorAll(TEXT_SELECTOR)) {
          if (isShown(text)) texts.add(text);
        }
      }
      cancelAnimations();
      // Un botón plegado no se estira: suelta los estilos en línea que le
      // dejó la medida de cuando estaba abierto.
      for (const child of toolbar.children) {
        if (!isCollapsed(child)) continue;
        child.style.flexGrow = "";
        child.style.flexShrink = "";
        const trigger = child.querySelector(":scope > button");
        if (trigger) trigger.style.width = "";
      }

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
      rememberSettled();
      if (animate) animateFrom(widths, margins, toggledNow, texts, input, padding);
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
    // Un botón que aparece o desaparece (`data-toolbar-collapse`) se anima.
    const mutations = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList" && r.target === toolbar)) {
        observeChildren();
      }
      for (const record of records) {
        if (record.type === "attributes" && record.target.parentElement === toolbar) {
          toggled.add(record.target);
          animateNext = true;
        }
      }
      // La animación en curso se corta y la nueva parte de lo que se ve.
      if (toggled.size) updateNow();
      else schedule();
    });
    mutations.observe(toolbar, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-toolbar-collapse"],
    });
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
