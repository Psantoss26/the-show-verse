import { notFound } from "next/navigation";
import ActorDetails from "@/components/ActorDetails";
import { getActorDetailsFull, getActorKnownFor } from "@/lib/api/tmdb";

export default async function ActorDetailsPage({ params }) {
  const { id } = await params;
  const actorDetails = await getActorDetailsFull(id);

  if (!actorDetails) notFound();

  const knownFor = await getActorKnownFor(id, actorDetails.name);
  const actorMovies = actorDetails?.combined_credits?.cast || [];

  return (
    <ActorDetails
      actorDetails={actorDetails}
      actorMovies={actorMovies}
      initialKnownFor={knownFor}
    />
  );
}
