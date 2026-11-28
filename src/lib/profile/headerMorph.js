// Cambio entre la cabecera completa del Perfil y la compacta (vista neuronal).
//
// Las dos cabeceras están siempre montadas y SUPERPUESTAS en la misma caja: la
// activa ocupa sitio y la otra queda encima, absoluta e invisible. Al cambiar:
//   - la caja toma al instante la altura de la que llega y lo que va DEBAJO
//     (pestañas y contenido) sale desplazado donde estaba y vuelve a su sitio
//     con transform. Antes se animaba la altura de la caja: eso va en el hilo
//     principal y, en el móvil, con el hilo ocupado (montar la sección) las
//     pestañas y el lienzo se quedaban atrás de las piezas que viajan (que van
//     por el compositor) y alcanzaban de golpe: un «bache». Ahora TODO el
//     morph es transform y opacidad;
//   - lo marcado con `data-header-morph-pin` dentro de lo de debajo (el lienzo
//     neuronal) se desplaza al revés a la vez: queda quieto en pantalla
//     mientras su marco se mueve;
//   - las cabeceras se funden (la que se va antes, la que llega después);
//   - las piezas que existen en las dos (avatar, nombre y las cuatro tarjetas
//     de recuento, marcadas con `data-header-morph`) VIAJAN de una a otra: la
//     que llega sale desde donde está su pareja y la que se va va hacia la
//     suya. Solo transform y opacidad (WAAPI), sin recortar nada a la mitad.
//
// Antes eran dos rejillas 0fr ↔ 1fr apiladas: se veían las dos a la vez,
// recortadas por abajo como una persiana (avatar y tarjetas partidos).

export const HEADER_MORPH_MS = 420;
export const HEADER_MORPH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

function pieces(layer) {
  const map = new Map();
  for (const el of layer.querySelectorAll("[data-header-morph]")) {
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) map.set(el.dataset.headerMorph, { el, rect });
  }
  return map;
}

// Transformación que lleva visualmente `from` (rect propio del elemento) sobre
// `to`. Siempre con escala UNIFORME (nada de texto estirado):
//   - nombre: escala por tamaño de letra, alineado por el borde izquierdo y el
//     centro vertical (su caja puede ser más ancha que el texto);
//   - avatar: círculo sobre círculo, por la esquina;
//   - tarjeta ↔ píldora: por el ancho, centro sobre centro (la forma distinta
//     la resuelve el fundido cruzado).
function transformBetween(key, from, to) {
  const fromCenterY = from.rect.top + from.rect.height / 2;
  const toCenterY = to.rect.top + to.rect.height / 2;
  if (key === "name") {
    const scale =
      parseFloat(getComputedStyle(to.el).fontSize) / Math.max(1, parseFloat(getComputedStyle(from.el).fontSize));
    const dx = to.rect.left - from.rect.left;
    return { origin: "0 50%", transform: `translate(${dx}px, ${toCenterY - fromCenterY}px) scale(${scale})` };
  }
  const scale = to.rect.width / from.rect.width;
  if (key === "avatar") {
    const dx = to.rect.left - from.rect.left;
    const dy = to.rect.top - from.rect.top;
    return { origin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${scale})` };
  }
  const dx = to.rect.left + to.rect.width / 2 - (from.rect.left + from.rect.width / 2);
  return { origin: "50% 50%", transform: `translate(${dx}px, ${toCenterY - fromCenterY}px) scale(${scale})` };
}

const IDENTITY = "translate(0px, 0px) scale(1)";

// Anima el cambio. `incoming` es la cabecera que acaba de pasar a ocupar
// sitio, `outgoing` la que ya está absoluta encima; el DOM ya refleja el estado
// final. `onFinish` se llama solo si la animación termina sola (no al
// cancelarla). Devuelve una función que cancela la animación en curso.
// `followers`: lo que va debajo de la caja (se desplaza con su altura).
export function morphProfileHeader({ incoming, outgoing, followers = [], onFinish }) {
  const oldHeight = outgoing.offsetHeight;
  const newHeight = incoming.offsetHeight;
  const from = pieces(outgoing);
  const to = pieces(incoming);
  const timing = { duration: HEADER_MORPH_MS, easing: HEADER_MORPH_EASING };
  const animations = [];

  // `add`: se suma a las entradas CSS de la sección (que también usan
  // transform) en vez de anularlas.
  const shift = oldHeight - newHeight;
  const slide = (el, offset) =>
    el.animate({ transform: [`translateY(${offset}px)`, "translateY(0px)"] }, { ...timing, composite: "add" });
  if (shift) {
    for (const follower of followers) {
      animations.push(slide(follower, shift));
      for (const pin of follower.querySelectorAll("[data-header-morph-pin]")) animations.push(slide(pin, -shift));
    }
  }
  // Fundido corto y temprano (la curva hace casi todo el viaje al principio):
  // así no se ven las dos cabeceras a medias ni lo que no viaja recortado.
  const outgoingFade = outgoing.animate(
    { opacity: [1, 0, 0], offset: [0, 0.3, 1] },
    { duration: HEADER_MORPH_MS, easing: "linear" },
  );
  animations.push(
    outgoingFade,
    incoming.animate({ opacity: [0, 0, 1, 1], offset: [0, 0.08, 0.5, 1] }, { duration: HEADER_MORPH_MS, easing: "linear" }),
  );

  for (const [key, source] of from) {
    const target = to.get(key);
    if (!target) continue;
    const leave = transformBetween(key, source, target);
    animations.push(
      source.el.animate(
        { transform: [IDENTITY, leave.transform], transformOrigin: [leave.origin, leave.origin] },
        timing,
      ),
    );
    const arrive = transformBetween(key, target, source);
    animations.push(
      target.el.animate(
        { transform: [arrive.transform, IDENTITY], transformOrigin: [arrive.origin, arrive.origin] },
        timing,
      ),
    );
  }

  let cancelled = false;
  outgoingFade.finished.then(
    () => {
      if (!cancelled) onFinish?.();
    },
    () => {},
  );
  return () => {
    cancelled = true;
    for (const animation of animations) animation.cancel();
  };
}
