import {
  PosterSkeleton,
  CardSkeleton,
  ScoreboardSkeleton,
  GridSkeleton,
} from "@/components/details/LoadingSkeleton";

export default function DetailsLoading() {
  return (
    <div className="min-h-screen bg-[#101010] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-8 h-10 w-56 animate-pulse rounded-full bg-white/5" />

        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <div className="mx-auto w-full max-w-[320px] lg:mx-0">
            <PosterSkeleton />
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
              <div className="h-12 w-5/6 animate-pulse rounded bg-white/5" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-white/5" />
            </div>

            <ScoreboardSkeleton />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>

            <GridSkeleton items={6} />
          </div>
        </div>
      </div>
    </div>
  );
}
