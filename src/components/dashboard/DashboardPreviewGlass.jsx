import {
  LIQUID_GLASS_DETAIL_SHADOW,
  LIQUID_GLASS_DETAIL_TINT,
} from "@/lib/ui/liquidGlass";

// Hermana del contenido, igual que el cristal del drawer de DetailModal.
// El padre posiciona y recorta esta capa, pero no filtra el backdrop: los
// botones, géneros y puntuaciones conservan sus propios filtros de cristal.
//
// Con `surface`, la capa lleva además el TINTE de la tarjeta y la sombra va en
// una hermana: es la variante de las vistas previa que se despliegan desde la
// tarjeta (`usePreviewMorph`), cuya carcasa no lleva fondo. El hook localiza
// las dos capas por sus atributos `data-preview-*`.
//
// `shadow={false}` quita la sombra: en las filas de backdrops (tarjetas bajas)
// la sombra se derramaba ~40 px sobre la fila de abajo como una franja
// borrosa fuera de la vista previa. El hook salta la capa si no existe.
export default function DashboardPreviewGlass({ surface = false, shadow = true }) {
  if (!surface) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] backdrop-blur-md"
      />
    );
  }
  return (
    <>
      {shadow ? (
        <div
          aria-hidden="true"
          data-preview-shadow=""
          className={`pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ${LIQUID_GLASS_DETAIL_SHADOW}`}
        />
      ) : null}
      <div
        aria-hidden="true"
        data-preview-glass=""
        className={`pointer-events-none absolute inset-0 -z-10 rounded-[inherit] backdrop-blur-md ${LIQUID_GLASS_DETAIL_TINT}`}
      />
    </>
  );
}
