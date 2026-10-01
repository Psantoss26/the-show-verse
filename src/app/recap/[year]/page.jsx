import { notFound } from "next/navigation";
import RecapClient from "@/components/recap/RecapClient";

function parseYear(value) {
  const year = Number(value);
  return /^\d{4}$/.test(String(value)) && year >= 1990 && year <= 2100 ? year : null;
}

export async function generateMetadata({ params }) {
  const { year } = await params;
  const parsed = parseYear(year);
  if (!parsed) return {};
  return {
    title: `Tu ${parsed} en The Show Verse`,
    description: `Tu resumen de ${parsed}: lo que viste, tus series y películas del año y tu perfil de espectador.`,
  };
}

export default async function RecapYearPage({ params }) {
  const { year } = await params;
  const parsed = parseYear(year);
  if (!parsed) notFound();
  return <RecapClient year={parsed} />;
}
