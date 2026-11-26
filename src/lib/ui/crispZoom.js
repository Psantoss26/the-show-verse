// Geometría de `.sv-crisp-zoom` (globals.css) para `<NextImage fill>`: su
// estilo en línea (`inset: 0`, `width/height: 100%`) pisa cualquier clase, así
// que la imagen ampliada se pasa por `style`. Con la clase `sv-crisp-zoom`
// (escala de reposo) y `group-hover:scale-100`.
const OFFSET = "calc((1 - var(--sv-zoom)) * 50%)";
const SIZE = "calc(var(--sv-zoom) * 100%)";

export const CRISP_ZOOM_FILL_STYLE = Object.freeze({
  left: OFFSET,
  top: OFFSET,
  right: "auto",
  bottom: "auto",
  width: SIZE,
  height: SIZE,
  maxWidth: "none",
});
