// src/components/details/LoadingSkeleton.jsx
"use client";

export function PosterSkeleton() {
  return (
    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-neutral-900 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-transparent animate-shimmer" />
    </div>
  );
}

export function CardSkeleton({ className = "" }) {
  return (
    <div
      className={`rounded-xl overflow-hidden bg-neutral-900/50 backdrop-blur-sm relative ${className}`}
    >
      <div className="p-4 space-y-3">
        <div className="h-4 bg-neutral-800 rounded-full w-3/4 animate-pulse" />
        <div className="h-3 bg-neutral-800 rounded-full w-1/2 animate-pulse" />
        <div className="h-3 bg-neutral-800 rounded-full w-5/6 animate-pulse" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    </div>
  );
}

export function ScoreboardSkeleton() {
  return (
    <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden">
      <div className="py-3 px-4 flex items-center gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-neutral-800 animate-pulse" />
            <div className="h-3 w-16 bg-neutral-800 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6, className = "" }) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
