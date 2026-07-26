import { notFound } from "next/navigation";
import { PROFILE_SECTION_IDS } from "@/app/u/[username]/profileRoutes";

export async function generateMetadata({ params }) {
  const { section } = await params;
  if (!PROFILE_SECTION_IDS.has(section)) return {};
  return {
    title: `${section} · Perfil`,
    description: `Sección ${section} de tu perfil en The Show Verse.`,
  };
}

export default async function ProfileSectionPage({ params }) {
  const { section } = await params;
  if (!PROFILE_SECTION_IDS.has(section)) notFound();

  // El layout persistente conserva el perfil y sustituye únicamente la
  // sección activa mediante useSelectedLayoutSegment().
  return null;
}
