// Me gusta (públicos) de las colecciones ya conocidos en esta pestaña.
//
// El índice de /lists ordena las colecciones por likes, así que no puede
// pintarlas hasta saberlos: si las pintara con 0 y luego llegaran los reales,
// las tarjetas cambiarían de sitio delante del usuario (p. ej. al volver de una
// ficha con «Más likes»). Guardarlos en la sesión permite pintar el orden final
// desde el primer fotograma; la petición de siempre solo confirma.
//
// La ficha de colección también escribe aquí al dar o quitar un me gusta, para
// que al volver el índice ya tenga el recuento nuevo.

const KEY = "showverse:lists:collection-likes:v1";
const TTL_MS = 20 * 60 * 1000;

let memory = null;

function load() {
  if (memory) return memory;
  memory = {};
  if (typeof window === "undefined") return memory;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    if (parsed && Date.now() - Number(parsed.t || 0) <= TTL_MS && parsed.data && typeof parsed.data === "object") {
      memory = { ...parsed.data };
    }
  } catch {
    // Sesión no disponible: solo memoria.
  }
  return memory;
}

/** Copia de lo conocido: { [collectionId]: likes }. */
export function readCollectionLikes() {
  return { ...load() };
}

/** Añade recuentos ({ [id]: likes }) y los guarda en la sesión. */
export function mergeCollectionLikes(likesById) {
  const next = load();
  for (const [id, likes] of Object.entries(likesById || {})) {
    next[id] = Number(likes) || 0;
  }
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data: next }));
  } catch {
    // Sesión llena: queda en memoria.
  }
}

/** ¿Se conocen los likes de todas estas colecciones? */
export function hasCollectionLikes(likesById, ids) {
  return ids.every((id) => Object.hasOwn(likesById, String(id)));
}
