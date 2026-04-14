import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";

export const revalidate = 600;

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const data = await getDetails(type, id);

  if (!data) {
    notFound();
  }

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
    />
  );
}
