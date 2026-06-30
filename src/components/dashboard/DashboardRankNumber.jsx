const TONE_STYLES = {
  movies: {
    rim:
      "text-transparent [-webkit-text-stroke:3px_rgba(3,105,161,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(14,165,233,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
    glass:
      "bg-[linear-gradient(145deg,rgba(248,252,255,0.98)_0%,rgba(186,230,253,0.94)_20%,rgba(56,189,248,0.78)_48%,rgba(14,165,233,0.86)_72%,rgba(3,105,161,0.96)_100%)] [-webkit-text-stroke:1px_rgba(224,242,254,0.9)]",
  },
  series: {
    rim:
      "text-transparent [-webkit-text-stroke:3px_rgba(162,28,175,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(217,70,239,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
    glass:
      "bg-[linear-gradient(145deg,rgba(254,250,255,0.98)_0%,rgba(245,208,254,0.94)_20%,rgba(232,121,249,0.78)_48%,rgba(217,70,239,0.86)_72%,rgba(162,28,175,0.96)_100%)] [-webkit-text-stroke:1px_rgba(250,232,255,0.9)]",
  },
};

const SPECULAR_CLASS =
  "bg-[linear-gradient(160deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.5)_11%,rgba(255,255,255,0.08)_29%,transparent_43%)] opacity-75";

export default function DashboardRankNumber({
  rank,
  tone,
  className = "",
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.movies;

  return (
    <span
      role="img"
      aria-label={`Puesto ${rank}`}
      className={`relative isolate inline-grid select-none font-black [-webkit-font-smoothing:antialiased] [text-rendering:geometricPrecision] [font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe_UI",sans-serif] ${className}`}
    >
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 [paint-order:stroke_fill] ${styles.rim}`}
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 bg-clip-text text-transparent [paint-order:stroke_fill] ${styles.glass}`}
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 bg-clip-text text-transparent ${SPECULAR_CLASS}`}
      >
        {rank}
      </span>
    </span>
  );
}
