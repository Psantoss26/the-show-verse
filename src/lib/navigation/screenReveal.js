// ¿Se está REVELANDO una pantalla que seguía montada?
//
// OverlayRouteHost conserva las pantallas anteriores en <Activity hidden> y, al
// volver atrás, las muestra tal cual. React deshace sus efectos al ocultarlas y
// los vuelve a ejecutar al mostrarlas, aunque nada haya cambiado: los efectos
// de carga de la ficha vaciaban su estado y volvían a pedirlo (secciones que
// desaparecen y entran de nuevo). Mientras dura el commit que revela la
// pantalla esta marca está puesta, y esos efectos se saltan si ya habían
// terminado con las mismas dependencias (ver lib/details/detailsBackSnapshot).
//
// Una marca explícita y no "el efecto se repitió sin cambiar sus
// dependencias": eso también pasa con el doble montaje de StrictMode en
// desarrollo, donde la primera carga se cancela y hay que repetirla.

// Identificador del revelado en curso (0 = ninguno). Cada revelado termina
// solo el suyo: la limpieza del anterior llega en el commit del siguiente.
let revealing = 0;
let lastReveal = 0;

export function beginScreenReveal() {
  lastReveal += 1;
  revealing = lastReveal;
  return revealing;
}

export function currentScreenReveal() {
  return revealing;
}

export function endScreenReveal(reveal) {
  if (revealing === reveal) revealing = 0;
}

export function isScreenReveal() {
  return revealing !== 0;
}
