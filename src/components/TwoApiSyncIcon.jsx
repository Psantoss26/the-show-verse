"use client";

const SOURCE_LABELS = {
  "tmdb-only": "TMDb",
  "trakt-only": "Trakt",
};

export function getTwoApiSyncState(tmdbActive, traktActive) {
  if (tmdbActive && traktActive) return "both";
  if (tmdbActive) return "tmdb-only";
  if (traktActive) return "trakt-only";
  return "none";
}

export function getTwoApiNextValue(tmdbActive, traktActive) {
  return getTwoApiSyncState(tmdbActive, traktActive) === "both" ? false : true;
}

export function getTwoApiSyncTitle({
  label,
  tmdbActive,
  traktActive,
  addLabel,
  removeLabel,
}) {
  const state = getTwoApiSyncState(tmdbActive, traktActive);

  if (state === "both") return `${label}: TMDb y Trakt. ${removeLabel}`;
  if (state === "tmdb-only") {
    return `${label}: solo en TMDb, falta en Trakt. Pulsa para sincronizar.`;
  }
  if (state === "trakt-only") {
    return `${label}: solo en Trakt, falta en TMDb. Pulsa para sincronizar.`;
  }
  return `${label}: sin guardar. ${addLabel}`;
}

export default function TwoApiSyncIcon({
  icon: Icon,
  tmdbActive = false,
  traktActive = false,
  className = "w-5 h-5",
}) {
  const state = getTwoApiSyncState(tmdbActive, traktActive);
  const isPartial = state === "tmdb-only" || state === "trakt-only";
  const clipPath =
    state === "tmdb-only"
      ? "inset(0 50% 0 0)"
      : state === "trakt-only"
        ? "inset(0 0 0 50%)"
        : "none";

  return (
    <span
      className="relative inline-flex w-5 h-5 items-center justify-center"
      aria-hidden="true"
    >
      <Icon className={className} />
      {state !== "none" && (
        <span className="absolute inset-0 overflow-hidden" style={{ clipPath }}>
          <Icon className={`${className} fill-current stroke-current`} />
        </span>
      )}
      {isPartial && (
        <span className="pointer-events-none absolute -bottom-2 left-1/2 max-w-8 -translate-x-1/2 truncate rounded bg-black/80 px-1 text-[0.5rem] font-black leading-3 text-white ring-1 ring-white/20">
          {SOURCE_LABELS[state]}
        </span>
      )}
    </span>
  );
}
