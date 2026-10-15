// Cualquier otra página: el slot se vacía. Sin esto, en una navegación interna
// un slot paralelo CONSERVA lo que tenía aunque la URL nueva no le corresponda
// (comportamiento de Next): ir de una ficha a otra página dejaba la ficha
// encima y la página nueva oculta debajo.
export default function OverlayNone() {
  return null;
}
