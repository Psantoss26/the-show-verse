// src/components/details/ModalTitleIcon.jsx
// Icono redondo que acompaña al título de los modales de las acciones de la
// ficha (el mismo que lleva el botón que los abre). Nació en el modal de
// añadir/quitar de favoritos y pendientes; todos los modales de acción lo
// comparten para que tamaño, tinte y canto interior sean idénticos.

export const MODAL_TITLE_ICON_TONES = {
  red: "bg-red-500/15 text-red-300",
  blue: "bg-blue-500/15 text-blue-300",
  yellow: "bg-yellow-500/15 text-yellow-300",
  amber: "bg-amber-500/15 text-amber-300",
  green: "bg-emerald-500/15 text-emerald-300",
  purple: "bg-purple-500/15 text-purple-300",
  orange: "bg-orange-500/15 text-orange-300",
  sky: "bg-sky-500/15 text-sky-300",
  neutral: "bg-white/10 text-white/80",
};

export default function ModalTitleIcon({ icon: Icon, tone = "neutral", className = "" }) {
  if (!Icon) return null;
  const toneClass = MODAL_TITLE_ICON_TONES[tone] || MODAL_TITLE_ICON_TONES.neutral;
  return (
    <span
      data-modal-title-icon=""
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${toneClass} ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}
