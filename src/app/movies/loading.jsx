function SkeletonRow() {
  return (
    <div>
      <div className="h-3 w-20 bg-neutral-800 rounded mb-2" />
      <div className="h-7 w-44 bg-neutral-800 rounded mb-4" />
      <div className="flex gap-3 sm:gap-3.5 md:gap-3.5 lg:gap-[18px] xl:gap-5 overflow-hidden">
        {Array.from({ length: 12 }).map((_, j) => (
          <div
            key={j}
            className="flex-shrink-0 w-[calc((100%-24px)/3)] sm:w-[calc((100%-42px)/4)] md:w-[140px] lg:w-[170px] xl:w-[190px] 2xl:w-[210px] aspect-[2/3] md:aspect-auto md:h-[220px] lg:h-[260px] xl:h-[300px] 2xl:h-[340px] rounded-lg bg-neutral-800/60"
          />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-black px-6 py-6">
      <div className="space-y-12 pt-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
