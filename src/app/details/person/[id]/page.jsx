import { notFound } from "next/navigation";
import { headers } from "next/headers";
import ActorDetails from "@/components/ActorDetails";
import { getActorDetailsFull, getActorKnownFor } from "@/lib/api/tmdb";

async function getInitialWatchedCredits(personId) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const protocol = (requestHeaders.get("x-forwarded-proto") || "http")
    .split(",")[0]
    .trim();
  const host = (
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || ""
  )
    .split(",")[0]
    .trim();

  if (!personId || !cookie || !host) return [];

  try {
    const response = await fetch(
      `${protocol}://${host}/api/trakt/person/${encodeURIComponent(personId)}/watched`,
      {
        headers: { cookie },
        cache: "no-store",
      },
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const actorDetails = await getActorDetailsFull(id).catch(() => null);

  return {
    title: actorDetails?.name || "Actor",
  };
}

export default async function ActorDetailsPage({ params }) {
  const { id } = await params;
  const actorDetails = await getActorDetailsFull(id);

  if (!actorDetails) notFound();

  const [knownFor, initialWatchedCredits] = await Promise.all([
    getActorKnownFor(id, actorDetails.name),
    getInitialWatchedCredits(id),
  ]);
  const actorMovies = actorDetails?.combined_credits?.cast || [];

  return (
    <ActorDetails
      actorDetails={actorDetails}
      actorMovies={actorMovies}
      initialKnownFor={knownFor}
      initialWatchedCredits={initialWatchedCredits}
    />
  );
}
