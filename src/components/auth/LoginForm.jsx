"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Image from "next/image";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const searchParams = useSearchParams();

  const next = useMemo(() => {
    const n = searchParams?.get("next") || "/";
    return n.startsWith("/") ? n : "/";
  }, [searchParams]);

  const startTmdbLogin = async () => {
    setLoading(true);
    setErr("");

    try {
      // Llamamos directamente a la API pública de TMDb desde el cliente,
      // sin pasar por el servidor Next.js, para que el login funcione
      // aunque el servidor de producción esté apagado.
      const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!API_KEY) throw new Error("Falta NEXT_PUBLIC_TMDB_API_KEY");

      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/authentication/token/new?api_key=${encodeURIComponent(API_KEY)}`,
        { headers: { Accept: "application/json" } },
      );
      const json = await tmdbRes.json().catch(() => ({}));
      if (!tmdbRes.ok || !json?.success)
        throw new Error(json?.status_message || "No se pudo obtener el token de TMDb");

      const token = json?.request_token;
      if (!token) throw new Error("Token inválido");

      // Construimos la URL de callback con el parámetro next.
      // TMDb añade automáticamente ?request_token=...&approved=true al redirect_to.
      const origin = window.location.origin;
      const redirectUrl = new URL(`${origin}/auth/callback`);
      if (next && next !== "/") redirectUrl.searchParams.set("next", next);

      const authenticateUrl =
        `https://www.themoviedb.org/authenticate/${token}` +
        `?redirect_to=${encodeURIComponent(redirectUrl.toString())}`;

      window.location.href = authenticateUrl;
    } catch (e) {
      setErr(e?.message || "Error iniciando login TMDb");
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center text-center gap-5"
    >
      {/* Logo TMDb estilo app-icon */}
      <div className="w-24 h-24 rounded-[28px] bg-[#0d253f] border border-white/10 shadow-xl shadow-black/50 flex items-center justify-center p-4">
        <Image
          src="/logo-TMDb.png"
          alt="TMDb"
          width={72}
          height={72}
          className="object-contain w-full h-auto"
          priority
        />
      </div>

      {/* Título y descripción */}
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white">
          Conecta tu cuenta de TMDb
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-[260px] mx-auto">
          Para guardar favoritos y gestionar tu lista de pendientes, necesitas
          iniciar sesión.
        </p>
      </div>

      {/* Botón */}
      <button
        type="button"
        onClick={startTmdbLogin}
        disabled={loading}
        className="
          rounded-2xl px-10 py-3.5 font-bold text-sm text-black
          bg-white hover:bg-zinc-100 active:scale-95
          transition-all disabled:opacity-60 disabled:cursor-not-allowed
          flex items-center justify-center gap-2 shadow-md
        "
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-800" />
        ) : null}
        {loading ? "Abriendo TMDb…" : "Conectar ahora"}
      </button>

      {/* Error */}
      <AnimatePresence>
        {!!err && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 text-xs text-red-400"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{err}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
