// src/app/detections/[id]/page.jsx
import DetectionCorrectionClient from "./DetectionCorrectionClient";

export const metadata = {
  title: "Corregir detección",
  description:
    "Indica si el título que detectó la sincronización de streaming era incorrecto para que no vuelva a pasar.",
};

export default async function DetectionCorrectionPage({ params }) {
  const { id } = await params;
  return <DetectionCorrectionClient detectionId={id} />;
}
