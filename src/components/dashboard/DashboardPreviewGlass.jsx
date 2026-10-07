// Hermana del contenido, igual que el cristal del drawer de DetailModal.
// El padre posiciona y recorta esta capa, pero no filtra el backdrop: los
// botones, géneros y puntuaciones conservan sus propios filtros de cristal.
export default function DashboardPreviewGlass() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] backdrop-blur-md"
    />
  );
}
