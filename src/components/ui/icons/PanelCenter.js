import { createLucideIcon } from "lucide-react";

// Pareja de `PanelRight` para el modal centrado: el mismo marco (18×18, rx 2)
// con la ventana centrada en horizontal y unida SOLO al borde inferior del
// marco (sube desde él y cierra arriba con esquinas redondeadas). Se crea con
// `createLucideIcon` para heredar trazo, tamaño y props de lucide.
const PanelCenter = createLucideIcon("panel-center", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "frame" }],
  ["path", { d: "M7 21V10a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v11", key: "window" }],
]);

export default PanelCenter;
