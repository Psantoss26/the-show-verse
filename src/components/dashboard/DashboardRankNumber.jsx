const TONE_STYLES = {
  movies: {
    legacy: {
      rim:
        "text-transparent [-webkit-text-stroke:3px_rgba(3,105,161,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(14,165,233,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
      glass:
        "bg-[linear-gradient(145deg,rgba(248,252,255,0.98)_0%,rgba(186,230,253,0.94)_20%,rgba(56,189,248,0.78)_48%,rgba(14,165,233,0.86)_72%,rgba(3,105,161,0.96)_100%)] [-webkit-text-stroke:1px_rgba(224,242,254,0.9)]",
    },
    default: {
      rim:
        "text-transparent [-webkit-text-stroke:3px_rgba(3,105,161,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(14,165,233,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
      glass:
        "bg-[linear-gradient(145deg,rgba(248,252,255,0.98)_0%,rgba(186,230,253,0.94)_20%,rgba(56,189,248,0.78)_48%,rgba(14,165,233,0.86)_72%,rgba(3,105,161,0.96)_100%)] [-webkit-text-stroke:1px_rgba(224,242,254,0.9)]",
    },
    hover: {
      rim:
        "text-transparent [-webkit-text-stroke:4px_rgba(3,105,161,0.92)] [filter:drop-shadow(0_0_15px_rgba(14,165,233,0.65))_drop-shadow(0_12px_24px_rgba(0,0,0,0.9))]",
      glass:
        "bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(186,230,253,0.98)_15%,rgba(56,189,248,0.9)_45%,rgba(14,165,233,0.95)_70%,rgba(3,105,161,1)_100%)] [-webkit-text-stroke:1.5px_rgba(255,255,255,0.95)]",
    },
  },
  series: {
    legacy: {
      rim:
        "text-transparent [-webkit-text-stroke:3px_rgba(162,28,175,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(217,70,239,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
      glass:
        "bg-[linear-gradient(145deg,rgba(254,250,255,0.98)_0%,rgba(245,208,254,0.94)_20%,rgba(232,121,249,0.78)_48%,rgba(217,70,239,0.86)_72%,rgba(162,28,175,0.96)_100%)] [-webkit-text-stroke:1px_rgba(250,232,255,0.9)]",
    },
    default: {
      rim:
        "text-transparent [-webkit-text-stroke:3px_rgba(162,28,175,0.72)] [filter:drop-shadow(0_0.055em_0.09em_rgba(217,70,239,0.3))_drop-shadow(0_0.075em_0.045em_rgba(0,0,0,0.88))]",
      glass:
        "bg-[linear-gradient(145deg,rgba(254,250,255,0.98)_0%,rgba(245,208,254,0.94)_20%,rgba(232,121,249,0.78)_48%,rgba(217,70,239,0.86)_72%,rgba(162,28,175,0.96)_100%)] [-webkit-text-stroke:1px_rgba(250,232,255,0.9)]",
    },
    hover: {
      rim:
        "text-transparent [-webkit-text-stroke:4px_rgba(162,28,175,0.92)] [filter:drop-shadow(0_0_15px_rgba(217,70,239,0.65))_drop-shadow(0_12px_24px_rgba(0,0,0,0.9))]",
      glass:
        "bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(245,208,254,0.98)_15%,rgba(232,121,249,0.9)_45%,rgba(217,70,239,0.95)_70%,rgba(162,28,175,1)_100%)] [-webkit-text-stroke:1.5px_rgba(255,255,255,0.95)]",
    },
  },
};

const SPECULAR_CLASS =
  "bg-[linear-gradient(160deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.5)_11%,rgba(255,255,255,0.08)_29%,transparent_43%)]";

const LEGACY_SPECULAR_CLASS = `${SPECULAR_CLASS} opacity-75`;

export default function DashboardRankNumber({
  rank,
  tone,
  interactive = false,
  hovered = false,
  className = "",
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.movies;

  if (!interactive) {
    const legacy = styles.legacy;
    return (
      <span
        role="img"
        aria-label={`Puesto ${rank}`}
        className={`relative isolate inline-grid select-none font-black [-webkit-font-smoothing:antialiased] [text-rendering:geometricPrecision] [font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe_UI",sans-serif] ${className}`}
      >
        <span
          aria-hidden="true"
          className={`col-start-1 row-start-1 [paint-order:stroke_fill] ${legacy.rim}`}
        >
          {rank}
        </span>
        <span
          aria-hidden="true"
          className={`col-start-1 row-start-1 bg-clip-text text-transparent [paint-order:stroke_fill] ${legacy.glass}`}
        >
          {rank}
        </span>
        <span
          aria-hidden="true"
          className={`col-start-1 row-start-1 bg-clip-text text-transparent ${LEGACY_SPECULAR_CLASS}`}
        >
          {rank}
        </span>
      </span>
    );
  }

  const wrapperClass = [
    "relative isolate inline-grid select-none font-black [-webkit-font-smoothing:antialiased] [text-rendering:geometricPrecision] [font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe_UI\",sans-serif]",
    "transition-all duration-500 ease-out origin-right",
    hovered
      ? "z-30 opacity-100 drop-shadow-[0_20px_35px_rgba(0,0,0,0.95)]"
      : "z-[5] opacity-[0.62] translate-x-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]",
    className,
  ].join(" ");

  const transformStyle = interactive
    ? {
        transform: hovered
          ? "perspective(800px) rotateY(24deg) rotateX(-6deg) scale(1.15) translate3d(calc(-0.6rem - 1.2vw), 0, 50px)"
          : "perspective(800px) rotateY(0deg) rotateX(0deg) scale(0.95) translate3d(0, 0, 0)",
        transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease-out, z-index 0.5s",
        transformOrigin: "right center",
      }
    : undefined;

  return (
    <span
      role="img"
      aria-label={`Puesto ${rank}`}
      className={wrapperClass}
      style={transformStyle}
    >
      {/* Capas por defecto */}
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 [paint-order:stroke_fill] transition-opacity duration-500 ease-out ${styles.default.rim} ${hovered ? "opacity-0" : "opacity-100"}`}
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 bg-clip-text text-transparent [paint-order:stroke_fill] transition-opacity duration-500 ease-out ${styles.default.glass} ${hovered ? "opacity-0" : "opacity-100"}`}
      >
        {rank}
      </span>

      {/* Capas hover (liquid glass destacado) */}
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 [paint-order:stroke_fill] transition-opacity duration-500 ease-out ${styles.hover.rim} ${hovered ? "opacity-100" : "opacity-0"}`}
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 bg-clip-text text-transparent [paint-order:stroke_fill] transition-opacity duration-500 ease-out ${styles.hover.glass} ${hovered ? "opacity-100" : "opacity-0"}`}
      >
        {rank}
      </span>

      {/* Brillo especular */}
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 bg-clip-text text-transparent transition-opacity duration-500 ease-out ${SPECULAR_CLASS} ${hovered ? "opacity-90" : "opacity-10"}`}
      >
        {rank}
      </span>
    </span>
  );
}
