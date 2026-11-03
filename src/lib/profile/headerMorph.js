// Cambio entre la cabecera completa del Perfil y la compacta (vista neuronal).
//
// Las dos cabeceras están siempre montadas y SUPERPUESTAS en la misma caja: la
// activa ocupa sitio y la otra queda encima, absoluta e invisible. Al cambiar:
//   - la caja anima su ALTURA (de la cabecera que se va a la que llega), para
//     que pestañas y contenido —el lienzo neuronal— acompañen el cambio;
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
// final. Devuelve una función que cancela la animación en curso.
export function morphProfileHeader({ box, incoming, outgoing }) {
  const oldHeight = outgoing.offsetHeight;
  const newHeight = incoming.offsetHeight;
  const from = pieces(outgoing);
  const to = pieces(incoming);
  const timing = { duration: HEADER_MORPH_MS, easing: HEADER_MORPH_EASING };
  const animations = [];

  // Recorte solo mientras dura: en reposo las tarjetas tienen sombras y
  // escalado al pasar el ratón que no deben cortarse.
  box.style.overflow = "clip";
  animations.push(box.animate({ height: [`${oldHeight}px`, `${newHeight}px`] }, timing));
  animations.push(
    // Fundido corto y temprano (la curva hace casi todo el viaje al principio):
    // así no se ven las dos cabeceras a medias ni lo que no viaja recortado.
    outgoing.animate({ opacity: [1, 0, 0], offset: [0, 0.3, 1] }, { duration: HEADER_MORPH_MS, easing: "linear" }),
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

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    box.style.overflow = "";
  };
  animations[0].finished.then(finish, finish);
  return () => {
    for (const animation of animations) animation.cancel();
    finish();
  };
}
