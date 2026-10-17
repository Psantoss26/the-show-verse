import { notFound } from "next/navigation";
import DetailsPage from "@/app/details/[type]/[id]/page";
import ActorDetailsPage from "@/app/details/person/[id]/page";
import EpisodePage from "@/app/details/tv/[id]/season/[season]/episode/[episode]/page";
import SeasonPage from "@/app/details/tv/[id]/season/[season]/page";
import EmbeddedDetailsBridge from "@/components/details/EmbeddedDetailsBridge";

export const metadata = { title: "Ficha", robots: { index: false, follow: false } };
export const revalidate = 600;

export default async function EmbeddedDetailsPage({ params, searchParams }) {
  const { segments } = await params;
  const [type, id, seasonKey, season, episodeKey, episode] = segments;
  if (!["movie", "tv", "person"].includes(type) || !/^\d+$/.test(id || "")) notFound();

  let content;
  if (type === "person") {
    // Ficha de una persona (desde el Reparto de la vista teléfono del panel).
    if (segments.length === 2) content = <ActorDetailsPage params={Promise.resolve({ id })} />;
  } else if (segments.length === 2) {
    content = (
      <DetailsPage
        params={Promise.resolve({ type, id })}
        searchParams={searchParams}
        embedded
      />
    );
  } else if (type === "tv" && seasonKey === "season" && /^\d+$/.test(season || "")) {
    if (segments.length === 4) {
      content = <SeasonPage params={Promise.resolve({ id, season })} />;
    } else if (segments.length === 6 && episodeKey === "episode" && /^\d+$/.test(episode || "")) {
      content = <EpisodePage params={Promise.resolve({ id, season, episode })} />;
    }
  }
  if (!content) notFound();

  return (
    <div data-embedded-details className={segments.length === 2 && type !== "person" ? "pt-12" : undefined}>
      <EmbeddedDetailsBridge />
      {content}
    </div>
  );
}
