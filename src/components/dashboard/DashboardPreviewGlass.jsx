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
export default function DashboardPreviewGlass({ surface = false }) {
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
      <div
        aria-hidden="true"
        data-preview-shadow=""
        className={`pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ${LIQUID_GLASS_DETAIL_SHADOW}`}
      />
      <div
        aria-hidden="true"
        data-preview-glass=""
        className={`pointer-events-none absolute inset-0 -z-10 rounded-[inherit] backdrop-blur-md ${LIQUID_GLASS_DETAIL_TINT}`}
      />
    </>
  );
}
