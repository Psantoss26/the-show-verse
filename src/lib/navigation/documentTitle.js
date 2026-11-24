// TÍTULO DE LA PESTAÑA: un único dueño para los títulos puestos desde el cliente.
//
// Next escribe el título de cada ruta en su propio <title> (metadata). Había dos
// formas de acabar con un título que no era el de la página mostrada:
//
// 1. Fichas abiertas por navegación interna (ruta interceptora @overlay/(.)details):
//    Next solo aplica la metadata del árbol `children`, que sigue siendo la
//    página de debajo. Con la ficha abierta la pestaña decía «Calendario».
// 2. Páginas que hacían `document.title = …`: eso REESCRIBE el <title> de Next.
//    Al ir a otra página cuyo título de Next era el mismo (p. ej. «TSV» por
//    defecto) React no tocaba el nodo y se quedaba el título anterior.
//
// Aquí cada pantalla visible registra su título (`register`, desde
// `usePageTitle` en un efecto) y el registro lo pinta en un <title> PROPIO que
// coloca el primero del <head> (document.title lee el primero). El de Next no
// se toca nunca, así que cuando nadie registra nada vuelve a mandar tal cual.
// Las pantallas guardadas en <Activity mode="hidden"> limpian sus efectos al
// ocultarse y los repiten al revelarse: su título sale y entra solo.

const OWN_TITLE_ATTR = "data-sv-page-title";

export function createTitleRegistry(getDocument = () => (typeof document === "undefined" ? null : document)) {
  const entries = [];
  let node = null;

  function apply() {
    const doc = getDocument();
    const head = doc?.head;
    if (!head) return;
    const top = entries[entries.length - 1];
    if (!top) {
      if (node?.parentNode) node.parentNode.removeChild(node);
      return;
    }
    if (!node) {
      node = doc.createElement("title");
      node.setAttribute(OWN_TITLE_ATTR, "");
    }
    if (node.textContent !== top.title) node.textContent = top.title;
    const first = head.querySelector("title");
    if (first !== node) head.insertBefore(node, first);
  }

  function register(title) {
    const clean = String(title ?? "").trim();
    if (!clean) return () => {};
    const entry = { title: clean };
    entries.push(entry);
    apply();
    return () => {
      const at = entries.indexOf(entry);
      if (at < 0) return;
      entries.splice(at, 1);
      apply();
    };
  }

  return { register, apply, isOwnNode: (candidate) => candidate === node };
}

export const pageTitleRegistry = createTitleRegistry();
