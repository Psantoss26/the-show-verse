import { Suspense } from "react";
import PlansClient from "./PlansClient";

export const metadata = {
  title: "Planes",
  description: "Planes de The Show Verse: Gratis, Sin anuncios y Pro con estadísticas, recap anual, vista neuronal y Plex.",
};

export default function PlansPage() {
  // useSearchParams (vuelta de Stripe Checkout) necesita su Suspense.
  return (
    <Suspense fallback={<main className="min-h-[100svh] bg-black" />}>
      <PlansClient />
    </Suspense>
  );
}
