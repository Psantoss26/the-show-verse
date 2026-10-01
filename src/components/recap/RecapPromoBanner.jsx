"use client";

// Acceso al resumen anual desde las estadísticas del propio perfil. Mismo
// lenguaje visual que la experiencia (colores planos, Anton, formas), en
// pequeño, para que se reconozca antes de entrar.

import Link from "next/link";
import { ArrowRight, PartyPopper } from "lucide-react";

import { ANTON } from "./recapUi";

export default function RecapPromoBanner({ className = "" }) {
  const year = new Date().getFullYear();
  return (
    <Link
      href="/recap"
      className={`group relative isolate flex items-center gap-4 overflow-hidden rounded-2xl bg-[#c6f432] px-5 py-4 text-[#0b0b0b] transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:px-6 sm:py-5 ${className}`}
    >
      <span aria-hidden="true" className="absolute -right-10 -top-14 -z-10 h-40 w-40 rounded-full bg-[#ff4fa3] transition-transform duration-500 group-hover:scale-110" />
      <span aria-hidden="true" className="absolute -bottom-16 right-24 -z-10 h-32 w-32 rounded-full border-[14px] border-dashed border-[#4a1fe0] transition-transform duration-700 group-hover:rotate-45" />
      <PartyPopper aria-hidden="true" className="h-9 w-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.2em]">Resumen anual</span>
        <span className="block text-[clamp(26px,5vw,38px)] uppercase leading-[0.95]" style={ANTON}>
          Tu {year} en The Show Verse
        </span>
        <span className="mt-1 block text-sm font-bold opacity-80">Tu serie y película del año, tu banda sonora y tu perfil de espectador.</span>
      </span>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b0b0b] text-white transition-transform group-hover:translate-x-1">
        <ArrowRight className="h-5 w-5" />
      </span>
    </Link>
  );
}
