"use client";

import { Star, StarHalf } from "lucide-react";

// Estrellas de solo lectura a partir de una nota 1-10 → escala de 5.
export default function Stars({ rating, className = "", iconClassName = "h-3.5 w-3.5" }) {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  const five = Math.max(0, Math.min(5, rating / 2));
  const full = Math.floor(five);
  const frac = five - full;
  const half = frac >= 0.25 && frac < 0.75;
  const roundedUp = frac >= 0.75;
  const fullCount = full + (roundedUp ? 1 : 0);
  return (
    <span
      className={`inline-flex items-center gap-[1px] text-emerald-400 ${className}`}
      aria-label={`${five.toFixed(1)} de 5`}
    >
      {Array.from({ length: fullCount }, (_, index) => (
        <Star key={index} className={`${iconClassName} fill-current`} />
      ))}
      {half && <StarHalf className={`${iconClassName} fill-current`} />}
    </span>
  );
}
