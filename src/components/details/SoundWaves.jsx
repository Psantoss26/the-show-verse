// Icono de "está sonando": el altavoz de lucide (Volume2) con sus dos ondas
// latiendo, una tras otra. Antes eran barras de ecualizador, pero en las
// series se confundían con el icono de valoración de episodios (BarChart3),
// que va al lado. El altavoz además casa con el de silenciado (VolumeX).
// Es un <svg> de 24×24 con trazo, como los de lucide, así que las filas de
// acciones lo dimensionan igual que al resto. Sin movimiento con
// `prefers-reduced-motion` (ver `.sv-sound-wave` en globals.css).
export default function SoundWaves({ playing = true, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      data-playing={playing ? "" : undefined}
    >
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path className="sv-sound-wave" d="M16 9a5 5 0 0 1 0 6" />
      <path className="sv-sound-wave" d="M19.364 18.364a9 9 0 0 0 0-12.728" style={{ animationDelay: "0.25s" }} />
    </svg>
  );
}
