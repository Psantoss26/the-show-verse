// Logos propios de cada plan, de una sola tinta (`currentColor`) y con los
// detalles calados (fill-rule evenodd): dentro de la medalla de la insignia o
// del cuadro de las tarjetas de /planes, el hueco deja ver el fondo, así que
// se leen igual en cualquier color.

function PlanGlyph({ className = "", children }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

// Gratis: una pantalla con el «play» calado.
export function FreePlanIcon({ className }) {
  return (
    <PlanGlyph className={className}>
      <path
        fillRule="evenodd"
        d="M6 4h12a3.5 3.5 0 0 1 3.5 3.5v7.5a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 15V7.5A3.5 3.5 0 0 1 6 4Zm4.2 4.1v6.3c0 .5.55.8.97.53l4.9-3.15a.63.63 0 0 0 0-1.06l-4.9-3.15a.63.63 0 0 0-.97.53Z"
      />
      <path d="M8.6 19.9h6.8a1 1 0 0 1 0 2H8.6a1 1 0 0 1 0-2Z" opacity=".55" />
    </PlanGlyph>
  );
}

// Sin anuncios: un escudo con la marca de «limpio» calada.
export function AdFreePlanIcon({ className }) {
  return (
    <PlanGlyph className={className}>
      <path
        fillRule="evenodd"
        d="M12 2.2 19.7 5v6.4c0 4.7-3.2 8.7-7.7 10.4-4.5-1.7-7.7-5.7-7.7-10.4V5L12 2.2Zm-4.4 10.5 1.45-1.45 2.05 2.05 4.25-4.3 1.45 1.45-5.7 5.75-3.5-3.5Z"
      />
    </PlanGlyph>
  );
}

// Pro: un destello grande y dos pequeños.
export function ProPlanIcon({ className }) {
  return (
    <PlanGlyph className={className}>
      <path d="M10.5 3.2c.65 4.8 3 7.15 7.8 7.8-4.8.65-7.15 3-7.8 7.8-.65-4.8-3-7.15-7.8-7.8 4.8-.65 7.15-3 7.8-7.8Z" />
      <path d="M18.6 2c.25 1.75 1.1 2.6 2.9 2.9-1.8.25-2.65 1.1-2.9 2.9-.25-1.8-1.1-2.65-2.9-2.9 1.8-.3 2.65-1.15 2.9-2.9Z" opacity=".75" />
      <path d="M18.4 16.6c.18 1.3.8 1.92 2.1 2.1-1.3.18-1.92.8-2.1 2.1-.18-1.3-.8-1.92-2.1-2.1 1.3-.18 1.92-.8 2.1-2.1Z" opacity=".5" />
    </PlanGlyph>
  );
}

// VIP: una corona con una gema calada en el centro y la banda debajo.
export function VipPlanIcon({ className }) {
  return (
    <PlanGlyph className={className}>
      <path
        fillRule="evenodd"
        d="M3.4 8.2 7.6 11.6 12 5.2l4.4 6.4 4.2-3.4-1.5 9.3H4.9L3.4 8.2Zm8.6 3.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z"
      />
      <path d="M3 5.6a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Zm9-2.9a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Zm9 2.9a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Z" />
      <path d="M5.4 18.9h13.2a1 1 0 0 1 0 2H5.4a1 1 0 0 1 0-2Z" opacity=".55" />
    </PlanGlyph>
  );
}
