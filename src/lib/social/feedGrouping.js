// Agrupado del feed de Social.
//
// Las páginas de usuario (Historial, Favoritos, Pendientes…) agrupan su lista
// con un desplegable "Agrupar" y una cabecera por grupo; Social no lo tenía.
// Aquí vive esa lógica, FUERA del componente, porque es puro cálculo sobre una
// lista y así se puede probar sin montar la página.
//
// Los criterios son los que tienen sentido en un muro de actividad: cuándo pasó
// (día, mes), qué se hizo (acción) y quién lo hizo (persona). Los de fecha
// respetan el orden elegido en la barra; los otros dos se ordenan por tamaño,
// que es lo que hace útil la cabecera.

export const SOCIAL_GROUP_OPTIONS = [
  ["none", "Sin agrupar"],
  ["day", "Día"],
  ["month", "Mes"],
  ["action", "Acción"],
  ["person", "Persona"],
];

// Rótulo corto para el botón del menú en móvil, donde no cabe el largo.
export const SOCIAL_GROUP_SHORT_LABELS = {
  none: "Sin agr.",
  day: "Día",
  month: "Mes",
  action: "Acción",
  person: "Persona",
};

// Mismos nombres que el filtro de acción: si el filtro dice "Visionados", la
// cabecera del grupo no puede decir otra cosa.
const ACCION_LABELS = {
  watched: "Visionados",
  rating: "Puntuaciones",
  review: "Reseñas",
  favorite: "Favoritos",
  watchlist: "Pendientes",
  list: "Listas",
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function conMayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "list_item" y "list" son la misma acción para quien lee el feed. */
export function accionDeEvento(evento) {
  return evento?.type === "list_item" ? "list" : evento?.type;
}

function fechaValida(evento) {
  const fecha = new Date(evento?.createdAt);
  return Number.isFinite(fecha.getTime()) ? fecha : null;
}

/**
 * Etiqueta del día. Los dos más recientes se dicen por su nombre ("Hoy",
 * "Ayer") porque en un feed es la referencia que se busca; el resto va con la
 * fecha completa.
 */
function etiquetaDeDia(fecha, hoy) {
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const referencia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diferencia = Math.round((referencia - dia) / 86400000);
  if (diferencia === 0) return "Hoy";
  if (diferencia === 1) return "Ayer";
  const mismoAno = fecha.getFullYear() === hoy.getFullYear();
  const base = `${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
  return mismoAno ? base : `${base} de ${fecha.getFullYear()}`;
}

function claveDeDia(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Reparte [eventos] en grupos según [agrupar].
 *
 * Devuelve `null` cuando no hay que agrupar, en vez de un único grupo con todo:
 * así quien pinta distingue "sin agrupar" de "un solo grupo" sin inspeccionar
 * la longitud.
 *
 * @param {Array} eventos lista ya filtrada y ordenada
 * @param {string} agrupar clave de SOCIAL_GROUP_OPTIONS
 * @param {{ orden?: string, ahora?: Date }} opciones
 */
export function groupSocialFeed(eventos, agrupar, { orden = "recent", ahora } = {}) {
  if (!Array.isArray(eventos) || eventos.length === 0) return null;
  if (!agrupar || agrupar === "none") return null;

  const hoy = ahora instanceof Date ? ahora : new Date();
  const grupos = new Map();

  const anadir = (clave, etiqueta, evento, peso) => {
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { key: clave, label: etiqueta, items: [], peso };
      grupos.set(clave, grupo);
    }
    grupo.items.push(evento);
  };

  for (const evento of eventos) {
    if (agrupar === "day" || agrupar === "month") {
      const fecha = fechaValida(evento);
      if (!fecha) {
        anadir("sin-fecha", "Sin fecha", evento, -Infinity);
        continue;
      }
      if (agrupar === "day") {
        anadir(claveDeDia(fecha), etiquetaDeDia(fecha, hoy), evento, fecha.getTime());
      } else {
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
        const etiqueta = conMayuscula(
          `${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`,
        );
        // El peso del mes es su primer día: así ordena igual con o sin datos.
        anadir(clave, etiqueta, evento, new Date(fecha.getFullYear(), fecha.getMonth(), 1).getTime());
      }
      continue;
    }

    if (agrupar === "action") {
      const accion = accionDeEvento(evento);
      anadir(accion || "otros", ACCION_LABELS[accion] || "Otros", evento, 0);
      continue;
    }

    // person
    const autor = evento?.author;
    const clave = autor?.username || autor?.id || "yo";
    anadir(clave, autor?.displayName || "Tu actividad", evento, 0);
  }

  const lista = Array.from(grupos.values());

  if (agrupar === "day" || agrupar === "month") {
    // Los grupos siguen al orden de la barra: si el feed va de antiguo a
    // reciente, las cabeceras también.
    lista.sort((a, b) => (orden === "oldest" ? a.peso - b.peso : b.peso - a.peso));
  } else {
    // Por tamaño: la cabecera solo aporta si lo grande va primero. A igualdad,
    // alfabético, para que no baile entre recargas.
    lista.sort(
      (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, "es"),
    );
  }

  return lista.map(({ key, label, items }) => ({ key, label, items }));
}
