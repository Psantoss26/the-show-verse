// La navegación de Next puede desmontar la ficha antes de recibir la siguiente.
// Conservamos solo su representación visual mientras llegan datos e imágenes;
// la View Transition empieza DESPUÉS de la carga, nunca dentro de ese await.
let activeTransition = null;
const FLAG = "data-details-sequence-transition";
const PART = "data-details-transition-part";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Solo damos un margen breve al fondo ligero. El reparto y las mejoras de
// resolución se completan sobre la ficha visible, sin retener su cabecera.
const IMAGE_WAIT_MS = 200;
const EXIT_MS = 220;
const NAVIGATION_WAIT_MS = 8000;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export function isDetailsSequenceTransitionActive() {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(FLAG);
}

function setNames(root, enabled) {
  root.style.viewTransitionName = enabled ? "details-sequence-page" : "";
  root.querySelectorAll(`[${PART}]`).forEach((element) => {
    element.style.viewTransitionName = enabled
      ? `details-sequence-${element.getAttribute(PART)}`
      : "";
  });
}

const SKIP = "data-details-sequence-skip";

// Marca los bloques del menú y las secciones que quedan por DEBAJO de la
// pantalla. La copia de la ficha entera son ~5.500 elementos con paneles de
// cristal, y pintarla retrasaba ~200ms el primer fotograma tras el clic (y con
// él la salida). Lo de abajo nunca se ve durante la transición y quitarlo no
// mueve lo de arriba; lo que queda por encima sí se conserva, porque
// sostiene la posición de lo visible.
function markBelowViewport(root) {
  const limit = innerHeight + 200;
  const marked = [];
  const visit = (element) => {
    for (const child of element.children || []) {
      const rect = child.getBoundingClientRect();
      if (rect.top > limit) {
        child.setAttribute(SKIP, "");
        marked.push(child);
      } else if (rect.bottom > limit) {
        visit(child);
      }
    }
  };
  root.querySelectorAll(`[${PART}="content"]`).forEach(visit);
  return marked;
}

function captureDetails(root) {
  const bounds = root.getBoundingClientRect();
  const marked = markBelowViewport(root);
  const snapshot = root.cloneNode(true);
  marked.forEach((node) => node.removeAttribute(SKIP));
  snapshot.querySelectorAll(`[${SKIP}]`).forEach((node) => node.remove());
  snapshot.removeAttribute("data-details-root");
  snapshot.removeAttribute("data-details-href");
  snapshot.setAttribute("data-details-sequence-snapshot", "");
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.inert = true;
  Object.assign(snapshot.style, {
    position: "absolute", top: `${bounds.top}px`, left: `${bounds.left}px`,
    width: `${bounds.width}px`, margin: "0", pointerEvents: "none",
  });
  snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  // Los clones son exclusivamente visuales: no arrancar audio, vídeo ni iframes.
  snapshot.querySelectorAll("audio, iframe").forEach((node) => node.remove());
  snapshot.querySelectorAll("video").forEach((node) => {
    node.removeAttribute("autoplay");
    node.removeAttribute("src");
    node.querySelectorAll("source").forEach((source) => source.remove());
  });
  const overlay = document.createElement("div");
  overlay.className = "sv-sequence-snapshot";
  overlay.setAttribute("aria-hidden", "true");
  overlay.inert = true;
  overlay.append(snapshot);
  document.body.append(overlay);
  return { snapshot, overlay };
}

async function waitForImages(root, snapshot) {
  // La portada ligera ya está lista cuando sequence-ready pasa a true.
  // No esperar por logos ni por la capa original del póster/fondo.
  const backgrounds = [...root.querySelectorAll('[data-details-background-preview]')];
  const urls = [...new Set(backgrounds.flatMap((node) => {
    const value = getComputedStyle(node).backgroundImage;
    return [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
  }))];
  const tasks = [];
  urls.forEach((url) => {
    const image = new Image();
    image.src = url;
    tasks.push(image.decode().catch(() => {}));
  });
  // Si la red supera el presupuesto, conservar una base ya pintada detrás
  // del nuevo fondo. El texto puede entrar sin descubrir una superficie negra.
  const previous = snapshot.querySelector('[data-details-background-preview]');
  const background = root.querySelector(`[${PART}="background"]`);
  const fallback = previous && background ? previous.cloneNode(true) : null;
  if (fallback) {
    fallback.removeAttribute('data-details-background-preview');
    background.prepend(fallback);
  }
  const settled = Promise.allSettled(tasks).then(() => fallback?.remove());
  await Promise.race([settled, delay(IMAGE_WAIT_MS)]);
}

function focusTitle(root) {
  const heading = root?.querySelector("h1");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  // El foco pasa al título nuevo para lectores de pantalla y teclado, pero sin
  // anillo: el título no es un control y el recuadro blanco ensuciaba la
  // cabecera al terminar la transición (`focusVisible` se ignora donde no
  // existe y el comportamiento es el de siempre).
  heading.focus({ preventScroll: true, focusVisible: false });
}

/** Bloquea clics repetidos, pero conserva los enlaces modificados en el caller. */
export async function navigateDetailsSequence({ href, direction, navigate }) {
  if (activeTransition) return false;
  const source = document.querySelector("[data-details-root][data-details-href]");
  if (!source || window.parent !== window) {
    return navigate(href);
  }

  const operation = {};
  activeTransition = operation;
  const from = location.pathname;
  const { snapshot, overlay } = captureDetails(source);
  const html = document.documentElement;
  html.setAttribute(FLAG, direction === "previous" ? "previous" : "next");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // En táctil conservamos la ficha completa hasta que llegue la siguiente.
  // Capturar varias superficies glass y animarlas por separado provoca
  // repintados caros y cambios de composición en las GPU de tablets.
  const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
  // SALIDA COMPLETA AL CLIC. Al pulsar, el contenido saliente (póster,
  // cabecera, menú y secciones) se va del todo —deslizándose hacia fuera y
  // desvaneciéndose— y solo queda el fondo. Así:
  //   - el clic responde al instante;
  //   - mientras carga la ficha nueva no hay un movimiento a medias parado (la
  //     versión anterior solo atenuaba y desplazaba 8px y ahí se quedaba);
  //   - la pausa en la que el navegador captura la View Transition no congela
  //     contenido a la vista, y la entrada del título nuevo se ve entera.
  // Si la ficha llega antes de acabar la salida, la View Transition la captura
  // a medias y su salida sigue desde ahí. El fondo no se toca: es lo que da
  // continuidad y se funde con el nuevo en la transición.
  // La ficha original sigue pintada DEBAJO de la copia hasta que Next la
  // sustituye: hay que ocultarla o se vería a través de la copia que se va.
  // Con `opacity`, no con `visibility`: esta se hereda y obligaba a recalcular
  // el estilo de miles de elementos (menú y secciones) en el fotograma del clic.
  const hiddenParts = [];
  if (!reduced && !touch) {
    source
      .querySelectorAll(`[${PART}="artwork"], [${PART}="info"], [${PART}="content"]`)
      .forEach((node) => {
        hiddenParts.push([node, node.style.opacity]);
        node.style.opacity = "0";
      });
    const shift = direction === "previous" ? 24 : -24;
    snapshot
      .querySelectorAll(`[${PART}="artwork"], [${PART}="info"], [${PART}="content"]`)
      .forEach((node) => node.animate?.(
        [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: `translateX(${shift}px)` }],
        // Curva que arranca rápido: con una de aceleración (ease-in) los primeros
        // 150ms apenas se movía y el clic parecía no responder.
        { duration: EXIT_MS, easing: "cubic-bezier(.2,0,0,1)", fill: "forwards" },
      ));
  }
  const lockedRoots = new Map();
  const lockRoot = (root) => {
    if (!root || lockedRoots.has(root)) return;
    lockedRoots.set(root, root.inert);
    root.inert = true;
  };
  lockRoot(source);
  let incoming = null;
  let viewTransition = null;
  let cancelled = false;
  const cancel = () => { cancelled = true; viewTransition?.skipTransition(); };
  window.addEventListener("popstate", cancel, { once: true });
  // Mantener la geometría de la instantánea durante la carga. La rueda queda
  // libre cuando termina; no se altera overflow ni el ancho de la página.
  const preventScroll = (event) => event.preventDefault();
  window.addEventListener("wheel", preventScroll, { passive: false });

  try {
    // La navegación pone a React a renderizar la ficha nueva en tareas largas.
    // Si empieza en el mismo instante, el navegador no pinta el primer
    // fotograma de la salida hasta que acaba ese trabajo: el contenido se
    // quedaba quieto y luego desaparecía de golpe. Dos fotogramas bastan para
    // que la salida llegue al compositor, que la sigue animando aunque el hilo
    // principal esté ocupado.
    if (!reduced) {
      await nextFrame();
      await nextFrame();
    }
    if (cancelled) return false;
    const opened = await navigate(href, { scroll: false });
    if (opened === false) return false;
    const deadline = Date.now() + NAVIGATION_WAIT_MS;
    while (!cancelled && Date.now() < deadline) {
      const route = location.pathname;
      if (route !== from && route !== href) break;
      incoming = document.querySelector(`[data-details-href="${href}"]`);
      lockRoot(incoming);
      if (incoming?.getAttribute("data-details-sequence-ready") === "true") break;
      // Errores de ruta se muestran inmediatamente, sin ocultar su recuperación.
      if (route === href && document.querySelector("[data-details-error], .next-error-h1")) {
        incoming = null;
        break;
      }
      incoming = null;
      // Se comprueba en cada fotograma: con 50ms de sondeo la transición podía
      // arrancar hasta 50ms después de estar lista la ficha.
      await nextFrame();
    }
    if (!incoming || cancelled) return false;
    incoming.setAttribute("data-details-sequence-entered", "");
    await waitForImages(incoming, snapshot);
    if (cancelled || !incoming.isConnected) return false;
    // El nuevo título arranca en su hero; la copia saliente conserva el scroll.
    window.scrollTo({ top: 0, behavior: "instant" });
    await nextFrame();
    if (!reduced && !touch && typeof document.startViewTransition === "function") {
      setNames(snapshot, true);
      viewTransition = document.startViewTransition(() => {
        overlay.remove();
        setNames(incoming, true);
      });
      void viewTransition.ready?.catch(() => {});
      await viewTransition.finished.catch(() => {});
    } else if (!reduced && overlay.animate) {
      // Baseline 2024: fundido sobre la nueva ficha YA lista, sin fondo negro.
      const x = direction === "previous" ? -24 : 24;
      const animations = (touch ? [] : [...incoming.querySelectorAll(`[${PART}="artwork"], [${PART}="info"], [${PART}="content"]`)])
        .map((node) => node.animate(
          [{ transform: `translateX(${x}px)` }, { transform: "translateX(0)" }],
          { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" },
        ));
      animations.push(overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320 }));
      await Promise.allSettled(animations.map((animation) => animation.finished));
    }
    lockedRoots.forEach((inert, root) => { root.inert = inert; });
    focusTitle(incoming);
    return true;
  } finally {
    viewTransition?.skipTransition();
    if (incoming) setNames(incoming, false);
    overlay.remove();
    // Navegación cancelada o fallida: la ficha original vuelve a verse.
    hiddenParts.forEach(([node, opacity]) => { node.style.opacity = opacity; });
    lockedRoots.forEach((inert, root) => { root.inert = inert; });
    html.removeAttribute(FLAG);
    window.removeEventListener("popstate", cancel);
    window.removeEventListener("wheel", preventScroll);
    if (activeTransition === operation) activeTransition = null;
  }
}
