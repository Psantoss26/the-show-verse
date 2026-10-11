import DashboardSectionClient from "./DashboardSectionClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";

const SECTION_TITLES = {
  tendencias: "Tendencias",
  populares: "Populares",
  recomendados: "Recomendados",
  "mas-esperadas": "Más esperadas",
};

export async function generateMetadata({ params }) {
  const { section } = await params;
  return {
    title: SECTION_TITLES[section] || "Sección",
  };
}

export default async function DashboardSectionPage({ params }) {
  const { section } = await params;
  // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una
  // tarjeta, igual que en Favoritos y el resto de páginas de usuario.
  return (
    <DetailModalProvider placement="right">
      <DashboardSectionClient section={section} />
    </DetailModalProvider>
  );
}
