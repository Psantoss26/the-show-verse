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
      const res = await fetch("/api/tmdb/auth/request-token", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json?.error || "No se pudo iniciar el login");

      const token = json?.request_token;
      const authenticateUrl = json?.authenticate_url;
      if (!token || !authenticateUrl) throw new Error("Token inválido");

      const finalUrl = new URL(authenticateUrl);
      const redirectTo = finalUrl.searchParams.get("redirect_to");
      if (redirectTo) {
        const redirectUrl = new URL(redirectTo);
        redirectUrl.searchParams.set("next", next);
        finalUrl.searchParams.set("redirect_to", redirectUrl.toString());
      }

      window.location.href = finalUrl.toString();
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
