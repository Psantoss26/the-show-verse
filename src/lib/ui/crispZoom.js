// Geometría de `.sv-crisp-zoom` (globals.css) para `<NextImage fill>`: su
// estilo en línea (`inset: 0`, `width/height: 100%`) pisa la posición de la
// clase, así que la posición se pasa por `style`. El TAMAÑO no: Next lanza un
// error en desarrollo si `fill` lleva `style.width/height` («has both "fill"
// and "style.width"»), y rompía DetailModal. El tamaño ampliado lo pone la
// clase con `!important`. Con la clase `sv-crisp-zoom` (escala de reposo) y
// `group-hover:scale-100`.
const OFFSET = "calc((1 - var(--sv-zoom)) * 50%)";

export const CRISP_ZOOM_FILL_STYLE = Object.freeze({
  left: OFFSET,
  top: OFFSET,
  right: "auto",
  bottom: "auto",
  maxWidth: "none",
});
