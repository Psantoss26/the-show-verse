"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MailWarning, ShieldCheck } from "lucide-react";

export default function EmailVerificationClient({ token }) {
  const [state, setState] = useState({ status: "loading", message: "Verificando tu correo…" });

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      if (!token) {
        setState({ status: "error", message: "El enlace de verificación no es válido." });
        return;
      }

      try {
        const response = await fetch("/api/auth/account/email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || "No se pudo verificar el correo.");
        if (!cancelled) {
          // La confirmación revoca las sesiones del backend. También eliminamos
          // la instantánea visual del cliente para que /login no recupere un
          // perfil ya invalidado antes de reautenticar.
          window.localStorage.removeItem("showverse:auth:user:v1");
          window.sessionStorage.removeItem("showverse:auth:user:v1");
          setState({
            status: "success",
            message: `El correo ${json.email || "nuevo"} ya está verificado. Por seguridad, vuelve a iniciar sesión.`,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ status: "error", message: error?.message || "No se pudo verificar el correo." });
        }
      }
    }

    confirm();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const success = state.status === "success";
  const loading = state.status === "loading";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_85%_78%,rgba(79,70,229,0.16),transparent_36%)]" />
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
        <div className={`mb-5 inline-flex rounded-2xl p-3 ${success ? "bg-emerald-500/10 text-emerald-300" : loading ? "bg-sky-500/10 text-sky-300" : "bg-rose-500/10 text-rose-300"}`}>
          {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : success ? <CheckCircle2 className="h-7 w-7" /> : <MailWarning className="h-7 w-7" />}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Seguridad de la cuenta
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white">{success ? "Correo verificado" : loading ? "Verificando correo" : "No se pudo verificar"}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400" role="status" aria-live="polite">{state.message}</p>
        {!loading && (
          <Link
            href="/login"
            className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-black text-black transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Iniciar sesión
          </Link>
        )}
      </section>
    </main>
  );
}
