import { notFound } from "next/navigation";
import { PROFILE_SECTION_IDS } from "../profileRoutes";

export async function generateMetadata({ params }) {
  const { username, section } = await params;
  if (!PROFILE_SECTION_IDS.has(section)) return {};
  return {
    title: `${section} · @${username}`,
    description: `Sección ${section} del perfil de @${username} en The Show Verse.`,
  };
}

export default async function UserProfileSectionPage({ params }) {
  const { section } = await params;
  if (!PROFILE_SECTION_IDS.has(section)) notFound();

  // El layout persistente conserva la cabecera y renderiza esta sección.
  return null;
}
