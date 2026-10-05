// src/app/detections/page.jsx
import DetectionsClient from "./DetectionsClient";

export const metadata = {
  title: "Detecciones del navegador",
  description:
    "Títulos que la extensión del navegador ha detectado en los últimos días, para corregir los que no eran correctos.",
};

export default function DetectionsPage() {
  return <DetectionsClient />;
}
