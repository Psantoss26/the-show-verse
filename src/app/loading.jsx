function SkeletonRow() {
  return (
    <div>
      <div className="h-3 w-20 bg-neutral-800 rounded mb-2 animate-pulse" />
      <div className="h-7 w-44 bg-neutral-800 rounded mb-4 animate-pulse" />
      <div className="flex gap-3 sm:gap-3.5 md:gap-3.5 lg:gap-[18px] xl:gap-5 overflow-hidden">
        {Array.from({ length: 12 }).map((_, j) => (
          <div
            key={j}
            className="flex-shrink-0 w-[calc((100%-24px)/3)] sm:w-[calc((100%-42px)/4)] md:w-[190px] xl:w-[210px] aspect-[2/3] md:aspect-auto md:h-[300px] xl:h-[340px] rounded-lg bg-neutral-800/60 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black px-4 sm:px-6 py-6 sm:py-8">
      {/* Hero skeleton */}
      <div className="mb-10 sm:mb-14">
        <div className="h-4 w-24 bg-neutral-800 rounded mb-3 animate-pulse" />
        <div className="h-8 w-56 bg-neutral-800 rounded mb-5 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[16/9] rounded-xl bg-neutral-800/60 animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Row skeletons */}
      <div className="space-y-14 sm:space-y-16">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
