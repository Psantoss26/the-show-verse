// La navegación de Next puede desmontar la ficha antes de recibir la siguiente.
// Conservamos solo su representación visual mientras llegan datos e imágenes;
// la View Transition empieza DESPUÉS de la carga, nunca dentro de ese await.
let activeTransition = null;
const FLAG = "data-details-sequence-transition";
const PART = "data-details-transition-part";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Tope de espera por imágenes de la ficha nueva. Las flechas precalientan el
// título vecino al pasar por encima (detailsSequenceWarmup), así que lo normal
// es que ya estén en caché; si no, la transición no se queda esperando a un
// `original` de varios MB.
const IMAGE_WAIT_MS = 900;

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

function captureDetails(root) {
  const bounds = root.getBoundingClientRect();
  const snapshot = root.cloneNode(true);
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

async function waitForImages(root) {
  const images = [...root.querySelectorAll(`[${PART}] img`)].filter((img) => {
    const rect = img.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
  });
  const background = root.querySelector(`[${PART}="background"]`);
  const backgrounds = background ? [...background.querySelectorAll("[style]")] : [];
  const urls = [...new Set(backgrounds.flatMap((node) => {
    const value = getComputedStyle(node).backgroundImage;
    return [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
  }))];
  const tasks = images.map((img) => img.decode?.().catch(() => {}));
  urls.forEach((url) => {
    const image = new Image();
    image.src = url;
    tasks.push(image.decode().catch(() => {}));
  });
  // Un recurso roto o una imagen original muy lenta no bloquea la navegación.
  await Promise.race([Promise.allSettled(tasks), delay(IMAGE_WAIT_MS)]);
}

function focusTitle(root) {
  const heading = root?.querySelector("h1");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

/** Bloquea clics repetidos, pero conserva los enlaces modificados en el caller. */
export async function navigateDetailsSequence({ href, direction, navigate }) {
  if (activeTransition) return false;
  const source = document.querySelector("[data-details-root][data-details-href]");
  if (!source || window.parent !== window || !matchMedia("(min-width: 1024px)").matches) {
    return navigate(href);
  }

  const operation = {};
  activeTransition = operation;
  const from = location.pathname;
  const { snapshot, overlay } = captureDetails(source);
  const html = document.documentElement;
  html.setAttribute(FLAG, direction === "previous" ? "previous" : "next");
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
    const opened = await navigate(href, { scroll: false });
    if (opened === false) return false;
    while (!cancelled) {
      const route = location.pathname;
      if (route !== from && route !== href) break;
      incoming = document.querySelector(`[data-details-href="${href}"]`);
      lockRoot(incoming);
      if (incoming?.getAttribute("data-details-sequence-ready") === "true") break;
      // Errores de ruta se muestran inmediatamente, sin ocultar su recuperación.
      if (route === href && document.querySelector("[data-details-error], .next-error-h1")) break;
      incoming = null;
      await delay(50);
    }
    if (!incoming || cancelled) return false;
    incoming.setAttribute("data-details-sequence-entered", "");
    await waitForImages(incoming);
    if (cancelled || !incoming.isConnected) return false;
    // El nuevo título arranca en su hero; la copia saliente conserva el scroll.
    window.scrollTo({ top: 0, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && typeof document.startViewTransition === "function") {
      setNames(snapshot, true);
      viewTransition = document.startViewTransition(() => {
        overlay.remove();
        setNames(incoming, true);
      });
      await viewTransition.finished.catch(() => {});
    } else if (!reduced && overlay.animate) {
      // Baseline 2024: fundido sobre la nueva ficha YA lista, sin fondo negro.
      const x = direction === "previous" ? -24 : 24;
      const animations = [...incoming.querySelectorAll(`[${PART}="artwork"], [${PART}="info"]`)]
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
    lockedRoots.forEach((inert, root) => { root.inert = inert; });
    html.removeAttribute(FLAG);
    window.removeEventListener("popstate", cancel);
    window.removeEventListener("wheel", preventScroll);
    if (activeTransition === operation) activeTransition = null;
  }
}
