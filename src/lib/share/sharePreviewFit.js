// Alto de la vista previa (9:16) del modal de compartir para que la imagen se
// vea ENTERA sin desplazar el modal: lo que deja libre el tope real del panel
// (`--sv-modal-max-h`, que ya descuenta las zonas seguras de la app de
// Android) tras la cabecera, los botones y lo que va encima de la vista previa
// en el cuerpo (relleno y selector Imagen/Vídeo), sin pasar del tope de diseño
// (`cap`) ni del alto que permite el ancho disponible a 9:16.
//
// Antes salía de una estimación fija (`85dvh − 18rem`) que no conocía ni ese
// tope ni el alto real de los botones: cuando se pasaba, el cuerpo desbordaba
// y había que desplazarse para ver la imagen completa.

const MIN_PREVIEW = 96;

export function fitSharePreviewHeight({ maxPanel, head, foot, bodyExtra, width, cap }) {
  const free = maxPanel - head - foot - bodyExtra;
  const byWidth = (width * 16) / 9;
  const h = Math.floor(Math.min(free, byWidth, cap));
  if (!Number.isFinite(h) || h < MIN_PREVIEW) return null;
  return h;
}
