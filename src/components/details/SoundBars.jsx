// Icono de "está sonando": cuatro barras de ecualizador. Es un <svg> de 24×24
// como los de lucide, así que las filas de acciones lo dimensionan igual que al
// resto de iconos. Sin movimiento con `prefers-reduced-motion` (ver
// `.sv-sound-bar` en globals.css).
const BARS = [
  { x: 3, delay: "0s" },
  { x: 8.5, delay: "-0.45s" },
  { x: 14, delay: "-0.2s" },
  { x: 19.5, delay: "-0.65s" },
];

export default function SoundBars({ playing = true, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      data-playing={playing ? "" : undefined}
    >
      {BARS.map(({ x, delay }) => (
        <rect
          key={x}
          className="sv-sound-bar"
          x={x - 1.5}
          y="4"
          width="3"
          height="16"
          rx="1.5"
          style={{ animationDelay: delay }}
        />
      ))}
    </svg>
  );
}
