// Loading boundary compartido por todas las rutas /details/*.
//
// Doble propósito:
//   1) Hace efectivo el router.prefetch de la ficha: Next solo prefetchea una
//      ruta dinámica hasta su boundary de loading, así que al pulsar "Ver ficha
//      completa" la navegación commitea al instante en lugar de esperar el
//      ida-y-vuelta al servidor (getDetails + comunidad).
//   2) Ofrece una superficie oscura inmediata con [data-details-root]. La View
//      Transition del modal (DetailModal -> DetailsClient) la detecta enseguida
//      y anima SIN retardo: el panel se cierra deslizándose y, justo detrás, ya
//      está la superficie de la ficha. DetailsClient real se inyecta encima en
//      cuanto el server component resuelve, con sus propias entradas.
//
// Los colores replican el arranque de DetailsClient (root #101010 + capa de
// fondo #0a0a0a) para que el reemplazo shell -> contenido no produzca ningún
// salto de color.
export default function DetailsLoading() {
  return (
    <div
      data-details-root
      aria-busy="true"
      className="relative min-h-screen bg-[#101010] text-gray-100"
    >
      <div className="fixed inset-0 z-0 bg-[#0a0a0a]" aria-hidden="true" />
    </div>
  );
}
