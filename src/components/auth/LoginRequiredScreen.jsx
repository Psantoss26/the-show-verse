"use client";

// src/components/auth/LoginRequiredScreen.jsx
//
// Pantalla «Inicia sesión» de las páginas de usuario (Favoritos, Pendientes,
// Mis listas, Social): fondo con las manchas de color de la sección, su
// cabecera y la tarjeta de cristal con el logo y el botón. Una sola pieza para
// que las cuatro sean idénticas y solo cambien el color y los textos.

import Link from "next/link";
import { motion } from "framer-motion";

// Clases completas por color (Tailwind solo genera las que aparecen enteras).
const THEMES = {
  red: {
    selection: "selection:bg-red-500/30",
    blobs: ["bg-red-600/15", "bg-red-700/20", "bg-red-800/25"],
    line: "bg-red-500",
    eyebrow: "text-red-400",
    dot: "text-red-500",
  },
  blue: {
    selection: "selection:bg-blue-500/30",
    blobs: ["bg-blue-600/15", "bg-blue-700/20", "bg-blue-800/25"],
    line: "bg-blue-500",
    eyebrow: "text-blue-400",
    dot: "text-blue-500",
  },
  purple: {
    selection: "selection:bg-purple-500/30",
    blobs: ["bg-purple-600/15", "bg-purple-700/20", "bg-blue-800/25"],
    line: "bg-purple-500",
    eyebrow: "text-purple-400",
    dot: "text-purple-500",
  },
  pink: {
    selection: "selection:bg-pink-500/30",
    blobs: ["bg-pink-600/15", "bg-fuchsia-700/20", "bg-pink-800/25"],
    line: "bg-pink-500",
    eyebrow: "text-pink-400",
    dot: "text-pink-500",
  },
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full ${t.blobs[0]} blur-[120px] sm:blur-[150px]`} />
        <div className={`absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full ${t.blobs[1]} blur-[120px] sm:blur-[150px]`} />
        <div className={`absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full ${t.blobs[2]} blur-[120px] sm:blur-[150px]`} />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <motion.header
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`h-px w-12 ${t.line}`} />
            <span className={`${t.eyebrow} font-bold uppercase tracking-widest text-xs`}>
              {eyebrow}
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
            {title}
            <span className={t.dot}>.</span>
          </h1>
          {description ? (
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              {description}
            </p>
          ) : null}
        </motion.header>

        <LoginRequiredCard message={message} next={next} />
      </div>
    </div>
  );
}
