import DashboardSectionClient from "./DashboardSectionClient";

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
  return <DashboardSectionClient section={section} />;
}
