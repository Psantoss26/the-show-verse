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

    const parts = () => {
      const search = toolbar.querySelector(":scope > .sv-page-toolbar-search");
      const dropdowns = [...toolbar.children].filter((child) =>
        child.querySelector(":scope > .sv-page-toolbar-trigger"),
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

    const setDropdownsGrow = (dropdowns, grow) => {
      for (const wrapper of dropdowns) {
        const trigger = wrapper.querySelector(":scope > .sv-page-toolbar-trigger");
        wrapper.style.flexGrow = grow ? "1" : "";
        if (trigger) trigger.style.width = grow ? "100%" : "";
      }
    };

    const update = () => {
      frame = 0;
      const { search, dropdowns } = parts();
      if (!search) return;
      const iconPx = remToPx(ICON_SIZE_REM);
      const labelPx = labelWidthPx(search.querySelector("input"));

      // Sin transición: las reglas globales de la barra animaban `flex-basis`,
      // y aquí se cambia un instante para medir. Con la animación el buscador
      // se quedaba a medio camino (ni icono ni texto) y el observador lo volvía
      // a medir mientras tanto, atascándolo en un tamaño intermedio.
      search.style.transition = "none";
      // Estado NATURAL para medir: buscador en cuadrado y desplegables sin
      // estirar. Lo que queda libre es lo que el buscador podría añadir.
      search.style.flex = `0 0 ${iconPx}px`;
      search.style.minWidth = `${iconPx}px`;
      setDropdownsGrow(dropdowns, false);
      const children = [...toolbar.children].filter(
        (child) => child.offsetParent !== null,
      );
      const first = children[0]?.getBoundingClientRect();
      const last = children.at(-1)?.getBoundingClientRect();
      const used = first && last ? last.right - first.left : 0;
      const free = toolbar.clientWidth - used;
      const fitsLabel = iconPx + free >= labelPx;

      if (fitsLabel || focused) {
        // Con texto: ocupa el hueco, al menos lo que necesita el texto.
        search.style.flex = `1 1 ${labelPx}px`;
        search.style.minWidth = focused && !fitsLabel ? `${labelPx}px` : `${iconPx}px`;
        search.dataset.searchFit = "label";
        setSearchIconMode(search, false);
      } else {
        // Solo icono: cuadrado, y el sobrante para los desplegables.
        search.dataset.searchFit = "icon";
        setSearchIconMode(search, true);
        setDropdownsGrow(dropdowns, true);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const onFocusIn = (event) => {
      if (!event.target.closest?.(".sv-page-toolbar-search")) return;
      focused = true;
      schedule();
    };
    const onFocusOut = (event) => {
      if (!event.target.closest?.(".sv-page-toolbar-search")) return;
      focused = false;
      schedule();
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
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
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
    toolbar.addEventListener("transitionend", schedule);
    toolbar.addEventListener("focusin", onFocusIn);
    toolbar.addEventListener("focusout", onFocusOut);

    cleanupRef.current = () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations.disconnect();
      toolbar.removeEventListener("transitionend", schedule);
      toolbar.removeEventListener("focusin", onFocusIn);
      toolbar.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return attach;
}
