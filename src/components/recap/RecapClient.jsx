"use client";

// Página de "Tu año en The Show Verse": pide el resumen al backend y monta el
// reproductor a pantalla completa. Sin año en la URL, el backend elige (el
// actual si ya tiene actividad, si no el último con datos) y la URL se fija
// después sin volver a cargar.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { LogIn, RefreshCw, X } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { fetchRecap, getCachedRecap } from "@/lib/recap/recapCache";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import RecapStory from "./RecapStory";
import { ANTON } from "./recapUi";

const LOADING_LINES = [
  "Contando minutos…",
  "Rebobinando tu año…",
  "Buscando tu serie del año…",
  "Afinando la banda sonora…",
  "Eligiendo tu película favorita…",
];

function FullScreen({ children, label }) {
  useBodyScrollLock(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[2147483000] flex items-center justify-center overflow-hidden bg-[#08080c] px-6 text-center text-white"
    >
      {children}
    </div>
  );
}

function CloseButton({ onClose }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar"
      className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <X aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}

function Loading({ year, onClose }) {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLine((value) => (value + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(timer);
  }, []);
  return (
    <FullScreen label="Preparando tu resumen anual">
      <CloseButton onClose={onClose} />
      <div aria-busy="true">
        <motion.p
          className="text-[clamp(64px,22vw,180px)] uppercase leading-[0.85] text-[#c6f432]"
          style={ANTON}
          animate={reduce ? undefined : { scale: [1, 1.05, 1], rotate: [-2, 2, -2] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {year || "Tu año"}
        </motion.p>
        <p className="mt-6 text-lg font-bold" aria-live="polite">{LOADING_LINES[line]}</p>
      </div>
    </FullScreen>
  );
}

function Message({ title, children, onClose }) {
  return (
    <FullScreen label={title}>
      <CloseButton onClose={onClose} />
      <div className="max-w-md">
        <h1 className="text-[clamp(40px,12vw,72px)] uppercase leading-[0.9]" style={ANTON}>{title}</h1>
        <div className="mt-5 space-y-5 text-lg text-white/75">{children}</div>
      </div>
    </FullScreen>
  );
}

export default function RecapClient({ year = null }) {
  const router = useRouter();
  const { authenticated, hydrated, account, user } = useAuth();
  // Si la vista previa del Perfil ya lo pidió, se abre al instante.
  const [state, setState] = useState(() => {
    const cached = getCachedRecap(year);
    return cached ? { status: cached.empty ? "empty" : "ready", data: cached } : { status: "loading", data: null };
  });
  const [attempt, setAttempt] = useState(0);

  const close = useCallback(() => {
    const cameFromApp =
      typeof document !== "undefined" &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin &&
      window.history.length > 1;
    if (cameFromApp) router.back();
    else router.push("/");
  }, [router]);

  useEffect(() => {
    if (!hydrated) return undefined;
    if (!authenticated) {
      setState({ status: "unauthenticated", data: null });
      return undefined;
    }
    const controller = new AbortController();
    if (!getCachedRecap(year)) setState({ status: "loading", data: null });
    fetchRecap(year, { signal: controller.signal })
      .then(({ status, data: json }) => {
        if (status === 401) return setState({ status: "unauthenticated", data: null });
        if (status !== 200 || !json) return setState({ status: "error", data: null });
        setState({ status: json.empty ? "empty" : "ready", data: json });
        // Fija el año elegido en la URL sin recargar.
        if (!year && json.year) window.history.replaceState(window.history.state, "", `/recap/${json.year}`);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ status: "error", data: null });
      });
    return () => controller.abort();
  }, [hydrated, authenticated, year, attempt]);

  const recapUser = state.data?.user || {
    username: account?.username || user?.username || "",
    name: account?.displayName || user?.name || "",
  };

  if (state.status === "ready") {
    return <RecapStory key={state.data.year} recap={state.data} user={recapUser} onClose={close} />;
  }

  if (state.status === "unauthenticated") {
    return (
      <Message title="Tu año te espera" onClose={close}>
        <p>Inicia sesión para ver tu resumen anual: lo que viste, tus favoritos y tu perfil de espectador.</p>
        <Link
          href={`/login?next=${encodeURIComponent(year ? `/recap/${year}` : "/recap")}`}
          className="inline-flex items-center gap-2 rounded-full bg-[#c6f432] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <LogIn aria-hidden="true" className="h-5 w-5" /> Iniciar sesión
        </Link>
      </Message>
    );
  }

  if (state.status === "error") {
    return (
      <Message title="Algo se ha cortado" onClose={close}>
        <p>No hemos podido preparar tu resumen. Vuelve a intentarlo en un momento.</p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-black focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <RefreshCw aria-hidden="true" className="h-5 w-5" /> Reintentar
        </button>
      </Message>
    );
  }

  if (state.status === "empty") {
    const years = (state.data?.availableYears || []).filter((item) => item.plays >= 5);
    return (
      <Message title={`${state.data.year} está en blanco`} onClose={close}>
        <p>
          Aún no hay nada registrado en {state.data.year}. Marca lo que veas y aquí tendrás tu resumen.
        </p>
        {years.length ? (
          <nav aria-label="Años con resumen" className="flex flex-wrap justify-center gap-2">
            {years.slice(0, 8).map((item) => (
              <Link
                key={item.year}
                href={`/recap/${item.year}`}
                className="rounded-full bg-white/12 px-4 py-2 font-bold text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {item.year}
              </Link>
            ))}
          </nav>
        ) : null}
      </Message>
    );
  }

  return <Loading year={year} onClose={close} />;
}
