"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function sanitizeNextPath(value) {
  const next = value || "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

function getAuthErrorMessage(error, mode) {
  const raw = String(error?.message || "").toLowerCase();
  if (error?.status === 401) return "Email o contraseña incorrectos.";
  if (error?.status === 409 || raw.includes("already")) {
    return "Ya existe una cuenta con ese email o nombre de usuario.";
  }
  if (error?.status === 400 || raw.includes("validation")) {
    return mode === "register"
      ? "Revisa email, usuario y contraseña. La contraseña debe tener al menos 8 caracteres."
      : "Introduce un email y contraseña válidos.";
  }
  if (error?.status === 503) {
    return "El backend no está disponible ahora mismo.";
  }
  return error?.message || "No se pudo completar la autenticación.";
}

export default function LoginForm({ next: nextProp }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
  });

  const next = useMemo(() => {
    return sanitizeNextPath(nextProp || searchParams?.get("next") || "/");
  }, [nextProp, searchParams]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr("");

    try {
      if (mode === "register") {
        await register({
          email: form.email.trim(),
          username: form.username.trim(),
          displayName: form.displayName.trim() || undefined,
          password: form.password,
        });
      } else {
        await login({
          email: form.email.trim(),
          password: form.password,
        });
      }

      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr(getAuthErrorMessage(e, mode));
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
          {isRegister ? (
            <UserPlus className="h-6 w-6 text-emerald-200" />
          ) : (
            <LogIn className="h-6 w-6 text-sky-200" />
          )}
        </div>
        <h1 className="text-2xl font-black text-white">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Guarda favoritos, vistos, ratings y listas en tu cuenta de The Show Verse.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 bg-black/30 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setErr("");
          }}
          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
            !isRegister ? "bg-white text-black" : "text-zinc-300 hover:text-white"
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setErr("");
          }}
          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
            isRegister ? "bg-white text-black" : "text-zinc-300 hover:text-white"
          }`}
        >
          Crear
        </button>
      </div>

      <div className="space-y-4">
        <label className="block text-left">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={updateField("email")}
            required
            className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
            placeholder="tu@email.com"
          />
        </label>

        {isRegister && (
          <>
            <label className="block text-left">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Usuario
              </span>
              <input
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={updateField("username")}
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_-]+"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
                placeholder="psantos26"
              />
            </label>

            <label className="block text-left">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Nombre visible
              </span>
              <input
                type="text"
                autoComplete="name"
                value={form.displayName}
                onChange={updateField("displayName")}
                maxLength={50}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
                placeholder="Opcional"
              />
            </label>
          </>
        )}

        <label className="block text-left">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
            Contraseña
          </span>
          <input
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={form.password}
            onChange={updateField("password")}
            required
            minLength={isRegister ? 8 : 1}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
            placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
          />
        </label>
      </div>

      <AnimatePresence>
        {!!err && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-left text-xs text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{err}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition hover:bg-zinc-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading
          ? isRegister
            ? "Creando cuenta..."
            : "Entrando..."
          : isRegister
            ? "Crear cuenta"
            : "Entrar"}
      </button>
    </motion.form>
  );
}
