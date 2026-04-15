export default function LoadingSeasonPage() {
  return (
    <div className="min-h-screen bg-[#101010] text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12 animate-pulse">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-28 rounded-full bg-white/10" />
          <div className="h-10 w-36 rounded-full bg-white/10" />
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-10 items-start">
          <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 shrink-0">
            <div className="aspect-[2/3] rounded-2xl bg-white/10 border border-white/10" />
          </div>

          <div className="flex-1 w-full space-y-5">
            <div className="space-y-3">
              <div className="h-4 w-24 rounded-full bg-white/10" />
              <div className="h-12 w-3/4 rounded-xl bg-white/10" />
              <div className="h-6 w-1/2 rounded-xl bg-white/10" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-28 rounded-2xl bg-white/10" />
                <div className="h-12 w-28 rounded-2xl bg-white/10" />
                <div className="h-12 w-28 rounded-2xl bg-white/10" />
              </div>
              <div className="mt-4 h-px bg-white/10" />
              <div className="mt-4 flex gap-3">
                <div className="h-8 w-24 rounded-full bg-white/10" />
                <div className="h-8 w-24 rounded-full bg-white/10" />
                <div className="h-8 w-24 rounded-full bg-white/10" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="h-24 rounded-2xl bg-white/5 border border-white/10" />
              <div className="h-24 rounded-2xl bg-white/5 border border-white/10" />
              <div className="h-24 rounded-2xl bg-white/5 border border-white/10" />
              <div className="h-24 rounded-2xl bg-white/5 border border-white/10" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-8 w-40 rounded-xl bg-white/10" />
          <div className="grid grid-cols-1 gap-4">
            <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
            <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
            <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
