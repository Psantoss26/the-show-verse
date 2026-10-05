// src/app/detections/page.jsx
import DetectionsClient from "./DetectionsClient";

export const metadata = {
  title: "Detecciones recientes",
  description:
    "Títulos que la sincronización de streaming ha detectado en los últimos días, para corregir los que no eran correctos.",
};

export default function DetectionsPage() {
  return <DetectionsClient />;
}
