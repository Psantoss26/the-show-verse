"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, LogIn, UserPlus, Mail, Lock, User, UserCheck, Eye, EyeOff } from "lucide-react";
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

function getGoogleErrorMessage(value) {
  if (!value) return "";
  if (value === "missing_config") {
    return "Google Login no está configurado todavía.";
  }
  if (value === "invalid_state") {
    return "No se pudo verificar la sesión de Google. Inténtalo de nuevo.";
  }
  if (value === "access_denied") {
    return "Has cancelado el inicio de sesión con Google.";
  }
  if (value === "backend_auth_failed") {
    return "Google validó tu cuenta, pero no se pudo iniciar sesión en Show Verse.";
  }
  if (value === "backend_google_config") {
    return "Falta GOOGLE_CLIENT_ID en el backend. Añádelo en backend/.env o Railway y reinicia el backend.";
  }
  if (value === "backend_missing_config") {
    return "El frontend no encuentra BACKEND_API_BASE_URL para completar el login.";
  }
  if (value === "backend_unavailable") {
    return "El backend no está disponible. Arráncalo en local o revisa BACKEND_API_BASE_URL.";
  }
  if (value === "google_audience_mismatch") {
    return "El GOOGLE_CLIENT_ID del backend no coincide con el cliente OAuth usado por el frontend.";
  }
  if (value === "google_email_not_verified") {
    return "Tu cuenta de Google no tiene el email verificado.";
  }
  return "No se pudo completar el inicio de sesión con Google.";
}

export default function LoginForm({ next: nextProp }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
  });

  const next = useMemo(() => {
    return sanitizeNextPath(nextProp || searchParams?.get("next") || "/");
  }, [nextProp, searchParams]);
  const googleError = getGoogleErrorMessage(searchParams?.get("google_error"));
  const visibleError = err || googleError;
  const googleAuthHref = `/api/auth/google/start?next=${encodeURIComponent(next)}`;

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[400px] rounded-[2.5rem] border border-white/12 bg-zinc-900/40 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
    >
      <div className="mb-6 flex flex-col items-center">
        <div className="relative mb-3 flex h-14 w-28 items-center justify-center overflow-hidden">
          <img
            src="/logo-TSV-sinFondo.png"
            alt="The Show Verse"
            className="h-full w-auto object-contain scale-[2.2] origin-center"
          />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="mt-1.5 text-xs font-medium text-zinc-400 max-w-[280px]">
          Guarda favoritos, vistos, ratings y listas en tu cuenta de The Show Verse.
        </p>
      </div>

      <a
        href={googleAuthHref}
        className="mb-5 flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-sm font-semibold text-white transition-all active:scale-[0.99] shadow-sm cursor-pointer"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="#EA4335"
            d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.336 0 3.332 2.691 1.39 6.618l3.876 3.147z"
          />
          <path
            fill="#FBBC05"
            d="M16.04 15.342c-1.043.682-2.38 1.09-4.04 1.09A7.078 7.078 0 0 1 5.266 11.6l-3.876 3.147C3.332 18.682 7.336 21.373 12 21.373c3.082 0 5.864-1.018 7.89-2.763l-3.85-3.268z"
          />
          <path
            fill="#4285F4"
            d="M23.49 12.273c0-.818-.082-1.609-.236-2.363H12v4.51h6.46A5.53 5.53 0 0 1 16.04 15.34l3.85 3.27C22.136 16.59 23.49 14.627 23.49 12.273z"
          />
          <path
            fill="#34A853"
            d="M5.266 11.6a6.973 6.973 0 0 1 0-1.835L1.39 6.618A11.968 11.968 0 0 0 0 12c0 1.91.445 3.718 1.236 5.33l4.03-3.147A6.976 6.976 0 0 1 5.266 11.6z"
          />
        </svg>
        Continuar con Google
      </a>

      <div className="mb-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          o
        </span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <div className="relative mb-6 grid grid-cols-2 rounded-xl border border-white/10 bg-black/40 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setErr("");
          }}
          className={`relative z-10 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
            !isRegister ? "text-black font-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          {!isRegister && (
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute inset-0 rounded-lg bg-white"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-20">Entrar</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setErr("");
          }}
          className={`relative z-10 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
            isRegister ? "text-black font-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          {isRegister && (
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute inset-0 rounded-lg bg-white"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-20">Crear</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="block text-left group">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
            Email
          </span>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={updateField("email")}
              required
              className="h-11 w-full rounded-xl border border-white/10 bg-black/45 pl-11 pr-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-500/40 focus:bg-black/60 focus:shadow-[0_0_15px_rgba(14,165,233,0.1)]"
              placeholder="tu@email.com"
            />
          </div>
        </div>

        {isRegister && (
          <>
            <div className="block text-left group">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
                Usuario
              </span>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="username"
                  value={form.username}
                  onChange={updateField("username")}
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_-]+"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/45 pl-11 pr-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-500/40 focus:bg-black/60 focus:shadow-[0_0_15px_rgba(14,165,233,0.1)]"
                  placeholder="usuario"
                />
              </div>
            </div>

            <div className="block text-left group">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
                Nombre visible
              </span>
              <div className="relative">
                <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="name"
                  value={form.displayName}
                  onChange={updateField("displayName")}
                  maxLength={50}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/45 pl-11 pr-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-500/40 focus:bg-black/60 focus:shadow-[0_0_15px_rgba(14,165,233,0.1)]"
                  placeholder="Opcional"
                />
              </div>
            </div>
          </>
        )}

        <div className="block text-left group">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
            Contraseña
          </span>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={form.password}
              onChange={updateField("password")}
              required
              minLength={isRegister ? 8 : 1}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/45 pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-500/40 focus:bg-black/60 focus:shadow-[0_0_15px_rgba(14,165,233,0.1)]"
              placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white transition-colors focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {!!visibleError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left text-xs text-red-200 animate-in fade-in duration-200"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-red-400" />
            <span className="leading-relaxed">{visibleError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.45)] cursor-pointer"
      >
        {loading ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" />
        ) : isRegister ? (
          <UserPlus className="h-4.5 w-4.5" />
        ) : (
          <LogIn className="h-4.5 w-4.5" />
        )}
        <span>
          {loading
            ? isRegister
              ? "Creando cuenta..."
              : "Entrando..."
            : isRegister
              ? "Crear"
              : "Entrar"}
        </span>
      </button>
    </motion.form>
  );
}
