import { OverlayRouteMarker } from "@/components/navigation/OverlayRouteHost";

// FICHA ABIERTA POR ENCIMA DE LA PÁGINA (ruta interceptora).
//
// Al abrir una ficha (/details/...) con una navegación interna, Next la pinta
// en este slot y DEJA MONTADA la página de origen (Favoritos, Historial, un
// dashboard…), que OverlayRouteHost oculta con <Activity mode="hidden">. Al
// volver atrás el slot se vacía y la página reaparece tal cual estaba: mismo
// DOM, mismo estado, imágenes ya pintadas, sin volver a montarse ni a animar.
// Antes se desmontaba al ir a la ficha y se reconstruía al volver (portadas sin
// pintar medio segundo, la ficha asomando un instante, tarjetas que parpadean).
//
// Cada página de aquí reexporta la real de src/app/details: misma ficha, mismos
// datos. Recargar la URL (o entrar por un enlace externo) no intercepta: sirve
// la página completa de siempre.
export default function DetailsOverlayLayout({ children }) {
  return <OverlayRouteMarker>{children}</OverlayRouteMarker>;
}
