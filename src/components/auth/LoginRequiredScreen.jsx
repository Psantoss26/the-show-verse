"use client";

// src/components/auth/LoginRequiredScreen.jsx
//
// Pantalla «Inicia sesión» de las páginas de usuario (Favoritos, Pendientes,
// Mis listas, Social): el fondo animado común (UserPageBackdrop), la cabecera
// común (UserPageHeading) y la tarjeta de cristal con el logo y el botón. Una sola pieza para
// que las cuatro sean idénticas y solo cambien el color y los textos.

import Link from "next/link";
import { motion } from "framer-motion";
import UserPageBackdrop from "@/components/ui/UserPageBackdrop";
import UserPageHeading from "@/components/ui/UserPageHeading";

// Por color: la variante del fondo común y el acento del título (los mismos
// que usa la página con sesión), y el color de la selección de texto.
const THEMES = {
  red: { variant: "favorites", accent: "red", selection: "selection:bg-red-500/30" },
  blue: { variant: "watchlist", accent: "blue", selection: "selection:bg-blue-500/30" },
  purple: { variant: "lists", accent: "purple", selection: "selection:bg-purple-500/30" },
  pink: { variant: "social", accent: "pink", selection: "selection:bg-pink-500/30" },
};

// Solo la tarjeta, para las páginas que siguen enseñando su cabecera y sus
// pestañas y bloquean una sola sección (Mis listas, en /lists).
export function LoginRequiredCard({ message, next }) {
  return (
    <div className="flex items-center justify-center py-12 lg:py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[380px] w-full flex flex-col items-center justify-center px-6 py-10 bg-zinc-950/40 border border-white/10 rounded-[2.5rem] text-center shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
      >
        <div className="relative mb-4 flex h-24 w-48 items-center justify-center mx-auto">
          <img
            src="/logo-TSV-sinFondo.png"
            alt="The Show Verse"
            className="h-full w-auto object-contain scale-[1.6]"
          />
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md mb-2">
          Inicia sesión
        </h2>
        <p className="text-zinc-400 text-xs font-medium max-w-sm mb-6 leading-relaxed">
          {message}
        </p>
        <Link
          href={`/login?next=${next}`}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.45)] cursor-pointer"
        >
          Iniciar sesión
        </Link>
      </motion.div>
    </div>
  );
}

export default function LoginRequiredScreen({
  theme = "red",
  eyebrow,
  title,
  description,
  message,
  next,
}) {
  const t = THEMES[theme] || THEMES.red;

  return (
    <div className={`min-h-screen bg-black text-zinc-100 font-sans ${t.selection} pb-20`}>
      <UserPageBackdrop variant={t.variant} />

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 sm:pt-8 lg:py-12">
        <header className="mb-8">
          <UserPageHeading
            eyebrow={eyebrow}
            title={title}
            accent={t.accent}
            description={description}
          />
        </header>

        <LoginRequiredCard message={message} next={next} />
      </div>
    </div>
  );
}
